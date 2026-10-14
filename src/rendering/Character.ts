import type { Item, Player } from '../game/types';
import { ellipse, itemIcon, rounded } from './art';
import { choppingToolPose } from './ChoppingPose';

export interface CharacterPose {
  headFrame: number; atlasFrame: number; direction: {x:number;y:number}; stride: number; bob: number; leanX: number; leanY: number;
  tilt: number; squash: number; headTilt: number; leftFoot: {x:number;y:number;lift:number}; rightFoot: {x:number;y:number;lift:number};
  leftHand: {x:number;y:number}; rightHand: {x:number;y:number};
  item: {x:number;y:number} | null; workObject: {x:number;y:number} | null; activity: Player['activity']; phase: number;
}

/** Work poses use fixed-step processing state, including pause and interruption. */
export function characterPose(player: Player, choppingTarget?: {x:number;y:number}): CharacterPose {
  const yaw=player.activity==='idle'?player.yaw:Math.atan2(player.facing.x,-player.facing.y);
  const f={x:Math.sin(yaw),y:-Math.cos(yaw)},lateral={x:Math.cos(yaw),y:Math.sin(yaw)*.58};
  const walking=Math.hypot(player.vx,player.vy)>12;
  const pace=walking?Math.min(1,Math.hypot(player.vx,player.vy)/210):0,cycle=player.walk*2;
  const stride=walking?Math.sin(cycle)*3.8*pace:0;
  const side=Math.abs(f.x)>.6, run=player.dash>0;
  const foot=(sign:number)=>({x:lateral.x*sign*8+f.x*stride*sign,y:lateral.y*sign*8+f.y*stride*sign*.58+2,lift:walking?Math.max(0,Math.cos(cycle+(sign>0?0:Math.PI)))*2.2*pace:0});
  const pickup=player.activity==='idle'?Math.sin(Math.min(1,player.action/.2)*Math.PI):0;
  const phase=player.workTime*(player.activity==='chop'?32:15);
  const working=player.activity!=='idle';
  const leanX=working?f.x*4:f.x*pace*(run?4:1);
  const item=player.held?{x:f.x*(22+pickup*3),y:(f.y<0?-28:-18)+pickup*3}:null;
  const workObject=player.activity==='wash'?{x:f.x*26,y:-24+f.y*12}:null;
  let leftHand={x:-lateral.x*19+f.x*stride,y:-17-lateral.y*16+f.y*stride*.58},rightHand={x:lateral.x*19-f.x*stride,y:-17+lateral.y*16-f.y*stride*.58};
  if(item) { const grip=player.held?.type==='plate'?20:12;leftHand={x:item.x-grip,y:item.y+5};rightHand={x:item.x+grip,y:item.y+5}; }
  if(working) {
    const x=f.x*26,y=-24+f.y*12,scrub=player.activity==='wash'?Math.sin(phase)*5:0;
    leftHand={x:x-8+scrub,y:y+2};
    rightHand={x:x+8+scrub,y:y-(player.activity==='chop'?(1+Math.sin(phase))*7:Math.cos(phase)*3)};
    if(workObject) {leftHand={x:x-18,y:y+7};rightHand={x:x+scrub,y:y-2+Math.cos(phase)*3};}
    if(player.activity==='chop'&&choppingTarget) {
      const tool=choppingToolPose(player.facing,player.workTime),leanY=f.y*3+Math.sin(phase)*.7;
      leftHand={x:choppingTarget.x+tool.support.x-leanX,y:choppingTarget.y+tool.support.y-leanY};
      rightHand={x:choppingTarget.x+tool.grip.x-leanX,y:choppingTarget.y+tool.grip.y-leanY};
      if(f.y<-.5)rightHand={x:choppingTarget.x+10-leanX,y:-42-Math.sin(phase)*3};
    }
  }
  return {headFrame:player.facing.y<0?1:player.facing.x<0?2:player.facing.x>0?3:0,atlasFrame:(Math.round(yaw/(Math.PI/4))+8)%8,direction:f,stride,bob:walking?-Math.abs(Math.cos(cycle))*1.2*pace:0,
    leanX,leanY:working?f.y*3+Math.sin(phase)*.7:f.y*pace*2,
    tilt:working?0:(side?f.x*(run?.11:.025)*pace:Math.sin(cycle)*.018*pace),
    squash:walking?Math.sin(cycle*2)*.01*pace:pickup*.045,headTilt:walking?-Math.sin(cycle)*.012*pace:0,
    leftFoot:foot(-1),rightFoot:foot(1),
    leftHand,rightHand,item,workObject,activity:player.activity,phase};
}

export class CharacterArt {
  readonly head = new Image();
  loaded=false;
  lastPose: CharacterPose | null=null;
  constructor() {
    this.head.onload=()=>{this.loaded=true;};
    this.head.src=`${import.meta.env.BASE_URL}art/chef-heads-v3.png`;
  }
  draw(c: CanvasRenderingContext2D,player:Player,workItem?:Item|null,choppingTarget?:{x:number;y:number}):void {
    const pose=characterPose(player,choppingTarget);this.lastPose=pose;
    const back=pose.direction.y<-.4,side=Math.abs(pose.direction.x)>.6;
    const lateral={x:-pose.direction.y,y:pose.direction.x*.58};
    const leftShoulder={x:-lateral.x*15,y:-24-lateral.y*12},rightShoulder={x:lateral.x*15,y:-24+lateral.y*12};
    const shoe=(foot:CharacterPose['leftFoot'])=>{
      ellipse(c,foot.x,foot.y+3,7,3,'#263f3425');
      rounded(c,foot.x-5,foot.y-foot.lift-8,10,11,4,'#fff0cf','#c8b69b');
      c.save();c.translate(foot.x+pose.direction.x*2,foot.y-foot.lift);c.rotate(Math.atan2(pose.direction.y*.58,pose.direction.x));
      const length=8*Math.hypot(pose.direction.x,pose.direction.y*.58);ellipse(c,0,0,length,5,'#684631','#3f352c');ellipse(c,-1,-1,length*.65,2,'#bc8756');c.restore();
    };
    [pose.leftFoot,pose.rightFoot].sort((a,b)=>a.y-b.y).forEach(shoe);
    c.save();c.translate(pose.leanX,pose.bob+pose.leanY);
    c.rotate(pose.tilt);c.scale(1+pose.squash,1-pose.squash);
    const farLeft=leftShoulder.y<rightShoulder.y;
    if(side&&!back){const sh=farLeft?leftShoulder:rightShoulder,h=farLeft?pose.leftHand:pose.rightHand;this.arm(c,sh.x,sh.y,h.x,h.y);}
    const coat=c.createLinearGradient(-18,-30,18,0);coat.addColorStop(0,'#fff8e7');coat.addColorStop(.5,'#f4e6cf');coat.addColorStop(1,'#cbbda6');
    ellipse(c,0,-20,20,17,coat,'#b5a58a');
    ellipse(c,0,-29,17,7,'#fff5e0','#d1bea1');
    ellipse(c,-7,-25,8,9,'#fff9ec88');
    const apron=c.createLinearGradient(-12,-18,15,1);apron.addColorStop(0,'#9dd2b4');apron.addColorStop(.55,'#70ac96');apron.addColorStop(1,'#397b68');
    if(back) {
      rounded(c,-13,-12,26,9,5,apron,'#4c8a73');
      stroke(c,-11,-28,10,-11,'#82bca5',3);stroke(c,11,-28,-10,-11,'#82bca5',3);
    } else {
      const width=side?15:26,x=pose.direction.x*8-width/2;
      rounded(c,x,-23,width,23,7,apron,'#4c8a73');
      if(!side){rounded(c,-6,-12,12,7,3,'#97c6a9','#4e9076');}
    }
    ellipse(c,pose.direction.x*8,-28+pose.direction.y*3,7,3,'#e58c42');
    const arm=(left:boolean)=>{
      const shoulder=left?leftShoulder:rightShoulder,hand=left?pose.leftHand:pose.rightHand;
      const elbow=back&&pose.activity==='chop'?{x:(left?-1:1)*(25+Math.sin(pose.phase)*3),y:-24-Math.sin(pose.phase)*2}:undefined;
      this.arm(c,shoulder.x,shoulder.y,hand.x,hand.y,elbow);
    };
    const arms=()=>{if(side&&!back)arm(!farLeft);else{arm(true);arm(false);}};
    const held=()=>{if(player.held&&pose.item){itemIcon(c,player.held,pose.item.x,pose.item.y,player.held.type==='plate'?35:29);this.hand(c,pose.leftHand.x,pose.leftHand.y,true);this.hand(c,pose.rightHand.x,pose.rightHand.y,true);}};
    const tools=()=>{
      if(pose.activity==='chop'&&!choppingTarget) {
        const h=pose.rightHand;c.save();c.translate(h.x,h.y);c.rotate(-.55+Math.sin(pose.phase)*.12);rounded(c,-2,-8,4,12,2,'#704d32');rounded(c,-3,3,11,17,2,'#f0f2e7','#84948b');c.restore();
      } else if(pose.workObject&&workItem?.type==='plate') {
        // Lift the actual sink plate while scrubbing; it stays in the sink's logical slot.
        itemIcon(c,workItem,pose.workObject.x,pose.workObject.y,30);
        this.hand(c,pose.leftHand.x,pose.leftHand.y,true);
        const h=pose.rightHand;rounded(c,h.x-5,h.y-3,10,6,2,'#f2cc67','#b99a48');
        for(let i=0;i<5;i++){const a=pose.phase*.4+i*1.7;ellipse(c,h.x+Math.sin(a)*14,h.y+Math.cos(a)*7,2+i%2,2,'#f2ffffb0','#9adbdccc');}
      }
    };
    if(back){arms();held();tools();}
    c.save();c.translate(0,-29);c.rotate(pose.headTilt);c.translate(0,29);
    if(this.loaded) {
      const w=this.head.naturalWidth/4,h=this.head.naturalHeight/2;
      if(pose.atlasFrame===3)c.scale(-1,1);
      c.drawImage(this.head,pose.atlasFrame%4*w,Math.floor(pose.atlasFrame/4)*h,w,h,-29,-77,58,58);
    } else {
      ellipse(c,0,-43,17,15,back?'#805737':'#f6c49b');rounded(c,-21,-73,42,27,12,'#fff5e4','#d9cbb5');ellipse(c,13,-66,4,7,'#74aa6c');
      if(!back){ellipse(c,-6,-44,2,3,'#573b2f');ellipse(c,6,-44,2,3,'#573b2f');}
    }
    c.restore();
    if(!back){arms();held();tools();}
    c.restore();
  }
  private arm(c:CanvasRenderingContext2D,sx:number,sy:number,hx:number,hy:number,elbow?:{x:number;y:number}):void {
    c.beginPath();c.moveTo(sx,sy);c.quadraticCurveTo(elbow?.x??(sx+hx)*.5,elbow?.y??Math.max(sy,hy)+4,hx,hy);c.strokeStyle='#c9baa2';c.lineWidth=10;c.lineCap='round';c.stroke();c.strokeStyle='#fff1d9';c.lineWidth=7;c.stroke();this.hand(c,hx,hy);
  }
  private hand(c:CanvasRenderingContext2D,x:number,y:number,gripping=false):void {
    const skin=c.createRadialGradient(x-1,y-2,1,x,y,6);skin.addColorStop(0,'#ffe2be');skin.addColorStop(.6,'#edb68b');skin.addColorStop(1,'#c78058');
    ellipse(c,x,y,4,gripping?3:4,skin,'#c48b64');
  }
}
function stroke(c:CanvasRenderingContext2D,x:number,y:number,x2:number,y2:number,color:string,width:number):void {c.beginPath();c.moveTo(x,y);c.lineTo(x2,y2);c.strokeStyle=color;c.lineWidth=width;c.stroke();}
