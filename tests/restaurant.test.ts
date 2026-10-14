import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/game/Simulation';
import { LEVELS } from '../src/levels/data';
import { plate, DIRTY_RETURN_SECONDS } from '../src/game/types';
import type { Control, Plate } from '../src/game/types';
import { recipe } from '../src/cooking/recipes';
import { EATING_SECONDS, Restaurant, SEATS } from '../src/restaurant/Restaurant';
import { deliveryPosition, diningLayout, plateReturnPosition } from '../src/rendering/RestaurantArt';
const idle: Control = { x: 0, y: 0, interact: false, work: false, dash: false };
function tick(s: Simulation, seconds: number) { for (let i = 0; i < Math.ceil(seconds * 60); i++) s.update(1 / 60, idle); }
function fixturePlate(id: string): Plate { const p = plate(); p.components = recipe(id).components.map(c => ({ ...c })); return p; }
describe('customer-owned restaurant orders', () => {
  it('creates no demand until actual guests arrive and choose a dish', () => {
    const s = new Simulation(LEVELS[0]);
    expect(s.orders).toHaveLength(0); expect(s.restaurant.customers).toHaveLength(1);
    tick(s, 1.4); expect(s.orders).toHaveLength(0); expect(s.restaurant.customers.some(c => c.state === 'CHOOSING')).toBe(true);
    tick(s, .7); expect(s.orders).toHaveLength(1);
    const order = s.orders[0]; expect(order.recipeId).toBe('salad'); expect(order.quantity).toBe(1);
    expect(s.restaurant.customers.filter(c => c.orderId === order.id && c.state === 'WAITING')).toHaveLength(order.quantity);
  });
  it('every level restricts all arrivals and requests to its existing menu', () => {
    for (const level of LEVELS) {
      const s = new Simulation(level);
      for (let i = 0; i < 180; i++) {
        tick(s, 1);
        for (const c of s.restaurant.customers) expect(level.recipes).toContain(c.recipeId);
        expect(s.restaurant.customers.length).toBeLessThanOrEqual(SEATS);
        expect(new Set(s.restaurant.customers.map(c => c.seat)).size).toBe(s.restaurant.customers.length);
        expect(s.orders.length + s.restaurant.pendingRecipes.length).toBeLessThanOrEqual(level.maxOrders);
        for (const order of s.orders) expect(s.restaurant.customers.filter(c => c.orderId === order.id && c.state === 'WAITING')).toHaveLength(order.quantity);
      }
    }
  });
  it('reserves pending party recipes without creating duplicate batches', () => {
    const s = new Simulation(LEVELS[4]);
    for(let i=0;i<4;i++){tick(s,3);s.spawnOrder();}
    tick(s,3); expect(s.orders).toHaveLength(4); expect(new Set(s.orders.map(o => o.recipeId)).size).toBe(4);
  });
  it('routes the actual served plate to a waiting guest, then eating and departure', () => {
    const s = new Simulation(LEVELS[0]); tick(s, 2.1);
    s.interact(s.stations.find(st => st.kind === 'plates')!);
    const p = s.player.held as Plate; p.components = fixturePlate('salad').components;
    const order = s.orders[0], servedAt = s.stations.find(st => st.kind === 'serve')!;
    s.interact(servedAt);
    const d = s.restaurant.deliveries[0], guest = s.restaurant.customers.find(c => c.id === d.customerId)!;
    expect(d.plate).toBe(p); expect(guest.state).toBe('DELIVERING'); expect(order.quantity).toBe(0); expect(s.served).toBe(0); expect(s.plateCount()).toBe(3);
    tick(s, .55); expect(s.restaurant.deliveries[0].elapsed).toBeGreaterThan(.5); expect(guest.plate).toBeNull();
    tick(s, d.duration - d.elapsed + .02); expect(s.restaurant.deliveries).toHaveLength(0); expect(guest.state).toBe('EATING'); expect(guest.plate).toBe(p);
    tick(s,EATING_SECONDS+.1); expect(guest.state).toBe('LEAVING'); expect(guest.plate).toBeNull();
    expect(s.restaurant.returning).toHaveLength(1); expect(s.restaurant.returning[0].plate).toBe(p); expect(p.dirty).toBe(true); expect(p.components).toEqual([]);
    const returned=s.restaurant.returning[0],sink=s.stations.find(st=>st.kind==='sink')!;
    expect(plateReturnPosition(s.level.rows,{...returned,elapsed:returned.duration},sink)).toEqual({x:80+sink.x+28,y:95+sink.y*.78+13});
    tick(s, .8); expect(s.restaurant.customers).not.toContain(guest); expect(s.plateCount()).toBe(3);
    tick(s,1.7); expect(s.restaurant.returning).toHaveLength(0); expect(s.dirtyQueue[0]).toBe(p); expect(s.dirtyPlates).toBe(1);
    s.work(sink,1); expect(s.dirtyPlates).toBe(1); expect(sink.item).toBe(p); s.work(sink,1); expect(s.dirtyPlates).toBe(0); expect(s.cleanPlates).toBe(3); expect(s.player.held).toBeNull(); expect(s.plateCount()).toBe(3);
  });
  it('returns dirty plates only after belt delivery and the guest finishes eating', () => {
    const s = new Simulation({ ...LEVELS[2], recipes: ['salad'] }); tick(s, 2.1);
    s.interact(s.stations.find(st => st.kind === 'plates')!); (s.player.held as Plate).components = fixturePlate('salad').components;
    s.interact(s.stations.find(st => st.kind === 'serve')!);
    tick(s, 2.5); expect(s.dirtyPlates).toBe(0); expect(s.restaurant.customers.every(c => c.state==='EATING')).toBe(true);
    tick(s, DIRTY_RETURN_SECONDS - 2.5 + .1); expect(s.dirtyPlates).toBe(1); expect(s.plateCount()).toBe(s.level.plates);
  });
  it('wrong and incomplete plates cannot start deliveries or consume demand', () => {
    const s = new Simulation(LEVELS[0]); tick(s, 2.1); const before = s.orders[0].quantity;
    s.player.held = fixturePlate('burger'); s.interact(s.stations.find(st => st.kind === 'serve')!);
    expect(s.restaurant.deliveries).toHaveLength(0); expect(s.orders[0].quantity).toBe(before); expect(s.score).toBe(0);
    s.player.held = plate(); s.interact(s.stations.find(st => st.kind === 'serve')!); expect(s.restaurant.deliveries).toHaveLength(0);
  });
  it('expires a waiting customer at one minute and rejects a delivery that arrives too late',()=>{
    const s=new Simulation(LEVELS[0]);tick(s,2.1);const guest=s.restaurant.customers[0];
    guest.patience=1;s.interact(s.stations.find(st=>st.kind==='plates')!);(s.player.held as Plate).components=fixturePlate('salad').components;s.interact(s.stations.find(st=>st.kind==='serve')!);
    tick(s,1.1);expect(guest.state).toBe('LEAVING');expect(guest.unhappy).toBe(true);expect(s.failed).toBe(1);expect(s.served).toBe(0);expect(s.score).toBe(0);
    expect(s.result().wasted).toBe(2);expect(s.restaurant.deliveries).toHaveLength(0);expect(s.restaurant.returning).toHaveLength(1);expect(s.plateCount()).toBe(3);
    tick(s,3);expect(s.dirtyPlates).toBe(1);expect(s.restaurant.customers).not.toContain(guest);
  });
  it('finished simulations freeze all restaurant state and new runs reset it', () => {
    const s = new Simulation(LEVELS[4]); tick(s, 3); s.time = .01; tick(s, .1);
    const frozen = JSON.stringify(s.restaurant); tick(s, 10); expect(JSON.stringify(s.restaurant)).toBe(frozen);
    const fresh = new Simulation(LEVELS[4]); expect(fresh.orders).toHaveLength(0); expect(fresh.restaurant.deliveries).toHaveLength(0); expect(fresh.restaurant.customers.every(c => c.state === 'ARRIVING')).toBe(true);
  });
  it('belt geometry starts at its output and terminates at the assigned seat on every map', () => {
    for (const level of LEVELS) {
      const s = new Simulation(level); tick(s, 2.1); const order = s.orders[0];
      const serve = s.stations.filter(st => st.kind === 'serve');
      for (const port of serve) {
        const c = s.restaurant.customers.find(c => c.state === 'WAITING'); if (!c) continue;
        s.restaurant.dispatch(order.id, fixturePlate(order.recipeId), port);
        const d = s.restaurant.deliveries.at(-1)!;
        const start = deliveryPosition(level.rows, d, c.seat); expect(start.x).toBe(80 + d.source.x);
        d.elapsed = d.duration / 2; expect(deliveryPosition(level.rows, d, c.seat)).not.toEqual(start);
        d.elapsed = d.duration; expect(deliveryPosition(level.rows, d, c.seat)).toEqual({ x: 88, y: diningLayout(level.rows).seatY(c.seat) });
      }
    }
  });
  it('never overbooks stools or accepts fractional party sizes', () => {
    const r = new Restaurant(); expect(r.arrive('salad', .5)).toBe(false); expect(r.arrive('salad',3)).toBe(false);for(let i=0;i<SEATS/2;i++)expect(r.arrive('salad',2)).toBe(true); expect(r.arrive('salad', 1)).toBe(false); expect(r.freeSeats).toBe(0);
  });
});

it('holding Space washes a queue consecutively and preserves partial progress across a pause',()=>{
  const s=new Simulation(LEVELS[0]),sink=s.stations.find(st=>st.kind==='sink')!;
  s.cleanPlates-=2; const plates=[plate(),plate()]; plates.forEach(p=>p.dirty=true); s.dirtyQueue.push(...plates);
  s.work(sink,.75); expect(s.dirtyPlates).toBe(2); expect(sink.item?.type).toBe('plate'); tick(s,1); expect((sink.item as Plate).progress).toBe(.75);
  s.work(sink,1.25); expect(s.dirtyPlates).toBe(1); expect(s.cleanPlates).toBe(2); s.work(sink,2); expect(s.dirtyPlates).toBe(0); expect(s.cleanPlates).toBe(3); expect(s.plateCount()).toBe(3);
});

it('dirty plates share the food belt and keep moving upward to the upper-left sink',()=>{
  for(const level of LEVELS){const s=new Simulation(level),sink=s.stations.find(st=>st.kind==='sink')!;
    for(let seat=0;seat<SEATS;seat++){let previous=Infinity; const p=plate();p.dirty=true;
      for(let frame=0;frame<=60;frame++){const point=plateReturnPosition(level.rows,{id:1,plate:p,seat,elapsed:frame/60,duration:1},sink);expect(point.y).toBeLessThanOrEqual(previous+.001);previous=point.y;}
    }
  }
});

it('halves actual delivery and return speeds, eats for eight seconds and expires after ninety seconds',()=>{
  const s=new Simulation(LEVELS[0]);tick(s,2.1);expect(s.restaurant.customers).toHaveLength(1);
  const guest=s.restaurant.customers[0];expect(guest.patience).toBeGreaterThan(89);expect(s.orders[0].duration).toBe(90);tick(s,88);expect(guest.state).toBe('WAITING');tick(s,2);expect(guest.state).toBe('LEAVING');expect(s.orders).toHaveLength(0);expect(s.failed).toBe(1);
  const r=new Restaurant();r.arrive('salad',1);const party=r.update(1.3);expect(party).toHaveLength(0);const ready=r.update(.6)[0];r.takeOrder(ready,1);
  const plate=fixturePlate('salad');const source=new Simulation(LEVELS[0]).stations.find(st=>st.kind==='serve')!;r.dispatch(1,plate,source);
  expect(r.deliveries[0].duration).toBeCloseTo(2.3);r.update(2.29);expect(r.customers[0].state).toBe('DELIVERING');r.update(.02);expect(r.customers[0].state).toBe('EATING');
  // Fixed-step updates keep eating independent of delivery.
  for(let i=0;i<7*60;i++)r.update(1/60);expect(r.customers[0].state).toBe('EATING');for(let i=0;i<61;i++)r.update(1/60);expect(r.returning[0].duration).toBeCloseTo(2.4);
});

it('accounts for raw, cooked, burnt and unused ingredients without duplicate waste records',()=>{
  const s=new Simulation(LEVELS[4]),crate=s.stations.find(st=>st.kind==='crate'&&st.ingredient==='tomato')!,trash=s.stations.find(st=>st.kind==='trash')!;
  s.interact(crate);s.interact(trash);expect(s.result().wasted).toBe(1);expect(s.result().wasteCost).toBe(2);
  s.interact(crate);expect(s.result().wasted).toBe(2);const same=s.result();expect(s.result()).toEqual(same);
  s.interact(trash);expect(s.result().wasted).toBe(2);expect(s.result().wasteBreakdown).toEqual([{kind:'tomato',quantity:2,cost:4}]);
  const burnt=fixturePlate('salad');burnt.components[0].state='BURNT';s.player.held=burnt;s.interact(trash);expect(s.result().wasted).toBe(4);expect(s.player.held).toBe(burnt);expect(burnt.components).toHaveLength(0);
});


it('each dish uses the least patience among its remaining waiting guests, excluding diners and deliveries',()=>{
  const s=new Simulation(LEVELS[0]);tick(s,2.1);const first=s.restaurant.customers[0];
  s.restaurant.customers.push({...first,id:999,seat:1,patience:80});first.patience=45;
  tick(s,1/60);expect(s.orders[0].quantity).toBe(2);expect(s.orders[0].remaining).toBeCloseTo(45-1/60);
  first.state='DELIVERING';tick(s,1/60);expect(s.orders[0].quantity).toBe(1);expect(s.orders[0].remaining).toBeCloseTo(80-2/60);
  first.state='EATING';first.patience=1;tick(s,1/60);expect(s.orders[0].remaining).toBeCloseTo(80-3/60);
});
