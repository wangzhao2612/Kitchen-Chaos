import { TILE } from '../game/types';
import type { IngredientKind, Level, Obstacle, Station, StationKind, Theme } from '../game/types';
type LayoutStation = Level['stations'][number];
function station(kind: StationKind, c: number, r: number, ingredient?: IngredientKind): LayoutStation { return { id: `${kind}-${c}-${r}`, kind, x: c * TILE, y: r * TILE, ingredient }; }
const themes: Theme[] = [
  { floor: '#ead3a0', tile: '#fff0cb', counter: '#f7c16b', cabinet: '#ad7043', accent: '#38ad98', wall: '#f0dab0', outside: '#6a947b' },
  { floor: '#d8d0bd', tile: '#f0e8d7', counter: '#ed8068', cabinet: '#965645', accent: '#4d9d9b', wall: '#eed1bb', outside: '#394e5b' },
  { floor: '#c5d5c7', tile: '#eaf3d8', counter: '#5bbca5', cabinet: '#477d71', accent: '#dda651', wall: '#ccdecc', outside: '#6a8376' },
  { floor: '#d4bd93', tile: '#e5d1aa', counter: '#e6ac5e', cabinet: '#98623e', accent: '#52979e', wall: '#e9bf76', outside: '#537b89' },
  { floor: '#d4c9be', tile: '#eee4d7', counter: '#b997ca', cabinet: '#654e66', accent: '#f3bd53', wall: '#e1d2c0', outside: '#42425c' }
];
function boundary(cols: number, rows: number): Obstacle[] { return [{ x: 0, y: 0, w: cols * TILE, h: TILE }, { x: 0, y: (rows-1) * TILE, w: cols * TILE, h: TILE }, { x: 0, y: TILE, w: TILE, h: (rows-2) * TILE }, { x: (cols-1) * TILE, y: TILE, w: TILE, h: (rows-2) * TILE }]; }
const names = ['阳光厨房', '汉堡餐厅', '繁忙食堂', '移动厨房', '终极厨房'];
const english = ['SUNNY SIDE', 'BURGER CLUB', 'LUNCH RUSH', 'ON THE ROAD', 'GRAND FINALE'];
const subtitles = ['从一份新鲜沙拉开始', '把握火候，煎出好滋味', '左上角快速洗碗', '小餐车里的灵活动线', '紧凑厨房，完整料理挑战'];
const descriptions = ['温暖的小餐厅。练习切菜、装盘与上菜；传送带回收脏盘，Space 两秒洗净。', '紧凑的双炉灶厨房。食物煎好后及时装盘，脏盘自动送入洗碗槽。', '米饭、鸡肉与多种订单。脏盘自动送到左上角的水槽，Space 两秒洗净。', '汤和意面登场。小餐车的交替通道始终保留一条通路。', '六种菜谱、四个炉灶、左上角的洗碗槽。烧焦起火时使用灭火器！'];
const recipeIds = [['salad'], ['burger', 'cheeseburger'], ['chickenrice', 'salad', 'cheeseburger', 'burger'], ['soup', 'pasta', 'salad', 'burger'], ['salad', 'soup', 'burger', 'cheeseburger', 'chickenrice', 'pasta']];
const ingredients: IngredientKind[][] = [['lettuce', 'tomato'], ['bread', 'beef', 'lettuce', 'cheese'], ['rice', 'chicken', 'lettuce', 'tomato', 'bread', 'beef', 'cheese'], ['tomato', 'onion', 'noodles', 'carrot', 'lettuce', 'bread', 'beef'], ['tomato', 'lettuce', 'onion', 'carrot', 'potato', 'beef', 'chicken', 'rice', 'bread', 'cheese', 'noodles']];
export const LEVELS: Level[] = names.map((name, i) => {
  const cols = [12,13,14,14,15][i], rows = i < 2 ? 9 : 10;
  const stations: LayoutStation[] = [];
  const firstCrate = Math.max(2, Math.floor((cols-ingredients[i].length)/2));
  ingredients[i].forEach((kind, k) => stations.push(station('crate', firstCrate+k, 1, kind)));
  const serviceRow = rows-2;
  stations.push(station('plates',2,serviceRow),station('serve',3,serviceRow),station('serve',4,serviceRow),station('trash',i>=2?8:5,serviceRow));
  stations.push(station('board',2,3),station('board',3,3),station('counter',4,3),station('counter',5,3));
  const sideRow = i >= 3 ? 6 : 5;
  stations.push(station('counter',cols-4,sideRow),station('counter',cols-3,sideRow));
  const stoveCount = [0,2,3,2,4][i], stoveStart = [0,7,8,9,9][i];
  for(let k=0;k<stoveCount;k++) stations.push(station('stove',stoveStart+k,3));
  stations.push(station('sink',1,1));
  if(i>=2) stations.push(station('counter',5,serviceRow));
  if(i===4) stations.push(station('extinguisher',9,serviceRow),station('board',4,6));
  const obstacles = boundary(cols,rows);
  if(i>=3) {
    stations.push({...station('counter',2,6),moving:{fromX:2*TILE,toX:(i===4?3:4)*TILE,y:6*TILE,phase:0,direction:1}});
    for(const row of [4,5,7]) stations.push(station('counter',7,row));
    // Both gates connect the same zones; the food aisle above them stays open.
    obstacles.push({x:7*TILE,y:3*TILE,w:TILE,h:TILE,gate:true},{x:7*TILE,y:6*TILE,w:TILE,h:TILE,gate:true});
  }
  return {id:i+1,cols,rows,name,english:english[i],subtitle:subtitles[i],description:descriptions[i],recipes:recipeIds[i],interval:[24,22,20,20,18][i],orderTime:90,maxOrders:[2,3,3,4,4][i],stars:[[300,600,900],[400,750,1100],[450,850,1250],[450,850,1050],[500,950,1250]][i] as [number,number,number],plates:i===0?3:i===1?4:5,washing:true,fire:i===4,dynamic:i>=3,theme:themes[i],stations,obstacles,spawn:{x:6.5*TILE,y:5.5*TILE}};
});
export function createStations(level: Level): Station[] { return level.stations.map(s => ({ ...s, moving: s.moving ? { ...s.moving } : undefined, item: null, stoveState: 'IDLE', elapsed: 0, cookTime: 0, extinguish: 0 })); }
