import { describe, expect, it } from 'vitest';
import { customerMood } from '../src/rendering/CustomerMood';
import type { Customer } from '../src/restaurant/Restaurant';
const guest:Customer={id:1,party:1,seat:0,recipeId:'salad',orderId:1,state:'WAITING',age:0,patience:90,unhappy:false,plate:null};
describe('customer patience expressions',()=>{
  it.each([[90,'relaxed'],[60.01,'relaxed'],[60,'uneasy'],[30.01,'uneasy'],[30,'angry'],[0,'angry']] as const)('patience %s has expression %s',(patience,mood)=>{expect(customerMood({...guest,patience})).toBe(mood);expect(customerMood({...guest,state:'DELIVERING',patience})).toBe(mood);});
  it('dining and choosing have no patience indicator; only unhappy departure has an angry face',()=>{for(const state of ['ARRIVING','CHOOSING','QUEUED','EATING','LEAVING'] as const)expect(customerMood({...guest,state})).toBeNull();expect(customerMood({...guest,state:'LEAVING',unhappy:true})).toBe('angry');});
});
