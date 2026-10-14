import type { Component, Plate, Station } from '../game/types';
import { TILE } from '../game/types';
import { matchRecipe } from '../cooking/recipes';

export const SEATS = 8;
export const PATIENCE_SECONDS = 90;
export const EATING_SECONDS = 8;
export const BELT_SPEED_SCALE = .5;
export type CustomerState = 'ARRIVING' | 'CHOOSING' | 'QUEUED' | 'WAITING' | 'DELIVERING' | 'EATING' | 'LEAVING';
export interface Customer {
  id: number; party: number; seat: number; recipeId: string; orderId: number | null;
  state: CustomerState; age: number; patience: number; unhappy: boolean; plate: Plate | null;
}
export interface Delivery {
  id: number; customerId: number; recipeId: string; plate: Plate;
  source: { x: number; y: number }; elapsed: number; duration: number;
}
export interface PlateReturn { id: number; plate: Plate; seat: number; elapsed: number; duration: number }
export interface Party { id: number; recipeId: string; customers: Customer[] }

/** Real guests own the demand. Plates on the belt alias the plate in transit,
 * so delivery animation never creates another physical plate. */
export class Restaurant {
  customers: Customer[] = [];
  deliveries: Delivery[] = [];
  returning: PlateReturn[] = [];
  private arrivedPlates: Plate[] = [];
  private completed: Delivery[] = [];
  private expired: { customer: Customer; delivering: boolean; wasted: Component[] }[] = [];
  collectServiceEvents() { const result={completed:this.completed,expired:this.expired};this.completed=[];this.expired=[];return result; }
  private customerId = 0;
  private partyId = 0;
  private deliveryId = 0;
  constructor(readonly washing = true) {}
  get platesInTransit(): number { return this.deliveries.length + this.returning.length + this.customers.filter(c => c.plate !== null).length; }
  collectReturnedPlates(): Plate[] { const plates = this.arrivedPlates; this.arrivedPlates = []; return plates; }
  get pendingRecipes(): string[] { return [...new Set(this.customers.filter(c => c.orderId === null && c.state !== 'LEAVING').map(c => c.recipeId))]; }
  get freeSeats(): number { return SEATS - this.customers.length; }

  arrive(recipeId: string, quantity: number): boolean {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 2 || quantity > this.freeSeats) return false;
    const party = ++this.partyId;
    for (let i = 0; i < quantity; i++) {
      const seat = Array.from({ length: SEATS }, (_, n) => n).find(n => !this.customers.some(c => c.seat === n))!;
      this.customers.push({ id: ++this.customerId, party, seat, recipeId, orderId: null, state: 'ARRIVING', age: -i * .65, patience: PATIENCE_SECONDS, unhappy: false, plate: null });
    }
    return true;
  }

  update(dt: number): Party[] {
    for(const c of this.customers) if(c.state==='WAITING'||c.state==='DELIVERING'){
      c.patience=Math.max(0,c.patience-dt);
      if(c.patience<=0){
        const delivering=c.state==='DELIVERING',delivery=this.deliveries.find(d=>d.customerId===c.id);
        const wasted=delivery?.plate.components.map(p=>({...p}))??[];
        if(delivery){delivery.plate.components=[];delivery.plate.dirty=true;this.returning.push({id:c.id,plate:delivery.plate,seat:c.seat,elapsed:0,duration:1.2/BELT_SPEED_SCALE});}
        c.state='LEAVING';c.age=0;c.unhappy=true;this.expired.push({customer:c,delivering,wasted});
      }
    }
    this.deliveries=this.deliveries.filter(d=>this.customers.some(c=>c.id===d.customerId&&c.state==='DELIVERING'));
    for (const returned of this.returning) {
      returned.elapsed += dt;
      if (returned.elapsed >= returned.duration) this.arrivedPlates.push(returned.plate);
    }
    this.returning = this.returning.filter(r => r.elapsed < r.duration);
    for (const delivery of this.deliveries) {
      delivery.elapsed += dt;
      if (delivery.elapsed >= delivery.duration) {
        const customer = this.customers.find(c => c.id === delivery.customerId);
        if (customer) { this.completed.push(delivery); customer.state = 'EATING'; customer.age = 0; customer.plate = delivery.plate; }
      }
    }
    this.deliveries = this.deliveries.filter(d => d.elapsed < d.duration);
    for (const c of this.customers) {
      c.age += dt;
      if (c.state === 'ARRIVING' && c.age >= 1.25) { c.state = 'CHOOSING'; c.age = 0; }
      else if (c.state === 'CHOOSING' && c.age >= .55) { c.state = 'QUEUED'; c.age = 0; }
      else if (c.state === 'EATING' && c.age >= EATING_SECONDS) {
        if (c.plate && this.washing) {
          c.plate.components = []; c.plate.dirty = true; c.plate.progress = 0;
          this.returning.push({ id: c.id, plate: c.plate, seat: c.seat, elapsed: 0, duration: 1.2 / BELT_SPEED_SCALE });
        }
        c.state = 'LEAVING'; c.age = 0; c.plate = null;
      }
    }
    this.customers = this.customers.filter(c => c.state !== 'LEAVING' || c.age < .7);
    const pending = this.customers.filter(c => c.orderId === null && c.state !== 'LEAVING');
    return [...new Set(pending.map(c => c.party))].map(id => ({ id, recipeId: pending.find(c => c.party === id)!.recipeId, customers: pending.filter(c => c.party === id) })).filter(p => p.customers.every(c => c.state === 'QUEUED'));
  }

  takeOrder(party: Party, orderId: number): void {
    for (const c of party.customers) { c.orderId = orderId; c.state = 'WAITING'; c.age = 0; c.patience=PATIENCE_SECONDS; }
  }

  dispatch(orderId: number, plate: Plate, source: Station): boolean {
    const customer = this.customers.find(c => c.orderId === orderId && c.state === 'WAITING');
    if (!customer || plate.dirty || matchRecipe(plate.components)?.id !== customer.recipeId) return false;
    customer.state = 'DELIVERING'; customer.age = 0;
    this.deliveries.push({ id: ++this.deliveryId, customerId: customer.id, recipeId: customer.recipeId, plate, source: { x: source.x + TILE / 2, y: source.y + TILE }, elapsed: 0, duration: (1.15 + customer.seat * .07) / BELT_SPEED_SCALE });
    return true;
  }

  expire(orderId: number): void {
    for (const c of this.customers) if (c.orderId === orderId && c.state === 'WAITING') { c.state = 'LEAVING'; c.age = 0; c.unhappy = true; }
  }
}
