import { expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Simulation } from '../src/game/Simulation';
import { LEVELS } from '../src/levels/data';
import { TILE, INGREDIENTS, WASH_SECONDS, DIRTY_RETURN_SECONDS } from '../src/game/types';
import { recipe } from '../src/cooking/recipes';
import type { Control, IngredientKind, Station } from '../src/game/types';

// An input-only solo runner: no teleporting, prepared food, scores or save edits.
const idle: Control = { x: 0, y: 0, interact: false, work: false, dash: false };
function tick(s: Simulation, seconds: number, control = idle): void { for (let i = 0; i < Math.ceil(seconds * 60) && !s.finished; i++) s.update(1/60, control); }
function find(s: Simulation, kind: Station['kind'], ingredient?: IngredientKind): Station { return s.stations.find(st => st.kind === kind && (!ingredient || st.ingredient === ingredient))!; }
function route(s: Simulation, station: Station): {x:number;y:number}[] {
  const start = [Math.floor(s.player.x/TILE), Math.floor(s.player.y/TILE)];
  const free = (x:number,y:number) => x>0&&y>0&&x<s.level.cols-1&&y<s.level.rows-1&&!s.blocked((x+.5)*TILE,(y+.5)*TILE);
  const ends = [[0,1],[1,0],[-1,0],[0,-1]].map(([dx,dy])=>[Math.round(station.x/TILE)+dx,Math.round(station.y/TILE)+dy]).filter(([x,y])=>free(x,y));
  const queue=[start], previous=new Map<string,string|null>([[start.join(','),null]]); let end:string|null=null;
  while(queue.length) { const [x,y]=queue.shift()!; if(ends.some(([ex,ey])=>ex===x&&ey===y)) {end=`${x},${y}`;break;} for(const [dx,dy] of [[0,1],[1,0],[-1,0],[0,-1]]) { const next=[x+dx,y+dy],id=next.join(','); if(!previous.has(id)&&free(next[0],next[1])) {previous.set(id,`${x},${y}`);queue.push(next);} } }
  if(!end) throw new Error(`No route to ${station.id}`);
  const points:{x:number;y:number}[]=[];
  while(end) {const [x,y]=end.split(',').map(Number);points.unshift({x:(x+.5)*TILE,y:(y+.5)*TILE});end=previous.get(end)??null;}
  return points;
}
function move(s: Simulation, station: Station, attempts=0): void {
  if(s.finished) throw new Error('Round ended during preparation');
  if(attempts>12) throw new Error(`Blocked input route to ${station.id} at ${s.player.x},${s.player.y}; time=${s.time}`);
  const points=route(s,station);
  for(let i=0;i<points.length;i++) {
    const point=points[i]; if(i===0&&s.blocked(point.x,point.y))continue; let last=Infinity, blocked=0;
    for(let frame=0;frame<300;frame++) {
      if(s.finished) throw new Error('Round ended during movement');
      const dx=point.x-s.player.x,dy=point.y-s.player.y,distance=Math.hypot(dx,dy);
      if(Math.abs(dx)<4&&Math.abs(dy)<4) break;
      blocked=Math.abs(last-distance)<.02?blocked+1:0;last=distance;
      if(blocked>12) {tick(s,.08);move(s,station,attempts+1);return;}
      // Dash along a straight stretch, then steer normally near a turn.
      const next=points.slice(i).find(p=>p.x!==point.x&&p.y!==point.y)??points.at(-1)!;
      const straightDistance=Math.max(Math.abs(next.x-s.player.x),Math.abs(next.y-s.player.y));
      const x=Math.abs(dx)>Math.abs(dy)?Math.sign(dx):0, y=x?0:Math.sign(dy);
      s.update(1/60,{...idle,x,y,dash:straightDistance>150&&distance>12&&s.player.cooldown===0});
      if(frame===299) throw new Error(`Input steering failed at ${station.id}`);
    }
  }
  tick(s,.1);
  const dx=station.x+TILE/2-s.player.x,dy=station.y+TILE/2-s.player.y;
  s.update(1/60,{...idle,x:Math.abs(dx)>Math.abs(dy)?Math.sign(dx):0,y:Math.abs(dx)>Math.abs(dy)?0:Math.sign(dy)});
  tick(s,.03);
  if(s.target!==station) throw new Error(`Wrong target: ${s.target?.id} instead of ${station.id}`);
}
function interact(s:Simulation,station:Station):void {move(s,station);s.update(1/60,{...idle,interact:true});}
function work(s:Simulation,station:Station,seconds:number):void {move(s,station);tick(s,seconds+.05,{...idle,work:true});}
function plate(s:Simulation):void {
  if(s.cleanPlates) interact(s,find(s,'plates'));
  else { if(!s.dirtyPlates) tick(s,DIRTY_RETURN_SECONDS+.1); work(s,find(s,'sink'),WASH_SECONDS);interact(s,find(s,'plates')); }
  if(s.player.held?.type!=='plate') throw new Error('Plate cycle failed');
}
function make(s:Simulation,id:string):void {
  const r=recipe(id),assembly=s.stations.find(st=>st.kind==='counter'&&!st.moving)!, board=find(s,'board');
  plate(s);interact(s,assembly);
  if(id==='soup') {
    const stove=find(s,'stove');
    for(const kind of ['tomato','onion'] as IngredientKind[]) {interact(s,find(s,'crate',kind));interact(s,board);work(s,board,INGREDIENTS[kind].chop);s.update(1/60,{...idle,interact:true});interact(s,stove);}
    interact(s,assembly);move(s,stove);if(stove.stoveState==='COOKING') tick(s,stove.cookTime-stove.elapsed+.05);s.update(1/60,{...idle,interact:true});
  } else {
    const pending:Station[]=[];
    const ordered=[...r.components].sort((a,b)=>({RAW:0,CHOPPED:1,COOKED:2,COOKING:3,BURNT:4}[a.state]-{RAW:0,CHOPPED:1,COOKED:2,COOKING:3,BURNT:4}[b.state]));
    for(const part of ordered) {
      interact(s,find(s,'crate',part.kind));
      if(part.state==='CHOPPED') {interact(s,board);work(s,board,INGREDIENTS[part.kind].chop);s.update(1/60,{...idle,interact:true});interact(s,assembly);}
      else if(part.state==='COOKED') {const stove=s.stations.find(st=>st.kind==='stove'&&!st.item)!;interact(s,stove);pending.push(stove);}
      else interact(s,assembly);
    }
    interact(s,assembly);
    for(const stove of pending) {move(s,stove);if(stove.stoveState==='COOKING') tick(s,stove.cookTime-stove.elapsed+.05);s.update(1/60,{...idle,interact:true});}
  }
  const before=s.served;interact(s,find(s,'serve'));tick(s,3.5);
  if(s.served!==before+1) throw new Error(`Dish was not accepted: ${id}`);
  if(s.plateCount()!==s.level.plates) throw new Error('Lost a plate');
}
it('all five kitchens have an input-only solo three-star route',()=>{
  const report=[];
  const cost:Record<string,number>={salad:18,cheeseburger:24,burger:28,chickenrice:32,pasta:34,soup:40};
  for(const level of LEVELS) {
    const s=new Simulation(level);let interrupted='';
    while(s.time>15) {
      if(!s.orders.length) {tick(s,1);continue;}
      const order=s.orders.filter(o=>o.remaining>cost[o.recipeId]+(s.cleanPlates?8:24)&&s.time>cost[o.recipeId]+(s.cleanPlates?1:9)).sort((a,b)=>recipe(b.recipeId).score/cost[b.recipeId]-recipe(a.recipeId).score/cost[a.recipeId])[0];
      if(!order){tick(s,1);continue;}
      try {make(s,order.recipeId);} catch(error) {interrupted=String(error);break;}
    }
    tick(s,s.time+.1);
    report.push({...s.result(),interrupted});
    expect(interrupted,JSON.stringify(report)).toBe('');
    expect(s.stars,JSON.stringify(report)).toBe(3);
  }
  console.log('Input-only solo balance',JSON.stringify(report));
  mkdirSync('artifacts',{recursive:true});
  writeFileSync('artifacts/solo-three-star.json',JSON.stringify({mode:'Fixed 60 Hz simulation with normal controls; no rendering',results:report},null,2));
});
