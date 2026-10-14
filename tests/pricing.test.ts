import { expect,it } from 'vitest';
import { recipe,recipeEconomy } from '../src/cooking/recipes';
import { INGREDIENT_COST,plate } from '../src/game/types';
import { Simulation } from '../src/game/Simulation';
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
