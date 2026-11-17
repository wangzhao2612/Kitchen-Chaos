import { describe, expect, it } from 'vitest';
import { Simulation, PERFECT_BONUS, PERFECT_SECONDS } from '../src/game/Simulation';
import { LEVELS } from '../src/levels/data';
import { canPlate, cookingTime, matchRecipe, RECIPES } from '../src/cooking/recipes';
import { food, plate, TILE, WASH_SECONDS, DIRTY_RETURN_SECONDS } from '../src/game/types';
import type { Control, IngredientKind, Station } from '../src/game/types';
const idle: Control = { x: 0, y: 0, interact: false, work: false, dash: false };
function tick(sim: Simulation, seconds: number, control = idle): void { for (let i = 0; i < Math.round(seconds * 60); i++) sim.update(1 / 60, control); }
function station(sim: Simulation, kind: Station['kind'], ingredient?: IngredientKind): Station { return sim.stations.find(s => s.kind === kind && (!ingredient || s.ingredient === ingredient))!; }
function salad(sim: Simulation): void {
  for (const kind of ['lettuce', 'tomato'] as IngredientKind[]) {
    sim.interact(station(sim, 'crate', kind)); sim.interact(station(sim, 'board'));
    sim.work(station(sim, 'board'), 1); expect((station(sim, 'board').item as ReturnType<typeof food>).components[0].state).toBe('RAW');
    sim.work(station(sim, 'board'), 1.1); sim.interact(station(sim, 'board'));
    if (kind === 'lettuce') { sim.interact(station(sim, 'counter')); sim.interact(station(sim, 'plates')); sim.interact(station(sim, 'counter')); sim.interact(station(sim, 'counter')); }
    else { sim.interact(station(sim, 'counter')); sim.interact(station(sim, 'counter')); }
  }
}
describe('recipes and processing', () => {
  it('recognizes all six recipes regardless of component order', () => { for (const recipe of RECIPES) expect(matchRecipe([...recipe.components].reverse())?.id).toBe(recipe.id); });
  it('rejects raw, duplicate, burnt, incomplete and extra ingredients', () => {
    expect(matchRecipe([{ kind: 'lettuce', state: 'RAW' }, { kind: 'tomato', state: 'CHOPPED' }])).toBeUndefined();
    expect(canPlate([{ kind: 'lettuce', state: 'CHOPPED' }], [{ kind: 'lettuce', state: 'CHOPPED' }], ['salad'])).toBe(false);
    expect(matchRecipe([{ kind: 'beef', state: 'BURNT' }, { kind: 'bread', state: 'RAW' }, { kind: 'cheese', state: 'RAW' }])).toBeUndefined();
    expect(matchRecipe(RECIPES[0].components.slice(0, 1))).toBeUndefined();
    expect(matchRecipe([...RECIPES[0].components, { kind: 'potato', state: 'CHOPPED' }])).toBeUndefined();
  });
  it('soup starts only after its two chopped inputs are collected', () => {
    const sim = new Simulation(LEVELS[3]), stove = station(sim, 'stove');
    sim.player.held = food('tomato', 'CHOPPED'); sim.interact(stove);
    expect(stove.stoveState).toBe('IDLE'); expect(cookingTime(stove.item as ReturnType<typeof food>)).toBe(0);
    sim.player.held = food('onion'); sim.interact(stove); expect(sim.player.held).not.toBeNull();
    sim.player.held = food('onion', 'CHOPPED'); sim.interact(stove); expect(stove.stoveState).toBe('COOKING');
    tick(sim, 10.1); expect(stove.stoveState).toBe('READY');
    sim.player.held = plate(); sim.interact(stove); expect(matchRecipe((sim.player.held as ReturnType<typeof plate>).components)?.id).toBe('soup');
  });
  it('chopping retains partial progress and completes only at the required time', () => {
    const sim = new Simulation(LEVELS[3]), board = station(sim, 'board'); sim.player.held = food('carrot'); sim.interact(board);
    sim.work(board, 1.5); tick(sim, 2); expect((board.item as ReturnType<typeof food>).progress).toBe(1.5);
    sim.interact(board); sim.interact(board); sim.work(board, 1.6); expect((board.item as ReturnType<typeof food>).components[0].state).toBe('CHOPPED');
  });
  it('cooking runs automatically and cannot be removed before it is ready', () => {
    const sim = new Simulation(LEVELS[1]), stove = station(sim, 'stove'); sim.player.held = food('beef'); sim.interact(stove); sim.interact(stove);
    expect(sim.player.held).toBeNull(); tick(sim, 5); expect(stove.stoveState).toBe('COOKING'); tick(sim, 1.1); expect(stove.stoveState).toBe('READY');
    sim.player.held = plate(); sim.interact(stove); expect((sim.player.held as ReturnType<typeof plate>).components[0].state).toBe('COOKED'); expect(stove.item).toBeNull();
  });
  it('transitions through warning, burnt and fire, then restores a usable stove', () => {
    const sim = new Simulation(LEVELS[4]), stove = station(sim, 'stove'); sim.player.held = food('beef'); sim.interact(stove);
    tick(sim, 6.1); expect(stove.stoveState).toBe('READY'); tick(sim, 12); expect(stove.stoveState).toBe('BURNING'); tick(sim, 5); expect(stove.stoveState).toBe('BURNT'); tick(sim, 8); expect(stove.stoveState).toBe('ON_FIRE');
    sim.player.held = plate(); sim.interact(stove); expect(sim.player.held.type).toBe('plate');
    sim.player.held = { type: 'extinguisher' }; sim.work(stove, 1); expect(stove.stoveState).toBe('ON_FIRE'); sim.work(stove, 2.1); expect(stove.stoveState).toBe('IDLE'); expect(stove.item).toBeNull();
    sim.player.held = food('chicken'); sim.interact(stove); expect(stove.stoveState).toBe('COOKING');
  });
  it('early kitchens teach burning without fire', () => {
    const sim = new Simulation(LEVELS[1]), stove = station(sim, 'stove'); sim.player.held = food('beef'); sim.interact(stove); tick(sim, 50); expect(stove.stoveState).toBe('BURNT'); sim.interact(stove); expect(sim.player.held?.type).toBe('food'); expect(stove.stoveState).toBe('IDLE');
  });
});
describe('serving, plate conservation and scores', () => {
  it('completes a full salad workflow without inventing finished dishes', () => {
    const sim = new Simulation(LEVELS[0]); tick(sim, 2.1); salad(sim); expect(sim.player.held?.type).toBe('plate'); expect(matchRecipe((sim.player.held as ReturnType<typeof plate>).components)?.id).toBe('salad');
    sim.interact(station(sim, 'serve')); tick(sim,3.5); expect(sim.served).toBe(1); expect(sim.score).toBeGreaterThan(100); expect(sim.orders).toHaveLength(0); expect(sim.plateCount()).toBe(3);
    tick(sim, DIRTY_RETURN_SECONDS); expect(sim.dirtyPlates).toBe(1); sim.work(station(sim,'sink'),2.1); expect(sim.cleanPlates).toBe(3); expect(sim.plateCount()).toBe(3);
  });
  it('serves a pair one plate at a time and removes only the completed batch',()=>{
    const sim=new Simulation(LEVELS[0]);tick(sim,2.1);salad(sim);sim.interact(station(sim,'serve'));tick(sim,3.5);
    tick(sim,26.5);const order=sim.orders[0];expect(order.quantity).toBe(2);
    salad(sim);sim.interact(station(sim,'serve'));expect(order.quantity).toBe(1);tick(sim,3.5);
    salad(sim);sim.interact(station(sim,'serve'));expect(sim.orders).toHaveLength(0);tick(sim,3.5);
    expect(sim.served).toBe(3);expect(sim.plateCount()).toBe(3);
  });
  it('never creates two simultaneous batches of the same recipe', () => {
    const sim = new Simulation(LEVELS[4]);
    for (let i = 0; i < 10; i++){tick(sim,3);sim.spawnOrder();}
    tick(sim,3);
    expect(new Set(sim.orders.map(o => o.recipeId)).size).toBe(sim.orders.length);
    expect(sim.orders).toHaveLength(4);
  });
  it('dirty plates enter the sink automatically and retain a two-second wash across interruptions', () => {
    const sim = new Simulation({ ...LEVELS[2], recipes: ['salad'] }); tick(sim, 2.1); salad(sim); sim.interact(station(sim, 'serve'));
    tick(sim, DIRTY_RETURN_SECONDS+.1); expect(sim.dirtyPlates).toBe(1); expect(sim.player.held).toBeNull();
    sim.work(station(sim, 'sink'), 1); tick(sim, 3); expect((station(sim, 'sink').item as ReturnType<typeof plate>).dirty).toBe(true);
    sim.work(station(sim, 'sink'), WASH_SECONDS-1); expect(station(sim,'sink').item).toBeNull(); expect(sim.player.held).toBeNull();
    expect(sim.cleanPlates).toBe(sim.level.plates); expect(sim.plateCount()).toBe(sim.level.plates);
  });
  it('rejects invalid or unordered dishes without losing plates or granting rewards', () => {
    const sim = new Simulation(LEVELS[1]); sim.player.held = plate(); sim.interact(station(sim, 'serve')); expect(sim.score).toBe(0); expect(sim.player.held).not.toBeNull();
    (sim.player.held as ReturnType<typeof plate>).components = RECIPES[0].components.map(c => ({ ...c })); sim.interact(station(sim, 'serve')); expect(sim.score).toBe(0); expect(sim.player.held).not.toBeNull();
    sim.interact(station(sim, 'trash')); expect((sim.player.held as ReturnType<typeof plate>).components).toHaveLength(0);
  });
  it('expires orders, resets streak, never goes below zero and respects queue limits', () => {
    const sim = new Simulation(LEVELS[0]); tick(sim, 2.1); sim.score = 10; sim.combo = 3; sim.restaurant.customers.find(c=>c.state==='WAITING')!.patience = 0.01; tick(sim, 1 / 60);
    expect(sim.score).toBe(0); expect(sim.combo).toBe(0); expect(sim.failed).toBe(1);
    tick(sim, 85); expect(sim.orders.length).toBeLessThanOrEqual(2);
  });
  it('ends at 300 seconds and freezes results', () => {
    const sim = new Simulation(LEVELS[0]); tick(sim, 300.1); expect(sim.finished).toBe(true); expect(sim.time).toBe(0); const result = sim.result(); tick(sim, 5); expect(sim.result()).toEqual(result);
  });
  it('awards stars at the exact configured boundaries', () => { for (const l of LEVELS) { const sim = new Simulation(l); l.stars.forEach((v, i) => { sim.score = v - 1; expect(sim.stars).toBe(i); sim.score = v; expect(sim.stars).toBe(i + 1); }); } });
});
describe('movement and level safety', () => {
  it('moves smoothly, normalizes diagonals and stops without continuing to drift', () => {
    const straight = new Simulation(LEVELS[0]), diagonal = new Simulation(LEVELS[0]); const p1 = { ...straight.player }, p2 = { ...diagonal.player };
    tick(straight, 0.3, { ...idle, x: 1 }); tick(diagonal, 0.3, { ...idle, x: 1, y: 1 });
    expect(Math.hypot(straight.player.x - p1.x, straight.player.y - p1.y)).toBeCloseTo(Math.hypot(diagonal.player.x - p2.x, diagonal.player.y - p2.y), 3);
    tick(straight, 1); expect(Math.abs(straight.player.vx)).toBeLessThan(0.001);
  });
  it('cannot walk or dash through a workbench', () => {
    const sim = new Simulation(LEVELS[0]); const board=station(sim,'board');sim.player.x=board.x+TILE/2;sim.player.y=board.y+TILE*1.5;
    tick(sim, 1, { ...idle, y: -1, dash: true }); expect(sim.player.y).toBeGreaterThanOrEqual(board.y+TILE+17-0.1);
  });
  it('all essential stations have a reachable interaction position in every gate phase', () => {
    for (const level of LEVELS) for (const elapsed of [0, 11, 12, 23, 24]) {
      const sim = new Simulation(level); sim.elapsed = elapsed; sim.player.x = 8.5 * TILE; sim.player.y = 7.5 * TILE;
      const free = (col: number, row: number) => !sim.blocked((col + 0.5) * TILE, (row + 0.5) * TILE);
      const seen = new Set<string>(), queue: [number, number][] = [[8, 7]];
      while (queue.length) { const [x, y] = queue.shift()!; const k = `${x},${y}`; if (seen.has(k) || !free(x, y)) continue; seen.add(k); for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) queue.push([x+dx,y+dy]); }
      for (const s of sim.stations) {
        const x = Math.round(s.x / TILE), y = Math.round(s.y / TILE);
        expect([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy]) => seen.has(`${x+dx},${y+dy}`)), `${level.name}: ${s.id}, phase ${elapsed}`).toBe(true);
      }
    }
  });
  it('moving counters stop before overlapping the chef and keep their items', () => {
    const sim = new Simulation(LEVELS[3]), moving = sim.stations.find(s => s.moving)!; moving.item = food('tomato'); sim.player.x = moving.x + TILE + 18; sim.player.y = moving.y + TILE / 2;
    tick(sim, 3); expect(moving.x + TILE).toBeLessThanOrEqual(sim.player.x - 17 + 0.01); expect(moving.item?.type).toBe('food');
  });
});

it('returns every untouched raw ingredient to its matching crate without waste or cost',()=>{
  const sim=new Simulation(LEVELS[4]);
  for(const crate of sim.stations.filter(s=>s.kind==='crate')){
    sim.interact(crate);expect(sim.player.held).toEqual(food(crate.ingredient!));expect(sim.result().wasteCost).toBeGreaterThan(0);expect(sim.prompt(crate)).toContain('J 放回原材料');
    sim.interact(crate);expect(sim.player.held).toBeNull();expect(crate.item).toBeNull();expect(sim.result()).toMatchObject({wasted:0,wasteCost:0,ingredientCost:0,profit:0});expect(sim.player.action).toBeGreaterThan(0);
    sim.interact(crate);expect(sim.player.held).toEqual(food(crate.ingredient!));sim.interact(crate);
  }
  sim.interact(station(sim,'crate','tomato'));sim.interact(station(sim,'crate','tomato'));sim.interact(station(sim,'crate','lettuce'));expect(sim.player.held).toEqual(food('lettuce'));
});

it('does not lose ingredients or accept wrong, processed, combined or plated food into raw crates',()=>{
  const sim=new Simulation(LEVELS[4]),tomato=station(sim,'crate','tomato'),lettuce=station(sim,'crate','lettuce');
  sim.interact(tomato);const raw=sim.player.held;sim.interact(lettuce);expect(sim.player.held).toBe(raw);expect(sim.result().wasted).toBe(1);
  const combined=food('tomato');combined.components.push({kind:'lettuce',state:'RAW'});
  const partial=food('tomato');partial.progress=.5;
  const plated=plate();plated.components=[{kind:'tomato',state:'RAW'}];
  for(const item of [food('tomato','CHOPPED'),food('tomato','COOKING'),food('tomato','COOKED'),food('tomato','BURNT'),combined,partial,plated,plate(),{type:'extinguisher'} as const]){
    sim.player.held=item;sim.interact(tomato);expect(sim.player.held).toBe(item);expect(sim.prompt(tomato)).not.toContain('J 放回原材料');
  }
});

describe('perfect heat bonus', () => {
  // Both runs share one timeline (cook, wait, serve at the same moment); only the plating moment differs.
  function cheeseburgerRun(platingDelay: number, wait: number): { sim: Simulation; dish: ReturnType<typeof plate> } {
    const sim = new Simulation({ ...LEVELS[1], recipes: ['cheeseburger'] }), stove = station(sim, 'stove');
    tick(sim, 2.1);
    sim.player.held = food('beef'); sim.interact(stove); tick(sim, 6.1 + platingDelay);
    sim.player.held = plate(); sim.interact(stove);
    const dish = sim.player.held as ReturnType<typeof plate>;
    dish.components.push({ kind: 'bread', state: 'RAW' }, { kind: 'cheese', state: 'RAW' });
    expect(matchRecipe(dish.components)?.id).toBe('cheeseburger');
    tick(sim, wait); sim.interact(station(sim, 'serve')); tick(sim, 3.5);
    expect(sim.served).toBe(1);
    return { sim, dish };
  }
  it('pays a bonus only when freshly cooked food is plated straight from the stove', () => {
    const perfect = cheeseburgerRun(0, 6), late = cheeseburgerRun(6, 0);
    expect(PERFECT_SECONDS).toBeLessThan(6);
    expect(perfect.dish.perfect).toBe(1); expect(late.dish.perfect ?? 0).toBe(0);
    expect(perfect.sim.score - late.sim.score).toBe(PERFECT_BONUS);
  });
  it('clears the mark when a plate is emptied and never rewards burning food', () => {
    const sim = new Simulation(LEVELS[1]), stove = station(sim, 'stove');
    sim.player.held = food('beef'); sim.interact(stove); tick(sim, 6.1);
    expect(sim.prompt(stove)).toBe('烹饪完成 · J 装盘 / 取出');
    sim.player.held = plate(); expect(sim.prompt(stove)).toContain('完美火候'); sim.interact(stove);
    const held = sim.player.held as ReturnType<typeof plate>; expect(held.perfect).toBe(1);
    sim.interact(station(sim, 'trash')); expect(held.components).toHaveLength(0); expect(held.perfect).toBe(0);
    sim.player.held = food('beef'); sim.interact(stove); tick(sim, 6 + 12.5);
    expect(stove.stoveState).toBe('BURNING'); sim.player.held = plate(); expect(sim.prompt(stove)).not.toContain('完美火候');
    sim.interact(stove); expect((sim.player.held as ReturnType<typeof plate>).perfect ?? 0).toBe(0);
  });
});

it('throws held food along the facing line onto the first empty worktop and rejects bad throws',()=>{
  const sim=new Simulation(LEVELS[0]),throwing:Control={...idle,throwItem:true};
  sim.player.x=2*TILE+TILE/2;sim.player.y=4*TILE+TILE/2;sim.player.facing={x:0,y:-1};sim.player.held=food('tomato');
  sim.update(1/60,throwing);
  const event=sim.events.find(e=>e.kind==='throw')!;
  expect(Boolean(event)).toBe(true);expect(sim.player.held).toBeNull();
  const landed=sim.stations.find(s=>s.item?.type==='food'&&s.x+TILE/2===event.x&&s.y+TILE/2===event.y)!;
  expect(Boolean(landed)).toBe(true);expect(['counter','board']).toContain(landed.kind);
  // The cooldown blocks an immediate second throw, and plates can never be thrown.
  sim.player.held=food('lettuce');sim.update(1/60,throwing);expect(sim.events.some(e=>e.kind==='throw')).toBe(false);
  sim.player.held=plate();tick(sim,.6);sim.update(1/60,throwing);
  expect(sim.player.held?.type).toBe('plate');expect(sim.events.some(e=>e.kind==='throw')).toBe(false);
});
