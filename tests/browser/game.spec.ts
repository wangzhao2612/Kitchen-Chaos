import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { recordedTestFile } from '../../scripts/test-records.mjs';
import { ROUND_SECONDS } from '../../src/game/Simulation';
import { EATING_SECONDS } from '../../src/restaurant/Restaurant';
import { LEVELS } from '../../src/levels/data';
const LEVEL_MENUS=LEVELS.map(l=>l.recipes);
import { RECIPES, recipe } from '../../src/cooking/recipes';
import { INGREDIENTS, TILE, WASH_SECONDS, DIRTY_RETURN_SECONDS } from '../../src/game/types';
import type { Customer, Delivery, PlateReturn } from '../../src/restaurant/Restaurant';
import { deliveryPosition } from '../../src/rendering/RestaurantArt';
import type { IngredientKind, Item, Obstacle, Order, Player, RunResult, Station } from '../../src/game/types';
type Snapshot = { result:RunResult; restaurant:{customers:Customer[];deliveries:Delivery[];returning:PlateReturn[]}; character:{loaded:boolean;pose:{headFrame:number;atlasFrame:number;direction:{x:number;y:number};tilt:number;leftFoot:{x:number;y:number;lift:number};rightFoot:{x:number;y:number;lift:number};activity:string;phase:number;item:{x:number;y:number}|null;workObject:{x:number;y:number}|null;leftHand:{x:number;y:number};rightHand:{x:number;y:number}}}; kitchen:{cols:number;rows:number}; screen: string; time: number; score: number; served: number; stars: number; failed: number; player: Player; target?: string; stations: Station[]; orders: Order[]; clean: number; dirty: number; plateCount: number; obstacles: Obstacle[]; unlocked: number[]; camera:{x:number;y:number;zoom:number;width:number;height:number}; audio:{context:string;playing:boolean;track:string;decoded:number;urgent:boolean;playbackRate:number} };
async function snapshot(page: Page): Promise<Snapshot> { return JSON.parse((await page.locator('#game-debug').textContent())!); }
async function advance(page: Page, ms: number): Promise<void> { await page.clock.runFor(Math.max(17, Math.round(ms))); }
async function key(page: Page, code: string, ms = 50): Promise<void> { await page.keyboard.down(code); await advance(page, ms); await page.keyboard.up(code); await advance(page, 40); }
async function boot(page: Page): Promise<void> {
  await page.clock.install({ time: new Date('2026-10-11T12:00:00Z') }); await page.goto('/');
  await page.clock.pauseAt(new Date('2026-10-11T12:00:01Z'));
  await advance(page,600);
  await expect(page.getByRole('heading', { name: '疯狂厨房', exact: true })).toBeVisible();
}
function find(s: Snapshot, kind: Station['kind'], ingredient?: IngredientKind): Station { return s.stations.find(st => st.kind === kind && (!ingredient || st.ingredient === ingredient))!; }
function hit(x: number, y: number, rect: Obstacle): boolean { const cx = Math.max(rect.x, Math.min(rect.x + rect.w, x)), cy = Math.max(rect.y, Math.min(rect.y + rect.h, y)); return (x-cx)**2+(y-cy)**2 < 19**2; }
function path(s: Snapshot, target: Station): { x: number; y: number }[] {
  const free = (x: number, y: number) => x > 0 && y > 0 && x < s.kitchen.cols-1 && y < s.kitchen.rows-1 && ![...s.obstacles, ...s.stations.map(st => ({ x: st.x, y: st.y, w: TILE, h: TILE }))].some(r => hit((x+.5)*TILE,(y+.5)*TILE,r));
  const start = [Math.floor(s.player.x/TILE),Math.floor(s.player.y/TILE)];
  const ends = [[0,1],[1,0],[-1,0],[0,-1]].map(([dx,dy]) => [Math.round(target.x/TILE)+dx,Math.round(target.y/TILE)+dy]).filter(([x,y]) => free(x,y));
  const queue = [start], previous = new Map<string,string | null>([[start.join(','),null]]); let end: number[] | null = null;
  while (queue.length) { const [x,y] = queue.shift()!; if (ends.some(([ex,ey])=>ex===x&&ey===y)) { end=[x,y]; break; } for (const [dx,dy] of [[0,1],[1,0],[-1,0],[0,-1]]) { const next=[x+dx,y+dy], id=next.join(','); if (!previous.has(id)&&free(...next as [number,number])) { previous.set(id,`${x},${y}`); queue.push(next); } } }
  if (!end) throw new Error(`No path to ${target.id} from ${start}`);
  const points: {x:number;y:number}[]=[]; let id: string | null = end.join(',');
  while(id) { const [x,y]=id.split(',').map(Number); points.unshift({x:(x+.5)*TILE,y:(y+.5)*TILE}); id=previous.get(id)??null; }
  return points;
}
async function moveTo(page: Page, target: Station, retries = 0): Promise<void> {
  if(retries>10) throw new Error(`Repeatedly obstructed route to ${target.id}`);
  let current = await snapshot(page);
  const points = path(current,target);
  let heldKey: string | null = null;
  for (let index=0;index<points.length;index++) {
    const point=points[index];
    if(index===0&&[...current.obstacles,...current.stations.map(st=>({x:st.x,y:st.y,w:TILE,h:TILE}))].some(rect=>hit(point.x,point.y,rect)))continue;
    let lastDistance=Infinity,blockedFrames=0;
    for(let i=0;i<70;i++) {
      current=await snapshot(page); const dx=point.x-current.player.x,dy=point.y-current.player.y;
      const distance=Math.hypot(dx,dy); blockedFrames=Math.abs(lastDistance-distance)<.08?blockedFrames+1:0; lastDistance=distance;
      if(blockedFrames>4) { if(heldKey) await page.keyboard.up(heldKey); await advance(page,90); return moveTo(page,target,retries+1); }
      if(Math.abs(dx)<5&&Math.abs(dy)<5) break;
      const code=Math.abs(dx)>Math.abs(dy)?dx>0?'ArrowRight':'ArrowLeft':dy>0?'ArrowDown':'ArrowUp';
      if(heldKey!==code) { if(heldKey) await page.keyboard.up(heldKey); await page.keyboard.down(code); heldKey=code; }
      await advance(page,Math.max(17,Math.min(80,Math.max(Math.abs(dx),Math.abs(dy))/210*1000*.65)));
      if(i===69) throw new Error(`Movement stuck approaching ${target.id}: ${current.player.x},${current.player.y} -> ${point.x},${point.y}`);
    }
  }
  if(heldKey) await page.keyboard.up(heldKey); await advance(page,110);
  current=await snapshot(page);
  const dx=target.x+TILE/2-current.player.x,dy=target.y+TILE/2-current.player.y;
  await key(page,Math.abs(dx)>Math.abs(dy)?dx>0?'ArrowRight':'ArrowLeft':dy>0?'ArrowDown':'ArrowUp',35);
  expect((await snapshot(page)).target, `expected interaction target ${target.id}`).toBe(target.id);
}
async function interact(page: Page, station: Station): Promise<void> { await moveTo(page,station); await key(page,'KeyJ'); }
async function work(page: Page, station: Station, seconds: number): Promise<void> { await moveTo(page,station); await key(page,'Space',(seconds+.1)*1000); }
async function getPlate(page: Page): Promise<void> {
  let s=await snapshot(page);
  if(!s.clean) {
    if(!s.dirty) { await advance(page,(DIRTY_RETURN_SECONDS+.1)*1000); s=await snapshot(page); }
    await work(page,find(s,'sink'),WASH_SECONDS); await interact(page,find(s,'plates'));
  } else await interact(page,find(s,'plates'));
  expect((await snapshot(page)).player.held?.type).toBe('plate');
}
async function makeDish(page: Page, id: string, awaitDelivery=true): Promise<void> {
  let s=await snapshot(page); const r=recipe(id), assembly=s.stations.find(st=>st.kind==='counter'&&!st.moving)!, board=find(s,'board');
  await getPlate(page); await interact(page,assembly);
  const ordered=[...r.components].sort((a,b)=>({RAW:0,CHOPPED:1,COOKED:2,COOKING:3,BURNT:4}[a.state]-{RAW:0,CHOPPED:1,COOKED:2,COOKING:3,BURNT:4}[b.state]));
  if(id==='soup') {
    const stove=find(s,'stove');
    for(const kind of ['tomato','onion'] as IngredientKind[]) { await interact(page,find(s,'crate',kind)); await interact(page,board); await work(page,board,INGREDIENTS[kind].chop); await key(page,'KeyJ'); await interact(page,stove); }
    await interact(page,assembly); await moveTo(page,stove); s=await snapshot(page);
    const pot=s.stations.find(st=>st.id===stove.id)!;
    if(pot.stoveState==='COOKING') await advance(page,(pot.cookTime-pot.elapsed+.1)*1000);
    await key(page,'KeyJ');
  } else {
    const pending: Station[]=[];
    for(const part of ordered) {
      await interact(page,find(s,'crate',part.kind));
      if(part.state==='CHOPPED') { await interact(page,board); await work(page,board,INGREDIENTS[part.kind].chop); await key(page,'KeyJ'); await interact(page,assembly); }
      else if(part.state==='COOKED') { const available=(await snapshot(page)).stations.find(st=>st.kind==='stove'&&!st.item)!; await interact(page,available); pending.push(available); }
      else await interact(page,assembly);
    }
    await interact(page,assembly);
    for(const stove of pending) { await moveTo(page,stove); const pot=(await snapshot(page)).stations.find(st=>st.id===stove.id)!; if(pot.stoveState==='COOKING') await advance(page,(pot.cookTime-pot.elapsed+.1)*1000); await key(page,'KeyJ'); }
  }
  const held=(await snapshot(page)).player.held;
  expect(held?.type).toBe('plate'); expect((held as Extract<Item,{type:'plate'}>).components).toHaveLength(r.components.length);
  const servedBefore=(await snapshot(page)).served;
  await interact(page,find(s,'serve')); if(awaitDelivery){await advance(page,3500);expect((await snapshot(page)).served).toBe(servedBefore+1);}else expect((await snapshot(page)).restaurant.deliveries).toHaveLength(1);
  expect((await snapshot(page)).plateCount).toBe(s.plateCount);
}

test('main menu, cookbook, audio settings, pause and restart are real controls', async({page})=>{
  const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message)); await boot(page);
  await expect(page.locator('.topbar [data-action="pause"]')).toBeHidden();
  await page.screenshot({path:'artifacts/main-menu.png'});
  await page.getByRole('button',{name:'料理手册',exact:true}).click(); await expect(page.getByRole('heading',{name:'六道拿手料理'})).toBeVisible(); expect(await page.locator('.recipe-card').count()).toBe(6);
  await page.getByRole('button',{name:'返回菜单',exact:true}).click(); await page.getByRole('button',{name:'声音设置',exact:true}).click(); await page.locator('#music-volume').fill('0.4'); await page.getByRole('button',{name:'完成',exact:true}).click();
  await page.getByRole('button',{name:'开始开餐 →',exact:true}).click(); await expect(page.getByRole('heading',{name:'阳光厨房',exact:true})).toBeVisible(); expect((await snapshot(page)).time).toBe(300);
  await page.getByRole('button',{name:'准备好了，开餐！'}).click(); await advance(page,2000);
  await key(page,'Escape'); const paused=(await snapshot(page)).time; await advance(page,5000); expect((await snapshot(page)).time).toBe(paused);
  await expect(page.locator('.topbar [data-action="resume"]')).toBeVisible();
  await page.locator('.topbar [data-action="resume"]').click(); await advance(page,1000); expect((await snapshot(page)).time).toBeLessThan(paused);
  await key(page,'Escape'); await page.getByRole('button',{name:'继续开餐',exact:true}).click(); await advance(page,40);
  await key(page,'Escape'); await page.getByRole('button',{name:'重新开始本关'}).click(); await advance(page,40); expect((await snapshot(page)).time).toBe(300); expect((await snapshot(page)).score).toBe(0);
  expect(errors).toEqual([]);
});

test('keyboard-controlled chef clears all five kitchens; records real scores and unlocks',async({page})=>{
  test.setTimeout(1200000);
  const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message)); await boot(page);
  await page.getByRole('button',{name:'开始开餐 →',exact:true}).click();
  const results:Record<string,unknown>[]=[]; const made=new Set<string>();
  for(let id=1;id<=5;id++) {
    await page.getByRole('button',{name:'准备好了，开餐！'}).click(); await advance(page,40);
    for(let n=0;n<16;n++) {
      let s=await snapshot(page);
      for(const c of s.restaurant.customers) expect(LEVEL_MENUS[id-1]).toContain(c.recipeId);
      for(const o of s.orders) expect(s.restaurant.customers.filter(c=>c.orderId===o.id&&c.state==='WAITING')).toHaveLength(o.quantity);
      if(s.time<18 || s.stars>=3) break;
      if(!s.orders.length) { await advance(page,1000); n--; continue; }
      const cost:Record<string,number>={salad:18,cheeseburger:20,burger:23,chickenrice:28,pasta:28,soup:36};
      const order=s.orders.filter(o=>o.remaining>cost[o.recipeId]+8&&s.time>cost[o.recipeId]+(s.clean?1:9)).sort((a,b)=>Number(made.has(a.recipeId))-Number(made.has(b.recipeId))||cost[a.recipeId]-cost[b.recipeId])[0];
      if(!order) break;
      await makeDish(page,order.recipeId); made.add(order.recipeId);
    }
    let s=await snapshot(page);
    await page.screenshot({path:`artifacts/kitchen-${id}.png`});
    await advance(page,Math.ceil(s.time*1000)+1100); s=await snapshot(page);
    expect(s.screen).toBe('results'); expect(s.stars,`level ${id} score=${s.score}, served=${s.served}`).toBeGreaterThanOrEqual(1);
    results.push({level:id,score:s.score,stars:s.stars,served:s.served,failed:s.failed});
    mkdirSync('artifacts',{recursive:true}); writeFileSync('artifacts/playability.json',JSON.stringify({results,recipes:[...made],errors},null,2));
    await page.screenshot({path:`artifacts/results-${id}.png`});
    if(id<5) { expect(s.unlocked).toContain(id+1); await page.getByRole('button',{name:'下一间厨房 →'}).click(); }
  }
  expect(made.size).toBe(RECIPES.length); expect(errors).toEqual([]);
  await page.context().storageState({path:'artifacts/earned-progress.json'});
  mkdirSync('artifacts',{recursive:true}); writeFileSync('artifacts/playability.json',JSON.stringify({results,recipes:[...made],errors},null,2));
  await expect(page.getByRole('heading',{name:'五间厨房，圆满收工！'})).toBeVisible();
  // Continue on the legitimately unlocked fifth kitchen to test a real fire.
  await page.getByRole('button',{name:'再挑战一次',exact:true}).click(); await page.getByRole('button',{name:'准备好了，开餐！'}).click(); await advance(page,40);
  await advance(page,2200); let s=await snapshot(page), stove=find(s,'stove'); const firstDeadline=(ROUND_SECONDS-s.time)+s.orders[0].remaining;
  await interact(page,find(s,'crate','beef')); await interact(page,stove); await advance(page,31100);
  expect((await snapshot(page)).stations.find(st=>st.id===stove.id)?.stoveState).toBe('ON_FIRE');
  await page.screenshot({path:'artifacts/fire.png'});
  await interact(page,find(s,'extinguisher')); await work(page,stove,3);
  expect((await snapshot(page)).stations.find(st=>st.id===stove.id)?.stoveState).toBe('IDLE');
  await page.screenshot({path:'artifacts/extinguished.png'});
  await interact(page,find(s,'extinguisher')); await interact(page,find(s,'crate','chicken')); await interact(page,stove); await advance(page,7100);
  expect((await snapshot(page)).stations.find(st=>st.id===stove.id)?.stoveState).toBe('READY');
  await advance(page,Math.max(0,firstDeadline+1-(ROUND_SECONDS-(await snapshot(page)).time))*1000);
  expect((await snapshot(page)).failed).toBeGreaterThan(0); expect(errors).toEqual([]);
});

test('all music loops decode, play after a click, and settings persist',async({page})=>{
  await page.goto('/'); await page.getByRole('button',{name:'声音设置',exact:true}).click();
  await expect.poll(async()=> (await snapshot(page)).audio.playing).toBe(true);
  expect((await snapshot(page)).audio.context).toBe('running');
  const decoded=await page.evaluate(async()=>{
    const manifest=await(await fetch('/audio/manifest.json')).json(); const context=new AudioContext(); const result:Record<string,number>={};
    for(const [id,track] of Object.entries(manifest.tracks) as [string,{file:string;seconds:number;fallback:string}][]) { const buffer=await context.decodeAudioData(await(await fetch(`/audio/${track.file}`)).arrayBuffer()); if(Math.abs(buffer.duration-track.seconds)>.04) throw new Error(`${id} loop length mismatch`); result[id]=buffer.duration; }
    await context.close(); return result;
  });
  expect(Object.keys(decoded)).toHaveLength(13);
  await page.getByRole('button',{name:'切换静音',exact:true}).click(); await expect(page.locator('#mute')).toHaveText('已静音');
  await page.reload(); await expect(page.locator('#mute')).toHaveText('已静音');
});

test('small windows keep all menu buttons visible and usable',async({page})=>{
  await page.setViewportSize({width:556,height:768}); await boot(page);
  const home=await page.evaluate(()=>{const a=document.querySelector('.stage')!.getBoundingClientRect(),b=document.querySelector('.hero')!.getBoundingClientRect();return {stageW:a.width,stageH:a.height,heroW:b.width,heroH:b.height};});
  expect(Math.abs(home.stageW-home.stageH)).toBeLessThan(2);expect(Math.abs(home.heroW-home.stageW)).toBeLessThan(2);expect(Math.abs(home.heroH-home.stageH)).toBeLessThan(2);
  await page.screenshot({path:'artifacts/square-home-narrow.png'});
  await expect(page.getByRole('button',{name:'选择关卡',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'选择关卡',exact:true}).click(); await expect(page.locator('.level-card')).toHaveCount(5); await advance(page,350);
  await page.screenshot({path:'artifacts/narrow-window.png'});
});

test('J and K controls, pictogram batches and the following camera work with keyboard menus', async ({page}) => {
  await boot(page);
  await expect(page.getByRole('button', {name:'开始开餐 →', exact:true})).toBeFocused();
  await key(page, 'ArrowRight');
  await expect(page.getByRole('button', {name:'选择关卡', exact:true})).toBeFocused();
  await key(page, 'KeyJ');
  await expect(page.locator('.level-card').first()).toBeFocused();
  await key(page, 'KeyJ');
  expect((await snapshot(page)).screen).toBe('briefing');
  await key(page, 'KeyJ');
  expect((await snapshot(page)).screen).toBe('playing');
  await expect(page.locator('#orders button')).toHaveCount(0);
  await expect(page.locator('.order-card[title], .order-card[data-action]')).toHaveCount(0);
  const layout = async () => page.evaluate(() => {
    const canvas = document.querySelector('#game')!.getBoundingClientRect();
    const timer = document.querySelector('#play-timer')!.getBoundingClientRect();
    const cards = [...document.querySelectorAll('.order-card')].map(el=>el.getBoundingClientRect());
    return {canvasWidth:canvas.width,viewportWidth:innerWidth,timerCenter:timer.x+timer.width/2,
      cardsFit:cards.every(card=>card.left>=0&&card.right<=innerWidth),
      ingredientSize:document.querySelector('.ingredient-symbol>img')!.getBoundingClientRect().width,
      promptSize:parseFloat(getComputedStyle(document.querySelector('#interaction')!).fontSize)};
  });
  await advance(page,2200); const initial = await layout();
  expect(initial.canvasWidth).toBeCloseTo(initial.viewportWidth,0); expect(initial.cardsFit).toBe(true);
  expect(initial.timerCenter).toBeCloseTo(initial.viewportWidth/2,0);
  await expect(page.locator('.brand')).toBeHidden();
  await expect(page.locator('.order-quantity')).toHaveText('×1');
  await expect(page.locator('.order-requirements')).toHaveText('');
  await expect(page.locator('.process-icon[data-process="chop"]')).toHaveCount(2);
  const cameraBefore = (await snapshot(page)).camera;
  await page.keyboard.down('ArrowRight'); await page.keyboard.down('KeyK'); await advance(page,100);
  expect((await snapshot(page)).player.cooldown).toBeGreaterThan(1);
  expect((await snapshot(page)).player.dash).toBeGreaterThan(0);
  await page.keyboard.up('KeyK'); await page.keyboard.up('ArrowRight'); await advance(page,300);
  expect((await snapshot(page)).camera.x).toBeLessThan(cameraBefore.x);
  await key(page,'KeyR');
  await expect(page.getByRole('heading',{name:'六道拿手料理'})).toBeVisible();
  const paused = await snapshot(page);
  await advance(page,2500); expect((await snapshot(page)).time).toBe(paused.time);
  expect((await snapshot(page)).camera).toEqual(paused.camera);
  await key(page,'KeyR'); expect((await snapshot(page)).screen).toBe('playing');
  await makeDish(page,'salad');expect((await snapshot(page)).served).toBe(1);await expect(page.locator('.order-card')).toHaveCount(0);
  await advance(page,26000);await expect(page.locator('.order-quantity')).toHaveText('×2');
  await makeDish(page,'salad');await expect(page.locator('.order-quantity')).toHaveText('×1');
  await makeDish(page,'salad');expect((await snapshot(page)).served).toBe(3);await expect(page.locator('.order-card')).toHaveCount(0);
  await advance(page,28000);await expect(page.locator('.order-quantity')).toHaveText('×1');
  await page.setViewportSize({width:556,height:768}); await advance(page,500);
  const narrow = await layout();
  expect(narrow.cardsFit).toBe(true); expect(narrow.canvasWidth).toBeCloseTo(narrow.viewportWidth,0);
  expect(narrow.ingredientSize).toBeGreaterThanOrEqual(44); expect(narrow.promptSize).toBeGreaterThanOrEqual(17);
  expect(narrow.timerCenter).toBeCloseTo(narrow.viewportWidth/2,0);
  await page.screenshot({path:'artifacts/narrow-icon-hud.png'});
  await key(page,'Escape');
  await expect(page.getByRole('button',{name:'继续开餐',exact:true})).toBeFocused();
  await key(page,'ArrowDown'); await key(page,'ArrowDown'); await key(page,'KeyJ');
  await expect(page.getByRole('heading',{name:'声音设置'})).toBeVisible();
  await key(page,'Tab'); // Primary completion button -> first range.
  await expect(page.locator('#music-volume')).toBeFocused();
  const volume = Number(await page.locator('#music-volume').inputValue());
  await key(page,'ArrowLeft');
  expect(Number(await page.locator('#music-volume').inputValue())).toBeCloseTo(volume-.05);
  await key(page,'Enter'); await key(page,'KeyJ');
  expect((await snapshot(page)).screen).toBe('playing');
});

test('four pictogram orders preserve the whole viewport and keep targets visible while the camera pans', async ({browser}) => {
  // Reuse the actual progression earned by the five-kitchen keyboard playthrough.
  const context = await browser.newContext({storageState:recordedTestFile('earned-progress.json'),viewport:{width:556,height:768}});
  const page = await context.newPage();
  try {
    await boot(page);
    await key(page,'ArrowRight'); await key(page,'KeyJ');
    for(let i=0;i<4;i++) await key(page,'ArrowRight');
    await expect(page.locator('.level-card[data-level="5"]')).toBeFocused();
    await key(page,'KeyJ'); await key(page,'KeyJ'); await advance(page,57000);
    await expect(page.locator('.order-card')).toHaveCount(4);
    const geometry = await page.evaluate(() => {
      const canvas = document.querySelector('#game')!.getBoundingClientRect();
      const cards = [...document.querySelectorAll('.order-card')].map(el=>el.getBoundingClientRect());
      return {canvasWidth:canvas.width,canvasHeight:canvas.height,
        fit:cards.every(c=>c.left>=0&&c.right<=innerWidth),
        rows:new Set(cards.map(c=>c.top)).size,
        noScroll:document.documentElement.scrollHeight<=innerHeight};
    });
    expect(geometry).toMatchObject({fit:true,rows:2,noScroll:true});
    expect(geometry.canvasWidth).toBe(556); expect(geometry.canvasHeight).toBeGreaterThan(550);
    await page.screenshot({path:'artifacts/narrow-four-orders.png'});
    await page.setViewportSize({width:1460,height:700}); await advance(page,100);
    const landscape = await page.evaluate(() => {
      const stage = document.querySelector('#stage')!.getBoundingClientRect();
      const orders = document.querySelector('#orders')!.getBoundingClientRect();
      const timer = document.querySelector('#play-timer')!.getBoundingClientRect();
      return {canvasWidth:stage.width,canvasHeight:stage.height,ordersWidth:orders.width,
        timerCenter:timer.x+timer.width/2};
    });
    expect(landscape.canvasWidth).toBe(1460); expect(landscape.canvasHeight).toBeGreaterThan(570);
    expect(landscape.ordersWidth).toBeLessThan(430); expect(landscape.timerCenter).toBe(730);
    await page.screenshot({path:'artifacts/landscape-four-orders.png'});
    // Approach every ingredient crate using normal keys, confirming current targets
    // are fully visible below/beside the HUD instead of hidden behind a recipe card.
    for (const crate of (await snapshot(page)).stations.filter(st=>st.kind==='crate')) {
      await moveTo(page,crate); await advance(page,350);
      const state = await snapshot(page);
      const point = {x:state.camera.x+(80+crate.x+TILE/2)*state.camera.zoom,
        y:state.camera.y+(95+crate.y*.78)*state.camera.zoom};
      const visible = await page.evaluate(({point,camera})=>{
        const canvas = document.querySelector('#game')!.getBoundingClientRect(), scale=canvas.width/camera.width;
        const x=canvas.x+point.x*scale,y=canvas.y+point.y*scale;
        return x>canvas.left&&x<canvas.right&&y>canvas.top+40&&y<canvas.bottom-50&&
          [...document.querySelectorAll('.order-card, #play-timer')].every(el=>{const r=el.getBoundingClientRect();return x<r.left-20||x>r.right+20||y<r.top-30||y>r.bottom+30;});
      },{point,camera:state.camera});
      expect(visible,`crate ${crate.ingredient} must stay visible`).toBe(true);
    }
    await page.screenshot({path:'artifacts/camera-food-area.png'});

  } finally {await context.close();}
});

test('compact solo kitchens use the AI chef, hand-held plates and real chopping and washing poses',async({page,browser})=>{
  test.setTimeout(240000);
  await boot(page);
  await expect(page.locator('.cover-art')).toBeVisible();
  await expect.poll(()=>page.locator('.cover-art').evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBeGreaterThan(500);
  await page.screenshot({path:'artifacts/new-character-menu.png'});
  await key(page,'KeyJ');await key(page,'KeyJ');
  await expect.poll(async()=>{await advance(page,17);return(await snapshot(page)).character.loaded;}).toBe(true);
  let s=await snapshot(page);expect(s.kitchen).toEqual({cols:12,rows:9});
  const plates=find(s,'plates'),board=find(s,'board');
  await getPlate(page);s=await snapshot(page);
  expect(s.character.pose.item!.y).toBeGreaterThanOrEqual(-28);
  await page.screenshot({path:'artifacts/chef-holding-plate.png'});
  for(const [code,frame] of [['ArrowLeft',2],['ArrowRight',3],['ArrowUp',1],['ArrowDown',0]] as const){
    await key(page,code,35);s=await snapshot(page);expect(s.character.pose.headFrame).toBe(frame);expect(s.character.pose.item!.y).toBeGreaterThanOrEqual(-28);
  }
  await interact(page,plates);
  await interact(page,find(s,'crate','tomato'));await interact(page,board);await moveTo(page,board);
  await page.keyboard.down('Space');await advance(page,500);const first=(await snapshot(page)).character.pose;
  expect(first.activity).toBe('chop');await advance(page,300);const cutting=(await snapshot(page)).character.pose;
  expect(cutting.rightHand.y).not.toBe(first.rightHand.y);
  await page.screenshot({path:'artifacts/chef-chopping.png'});
  await key(page,'KeyP');const frozen=(await snapshot(page)).character.pose;await advance(page,1000);
  expect((await snapshot(page)).character.pose).toEqual(frozen);
  await page.keyboard.up('Space');await key(page,'KeyJ');await key(page,'Space',1400);
  expect((await snapshot(page)).stations.find(st=>st.id===board.id)?.item?.type).toBe('food');
  expect(((await snapshot(page)).stations.find(st=>st.id===board.id)!.item as Extract<Item,{type:'food'}>).components[0].state).toBe('CHOPPED');

  const context=await browser.newContext({storageState:recordedTestFile('earned-progress.json')});
  const washing=await context.newPage();await boot(washing);
  await key(washing,'ArrowRight');await key(washing,'KeyJ');await key(washing,'ArrowRight');await key(washing,'ArrowRight');await key(washing,'KeyJ');await key(washing,'KeyJ');
  await advance(washing,2200); s=await snapshot(washing);expect(s.kitchen).toEqual({cols:14,rows:10});expect(s.plateCount).toBe(5);
  await makeDish(washing,s.orders[0].recipeId);await advance(washing,(DIRTY_RETURN_SECONDS+.1)*1000);
  s=await snapshot(washing);expect(s.dirty).toBeGreaterThan(0);
  const cleanBeforeWash=s.clean; await moveTo(washing,find(s,'sink'));
  await washing.keyboard.down('Space');await advance(washing,700);const scrub=(await snapshot(washing)).character.pose;
  expect(scrub.activity).toBe('wash');expect(scrub.workObject).not.toBeNull();expect(Math.hypot(scrub.rightHand.x-scrub.workObject!.x,scrub.rightHand.y-scrub.workObject!.y)).toBeLessThan(8);expect((await snapshot(washing)).player.held).toBeNull();await advance(washing,200);expect((await snapshot(washing)).character.pose.rightHand.x).not.toBe(scrub.rightHand.x);
  await washing.screenshot({path:'artifacts/chef-washing.png'});
  await washing.keyboard.up('Space');await advance(washing,350);
  expect((await snapshot(washing)).player.activity).toBe('idle');
  expect(((await snapshot(washing)).stations.find(st=>st.kind==='sink')!.item as Extract<Item,{type:'plate'}>).dirty).toBe(true);
  await key(washing,'Space',1200);
  expect((await snapshot(washing)).stations.find(st=>st.kind==='sink')!.item).toBeNull();
  expect((await snapshot(washing)).dirty).toBe(0); expect((await snapshot(washing)).clean).toBe(cleanBeforeWash+1);
  await getPlate(washing); expect(((await snapshot(washing)).player.held as Extract<Item,{type:'plate'}>).dirty).toBe(false);
  await washing.screenshot({path:'artifacts/chef-clean-plate.png'});await context.close();
});


test('directional walk, dash lean and stopping are visible during keyboard play',async({page})=>{
  await boot(page);await key(page,'KeyJ');await key(page,'KeyJ');
  await page.keyboard.down('ArrowLeft');await advance(page,120);
  const a=await snapshot(page);await advance(page,120);const b=await snapshot(page);
  expect(b.player.x).toBeLessThan(a.player.x);
  expect(b.character.pose.leftFoot.x).not.toBe(a.character.pose.leftFoot.x);
  await page.screenshot({path:'artifacts/polished-walking.png'});
  await page.keyboard.down('KeyK');await advance(page,60);const dash=await snapshot(page);
  expect(dash.player.dash).toBeGreaterThan(0);expect(Math.abs(dash.character.pose.tilt)).toBeGreaterThan(Math.abs(a.character.pose.tilt));
  await page.screenshot({path:'artifacts/polished-dashing.png'});
  await page.keyboard.up('KeyK');await page.keyboard.up('ArrowLeft');await advance(page,700);
  const stopped=(await snapshot(page)).character.pose;await advance(page,250);
  expect((await snapshot(page)).character.pose).toEqual(stopped);
});


test('square home integrates its controls and music accelerates only below thirty seconds',async({page})=>{
  test.setTimeout(300000);await boot(page);
  await expect(page.locator('.topbar')).toBeHidden();await expect(page.locator('.keybar')).toBeHidden();
  const geometry=await page.evaluate(()=>{
    const stage=document.querySelector('.stage')!.getBoundingClientRect(),copy=document.querySelector('.hero-copy')!.getBoundingClientRect();
    return {width:stage.width,height:stage.height,controls:[...document.querySelectorAll('.hero button,.hero .menu-key-hint')].map(el=>{const r=el.getBoundingClientRect();return r.left>=copy.left&&r.right<=copy.right+1&&r.top>=stage.top&&r.bottom<=stage.bottom;})};
  });
  expect(Math.abs(geometry.width-geometry.height)).toBeLessThan(2);expect(geometry.controls.every(Boolean)).toBe(true);
  await page.screenshot({path:'artifacts/square-home.png'});
  await page.setViewportSize({width:556,height:768});await advance(page,200);
  await expect(page.getByRole('button',{name:'选择关卡',exact:true})).toBeVisible();
  await page.screenshot({path:'artifacts/square-home-narrow.png'});
  await page.getByRole('button',{name:'音乐开',exact:true}).click();await expect(page.locator('[data-home-mute]')).toHaveText('已静音');
  await page.getByRole('button',{name:'已静音',exact:true}).click();await expect(page.locator('[data-home-mute]')).toHaveText('音乐开');
  await page.getByRole('button',{name:'开始开餐 →',exact:true}).click();await key(page,'KeyJ');
  await expect.poll(async()=>{await advance(page,17);return(await snapshot(page)).audio.decoded;}).toBeGreaterThanOrEqual(3);
  let s=await snapshot(page);await advance(page,Math.max(0,(s.time-30.3)*1000));s=await snapshot(page);
  expect(s.time).toBeGreaterThan(30);expect(s.audio.urgent).toBe(false);expect(s.audio.playbackRate).toBe(1);
  await advance(page,600);expect((await snapshot(page)).time).toBeLessThan(30);
  await expect.poll(async()=>{await advance(page,17);return(await snapshot(page)).audio.playbackRate;}).toBeGreaterThan(1.1);
  expect((await snapshot(page)).audio.urgent).toBe(true);
  await key(page,'Escape');expect((await snapshot(page)).screen).toBe('paused');
  await page.getByRole('button',{name:'重新开始本关'}).click();await key(page,'KeyJ');
  await expect.poll(async()=>{await advance(page,17);return(await snapshot(page)).audio.playbackRate;}).toBe(1);
});


test('eight-direction movement stays aligned and back-facing chopping hides the knife while arms move',async({page})=>{
  test.setTimeout(180000);await boot(page);await key(page,'KeyJ');await key(page,'KeyJ');
  await page.keyboard.down('ArrowRight');await page.keyboard.down('ArrowDown');await advance(page,200);
  let s=await snapshot(page);expect(s.character.pose.atlasFrame).toBe(3);expect(s.character.pose.direction.x).toBeGreaterThan(.5);expect(s.character.pose.direction.y).toBeGreaterThan(.5);
  await page.screenshot({path:'artifacts/chef-diagonal.png'});
  await page.keyboard.up('ArrowRight');await page.keyboard.up('ArrowDown');await advance(page,600);
  const board=find(s,'board');await interact(page,find(s,'crate','tomato'));await interact(page,board);
  async function point(x:number,y:number){
    for(let i=0;i<80;i++){
      const state=await snapshot(page),dx=x-state.player.x,dy=y-state.player.y;
      if(Math.abs(dx)<4&&Math.abs(dy)<4){await advance(page,100);return;}
      const code=Math.abs(dx)>Math.abs(dy)?dx>0?'ArrowRight':'ArrowLeft':dy>0?'ArrowDown':'ArrowUp';
      await key(page,code,Math.max(17,Math.min(100,Math.max(Math.abs(dx),Math.abs(dy))/210*1000*.65)));
    }
    throw new Error('Could not approach the board from below with normal keys');
  }
  await point(board.x-TILE/2,board.y-TILE/2);await point(board.x-TILE/2,board.y+TILE*1.5);await point(board.x+TILE/2,board.y+TILE*1.5);
  await key(page,'ArrowUp',35);await page.keyboard.down('Space');await advance(page,400);s=await snapshot(page);
  expect(s.player.activity).toBe('chop');expect(s.character.pose.atlasFrame).toBe(0);
  const lift=(1+Math.sin(s.player.workTime*32))*7,world={x:80+board.x+TILE/2+7,y:95+board.y*.78+13-1-lift};
  const pixels=await page.evaluate(({world,camera})=>{
    const canvas=document.querySelector<HTMLCanvasElement>('#game')!,ctx=canvas.getContext('2d')!,scale=canvas.width/1280;
    const x=Math.round((camera.x+world.x*camera.zoom)*scale),y=Math.round((camera.y+world.y*camera.zoom)*scale);
    const w=Math.round(20*camera.zoom*scale),h=Math.round(13*camera.zoom*scale),data=ctx.getImageData(x,y,w,h).data;
    let edge=0,metal=0;for(let i=0;i<data.length;i+=4){if(Math.abs(data[i]-60)<13&&Math.abs(data[i+1]-93)<13&&Math.abs(data[i+2]-105)<13)edge++;if(data[i]>170&&data[i+1]>180&&data[i+2]>180)metal++;}
    return {edge,metal};
  },{world,camera:s.camera});
  expect(pixels.edge).toBeLessThan(5);
  const armBefore=s.character.pose.rightHand.y;await advance(page,150);expect((await snapshot(page)).character.pose.rightHand.y).not.toBe(armBefore);
  await page.screenshot({path:'artifacts/chef-back-chopping.png'});await page.keyboard.up('Space');
  await key(page,'Space',1800);expect(((await snapshot(page)).stations.find(st=>st.id===board.id)!.item as Extract<Item,{type:'food'}>).components[0].state).toBe('CHOPPED');
});

test('both side chopping views keep the knife low, face the actual board and complete processing',async({browser})=>{
  const context=await browser.newContext({storageState:recordedTestFile('earned-progress.json')}),page=await context.newPage();
  try {
    await boot(page);await key(page,'ArrowRight');await key(page,'KeyJ');
    for(let i=0;i<4;i++)await key(page,'ArrowRight');await key(page,'KeyJ');await key(page,'KeyJ');
    async function point(x:number,y:number){for(let i=0;i<100;i++){
      const state=await snapshot(page),dx=x-state.player.x,dy=y-state.player.y;
      if(Math.abs(dx)<4&&Math.abs(dy)<4){await advance(page,120);return;}
      await key(page,Math.abs(dx)>Math.abs(dy)?dx>0?'ArrowRight':'ArrowLeft':dy>0?'ArrowDown':'ArrowUp',Math.max(17,Math.min(100,Math.max(Math.abs(dx),Math.abs(dy))/210*1000*.65)));
    }throw new Error('Could not reach side approach with normal keys');}
    for(const direction of [1,-1]) {
      let s=await snapshot(page);const board=s.stations.find(st=>st.kind==='board'&&(direction===1?st.x===2*TILE:st.x===4*TILE&&st.y===6*TILE))!;
      await interact(page,find(s,'crate','tomato'));await interact(page,board);
      const approach=board.x+TILE/2-direction*TILE;
      await point(approach,board.y-TILE/2);await point(approach,board.y+TILE/2);
      await key(page,direction===1?'ArrowRight':'ArrowLeft',35);await page.keyboard.down('Space');await advance(page,350);s=await snapshot(page);
      expect(s.target).toBe(board.id);expect(s.player.facing).toEqual({x:direction,y:0});expect(s.character.pose.atlasFrame).toBe(direction===1?2:6);
      expect(s.character.pose.rightHand.y).toBeGreaterThan(-25);expect(s.character.pose.rightHand.x*direction).toBeGreaterThan(15);
      const oldY=s.character.pose.rightHand.y;await advance(page,120);expect((await snapshot(page)).character.pose.rightHand.y).not.toBe(oldY);
      await page.screenshot({path:`artifacts/chef-side-${direction===1?'right':'left'}-chopping.png`});await page.keyboard.up('Space');
      await key(page,'Space',1700);expect(((await snapshot(page)).stations.find(st=>st.id===board.id)!.item as Extract<Item,{type:'food'}>).components[0].state).toBe('CHOPPED');
    }
  }finally{await context.close();}
});

test('all five kitchens deliver dirty plates to the single upper-left sink and wash directly with Space',async({browser})=>{
  test.setTimeout(600000);
  const report=[];
  for(let id=1;id<=5;id++){
    const context=await browser.newContext({storageState:recordedTestFile('earned-progress.json')});
    const page=await context.newPage();
    try{
      await boot(page);await key(page,'ArrowRight');await key(page,'KeyJ');
      for(let i=1;i<id;i++)await key(page,'ArrowRight');
      await key(page,'KeyJ');await key(page,'KeyJ');await advance(page,2200);
      let s=await snapshot(page);const sink=find(s,'sink');
      expect(sink.x).toBe(TILE);expect(sink.y).toBe(TILE);expect(s.stations.filter(st=>st.kind==='sink')).toHaveLength(1);
      expect(LEVEL_MENUS[id-1]).toContain(s.orders[0].recipeId);
      await makeDish(page,s.orders[0].recipeId);await advance(page,(DIRTY_RETURN_SECONDS+.1)*1000);
      s=await snapshot(page);const dirty=s.dirty,clean=s.clean;
      expect(dirty).toBe(1);expect(s.player.held).toBeNull();await moveTo(page,sink);
      await page.screenshot({path:`artifacts/upper-left-sink-level${id}.png`});
      await page.keyboard.down('Space');await advance(page,600);s=await snapshot(page);
      expect(s.player.activity).toBe('wash');expect(s.target).toBe(sink.id);expect(s.dirty).toBe(dirty);
      await advance(page,1500);await page.keyboard.up('Space');s=await snapshot(page);
      expect(s.dirty).toBe(0);expect(s.clean).toBe(clean+1);expect(s.player.held).toBeNull();expect(s.plateCount).toBe(id===1?3:id===2?4:5);
      report.push({level:id,recipe:s.restaurant.customers[0]?.recipeId??'served',served:s.served,sink:{x:sink.x,y:sink.y},dirty:s.dirty,clean:s.clean,plateCount:s.plateCount});
      await page.screenshot({path:`artifacts/upper-left-sink-clean-level${id}.png`});
    }finally{await context.close();}
  }
  writeFileSync('artifacts/upper-left-sink-playability.json',JSON.stringify(report,null,2));
});

test('front chopping holds the knife in the moving right hand over the real board',async({page})=>{
  await boot(page);await key(page,'KeyJ');await key(page,'KeyJ');let s=await snapshot(page);
  const board=find(s,'board');await interact(page,find(s,'crate','tomato'));await interact(page,board);await moveTo(page,board);
  await page.keyboard.down('Space');await advance(page,400);s=await snapshot(page);const a=s.character.pose;
  expect(s.player.facing).toEqual({x:0,y:1});expect(a.activity).toBe('chop');expect(a.rightHand.x).toBeLessThan(a.leftHand.x);
  await page.screenshot({path:'artifacts/front-right-hand-knife-a.png'});await advance(page,180);const b=(await snapshot(page)).character.pose;
  expect(b.rightHand.y).not.toBe(a.rightHand.y);expect(b.rightHand.x).not.toBe(a.rightHand.x);await page.screenshot({path:'artifacts/front-right-hand-knife-b.png'});
  await advance(page,1500);await page.keyboard.up('Space');expect(((await snapshot(page)).stations.find(st=>st.id===board.id)!.item as Extract<Item,{type:'food'}>).components[0].state).toBe('CHOPPED');
});

test('five-minute service uses slow delivery, patient small parties, eating progress and real waste accounting',async({page})=>{
  test.setTimeout(300000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await boot(page);await key(page,'KeyJ');await key(page,'KeyJ');
  let s=await snapshot(page);expect(s.time).toBeGreaterThan(299);expect(s.restaurant.customers).toHaveLength(1);
  await advance(page,2100);s=await snapshot(page);const guest=s.restaurant.customers[0];expect(guest.patience).toBeGreaterThan(89);expect(s.orders[0].duration).toBe(90);expect(s.orders[0].quantity).toBe(1);
  await makeDish(page,'salad',false);s=await snapshot(page);const d=s.restaurant.deliveries[0];expect(d.duration).toBeCloseTo(2.3);expect(s.served).toBe(0);
  await advance(page,1000);expect((await snapshot(page)).restaurant.customers.find(c=>c.id===guest.id)?.state).toBe('DELIVERING');
  await page.screenshot({path:'artifacts/half-speed-conveyor.png'});await key(page,'Escape');const frozen=(await snapshot(page)).restaurant;await advance(page,2000);expect((await snapshot(page)).restaurant).toEqual(frozen);await key(page,'KeyJ');
  s=await snapshot(page);const moving=s.restaurant.deliveries[0];await advance(page,(moving.duration-moving.elapsed+.05)*1000);
  s=await snapshot(page);expect(s.served).toBe(1);expect(s.restaurant.customers.find(c=>c.id===guest.id)?.state).toBe('EATING');
  await advance(page,4000);s=await snapshot(page);const diner=s.restaurant.customers.find(c=>c.id===guest.id)!;expect(diner.state).toBe('EATING');expect(diner.age).toBeGreaterThan(3.9);expect(diner.age).toBeLessThan(EATING_SECONDS);
  await page.screenshot({path:'artifacts/eating-progress-and-patience.png'});await key(page,'Escape');const eatingPause=(await snapshot(page)).restaurant;await advance(page,3000);expect((await snapshot(page)).restaurant).toEqual(eatingPause);await key(page,'KeyJ');
  await advance(page,4200);s=await snapshot(page);expect(s.restaurant.returning).toHaveLength(1);expect(s.restaurant.returning[0].duration).toBeCloseTo(2.4);
  await advance(page,2600);s=await snapshot(page);expect(s.dirty).toBe(1);expect(s.plateCount).toBe(3);await work(page,find(s,'sink'),WASH_SECONDS);expect((await snapshot(page)).dirty).toBe(0);
  s=await snapshot(page);const groups=new Map<number,number>();for(const c of s.restaurant.customers)groups.set(c.party,(groups.get(c.party)??0)+1);expect([...groups.values()].every(n=>n<=2)).toBe(true);
  for(let i=0;i<30&&!s.restaurant.customers.some(c=>c.state==='WAITING');i++){await advance(page,1000);s=await snapshot(page);}
  const waiting=s.restaurant.customers.find(c=>c.state==='WAITING')!;expect(waiting).toBeDefined();expect(s.restaurant.customers.filter(c=>c.party===waiting.party)).toHaveLength(2);await page.screenshot({path:'artifacts/small-parties-patience.png'});const failed=s.failed;await advance(page,(waiting.patience+.2)*1000);s=await snapshot(page);expect(s.failed).toBeGreaterThan(failed);expect(s.restaurant.customers.find(c=>c.id===waiting.id)?.state??'LEAVING').toBe('LEAVING');
  await interact(page,find(s,'crate','tomato'));await interact(page,find(s,'trash'));await interact(page,find(s,'crate','tomato'));
  s=await snapshot(page);expect(s.result.wasted).toBe(2);expect(s.result.wasteCost).toBe(4);await advance(page,(s.time+1)*1000);s=await snapshot(page);
  expect(s.screen).toBe('results');expect(s.time).toBe(0);expect(s.result.wasted).toBe(2);expect(s.result.revenue).toBe(8);expect(s.result.ingredientCost).toBe(8);expect(s.result.profit).toBe(0);await expect(page.locator('.earnings-summary')).toContainText('营业额 8');await expect(page.locator('.waste-summary')).toContainText('番茄 ×2');await expect(page.locator('.waste-summary')).toContainText('成本 4 金币');
  await page.screenshot({path:'artifacts/five-minute-waste-results.png'});writeFileSync('artifacts/five-minute-service-check.json',JSON.stringify({result:s.result,errors},null,2));expect(errors).toEqual([]);
});

test('raw material pricing and all recipe margins are visible and real deliveries earn money',async({page})=>{
  await boot(page);await key(page,'KeyR');await expect(page.locator('.ingredient-prices span')).toHaveCount(11);await expect(page.locator('.recipe-price')).toHaveCount(6);
  const prices=await page.locator('.recipe-price').allTextContents();expect(prices.every(p=>p.includes('50%'))).toBe(true);
  await expect(page.locator('.recipe-card').first().locator('.recipe-price')).toHaveText('售价 8 金币 · 原料成本 4 金币（50%）');
  await expect(page.locator('.ingredient-prices')).toContainText('番茄2');await expect(page.locator('.ingredient-prices')).toContainText('牛肉5');await expect(page.locator('.ingredient-prices')).toContainText('鸡肉4');
  await page.locator('.ingredient-prices').scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/raw-material-prices.png'});await key(page,'Escape');await key(page,'KeyJ');await key(page,'KeyJ');await advance(page,2200);
  await makeDish(page,'salad');let s=await snapshot(page);expect(s.result.revenue).toBe(8);expect(s.result.ingredientCost).toBe(4);expect(s.result.profit).toBe(4);
  await interact(page,find(s,'crate','tomato'));await interact(page,find(s,'trash'));s=await snapshot(page);expect(s.result.ingredientCost).toBe(6);expect(s.result.wasteCost).toBe(2);expect(s.result.profit).toBe(2);
});

async function assertSinglePage(page:Page,selector:string):Promise<void>{
  const geometry=await page.locator(selector).evaluate(el=>{
    const panel=el as HTMLElement,r=panel.getBoundingClientRect();
    const out=[...panel.querySelectorAll('h2,h3,p,li,kbd,button,.menu-key-hint,.waste-summary span,.brief-recipes>div')].filter(child=>{const b=child.getBoundingClientRect();return b.width&&b.height&&(b.top<r.top-1||b.bottom>r.bottom+1||b.left<r.left-1||b.right>r.right+1);}).map(child=>child.textContent);
    return {scrollH:panel.scrollHeight,clientH:panel.clientHeight,scrollW:panel.scrollWidth,clientW:panel.clientWidth,top:r.top,bottom:r.bottom,viewport:innerHeight,out};
  });
  expect(geometry,selector).toMatchObject({out:[]});expect(geometry.top).toBeGreaterThanOrEqual(0);expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.scrollH).toBeLessThanOrEqual(geometry.clientH+1);expect(geometry.scrollW).toBeLessThanOrEqual(geometry.clientW+1);
  await page.mouse.wheel(0,700);await advance(page,80);expect(await page.locator(selector).evaluate(el=>el.scrollTop)).toBe(0);
}
const singlePageSizes=[{width:1440,height:1000},{width:1280,height:720},{width:960,height:600},{width:760,height:540},{width:556,height:768},{width:500,height:640}];
test('single-page briefings keep all five menus, lessons and start controls in view',async({browser})=>{
  const context=await browser.newContext({storageState:recordedTestFile('earned-progress.json')}),page=await context.newPage();await boot(page);
  for(const size of singlePageSizes){await page.setViewportSize(size);for(const level of LEVELS){
    await page.getByRole('button',{name:'选择关卡',exact:true}).click();await page.locator(`.level-card[data-level="${level.id}"]`).click();await advance(page,350);
    await assertSinglePage(page,'.briefing');await expect(page.locator('.brief-task-list li')).toHaveCount(4);await expect(page.locator('.brief-recipes>div')).toHaveCount(level.recipes.length);await expect(page.locator('.brief-controls>span')).toHaveCount(5);expect((await snapshot(page)).time).toBe(300);
    if(level.id===5)await page.screenshot({path:`artifacts/briefing-${size.width}x${size.height}.png`});
    await key(page,'ArrowRight');await key(page,'KeyJ');await advance(page,80);
  }}
  await page.setViewportSize({width:1440,height:1000});await advance(page,350);await page.screenshot({path:'artifacts/new-title-wide.png'});await page.setViewportSize({width:556,height:768});await advance(page,350);await assertSinglePage(page,'.hero');await page.screenshot({path:'artifacts/new-title-narrow.png'});await context.close();
});

test('patience expressions follow real waiting; dining keeps its animation without bars',async({page})=>{
  const {customerMood}=await import('../../src/rendering/CustomerMood');await boot(page);await key(page,'KeyJ');await key(page,'KeyJ');await advance(page,2100);
  let s=await snapshot(page);const id=s.restaurant.customers[0].id;expect(customerMood(s.restaurant.customers[0])).toBe('relaxed');await expect(page.locator('.order-seconds,.order-time')).toHaveCount(0);await page.screenshot({path:'artifacts/customer-relaxed.png'});
  await advance(page,31000);s=await snapshot(page);expect(customerMood(s.restaurant.customers.find(c=>c.id===id)!)).toBe('uneasy');await page.screenshot({path:'artifacts/customer-uneasy.png'});
  await advance(page,30000);s=await snapshot(page);expect(customerMood(s.restaurant.customers.find(c=>c.id===id)!)).toBe('angry');await page.screenshot({path:'artifacts/customer-angry.png'});
  await key(page,'Escape');const frozen=(await snapshot(page)).restaurant;await advance(page,2000);expect((await snapshot(page)).restaurant).toEqual(frozen);
  await page.getByRole('button',{name:'重新开始本关'}).click();await key(page,'KeyJ');await advance(page,2100);await makeDish(page,'salad');s=await snapshot(page);const diner=s.restaurant.customers.find(c=>c.state==='EATING')!;expect(diner).toBeDefined();expect(customerMood(diner)).toBeNull();await advance(page,2000);expect((await snapshot(page)).restaurant.customers.find(c=>c.id===diner.id)?.state).toBe('EATING');await page.screenshot({path:'artifacts/dining-without-progress.png'});
});

test('single-page results fit real eleven-ingredient losses and preserve keyboard restart',async({browser})=>{
  test.setTimeout(300000);const context=await browser.newContext({storageState:recordedTestFile('earned-progress.json')}),page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await boot(page);
  await page.getByRole('button',{name:'选择关卡',exact:true}).click();await page.locator('.level-card[data-level="5"]').click();await key(page,'KeyJ');
  let s=await snapshot(page);for(const crate of s.stations.filter(st=>st.kind==='crate')){await interact(page,crate);await interact(page,find(s,'trash'));}
  s=await snapshot(page);expect(s.result.wasteBreakdown).toHaveLength(11);await advance(page,(s.time+1)*1000);expect((await snapshot(page)).screen).toBe('results');writeFileSync('artifacts/single-page-results-real.json',JSON.stringify((await snapshot(page)).result,null,2));
  for(const size of singlePageSizes){await page.setViewportSize(size);await advance(page,350);await assertSinglePage(page,'.results');await expect(page.locator('.waste-summary img')).toHaveCount(11);await page.screenshot({path:`artifacts/results-single-${size.width}x${size.height}.png`});}
  await key(page,'KeyJ');expect((await snapshot(page)).screen).toBe('briefing');expect((await snapshot(page)).time).toBe(300);expect(errors).toEqual([]);await context.close();
});

// Fast layout regression reuses a completed real service result; it does not alter gameplay.
test('single-page result layout component handles recorded losses and all result variants',async({page})=>{
  const {readFileSync}=await import('node:fs');const result=JSON.parse(readFileSync(recordedTestFile('single-page-results-real.json'),'utf8'));
  await page.route('**/result-layout-check',route=>route.fulfill({contentType:'text/html',body:`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/style.css"><link rel="stylesheet" href="/src/ui/polish.css"><link rel="stylesheet" href="/src/ui/home.css"><link rel="stylesheet" href="/src/ui/briefing.css"><link rel="stylesheet" href="/src/ui/results.css"></head><body><div id="app"></div></body></html>`}));
  await page.goto('/result-layout-check');await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(async data=>{
    const {UI}=await import('/src/ui/UI.ts'),{Save}=await import('/src/game/Save.ts'),{LEVELS}=await import('/src/levels/data.ts');
    const ui=new UI(document.querySelector('#app'),new Save(),{start(){},pause(){},resume(){},menu(){},restart(){},recipes(){},mute(){},volume(){}});
    ui.setPlaying(LEVELS[4]);ui.setScreen('results');ui.results(data);
  },result);
  for(const size of singlePageSizes){await page.setViewportSize(size);await assertSinglePage(page,'.results');await page.screenshot({path:`artifacts/results-layout-${size.width}x${size.height}.png`});}
  // UI-only boundary fixtures exercise four action buttons and the completion title.
  // They are not gameplay scores and are never written into the game's save.
  for(const level of [1,5]){
    await page.evaluate(async data=>{
      const {UI}=await import('/src/ui/UI.ts'),{Save}=await import('/src/game/Save.ts'),{LEVELS}=await import('/src/levels/data.ts');
      const ui=new UI(document.querySelector('#app'),new Save(),{start(){},pause(){},resume(){},menu(){},restart(){},recipes(){},mute(){},volume(){}});
      ui.setPlaying(LEVELS[data.level-1]);ui.setScreen('results');ui.results(data);
    },{...result,level,stars:3});
    for(const size of singlePageSizes){await page.setViewportSize(size);await assertSinglePage(page,'.results');}
  }
});

test('menu patience bars track the oldest outstanding guest for ninety seconds and update after serving',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await boot(page);await key(page,'KeyJ');await key(page,'KeyJ');await advance(page,2100);
  const check=async()=>{
    const s=await snapshot(page);
    await expect(page.locator('.order-patience')).toHaveCount(s.orders.length);
    for(const order of s.orders){
      const waiting=s.restaurant.customers.filter(c=>c.orderId===order.id&&c.state==='WAITING'),minimum=Math.min(...waiting.map(c=>c.patience));
      const bar=page.locator(`[data-order="${order.id}"] .order-patience`);await expect(bar).toHaveAttribute('aria-valuemax','90');expect(Math.abs(Number(await bar.getAttribute('aria-valuenow'))-minimum)).toBeLessThanOrEqual(1.2);
      const fill=await bar.locator('i').evaluate(el=>Number((el as HTMLElement).style.width.replace('%','')));expect(Math.abs(fill-minimum/90*100)).toBeLessThan(.3);
      await expect(bar).toHaveAttribute('data-mood',minimum>60?'relaxed':minimum>30?'uneasy':'angry');await expect(page.locator('.order-seconds')).toHaveCount(0);
    }
    return s;
  };
  let s=await check();const id=s.restaurant.customers[0].id,orderId=s.orders[0].id;expect(s.orders[0].duration).toBe(90);await page.screenshot({path:'artifacts/patience-bar-green.png'});
  await advance(page,31000);await check();await page.screenshot({path:'artifacts/patience-bar-yellow.png'});
  await key(page,'Escape');const frozen=await snapshot(page),width=await page.locator('.order-patience i').getAttribute('style');await advance(page,4000);expect((await snapshot(page)).restaurant).toEqual(frozen.restaurant);expect(await page.locator('.order-patience i').getAttribute('style')).toBe(width);await key(page,'KeyJ');
  await advance(page,30000);await check();await page.screenshot({path:'artifacts/patience-bar-red.png'});
  await advance(page,14000);s=await check();expect(s.restaurant.customers.find(c=>c.id===id)?.state).toBe('WAITING');
  const oldest=s.restaurant.customers.find(c=>c.id===id)!;await advance(page,(oldest.patience+.2)*1000);s=await snapshot(page);expect(s.failed).toBe(1);await expect(page.locator(`[data-order="${orderId}"]`)).toHaveCount(0);
  for(let i=0;i<30&&!s.orders.length;i++){await advance(page,1000);s=await snapshot(page);}expect(s.orders[0].quantity).toBe(2);
  const partyOrder=s.orders[0].id;await makeDish(page,'salad');s=await check();expect(s.orders.find(o=>o.id===partyOrder)?.quantity).toBe(1);expect(s.restaurant.customers.some(c=>c.orderId===partyOrder&&c.state==='EATING')).toBe(true);
  await makeDish(page,'salad');await expect(page.locator(`[data-order="${partyOrder}"] .order-patience`)).toHaveCount(0);expect(errors).toEqual([]);
});

test('J returns untouched ingredients to their own crates and lets the chef pick another without waste',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await boot(page);await key(page,'KeyJ');await key(page,'KeyJ');
  let s=await snapshot(page);const tomato=find(s,'crate','tomato'),lettuce=find(s,'crate','lettuce');
  await interact(page,tomato);await advance(page,150);s=await snapshot(page);expect(s.player.held?.type).toBe('food');expect(s.result.wasteCost).toBe(2);await expect(page.locator('#interaction')).toContainText('J 放回原材料');
  const held=s.player.held;await interact(page,lettuce);expect((await snapshot(page)).player.held).toEqual(held);
  await interact(page,tomato);s=await snapshot(page);expect(s.player.held).toBeNull();expect(s.result.wasteCost).toBe(0);expect(s.result.ingredientCost).toBe(0);await page.screenshot({path:'artifacts/return-raw-ingredient.png'});
  await interact(page,lettuce);await advance(page,150);expect((await snapshot(page)).player.held).toMatchObject({type:'food',components:[{kind:'lettuce',state:'RAW'}]});await expect(page.locator('#interaction')).toContainText('J 放回原材料');
  await interact(page,find(s,'board'));await work(page,find(s,'board'),2);await key(page,'KeyJ');s=await snapshot(page);expect(s.player.held).toMatchObject({type:'food',components:[{kind:'lettuce',state:'CHOPPED'}]});
  await interact(page,lettuce);expect((await snapshot(page)).player.held).toEqual(s.player.held);
  await interact(page,find(s,'trash'));s=await snapshot(page);expect(s.result.wasted).toBe(1);expect(s.result.wasteCost).toBe(2);
  await makeDish(page,'salad');s=await snapshot(page);expect(s.served).toBe(1);expect(s.result.revenue).toBe(8);expect(s.result.ingredientCost).toBe(6);expect(s.result.wasteCost).toBe(2);expect(errors).toEqual([]);
});
