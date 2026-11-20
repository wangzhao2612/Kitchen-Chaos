import { INGREDIENTS, TILE, WASH_SECONDS } from './types';
import type { Control, IngredientKind, Station } from './types';
import { RECIPES, isSubset, recipe } from '../cooking/recipes';
import type { Simulation } from './Simulation';

const IDLE: Control = { x: 0, y: 0, interact: false, work: false, dash: false };
// Rough seconds a dish takes the AI (walking only, no dashing); used to skip orders it cannot finish in time.
const DISH_SECONDS: Record<string, number> = { salad: 26, cheeseburger: 34, burger: 40, chickenrice: 44, pasta: 48, soup: 56 };
const STATE_ORDER = { RAW: 0, CHOPPED: 1, COOKED: 2, COOKING: 3, BURNT: 4 } as const;

type Routine = Generator<Control, void, undefined>;

/**
 * An automatic second chef. It only ever produces normal controls (move / interact / work), so it obeys exactly the
 * same rules as the human player: no teleporting, no free ingredients. Written as a coroutine that yields one
 * control per simulation frame, which keeps the "walk there, face it, press J" logic readable.
 */
export class ChefAI {
  private sim!: Simulation;
  private routine: Routine | null = null;
  /** Dishes finished since the round began, mostly useful for tests and debugging. */
  dishes = 0;
  lastError = '';

  /** Pass this as `Simulation.partnerBrain`. */
  readonly brain = (sim: Simulation): Control => {
    this.sim = sim;
    if (!this.routine) this.routine = this.main();
    try {
      const step = this.routine.next();
      if (step.done) { this.routine = null; return IDLE; }
      return step.value;
    } catch (error) {
      this.lastError = String(error);
      this.routine = this.recover();
      return IDLE;
    }
  };

  private get me() { return this.sim.partner!; }
  private find(kind: Station['kind'], ingredient?: IngredientKind): Station {
    const found = this.sim.stations.find(s => s.kind === kind && (!ingredient || s.ingredient === ingredient));
    if (!found) throw new Error(`No ${kind} ${ingredient ?? ''}`);
    return found;
  }

  private *wait(seconds: number, control: Control = IDLE): Routine {
    for (let i = 0; i < Math.ceil(seconds * 60); i++) { if (this.sim.finished) return; yield control; }
  }

  private route(station: Station, avoidOther = true): { x: number; y: number }[] {
    const sim = this.sim, me = this.me, other = sim.mainPlayer;
    const start = [Math.floor(me.x / TILE), Math.floor(me.y / TILE)];
    const free = (x: number, y: number) => x > 0 && y > 0 && x < sim.level.cols - 1 && y < sim.level.rows - 1 && !sim.blocked((x + .5) * TILE, (y + .5) * TILE)
      && !(avoidOther && Math.hypot((x + .5) * TILE - other.x, (y + .5) * TILE - other.y) < TILE * .75 && !(x === start[0] && y === start[1]));
    const dirs = [[0, 1], [1, 0], [-1, 0], [0, -1]];
    const ends = dirs.map(([dx, dy]) => [Math.round(station.x / TILE) + dx, Math.round(station.y / TILE) + dy]).filter(([x, y]) => free(x, y));
    const queue = [start], previous = new Map<string, string | null>([[start.join(','), null]]);
    let end: string | null = null;
    while (queue.length) {
      const [x, y] = queue.shift()!;
      if (ends.some(([ex, ey]) => ex === x && ey === y)) { end = `${x},${y}`; break; }
      for (const [dx, dy] of dirs) {
        const next = [x + dx, y + dy], id = next.join(',');
        if (!previous.has(id) && free(next[0], next[1])) { previous.set(id, `${x},${y}`); queue.push(next); }
      }
    }
    if (!end) { if (avoidOther) return this.route(station, false); throw new Error(`No route to ${station.id}`); }
    const points: { x: number; y: number }[] = [];
    while (end) { const [x, y] = end.split(',').map(Number); points.unshift({ x: (x + .5) * TILE, y: (y + .5) * TILE }); end = previous.get(end) ?? null; }
    return points;
  }

  /** Walk next to a station and turn to face it until the simulation reports it as the chef's target. */
  private *goTo(station: Station, attempts = 0): Routine {
    if (attempts > 8) throw new Error(`Blocked on the way to ${station.id}`);
    const points = this.route(station);
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      if (i === 0 && this.sim.blocked(point.x, point.y)) continue;
      let last = Infinity, stuck = 0;
      for (let frame = 0; frame < 300; frame++) {
        if (this.sim.finished) return;
        const dx = point.x - this.me.x, dy = point.y - this.me.y, distance = Math.hypot(dx, dy);
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) break;
        stuck = Math.abs(last - distance) < .02 ? stuck + 1 : 0; last = distance;
        if (stuck > 12) { yield* this.wait(.25 + attempts * .1); yield* this.goTo(station, attempts + 1); return; }
        const x = Math.abs(dx) > Math.abs(dy) ? Math.sign(dx) : 0;
        yield { ...IDLE, x, y: x ? 0 : Math.sign(dy) };
        if (frame === 299) throw new Error(`Steering failed to ${station.id}`);
      }
    }
    yield* this.wait(.1);
    for (let i = 0; i < 30; i++) {
      if (this.sim.partnerTarget === station) return;
      const dx = station.x + TILE / 2 - this.me.x, dy = station.y + TILE / 2 - this.me.y;
      const x = Math.abs(dx) > Math.abs(dy) ? Math.sign(dx) : 0;
      yield { ...IDLE, x, y: x ? 0 : Math.sign(dy) };
    }
    if (this.sim.partnerTarget !== station) yield* this.goTo(station, attempts + 1);
  }

  private *interact(station: Station): Routine { yield* this.goTo(station); yield { ...IDLE, interact: true }; yield IDLE; }
  private *work(station: Station, seconds: number): Routine { yield* this.goTo(station); yield* this.wait(seconds + .08, { ...IDLE, work: true }); }
  private *press(): Routine { yield { ...IDLE, interact: true }; yield IDLE; }

  private *getPlate(): Routine {
    const sim = this.sim;
    if (!sim.cleanPlates) {
      for (let i = 0; i < 20 && !sim.dirtyPlates; i++) yield* this.wait(1);
      if (!sim.dirtyPlates) throw new Error('No plates to wash');
      yield* this.work(this.find('sink'), WASH_SECONDS);
    }
    yield* this.interact(this.find('plates'));
    if (this.me.held?.type !== 'plate') throw new Error('Plate cycle failed');
  }

  private *waitForStove(stove: Station): Routine {
    yield* this.goTo(stove);
    for (let i = 0; i < 60 * 14 && stove.stoveState === 'COOKING'; i++) yield IDLE;
    yield* this.press();
  }

  private *make(id: string): Routine {
    const sim = this.sim, r = recipe(id);
    const assembly = sim.stations.find(s => s.kind === 'counter' && !s.moving && !s.item);
    const board = sim.stations.find(s => s.kind === 'board' && !s.item);
    if (!assembly || !board) throw new Error('No free assembly counter or board');
    yield* this.getPlate();
    yield* this.interact(assembly);
    if (id === 'soup') {
      const stove = sim.stations.find(s => s.kind === 'stove' && !s.item);
      if (!stove) throw new Error('No free stove');
      for (const kind of ['tomato', 'onion'] as IngredientKind[]) {
        yield* this.interact(this.find('crate', kind));
        yield* this.interact(board);
        yield* this.work(board, INGREDIENTS[kind].chop);
        yield* this.press();
        yield* this.interact(stove);
      }
      yield* this.interact(assembly);
      yield* this.waitForStove(stove);
    } else {
      const pending: Station[] = [];
      const ordered = [...r.components].sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state]);
      for (const part of ordered) {
        yield* this.interact(this.find('crate', part.kind));
        if (part.state === 'CHOPPED') {
          yield* this.interact(board);
          yield* this.work(board, INGREDIENTS[part.kind].chop);
          yield* this.press();
          yield* this.interact(assembly);
        } else if (part.state === 'COOKED') {
          const stove = sim.stations.find(s => s.kind === 'stove' && !s.item);
          if (!stove) throw new Error('No free stove');
          yield* this.interact(stove);
          pending.push(stove);
        } else yield* this.interact(assembly);
      }
      yield* this.interact(assembly);
      for (const stove of pending) yield* this.waitForStove(stove);
    }
    const before = sim.served;
    yield* this.interact(this.find('serve'));
    yield* this.wait(3.5);
    if (sim.served > before) this.dishes++;
  }

  /** Dishes someone else is already assembling: a partly-filled plate in the human's hands or on a worktop counts as claiming that recipe. */
  private claimed(): Map<string, number> {
    const sim = this.sim, claims = new Map<string, number>();
    const plates = [sim.mainPlayer.held, ...sim.stations.filter(s => s.kind === 'counter' || s.kind === 'board').map(s => s.item)];
    for (const item of plates) {
      if (item?.type !== 'plate' || item.dirty || !item.components.length) continue;
      const wanted = new Set(sim.orders.map(o => o.recipeId));
      const match = RECIPES.find(r => wanted.has(r.id) && isSubset(item.components, r.components));
      if (match) claims.set(match.id, (claims.get(match.id) ?? 0) + 1);
    }
    return claims;
  }

  pickOrder(): string | null {
    const sim = this.sim, claims = this.claimed();
    const options = sim.orders
      .filter(o => sim.orders.filter(x => x.recipeId === o.recipeId).reduce((sum, x) => sum + x.quantity, 0) - (claims.get(o.recipeId) ?? 0) > 0)
      .filter(o => DISH_SECONDS[o.recipeId] !== undefined)
      .filter(o => o.remaining > DISH_SECONDS[o.recipeId] + (sim.cleanPlates ? 6 : 20) && sim.time > DISH_SECONDS[o.recipeId] + 4)
      .sort((a, b) => recipe(b.recipeId).score / DISH_SECONDS[b.recipeId] - recipe(a.recipeId).score / DISH_SECONDS[a.recipeId]);
    return options[0]?.recipeId ?? null;
  }

  private *main(): Routine {
    for (;;) {
      if (this.sim.finished) return;
      const id = this.pickOrder();
      if (id) { yield* this.make(id); continue; }
      // Nothing worth cooking: keep the plate cycle going so the human always has clean plates.
      const sink = this.sim.stations.find(s => s.kind === 'sink');
      if (sink && this.sim.dirtyPlates > 0 && !this.me.held) yield* this.work(sink, WASH_SECONDS);
      else yield* this.wait(1);
    }
  }

  /** After a failure: bin whatever is in hand, then carry on with the main loop. */
  private *recover(): Routine {
    if (this.me.held) { yield* this.interact(this.find('trash')); }
    yield* this.wait(.5);
    yield* this.main();
  }
}
