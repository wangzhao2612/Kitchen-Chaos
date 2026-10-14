import { INGREDIENT_COST } from '../game/types';
import type { Component, Food, Recipe } from '../game/types';
export const RECIPES: Recipe[] = [
  { id: 'salad', name: '蔬菜沙拉', english: 'Garden salad', components: [{ kind: 'lettuce', state: 'CHOPPED' }, { kind: 'tomato', state: 'CHOPPED' }], score: 100, color: '#68a96c' },
  { id: 'soup', name: '番茄汤', english: 'Tomato soup', components: [{ kind: 'tomato', state: 'COOKED' }, { kind: 'onion', state: 'COOKED' }], score: 150, color: '#d6754f' },
  { id: 'burger', name: '经典汉堡', english: 'Classic burger', components: [{ kind: 'bread', state: 'RAW' }, { kind: 'beef', state: 'COOKED' }, { kind: 'lettuce', state: 'CHOPPED' }], score: 160, color: '#d6a14c' },
  { id: 'cheeseburger', name: '芝士汉堡', english: 'Cheeseburger', components: [{ kind: 'bread', state: 'RAW' }, { kind: 'beef', state: 'COOKED' }, { kind: 'cheese', state: 'RAW' }], score: 150, color: '#d3a347' },
  { id: 'chickenrice', name: '鸡肉饭', english: 'Chicken rice', components: [{ kind: 'rice', state: 'COOKED' }, { kind: 'chicken', state: 'COOKED' }], score: 180, color: '#bb915f' },
  { id: 'pasta', name: '蔬菜意面', english: 'Veggie pasta', components: [{ kind: 'noodles', state: 'COOKED' }, { kind: 'tomato', state: 'CHOPPED' }, { kind: 'carrot', state: 'CHOPPED' }], score: 170, color: '#dc8750' }
];
export function recipe(id: string): Recipe { const result = RECIPES.find(r => r.id === id); if (!result) throw new Error(`Unknown recipe: ${id}`); return result; }
function key(c: Component): string { return `${c.kind}:${c.state}`; }
export function isSubset(parts: Component[], expected: Component[]): boolean {
  const left = expected.map(key);
  for (const part of parts) { const index = left.indexOf(key(part)); if (index < 0) return false; left.splice(index, 1); }
  return true;
}
export function matchRecipe(parts: Component[]): Recipe | undefined { return RECIPES.find(r => r.components.length === parts.length && isSubset(parts, r.components)); }
export function canPlate(parts: Component[], add: Component[], allowed: string[]): boolean {
  return add.length > 0 && RECIPES.some(r => allowed.includes(r.id) && isSubset([...parts, ...add], r.components));
}
export const SOUP_INPUT: Component[] = [{ kind: 'tomato', state: 'CHOPPED' }, { kind: 'onion', state: 'CHOPPED' }];
export function cookingTime(item: Food): number {
  if (item.components.length === 2 && isSubset(item.components, SOUP_INPUT)) return 10;
  if (item.components.length !== 1 || item.components[0].state !== 'RAW') return 0;
  return ({ beef: 6, chicken: 7, rice: 8, noodles: 7 } as Record<string, number>)[item.components[0].kind] ?? 0;
}

export function recipeEconomy(dish: Recipe) { const cost=dish.components.reduce((sum,p)=>sum+INGREDIENT_COST[p.kind],0);return {cost,price:cost*2}; }
