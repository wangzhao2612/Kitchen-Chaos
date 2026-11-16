export const TILE = 56;
export const WASH_SECONDS = 2;
// Upper bound for delivery, eating and the physical return belt.
export const DIRTY_RETURN_SECONDS = 14;
export type IngredientKind = 'tomato' | 'lettuce' | 'onion' | 'carrot' | 'potato' | 'beef' | 'chicken' | 'rice' | 'bread' | 'cheese' | 'noodles';
export type IngredientState = 'RAW' | 'CHOPPED' | 'COOKING' | 'COOKED' | 'BURNT';
export interface Component { kind: IngredientKind; state: IngredientState }
export interface Food { type: 'food'; components: Component[]; progress: number }
/** `perfect` counts cooked components plated straight from the stove right after they finished. */
export interface Plate { type: 'plate'; components: Component[]; dirty: boolean; progress: number; perfect?: number }
export interface Extinguisher { type: 'extinguisher' }
export type Item = Food | Plate | Extinguisher;
export type StoveState = 'IDLE' | 'COOKING' | 'READY' | 'BURNING' | 'BURNT' | 'ON_FIRE';
export type StationKind = 'crate' | 'counter' | 'board' | 'stove' | 'plates' | 'serve' | 'sink' | 'return' | 'trash' | 'extinguisher';
export interface Station {
  id: string; kind: StationKind; x: number; y: number; ingredient?: IngredientKind;
  item: Item | null; stoveState: StoveState; elapsed: number; cookTime: number; extinguish: number;
  moving?: { fromX: number; toX: number; y: number; phase: number; direction: number };
}
export interface Obstacle { x: number; y: number; w: number; h: number; gate?: boolean }
export type Activity = 'idle' | 'chop' | 'wash' | 'extinguish';
export interface Player { x: number; y: number; vx: number; vy: number; facing: { x: number; y: number }; held: Item | null; dash: number; cooldown: number; walk: number; yaw: number; heading: number; action: number; activity: Activity; workTime: number }
export interface Recipe { id: string; name: string; english: string; components: Component[]; score: number; color: string }
export interface Order { id: number; recipeId: string; remaining: number; duration: number; quantity: number }
export interface Theme { floor: string; tile: string; counter: string; cabinet: string; accent: string; wall: string; outside: string }
export interface Level {
  cols: number; rows: number;
  id: number; name: string; english: string; subtitle: string; description: string;
  recipes: string[]; interval: number; orderTime: number; maxOrders: number; stars: [number, number, number];
  plates: number; washing: boolean; fire: boolean; dynamic: boolean;
  theme: Theme; stations: Omit<Station, 'item' | 'stoveState' | 'elapsed' | 'cookTime' | 'extinguish'>[]; obstacles: Obstacle[];
  spawn: { x: number; y: number };
}
export type EventKind = 'pickup' | 'place' | 'chop' | 'wash' | 'ready' | 'serve' | 'fail' | 'fire' | 'extinguish' | 'dash' | 'finish' | 'hint';
export interface GameEvent { kind: EventKind; x: number; y: number; text?: string; value?: number }
export interface Control { x: number; y: number; interact: boolean; work: boolean; dash: boolean }
export interface RunResult { level: number; score: number; stars: number; served: number; failed: number; bestCombo: number; revenue: number; tips: number; ingredientCost: number; profit: number; wasted: number; wasteCost: number; wasteBreakdown: {kind: IngredientKind; quantity: number; cost: number}[] }
export const INGREDIENTS: Record<IngredientKind, { name: string; color: string; chop: number; cook: number }> = {
  tomato: { name: '番茄', color: '#ed6250', chop: 2, cook: 0 },
  lettuce: { name: '生菜', color: '#73b955', chop: 2, cook: 0 },
  onion: { name: '洋葱', color: '#c790c5', chop: 3, cook: 0 },
  carrot: { name: '胡萝卜', color: '#f0a145', chop: 3, cook: 0 },
  potato: { name: '土豆', color: '#d5ac65', chop: 3, cook: 0 },
  beef: { name: '牛肉', color: '#c86c69', chop: 0, cook: 6 },
  chicken: { name: '鸡肉', color: '#edb896', chop: 0, cook: 7 },
  rice: { name: '米饭', color: '#f5eee1', chop: 0, cook: 8 },
  bread: { name: '面包', color: '#e9ab4f', chop: 0, cook: 0 },
  cheese: { name: '奶酪', color: '#f8d35e', chop: 0, cook: 0 },
  noodles: { name: '面条', color: '#eac975', chop: 0, cook: 7 }
};
export const STATE_NAMES: Record<IngredientState, string> = { RAW: '原始', CHOPPED: '切好', COOKING: '烹饪中', COOKED: '熟食', BURNT: '烧焦' };
export const STATION_NAMES: Record<StationKind, string> = { crate: '食材箱', counter: '工作台', board: '切菜板', stove: '炉灶', plates: '干净盘子', serve: '上菜窗口', sink: '洗碗池', return: '脏盘回收', trash: '垃圾桶', extinguisher: '灭火器' };
export function food(kind: IngredientKind, state: IngredientState = 'RAW'): Food { return { type: 'food', components: [{ kind, state }], progress: 0 }; }
export function plate(): Plate { return { type: 'plate', components: [], dirty: false, progress: 0 }; }

export const INGREDIENT_COST: Record<IngredientKind,number> = {tomato:2,lettuce:2,onion:2,carrot:2,potato:2,beef:5,chicken:4,rice:2,bread:2,cheese:3,noodles:2};
