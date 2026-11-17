import { expect,it } from 'vitest';
import { recipe,recipeEconomy } from '../src/cooking/recipes';
import { INGREDIENT_COST,plate } from '../src/game/types';
import { Simulation, TIP_PATIENCE_RATIO, TIP_RATE } from '../src/game/Simulation';
import { LEVELS } from '../src/levels/data';
it('prices every original recipe with ingredient costs exactly half its sale price',()=>{
  const expected=[['salad',4,8],['soup',4,8],['burger',9,18],['cheeseburger',10,20],['chickenrice',6,12],['pasta',6,12]] as const;
  for(const [id,cost,price] of expected)expect(recipeEconomy(recipe(id))).toEqual({cost,price});
  expect(Object.keys(INGREDIENT_COST)).toHaveLength(11);
});
it('recognizes revenue only on arrival and includes waste in real ingredient costs and profit',()=>{
  const s=new Simulation(LEVELS[0]),idle={x:0,y:0,interact:false,work:false,dash:false};
  for(let i=0;i<126;i++)s.update(1/60,idle);
  const p=plate();p.components=recipe('salad').components.map(c=>({...c}));s.player.held=p;s.cleanPlates--;
  s.interact(s.stations.find(st=>st.kind==='serve')!);expect(s.revenue).toBe(0);
  for(let i=0;i<150;i++)s.update(1/60,idle);
  expect(s.result().revenue).toBe(8);expect(s.result().ingredientCost).toBe(4);expect(s.result().profit).toBe(4);
  s.interact(s.stations.find(st=>st.kind==='crate'&&st.ingredient==='tomato')!);s.interact(s.stations.find(st=>st.kind==='trash')!);
  expect(s.result().wasteCost).toBe(2);expect(s.result().ingredientCost).toBe(6);expect(s.result().profit).toBe(2);expect(s.result()).toEqual(s.result());
});
it('pays a separate tip only when served with at least two thirds of the patience left, without touching revenue or profit',()=>{
  const serveSalad=(patience:number)=>{
    const s=new Simulation(LEVELS[0]),idle={x:0,y:0,interact:false,work:false,dash:false};
    for(let i=0;i<126;i++)s.update(1/60,idle);
    for(const c of s.restaurant.customers)c.patience=patience;
    const p=plate();p.components=recipe('salad').components.map(c=>({...c}));s.player.held=p;s.cleanPlates--;
    s.interact(s.stations.find(st=>st.kind==='serve')!);
    for(let i=0;i<150;i++)s.update(1/60,idle);
    return s;
  };
  const fresh=serveSalad(85),late=serveSalad(50);
  expect(TIP_PATIENCE_RATIO).toBeCloseTo(2/3);
  expect(fresh.served).toBe(1);expect(late.served).toBe(1);
  expect(fresh.tips).toBe(Math.max(1,Math.round(recipeEconomy(recipe('salad')).price*TIP_RATE)));expect(fresh.tips).toBe(2);
  expect(late.tips).toBe(0);
  expect(fresh.result()).toMatchObject({tips:2,revenue:8,ingredientCost:4,profit:4});
  expect(late.result()).toMatchObject({tips:0,revenue:8,ingredientCost:4,profit:4});
});
