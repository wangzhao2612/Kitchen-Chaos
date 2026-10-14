import { PATIENCE_SECONDS } from '../restaurant/Restaurant';
import type { Customer } from '../restaurant/Restaurant';
export type Mood = 'relaxed' | 'uneasy' | 'angry';
/** Customers use expressions; their corresponding order card has a patience bar. */
export function customerMood(customer: Customer): Mood | null {
  if(customer.state==='LEAVING' && customer.unhappy) return 'angry';
  if(customer.state!=='WAITING' && customer.state!=='DELIVERING') return null;
  return customer.patience>PATIENCE_SECONDS*2/3?'relaxed':customer.patience>PATIENCE_SECONDS/3?'uneasy':'angry';
}
