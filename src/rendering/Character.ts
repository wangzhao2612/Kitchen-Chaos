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
  const stride=walking?Math.sin(cycle)*6.4*pace:0;
  const side=Math.abs(f.x)>.6, run=player.dash>0;
  const foot=(sign:number)=>({x:lateral.x*sign*8+f.x*stride*sign,y:lateral.y*sign*8+f.y*stride*sign*.58+2,lift:walking?Math.max(0,Math.cos(cycle+(sign>0?0:Math.PI)))*4.2*pace:0});
  const pickup=player.activity==='idle'?Math.sin(Math.min(1,player.action/.2)*Math.PI):0;
  const phase=player.workTime*(player.activity==='chop'?32:15);
  const working=player.activity!=='idle';
  const leanX=working?f.x*4:f.x*pace*(run?4:1);
  const item=player.held?{x:f.x*(22+pickup*3),y:(f.y<-.3?-28:-13)+pickup*3}:null;
  const workObject=player.activity==='wash'?{x:f.x*26,y:-24+f.y*12}:null;
  const swing=stride*1.7;let leftHand={x:-lateral.x*19+f.x*swing,y:-17-lateral.y*16+f.y*swing*.58},rightHand={x:lateral.x*19-f.x*swing,y:-17+lateral.y*16-f.y*swing*.58};
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
  return {headFrame:player.facing.y<0?1:player.facing.x<0?2:player.facing.x>0?3:0,atlasFrame:(Math.round(yaw/(Math.PI/4))+8)%8,direction:f,stride,bob:walking?-Math.abs(Math.cos(cycle))*2.8*pace:0,
    leanX,leanY:working?f.y*3+Math.sin(phase)*.7:f.y*pace*2,
    tilt:working?0:(side?f.x*(run?.16:.06)*pace+Math.sin(cycle)*.02*pace:Math.sin(cycle)*.05*pace),
    squash:walking?-Math.cos(cycle*2)*.03*pace:pickup*.07,headTilt:walking?-Math.sin(cycle)*.035*pace:0,
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
  draw(c: CanvasRenderingContext2D,player:Player,workItem?:Item|null,choppingTarget?:{x:number;y:number},variant=0):void {
    const P=APRONS[variant]??APRONS[0];
    const pose=characterPose(player,choppingTarget);this.lastPose=pose;
    const back=pose.direction.y<-.4,side=Math.abs(pose.direction.x)>.6,turn=Math.abs(pose.direction.x);
    const lateral={x:-pose.direction.y,y:pose.direction.x*.58};
    const leftShoulder={x:-lateral.x*15,y:-24-lateral.y*12},rightShoulder={x:lateral.x*15,y:-24+lateral.y*12};
    // Legs and shoes: slate trousers keep the silhouette apart from the cream coat; the hip joins the torso.
    const leg=(foot:CharacterPose['leftFoot'])=>{
      ellipse(c,foot.x,foot.y+3,7,3,'#263f3425');
      const ankleY=foot.y-foot.lift-2;
      limb(c,foot.x*.55,-10,foot.x*.78,(ankleY-10)/2,foot.x,ankleY,4.9,4.1,TROUSERS,TROUSERS_EDGE);
      c.save();c.translate(foot.x+pose.direction.x*2,foot.y-foot.lift);c.rotate(Math.atan2(pose.direction.y*.58,pose.direction.x));
      const length=9*Math.hypot(pose.direction.x,pose.direction.y*.58);ellipse(c,0,0,length,5.6,'#7a4f35','#4a3426');ellipse(c,-1,-1.5,length*.6,2.2,'#c08f62');c.restore();
    };
    [pose.leftFoot,pose.rightFoot].sort((a,b)=>a.y-b.y).forEach(leg);
    c.save();c.translate(pose.leanX,pose.bob+pose.leanY);
    const breath=pose.activity==='idle'&&pose.stride===0&&!player.held?Math.sin(performance.now()/380)*.014:0;
    c.rotate(pose.tilt);c.scale(1+pose.squash-breath,1-pose.squash+breath);
    const farLeft=leftShoulder.y<rightShoulder.y;
    if(side&&!back){const sh=farLeft?leftShoulder:rightShoulder,h=farLeft?pose.leftHand:pose.rightHand;this.arm(c,sh.x,sh.y,h.x,h.y,undefined,true);}
    // Torso: a flared chef jacket with a flat hem instead of a round "bottom"; slimmer from the side and kept under the head so the chef stands upright.
    const tw=13-2*turn,hw=17.5-3.5*turn,rx=hw,tx=pose.direction.x*1.2,hs=pose.stride*.32*(1-turn*.5);
    const jacket=():void=>{c.beginPath();c.moveTo(tx-tw,-30);c.quadraticCurveTo(tx,-40,tx+tw,-30);c.bezierCurveTo(tx+tw+2,-26,tx+hw,-17,tx+hw,-11);c.quadraticCurveTo(tx+hw,-4+hs*.2,tx+hw-6+hs,-4);c.lineTo(tx-hw+6+hs,-4);c.quadraticCurveTo(tx-hw,-4-hs*.2,tx-hw,-11);c.bezierCurveTo(tx-hw,-17,tx-tw-2,-26,tx-tw,-30);c.closePath();};
    const coat=c.createLinearGradient(tx-hw,-36,tx+hw*.8,-4);coat.addColorStop(0,'#fffaf0');coat.addColorStop(.6,'#f5e8d0');coat.addColorStop(1,'#e2d3b6');
    jacket();c.fillStyle=coat;c.fill();
    stroke(c,tx-hw+4,-7.5,tx+hw-4,-7.5,'#e6d7ba',1.2);
    ellipse(c,tx-hw*.35,-26,hw*.35,7,'#fffdf5aa');
    const apron=c.createLinearGradient(-12,-18,15,1);apron.addColorStop(0,P.a0);apron.addColorStop(.55,P.a1);apron.addColorStop(1,P.a2);
    if(back) {
      stroke(c,tx-9,-31,tx+8,-14,P.light,2.6);stroke(c,tx+9,-31,tx-8,-14,P.light,2.6);
      stroke(c,-1,-11,-6,-4,P.a1,3);stroke(c,1,-11,6,-4,P.a1,3);
      rounded(c,-13,-16,26,5,2.5,apron,P.edge);
      for(const sign of [-1,1]){c.save();c.translate(sign*4.8,-13.5);c.rotate(sign*.35);ellipse(c,0,0,5.2,3.2,P.light,P.edge);c.restore();}
      ellipse(c,0,-13.5,2.4,2.4,P.knot,P.edge);
    } else {
      // The apron is clipped to the jacket so it wraps the body instead of floating in front of it.
      const width=22-11*turn,center=pose.direction.x*8.5,x=center-width/2;
      c.save();jacket();c.clip();c.lineWidth=1;
      if(turn>.5)rounded(c,tx-hw+2,-16,2*hw-4,5,2,P.light,P.edge);
      rounded(c,x,-26,width,27,Math.min(7,width/2),apron,P.edge);
      if(turn<=.5)rounded(c,center-6,-13,12,7,3,P.pale,P.edge);
      c.restore();
      if(turn>.5)ellipse(c,tx-pose.direction.x*(hw-2),-13.5,3.4,3,P.a1,P.edge);
      if(turn<=.5){stroke(c,center-6,-24,center-4,-31,P.light,2.2);stroke(c,center+6,-24,center+4,-31,P.light,2.2);}
    }
    jacket();c.strokeStyle='#d2bf9e';c.lineWidth=1;c.stroke();
    ellipse(c,tx,-29,Math.max(9,hw-5),6.5,'#fff7e6','#dac8a8');
    ellipse(c,pose.direction.x*6,-28+pose.direction.y*2,7,3,'#e58c42');
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
    // A soft contact shadow under the chin ties the rendered head to the flat-shaded body.
    ellipse(c,0,-22,Math.max(9,rx-4),5,'#7a65482e');
    c.save();c.translate(0,-29-pose.bob*.45);c.rotate(pose.headTilt);c.translate(0,29);
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
  /** A tapered sleeve with a rolled cuff; `far` shades the arm that is partly behind the torso. */
  private arm(c:CanvasRenderingContext2D,sx:number,sy:number,hx:number,hy:number,elbow?:{x:number;y:number},far=false):void {
    const out=sx>=0?1:-1,cx=elbow?.x??(sx+hx)*.5+out*2.6,cy=elbow?.y??Math.max(sy,hy)+4;
    limb(c,sx,sy,cx,cy,hx,hy,5.4,3.9,far?'#efe2c8':'#fff7e6','#d6c4a4');
    const t=.86,u=1-t,px=u*u*sx+2*u*t*cx+t*t*hx,py=u*u*sy+2*u*t*cy+t*t*hy;
    c.beginPath();c.arc(px,py,4.6,0,Math.PI*2);c.fillStyle=far?'#f1e5cc':'#fffbf0';c.fill();c.strokeStyle='#d6c4a4';c.lineWidth=1;c.stroke();
    this.hand(c,hx,hy);
  }
  private hand(c:CanvasRenderingContext2D,x:number,y:number,gripping=false):void {
    const r=gripping?3.3:3.8,skin=c.createRadialGradient(x-1,y-1.2,0,x,y,r+1.5);
    skin.addColorStop(0,'#ffe7cf');skin.addColorStop(.65,SKIN);skin.addColorStop(1,'#e2a67f');
    c.lineWidth=1;ellipse(c,x,y,r,gripping?r-.4:r,skin,'#c48b64');
  }
}
/** Same peach as the cutting-hand drawn by the renderer, so every hand matches the face. */
const APRONS=[
  {a0:'#a6d8bb',a1:'#74b09a',a2:'#468873',edge:'#4f8f78',light:'#8ac3aa',pale:'#9fceb2',knot:'#5c9d85'},
  {a0:'#f6c38a',a1:'#ec9b5a',a2:'#c8692f',edge:'#b5602b',light:'#f2b27a',pale:'#f8cf9f',knot:'#d8803f'}
];
export const SKIN='#f2be92';
const TROUSERS='#66737f',TROUSERS_EDGE='#4b5863';
/** Draws a tube along a quadratic curve whose radius tapers from r0 to r1, as overlapping discs. */
function limb(c:CanvasRenderingContext2D,sx:number,sy:number,cx:number,cy:number,ex:number,ey:number,r0:number,r1:number,fill:string,edge:string):void {
  const pts:{x:number;y:number;r:number}[]=[];
  for(let i=0;i<=10;i++){const t=i/10,u=1-t;pts.push({x:u*u*sx+2*u*t*cx+t*t*ex,y:u*u*sy+2*u*t*cy+t*t*ey,r:r0+(r1-r0)*t});}
  c.fillStyle=edge;for(const p of pts){c.beginPath();c.arc(p.x,p.y,p.r+1,0,Math.PI*2);c.fill();}
  c.fillStyle=fill;for(const p of pts){c.beginPath();c.arc(p.x,p.y,p.r,0,Math.PI*2);c.fill();}
}
function stroke(c:CanvasRenderingContext2D,x:number,y:number,x2:number,y2:number,color:string,width:number):void {c.beginPath();c.moveTo(x,y);c.lineTo(x2,y2);c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.stroke();}
