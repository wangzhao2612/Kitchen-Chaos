import { WASH_SECONDS, INGREDIENT_COST, INGREDIENTS, STATION_NAMES, TILE, food, plate } from './types';
import type { Component, Control, GameEvent, Item, Level, Obstacle, Order, Plate, Player, RunResult, Station } from './types';
import { canPlate, recipeEconomy, cookingTime, isSubset, matchRecipe, SOUP_INPUT } from '../cooking/recipes';
import { createStations } from '../levels/data';
import { PATIENCE_SECONDS, Restaurant } from '../restaurant/Restaurant';

const RADIUS = 17;
export const ROUND_SECONDS = 300;
export const READY_SECONDS = 12;
export const WARNING_SECONDS = 5;
export const FIRE_SECONDS = 8;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const length = (x: number, y: number) => Math.hypot(x, y);

/** Pure simulation: no DOM, drawing, audio or wall-clock dependencies. */
export class Simulation {
  readonly stations: Station[];
  readonly player: Player;
  time = ROUND_SECONDS;
  elapsed = 0;
  score = 0;
  combo = 0;
  bestCombo = 0;
  served = 0;
  revenue = 0;
  private soldIngredientCost = 0;
  failed = 0;
  cleanPlates: number;
  readonly dirtyQueue: Plate[] = [];
  get dirtyPlates(): number { return this.dirtyQueue.length + this.stations.filter(s => s.kind === 'sink' && s.item?.type === 'plate' && s.item.dirty).length; }
  returns: { remaining: number; dirty: boolean }[] = [];
  orders: Order[] = [];
  readonly restaurant: Restaurant;
  events: GameEvent[] = [];
  finished = false;
  target: Station | null = null;
  private orderClock = 0;
  private orderId = 0;
  private arrivalId = 0;
  private waste: Component[] = [];
  private recordWaste(parts: Component[]): void { this.waste.push(...parts.map(p=>({...p}))); }
  private recipeBag: string[] = [];
  private seed: number;
  private hintCooldown = 0;

  constructor(readonly level: Level, seed = 1701 + level.id * 77) {
    this.seed = seed;
    this.stations = createStations(level);
    this.restaurant = new Restaurant(level.washing);
    this.cleanPlates = level.plates;
    this.player = { ...level.spawn, vx: 0, vy: 0, facing: { x: 0, y: -1 }, held: null, dash: 0, cooldown: 0, walk: 0, yaw: 0, heading: 0, action: 0, activity: 'idle', workTime: 0 };
    const extinguisher = this.stations.find(s => s.kind === 'extinguisher');
    if (extinguisher) extinguisher.item = { type: 'extinguisher' };
    this.spawnOrder();
  }

  private random(): number { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }
  spawnOrder(): void {
    if(this.restaurant.customers.some(c=>c.state==='ARRIVING'||c.state==='CHOOSING')) return;
    if (this.orders.length + this.restaurant.pendingRecipes.length >= this.level.maxOrders) return;
    const available = this.level.recipes.filter(id => !this.orders.some(o => o.recipeId === id) && !this.restaurant.pendingRecipes.includes(id));
    if (!available.length) return;
    const quantity = 1 + this.arrivalId % 2;
    if (this.restaurant.freeSeats < quantity) return;
    if (!this.recipeBag.some(id => available.includes(id))) {
      this.recipeBag = [...available];
      for (let i = this.recipeBag.length - 1; i > 0; i--) { const j = Math.floor(this.random() * (i + 1)); [this.recipeBag[i], this.recipeBag[j]] = [this.recipeBag[j], this.recipeBag[i]]; }
    }
    const recipeId = this.recipeBag.splice(this.recipeBag.findIndex(id => available.includes(id)), 1)[0];
    if(this.restaurant.arrive(recipeId, quantity)) this.arrivalId++;
  }

  update(dt: number, control: Control): void {
    if (this.finished) return;
    this.events = [];
    const step = Math.min(dt, this.time);
    this.hintCooldown = Math.max(0, this.hintCooldown - step);
    this.elapsed += step;
    this.time = Math.max(0, this.time - step);
    this.move(step, control);
    this.updateMovingCounters(step);
    this.target = this.findTarget();
    const previousActivity = this.player.activity;
    this.player.activity = 'idle';
    if (control.interact && this.target) this.interact(this.target);
    if (control.work && this.target) this.work(this.target, step);
    if (this.player.activity !== previousActivity) this.player.workTime = step;
    else if (this.player.activity !== 'idle') this.player.workTime += step;
    else this.player.workTime = 0;
    this.updateStoves(step);
    for (const party of this.restaurant.update(step)) {
      const quantity = party.customers.length;
      const duration = PATIENCE_SECONDS;
      const id = ++this.orderId;
      this.restaurant.takeOrder(party, id);
      this.orders.push({ id, recipeId: party.recipeId, duration, remaining: duration, quantity });
      this.emit('place', 0, this.level.rows * TILE / 2, '客人已点单');
    }
    this.dirtyQueue.push(...this.restaurant.collectReturnedPlates());
    for (const returned of this.returns) returned.remaining -= step;
    this.cleanPlates += this.returns.filter(r => r.remaining <= 0).length;
    this.returns = this.returns.filter(r => r.remaining > 0);
    const service=this.restaurant.collectServiceEvents();
    for(const expired of service.expired){
      this.recordWaste(expired.wasted);this.score=Math.max(0,this.score-30);this.combo=0;this.failed++;
      this.emit('fail',0,this.level.rows*TILE/2,'客人耐心耗尽 −30',-30);
    }
    for(const delivery of service.completed){
      const dish=matchRecipe(delivery.plate.components),customer=this.restaurant.customers.find(c=>c.id===delivery.customerId);
      if(!dish||!customer)continue;
      this.combo++;this.bestCombo=Math.max(this.bestCombo,this.combo);
      const points=dish.score+Math.floor(40*customer.patience/PATIENCE_SECONDS)+Math.min(50,(this.combo-1)*10);
      const sale=recipeEconomy(dish);this.revenue+=sale.price;this.soldIngredientCost+=sale.cost;
      this.score+=points;this.served++;this.emit('serve',delivery.source.x,delivery.source.y,`${dish.name} +${points}`,points);
    }
    for(const order of this.orders){
      const waiting=this.restaurant.customers.filter(c=>c.orderId===order.id&&c.state==='WAITING');
      order.quantity=waiting.length;order.remaining=waiting.length?Math.min(...waiting.map(c=>c.patience)):0;
    }
    this.orders=this.orders.filter(o=>o.quantity>0);
    this.orderClock += step;
    if (this.orderClock >= this.level.interval && this.orders.length < this.level.maxOrders) { this.spawnOrder(); this.orderClock = 0; }
    if (this.time === 0) { this.finished = true; this.emit('finish', this.player.x, this.player.y); }
  }

  activeObstacles(): Obstacle[] {
    const phase = Math.floor(this.elapsed / 12) % 2;
    const gates = this.level.obstacles.filter(o => o.gate);
    return this.level.obstacles.filter(o => !o.gate || gates.indexOf(o) === phase).filter(o => !o.gate || !this.circleHits(this.player.x, this.player.y, o));
  }

  private circleHits(x: number, y: number, rect: Obstacle): boolean {
    const closestX = clamp(x, rect.x, rect.x + rect.w);
    const closestY = clamp(y, rect.y, rect.y + rect.h);
    return (x - closestX) ** 2 + (y - closestY) ** 2 < RADIUS ** 2;
  }

  blocked(x: number, y: number): boolean {
    if (x < RADIUS || y < RADIUS || x > this.level.cols * TILE - RADIUS || y > this.level.rows * TILE - RADIUS) return true;
    return this.activeObstacles().some(o => this.circleHits(x, y, o)) || this.stations.some(s => this.circleHits(x, y, { x: s.x, y: s.y, w: TILE, h: TILE }));
  }

  private move(dt: number, control: Control): void {
    const p = this.player, startX=p.x, startY=p.y;
    p.cooldown = Math.max(0, p.cooldown - dt);
    p.dash = Math.max(0, p.dash - dt);
    p.action = Math.max(0, p.action - dt);
    const mag = length(control.x, control.y);
    const dx = mag ? control.x / mag : 0;
    const dy = mag ? control.y / mag : 0;
    if (mag) {
      p.facing = { x: Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0, y: Math.abs(dx) >= Math.abs(dy) ? 0 : Math.sign(dy) };
      p.heading=Math.atan2(dx,-dy);
    }
    const turn=Math.atan2(Math.sin(p.heading-p.yaw),Math.cos(p.heading-p.yaw));
    p.yaw=Math.abs(turn)<.001?p.heading:p.yaw+turn*(1-Math.exp(-24*dt));
    if (control.dash && p.cooldown === 0 && mag) { p.dash = 0.2; p.cooldown = 1.2; this.emit('dash', p.x, p.y); }
    const speed = p.dash > 0 ? 420 : 210;
    const blend = 1 - Math.exp(-(mag ? 17 : 21) * dt);
    p.vx += (dx * speed - p.vx) * blend;
    p.vy += (dy * speed - p.vy) * blend;
    // Substeps also protect collision during fast movement and test time steps.
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(p.vx * dt), Math.abs(p.vy * dt)) / 8));
    for (let i = 0; i < steps; i++) {
      const nx = p.x + p.vx * dt / steps;
      if (!this.blocked(nx, p.y)) p.x = nx; else p.vx = 0;
      const ny = p.y + p.vy * dt / steps;
      if (!this.blocked(p.x, ny)) p.y = ny; else p.vy = 0;
    }
    p.walk += length(p.x-startX,p.y-startY) * 0.04;
  }

  private updateMovingCounters(dt: number): void {
    for (const s of this.stations) {
      if (!s.moving) continue;
      const m = s.moving;
      const next = clamp(s.x + m.direction * dt * 22, m.fromX, m.toX);
      const swept = { x: Math.min(s.x, next), y: s.y, w: TILE + Math.abs(next - s.x), h: TILE };
      if (!this.circleHits(this.player.x, this.player.y, swept)) s.x = next;
      if (s.x >= m.toX) m.direction = -1;
      if (s.x <= m.fromX) m.direction = 1;
    }
  }

  findTarget(): Station | null {
    const p = this.player;
    const candidates = this.stations.map(s => {
      const x = clamp(p.x, s.x, s.x + TILE);
      const y = clamp(p.y, s.y, s.y + TILE);
      const distance = length(p.x - x, p.y - y);
      const cx = s.x + TILE / 2 - p.x, cy = s.y + TILE / 2 - p.y;
      const dot = (cx * p.facing.x + cy * p.facing.y) / Math.max(1, length(cx, cy));
      return { s, distance, score: distance - dot * 16 - (s === this.target ? 7 : 0) };
    }).filter(c => c.distance <= 42);
    candidates.sort((a, b) => a.score - b.score);
    return candidates[0]?.s ?? null;
  }

  emit(kind: GameEvent['kind'], x: number, y: number, text?: string, value?: number): void { this.events.push({ kind, x, y, text, value }); }
  private hint(text: string, station: Station): void { if (this.hintCooldown > 0) return; this.emit('hint', station.x + TILE / 2, station.y, text); this.hintCooldown = 0.45; }
  private pickup(s: Station): void { this.player.held = s.item; s.item = null; this.player.action = 0.2; this.emit('pickup', s.x + TILE / 2, s.y); }
  private place(s: Station): void { s.item = this.player.held; this.player.held = null; this.player.action = 0.2; this.emit('place', s.x + TILE / 2, s.y); }

  private canReturnToCrate(item: Item | null, s: Station): boolean {
    return item?.type === 'food' && item.components.length === 1 && item.components[0].kind === s.ingredient && item.components[0].state === 'RAW' && item.progress === 0;
  }

  interact(s: Station): void {
    const p = this.player, held = p.held;
    if (s.kind === 'crate') {
      if (this.canReturnToCrate(held, s)) {
        p.held = null; p.action = 0.2;
        this.emit('place', s.x + TILE / 2, s.y, '已放回原材料'); return;
      }
      if (held) { this.hint('原材料可放回对应食材箱；其他物品先放工作台', s); return; }
      p.held = food(s.ingredient!); p.action = 0.2; this.emit('pickup', s.x + TILE / 2, s.y); return;
    }
    if (s.kind === 'plates') {
      if (!held && this.cleanPlates > 0) { p.held = plate(); this.cleanPlates--; this.emit('pickup', s.x, s.y); }
      else if (held?.type === 'plate' && !held.dirty && !held.components.length) { p.held = null; this.cleanPlates++; this.emit('place', s.x, s.y); }
      else this.hint(!held ? (this.level.washing ? '盘子用完了，去洗碗槽按住 Space' : '盘子正在归还，请稍等') : '这里只能放回空的干净盘子', s);
      return;
    }
    if (s.kind === 'return') {
      this.hint('传送带直接将脏盘送入洗碗槽', s);
      return;
    }
    if (s.kind === 'serve') { this.serve(s); return; }
    if (s.kind === 'trash') {
      if (held?.type === 'food') { this.recordWaste(held.components); p.held = null; this.emit('place', s.x, s.y, '已丢弃'); }
      else if (held?.type === 'plate' && held.components.length) { this.recordWaste(held.components); held.components = []; this.emit('place', s.x, s.y, '清空盘子'); }
      else this.hint('携带食材或有食物的盘子，再按 J 丢弃', s);
      return;
    }
    if (s.kind === 'extinguisher') {
      if (!held && s.item) this.pickup(s);
      else if (held?.type === 'extinguisher' && !s.item) this.place(s);
      else this.hint('拿起灭火器，在起火炉灶旁按住 Space', s);
      return;
    }
    if (s.kind === 'stove') { this.stoveInteraction(s); return; }
    if (s.kind === 'sink') {
      this.hint(held ? '先放下手中物品，再按住 Space 洗碗' : this.dirtyPlates ? '按住 Space，直接清洗槽里的脏盘' : '脏盘吃完后会沿传送带送到这里', s);
      return;
    }
    if (!held && s.item) { this.pickup(s); return; }
    if (held && !s.item) { this.place(s); return; }
    if (held?.type === 'plate' && !held.dirty && s.item?.type === 'food') {
      if (this.addToPlate(held, s.item.components, s)) { s.item = null; this.emit('place', s.x, s.y, matchRecipe(held.components)?.name ?? '已装盘'); } return;
    }
    if (held?.type === 'food' && s.item?.type === 'plate' && !s.item.dirty) {
      if (this.addToPlate(s.item, held.components, s)) { p.held = null; this.emit('place', s.x, s.y, matchRecipe(s.item.components)?.name ?? '已添加'); } return;
    }
    this.hint(s.item ? '工作台已有物品，先空手取走' : '空手按 J 拾取，拿着物品按 J 放下', s);
  }

  private addToPlate(target: Extract<Item, { type: 'plate' }>, parts: Component[], s: Station): boolean {
    if (!canPlate(target.components, parts, this.level.recipes)) { this.hint('食材状态不对、重复，或不能组合成本关菜品', s); return false; }
    target.components.push(...parts.map(c => ({ ...c }))); return true;
  }

  private stoveInteraction(s: Station): void {
    const held = this.player.held;
    if (s.stoveState === 'ON_FIRE') { this.hint('炉灶起火！拿灭火器并按住 Space', s); return; }
    if (!held && s.item && s.stoveState !== 'COOKING') { this.pickup(s); this.resetStove(s); return; }
    if (held?.type === 'plate' && !held.dirty && s.item?.type === 'food' && ['READY', 'BURNING'].includes(s.stoveState)) {
      if (this.addToPlate(held, s.item.components, s)) { s.item = null; this.resetStove(s); this.emit('place', s.x, s.y, '热腾腾，已装盘'); } return;
    }
    if (s.stoveState === 'COOKING') { this.hint('正在烹饪，请留意进度条', s); return; }
    if (held?.type === 'food' && s.stoveState === 'IDLE') {
      if (!s.item) {
        if (cookingTime(held) > 0 || (this.level.recipes.includes('soup') && isSubset(held.components, SOUP_INPUT))) { this.place(s); this.startCooking(s); }
        else this.hint('牛肉、鸡肉、米饭和面条直接烹饪；汤需要切好的番茄与洋葱', s);
      } else if (s.item.type === 'food' && this.level.recipes.includes('soup') && isSubset([...s.item.components, ...held.components], SOUP_INPUT)) {
        s.item.components.push(...held.components); this.player.held = null; this.emit('place', s.x, s.y); this.startCooking(s);
      } else this.hint('锅里已有食物，或这两种食材不能一起煮', s);
      return;
    }
    this.hint(s.stoveState === 'BURNT' ? '空手取出烧焦食物，拿到垃圾桶丢弃' : '放入食材；完成后用干净盘子装盘', s);
  }

  private startCooking(s: Station): void {
    if (s.item?.type !== 'food') return;
    const time = cookingTime(s.item);
    if (!time) { this.hint('番茄汤：继续加入切好的另一种食材', s); return; }
    s.cookTime = time; s.elapsed = 0; s.stoveState = 'COOKING';
    s.item.components.forEach(c => c.state = 'COOKING');
  }

  private resetStove(s: Station): void { s.stoveState = 'IDLE'; s.elapsed = 0; s.cookTime = 0; s.extinguish = 0; }

  work(s: Station, dt: number): void {
    if (this.player.held?.type === 'extinguisher' && s.kind === 'stove' && s.stoveState === 'ON_FIRE') {
      this.player.activity = 'extinguish';
      this.player.action = 0.12;
      s.extinguish += dt;
      this.emit('extinguish', s.x + TILE / 2, s.y);
      if (s.extinguish >= 3) { if(s.item?.type==='food')this.recordWaste(s.item.components); s.item = null; this.resetStove(s); this.emit('ready', s.x, s.y, '火已扑灭，炉灶恢复'); }
      return;
    }
    if (this.player.held) return;
    if (s.kind === 'board' && s.item?.type === 'food' && s.item.components.length === 1) {
      const component = s.item.components[0], duration = INGREDIENTS[component.kind].chop;
      if (component.state !== 'RAW' || !duration) return;
      this.player.activity = 'chop';
      const dx=s.x+TILE/2-this.player.x,dy=s.y+TILE/2-this.player.y;
      this.player.facing=Math.abs(dx)>Math.abs(dy)?{x:Math.sign(dx),y:0}:{x:0,y:Math.sign(dy)};
      this.player.heading=Math.atan2(this.player.facing.x,-this.player.facing.y);
      this.player.yaw=this.player.heading;
      this.player.action = 0.12;
      const before = s.item.progress;
      s.item.progress = Math.min(duration, before + dt);
      if (Math.floor(before * 6) !== Math.floor(s.item.progress * 6)) this.emit('chop', s.x + TILE / 2, s.y);
      if (s.item.progress >= duration) { component.state = 'CHOPPED'; this.emit('ready', s.x, s.y, `${INGREDIENTS[component.kind].name}切好了`); }
    }
    if (s.kind === 'sink' && !s.item && this.dirtyQueue.length) s.item = this.dirtyQueue.shift()!;
    if (s.kind === 'sink' && s.item?.type === 'plate' && s.item.dirty) {
      this.player.activity = 'wash';
      const dx=s.x+TILE/2-this.player.x,dy=s.y+TILE/2-this.player.y;
      this.player.facing=Math.abs(dx)>Math.abs(dy)?{x:Math.sign(dx),y:0}:{x:0,y:Math.sign(dy)};
      this.player.heading=Math.atan2(this.player.facing.x,-this.player.facing.y); this.player.yaw=this.player.heading;
      this.player.action = 0.12;
      const before = s.item.progress;
      s.item.progress = Math.min(WASH_SECONDS, before + dt);
      if (Math.floor(before * 4) !== Math.floor(s.item.progress * 4)) this.emit('wash', s.x, s.y);
      if (s.item.progress >= WASH_SECONDS) { s.item.dirty = false; s.item.progress = 0; s.item = null; this.cleanPlates++; this.emit('ready', s.x, s.y, '洗净一只 · 已送回盘架'); }
    }
  }

  private updateStoves(dt: number): void {
    for (const s of this.stations) {
      if (s.kind !== 'stove' || !s.item || s.item.type !== 'food' || ['IDLE', 'ON_FIRE'].includes(s.stoveState)) continue;
      s.elapsed += dt;
      if (s.stoveState === 'COOKING' && s.elapsed >= s.cookTime) { s.elapsed -= s.cookTime; s.stoveState = 'READY'; s.item.components.forEach(c => c.state = 'COOKED'); this.emit('ready', s.x, s.y, '做好了！及时装盘'); }
      if (s.stoveState === 'READY' && s.elapsed >= READY_SECONDS) { s.elapsed -= READY_SECONDS; s.stoveState = 'BURNING'; this.emit('hint', s.x, s.y, '快装盘，要烧焦了！'); }
      if (s.stoveState === 'BURNING' && s.elapsed >= WARNING_SECONDS) { s.elapsed -= WARNING_SECONDS; s.stoveState = 'BURNT'; s.item.components.forEach(c => c.state = 'BURNT'); this.emit('fail', s.x, s.y, '食物烧焦了'); }
      if (s.stoveState === 'BURNT' && this.level.fire && s.elapsed >= FIRE_SECONDS) { s.stoveState = 'ON_FIRE'; this.emit('fire', s.x, s.y, '起火了！使用灭火器'); }
    }
  }

  private serve(s: Station): void {
    const held = this.player.held;
    if (held?.type !== 'plate' || held.dirty) { this.hint('把完成的菜品装在干净盘子里送来', s); return; }
    const dish = matchRecipe(held.components);
    if (!dish) { this.hint('菜品尚未完成：对照顶部订单检查食材', s); return; }
    const matching = this.orders.filter(o => o.recipeId === dish.id).sort((a, b) => a.remaining - b.remaining)[0];
    if (!matching) { this.hint(`目前没有${dish.name}订单，可以先放在工作台`, s); return; }
    if (!this.restaurant.dispatch(matching.id, held, s)) { this.hint('请等客人入座点单后再上菜', s); return; }
    matching.quantity--;
    if (matching.quantity === 0) {
      this.orders = this.orders.filter(o => o.id !== matching.id);
      // A completed batch disappears before a fresh batch of that recipe arrives.
      this.orderClock = 0;
    }
    if (!this.level.washing) this.returns.push({ remaining: 4, dirty: false });
    this.player.held = null; this.player.action = 0.3;
    this.emit('place', s.x + TILE / 2, s.y, '已出餐 · 正在送到客人');
  }

  get stars(): number { return this.level.stars.filter(v => this.score >= v).length; }
  result(): RunResult {
    const unused=[this.player.held,...this.stations.map(s=>s.item),...this.restaurant.deliveries.map(d=>d.plate)].flatMap(item=>item&&item.type!=='extinguisher'?item.components:[]);
    const parts=[...this.waste,...unused],kinds=[...new Set(parts.map(p=>p.kind))];
    const wasteBreakdown=kinds.map(kind=>{const quantity=parts.filter(p=>p.kind===kind).length;return {kind,quantity,cost:quantity*INGREDIENT_COST[kind]};});
    const wasteCost=wasteBreakdown.reduce((sum,p)=>sum+p.cost,0),ingredientCost=this.soldIngredientCost+wasteCost;
    return {revenue:this.revenue,ingredientCost,profit:this.revenue-ingredientCost,level:this.level.id,score:this.score,stars:this.stars,served:this.served,failed:this.failed,bestCombo:this.bestCombo,wasted:parts.length,wasteCost,wasteBreakdown};
  }
  plateCount(): number { return this.cleanPlates + this.dirtyQueue.length + this.returns.length + (this.level.washing ? this.restaurant.platesInTransit : 0) + (this.player.held?.type === 'plate' ? 1 : 0) + this.stations.filter(s => s.item?.type === 'plate').length; }
  prompt(s: Station | null = this.target): string {
    if (!s) return '靠近设施查看操作 · J 拾放 · Space 加工';
    const held = this.player.held;
    if (s.kind === 'crate') {
      const action = this.canReturnToCrate(held, s) ? 'J 放回原材料' : held ? '先归还原材料或放在工作台' : 'J 拿取';
      return `${INGREDIENTS[s.ingredient!].name}箱 · ${action} · ${INGREDIENT_COST[s.ingredient!]} 金币 / 份`;
    }
    if (s.kind === 'board') {
      if (s.item?.type === 'food' && s.item.components[0].state === 'RAW' && INGREDIENTS[s.item.components[0].kind].chop) return '切菜板 · 按住 Space 切菜 · J 取走';
      return `切菜板 · J ${s.item ? (held?.type === 'plate' ? '装盘' : '取走') : '放置'}`;
    }
    if (s.kind === 'stove') {
      if (s.stoveState === 'ON_FIRE') return held?.type === 'extinguisher' ? '按住 Space 灭火' : '起火了！拿灭火器';
      if (s.stoveState === 'COOKING') return '正在烹饪，去准备其他食材吧';
      if (['READY', 'BURNING'].includes(s.stoveState)) return '烹饪完成 · J 装盘 / 取出';
      if (s.stoveState === 'BURNT') return '烧焦了 · 空手 J 取出，再丢弃';
      return s.item ? '番茄汤 · J 加入另一种切好的食材' : '炉灶 · J 放入食材';
    }
    if (s.kind === 'sink') return `洗碗槽 · 脏盘 ×${this.dirtyPlates} · ${held ? '先放下手中物品' : this.dirtyPlates ? '按住 Space 连续洗碗' : '等待传送带回收'}`;
    if (s.kind === 'plates') return `干净盘子 ×${this.cleanPlates} · J 拿取 / 归还空盘`;
    if (s.kind === 'return') return `脏盘回收 ×${this.dirtyPlates} · J 拿取`;
    if (s.kind === 'serve') return '出餐口 · J 上菜，传送带自动送到客人';
    if (s.kind === 'extinguisher') return '灭火器 · J 拿取 / 归还';
    if (s.kind === 'trash') return '垃圾桶 · J 丢弃食物，盘子保留';
    return `${STATION_NAMES[s.kind]} · J ${s.item ? (held?.type === 'food' ? '添加到盘子' : '取走 / 装盘') : '放置'}`;
  }
}
