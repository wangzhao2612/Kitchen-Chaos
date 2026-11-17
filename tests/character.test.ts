import { expect, it } from 'vitest';
import { Simulation } from '../src/game/Simulation';
import { LEVELS } from '../src/levels/data';
import { characterPose } from '../src/rendering/Character';
import { food, plate, TILE, WASH_SECONDS } from '../src/game/types';
import type { Control, Station } from '../src/game/types';
const idle:Control={x:0,y:0,interact:false,work:false,dash:false};
function work(sim:Simulation,station:Station,seconds:number):void {
  sim.player.x=station.x+TILE/2;sim.player.y=station.y+TILE*1.5;sim.player.facing={x:0,y:-1};
  for(let i=0;i<Math.round(seconds*60);i++)sim.update(1/60,{...idle,work:true});
}
it('holds plates at the torso with both hands for every direction',()=>{
  const sim=new Simulation(LEVELS[0]);sim.player.held=plate();
  for(const facing of [{x:0,y:1},{x:0,y:-1},{x:-1,y:0},{x:1,y:0}]) {
    sim.player.facing=facing;sim.player.yaw=Math.atan2(facing.x,-facing.y);const pose=characterPose(sim.player);
    expect(pose.item!.y).toBeGreaterThanOrEqual(-28);
    expect(pose.leftHand.x).toBe(pose.item!.x-20);expect(pose.rightHand.x).toBe(pose.item!.x+20);
    for(const hand of [pose.leftHand,pose.rightHand])expect(Math.hypot(hand.x-pose.item!.x,hand.y-pose.item!.y)).toBeLessThan(23);
  }
});
it('chopping arms move only during actual processing and stop on interruption',()=>{
  const sim=new Simulation(LEVELS[0]),board=sim.stations.find(s=>s.kind==='board')!;
  sim.player.held=food('tomato');sim.interact(board);work(sim,board,.5);
  expect(sim.player.activity).toBe('chop');const before=characterPose(sim.player);
  work(sim,board,.25);expect(characterPose(sim.player).rightHand.y).not.toBe(before.rightHand.y);
  const progress=board.item?.type==='food'?board.item.progress:0;
  sim.update(1/60,idle);expect(sim.player.activity).toBe('idle');expect((board.item as ReturnType<typeof food>).progress).toBe(progress);
  expect(characterPose(sim.player)).toEqual(characterPose(sim.player));
});
it('washing scrubs the plate, preserves interrupted progress and completes in two active seconds',()=>{
  const sim=new Simulation(LEVELS[2]),sink=sim.stations.find(s=>s.kind==='sink')!;
  const dirty=plate();dirty.dirty=true;sim.cleanPlates--;sim.dirtyQueue.push(dirty);
  work(sim,sink,.75);expect(sim.player.activity).toBe('wash');const before=characterPose(sim.player);
  expect(before.workObject).not.toBeNull();
  expect(Math.hypot(before.rightHand.x-before.workObject!.x,before.rightHand.y-before.workObject!.y)).toBeLessThan(8);
  expect(before.leftHand.x).toBe(before.workObject!.x-18);expect(sim.player.held).toBeNull();expect(sink.item).toBe(dirty);
  work(sim,sink,.25);expect(characterPose(sim.player).rightHand.x).not.toBe(before.rightHand.x);
  sim.update(1/60,idle);expect(sim.player.activity).toBe('idle');expect((sink.item as ReturnType<typeof plate>).progress).toBeCloseTo(1);
  work(sim,sink,WASH_SECONDS-1+.05);expect(sink.item).toBeNull();expect(dirty.dirty).toBe(false);expect(sim.cleanPlates).toBe(sim.level.plates);
  sim.update(1/60,idle);expect(sim.player.activity).toBe('idle');
});
it('shrinks real map bounds and locates the sink at the upper-left belt end',()=>{
  for(const level of LEVELS) {
    expect(level.cols*level.rows).toBeLessThanOrEqual(150);
    const sim=new Simulation(level);expect(sim.blocked(level.cols*TILE+1,4*TILE)).toBe(true);
    if(!level.washing)continue;
    expect(level.plates).toBe(level.id<3?level.id+2:5);
    const sink=sim.stations.find(s=>s.kind==='sink')!;
    expect(sink.x).toBe(TILE); expect(sink.y).toBe(TILE);
    expect(sim.stations.filter(s=>s.kind==='sink')).toHaveLength(1);
  }
});
it('moving worktops never overlap fixed facilities at either end of their route',()=>{
  for(const level of LEVELS.filter(l=>l.dynamic)) {
    const moving=level.stations.find(s=>s.moving)!;
    for(const x of [moving.moving!.fromX,moving.moving!.toX])for(const fixed of level.stations.filter(s=>!s.moving)) {
      expect(x<fixed.x+TILE&&x+TILE>fixed.x&&moving.y<fixed.y+TILE&&moving.y+TILE>fixed.y).toBe(false);
    }
  }
});


it('walks with alternating directional feet, a dash lean and a stable stopped pose',()=>{
  const sim=new Simulation(LEVELS[0]),p=sim.player;
  p.facing={x:1,y:0};p.yaw=Math.PI/2;p.vx=210;p.walk=.2;
  const first=characterPose(p);p.walk+=Math.PI/2;const second=characterPose(p);
  expect(first.leftFoot.x).not.toBe(second.leftFoot.x);
  expect(first.leftFoot.lift).toBeGreaterThanOrEqual(0);
  expect(first.rightFoot.lift).toBeGreaterThanOrEqual(0);
  p.dash=.15;expect(Math.abs(characterPose(p).tilt)).toBeGreaterThan(Math.abs(first.tilt));
  p.dash=0;p.vx=.0001;const stopped=characterPose(p);p.walk+=1;p.vx=0;
  expect(characterPose(p)).toEqual(stopped);
  expect(stopped.bob).toBe(0);expect(stopped.tilt).toBe(0);
});


it('targets the actual board when chopping from any side',()=>{
  const sim=new Simulation(LEVELS[0]);sim.player.activity='chop';sim.player.workTime=.2;
  for(const facing of [{x:0,y:1},{x:0,y:-1},{x:1,y:0},{x:-1,y:0}]){
    sim.player.facing=facing;const target={x:facing.x*52,y:facing.y*35-10},pose=characterPose(sim.player,target);
    expect(pose.leftHand.x+pose.leanX).toBe(target.x+(facing.x?facing.x*5:8));
    expect(Math.abs(pose.rightHand.x+pose.leanX-target.x)).toBeLessThan(22);
    expect(Math.abs(pose.leftHand.y+pose.leanY-target.y)).toBeLessThan(5);
  }
});


it('turns through the shortest arc and projects both feet in the same eight-direction plane',()=>{
  const sim=new Simulation(LEVELS[0]);sim.update(1/60,{...idle,x:1,y:1});
  expect(sim.player.yaw).toBeGreaterThan(0);expect(sim.player.yaw).toBeLessThan(Math.PI*.75);
  for(let i=0;i<20;i++)sim.update(1/60,{...idle,x:1,y:1});
  const pose=characterPose(sim.player);expect(pose.atlasFrame).toBe(3);
  expect(pose.direction.x).toBeGreaterThan(.6);expect(pose.direction.y).toBeGreaterThan(.6);
  const before=sim.player.yaw;sim.update(1/60,{...idle,x:-1,y:1});
  expect(Math.abs(sim.player.yaw-before)).toBeLessThan(Math.PI/2);
});


it('keeps side chopping hands low on the board and mirrors the working direction',()=>{
  const sim=new Simulation(LEVELS[0]);sim.player.activity='chop';sim.player.workTime=.18;
  const poses=[-1,1].map(x=>{sim.player.facing={x,y:0};return characterPose(sim.player,{x:x*48,y:-9});});
  expect(poses[0].rightHand.x+poses[0].leanX).toBe(-(poses[1].rightHand.x+poses[1].leanX));
  for(const pose of poses){expect(pose.rightHand.y).toBeGreaterThan(-18);expect(pose.rightHand.y).toBeLessThan(-4);}
});
it('faces the real cutting board while processing even after an unrelated last movement',()=>{
  const sim=new Simulation(LEVELS[0]),board=sim.stations.find(s=>s.kind==='board')!;
  board.item=food('tomato');sim.player.x=board.x+TILE/2;sim.player.y=board.y+TILE*1.5;sim.player.facing={x:-1,y:0};
  sim.update(1/60,{...idle,work:true});expect(sim.player.activity).toBe('chop');expect(sim.player.facing).toEqual({x:0,y:-1});
});

it('front chopping uses the anatomical right hand, moving its grip and wrist angle together',()=>{
  const s=new Simulation(LEVELS[0]);s.player.activity='chop';s.player.facing={x:0,y:1};const target={x:0,y:28};
  s.player.workTime=.1;const a=characterPose(s.player,target);s.player.workTime=.16;const b=characterPose(s.player,target);
  expect(a.rightHand.x).toBeLessThan(a.leftHand.x);expect(a.rightHand.y).not.toBe(b.rightHand.y);expect(a.rightHand.x).not.toBe(b.rightHand.x);
});

it('carries plates and food below the chin line so the face stays visible',()=>{
  const sim=new Simulation(LEVELS[0]);
  for(const held of [plate(),food('tomato')]) {
    sim.player.held=held;
    for(const facing of [{x:0,y:1},{x:-1,y:0},{x:1,y:0}]) {
      sim.player.facing=facing;sim.player.yaw=Math.atan2(facing.x,-facing.y);
      expect(characterPose(sim.player).item!.y).toBeGreaterThanOrEqual(-14);
    }
  }
});

it('walks with a lively gait: visible stride, bob and arms swinging opposite to the legs',()=>{
  const sim=new Simulation(LEVELS[0]),p=sim.player;
  p.facing={x:0,y:1};p.yaw=0;p.vy=210;
  p.walk=0;expect(characterPose(p).bob).toBeLessThan(-2);
  p.walk=Math.PI/4;
  const pose=characterPose(p);
  expect(Math.abs(pose.stride)).toBeGreaterThan(4);
  // Hands swing opposite to the feet.
  expect((pose.leftHand.y-pose.rightHand.y)*(pose.leftFoot.y-pose.rightFoot.y)).toBeLessThan(0);
});
