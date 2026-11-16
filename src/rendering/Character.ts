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
  const item=player.held?{x:f.x*(22+pickup*3),y:(f.y<-.3?-28:-13)+pickup*3}:null;
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
    const back=pose.direction.y<-.4,side=Math.abs(pose.direction.x)>.6,turn=Math.abs(pose.direction.x);
    const lateral={x:-pose.direction.y,y:pose.direction.x*.58};
    const leftShoulder={x:-lateral.x*15,y:-24-lateral.y*12},rightShoulder={x:lateral.x*15,y:-24+lateral.y*12};
    // Legs and shoes: slate trousers keep the silhouette apart from the cream coat; the hip joins the torso.
    const leg=(foot:CharacterPose['leftFoot'])=>{
      ellipse(c,foot.x,foot.y+3,7,3,'#263f3425');
      const ankleY=foot.y-foot.lift-2;
      limb(c,foot.x*.55,-10,foot.x*.78,(ankleY-10)/2,foot.x,ankleY,4.9,4.1,TROUSERS,TROUSERS_EDGE);
      c.save();c.translate(foot.x+pose.direction.x*2,foot.y-foot.lift);c.rotate(Math.atan2(pose.direction.y*.58,pose.direction.x));
      const length=8*Math.hypot(pose.direction.x,pose.direction.y*.58);ellipse(c,0,0,length,5,'#7a4f35','#4a3426');ellipse(c,-1,-1.2,length*.6,2,'#c08f62');c.restore();
    };
    [pose.leftFoot,pose.rightFoot].sort((a,b)=>a.y-b.y).forEach(leg);
    c.save();c.translate(pose.leanX,pose.bob+pose.leanY);
    c.rotate(pose.tilt);c.scale(1+pose.squash,1-pose.squash);
    const farLeft=leftShoulder.y<rightShoulder.y;
    if(side&&!back){const sh=farLeft?leftShoulder:rightShoulder,h=farLeft?pose.leftHand:pose.rightHand;this.arm(c,sh.x,sh.y,h.x,h.y,undefined,true);}
    // Torso: narrows when seen from the side so no grey coat disc shows behind the apron.
    const rx=19-6*turn,tx=pose.direction.x*1.5;
    const coat=c.createLinearGradient(tx-rx,-34,tx+rx*.8,-2);coat.addColorStop(0,'#fffaf0');coat.addColorStop(.6,'#f5e8d0');coat.addColorStop(1,'#e2d3b6');
    c.lineWidth=1;ellipse(c,tx,-20,rx,17,coat,'#d2bf9e');
    ellipse(c,tx,-29,Math.max(9,rx-3),6.5,'#fff7e6','#dac8a8');
    ellipse(c,tx-rx*.35,-26,rx*.4,8,'#fffdf5aa');
    const apron=c.createLinearGradient(-12,-18,15,1);apron.addColorStop(0,'#a6d8bb');apron.addColorStop(.55,'#74b09a');apron.addColorStop(1,'#468873');
    if(back) {
      stroke(c,-10,-28,9,-12,'#8ac3aa',2.6);stroke(c,10,-28,-9,-12,'#8ac3aa',2.6);
      stroke(c,-1,-10,-5,-3,'#74b09a',2.8);stroke(c,1,-10,5,-3,'#74b09a',2.8);
      rounded(c,-13,-14,26,5,2.5,apron,'#4f8f78');
      for(const sign of [-1,1]){c.save();c.translate(sign*4.2,-11.5);c.rotate(sign*.35);ellipse(c,0,0,4.6,2.8,'#8ac3aa','#4f8f78');c.restore();}
      ellipse(c,0,-11.5,2.2,2.2,'#5c9d85','#4f8f78');
    } else {
      // Bib and skirt shrink to a slim front panel when the chef turns sideways; the tie shows at the back.
      const width=26-19*turn,center=pose.direction.x*(turn>.5?9.5:8),x=center-width/2;
      if(turn>.5)rounded(c,tx-rx+2,-14,2*rx-4,4.5,2,'#8ac3aa','#4f8f78');
      rounded(c,x,-23,width,23,Math.min(7,width/2),apron,'#4f8f78');
      if(turn>.5)ellipse(c,tx-pose.direction.x*(rx-3),-11.7,3.4,3,'#74b09a','#4f8f78');
      if(turn<=.5){stroke(c,-6,-23,-4,-30,'#8ac3aa',2.2);stroke(c,6,-23,4,-30,'#8ac3aa',2.2);rounded(c,-6,-12,12,7,3,'#9fceb2','#4f8f78');}
    }
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
  /** A tapered sleeve with a rolled cuff; `far` shades the arm that is partly behind the torso. */
  private arm(c:CanvasRenderingContext2D,sx:number,sy:number,hx:number,hy:number,elbow?:{x:number;y:number},far=false):void {
    const cx=elbow?.x??(sx+hx)*.5,cy=elbow?.y??Math.max(sy,hy)+4;
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
