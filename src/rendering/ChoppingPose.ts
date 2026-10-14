/** Board-relative working positions, projected for the fixed kitchen camera. */
export function choppingToolPose(facing:{x:number;y:number},time:number) {
  const phase=time*32,side=Math.abs(facing.x)>.5;
  const lift=(1+Math.sin(phase))*(side?3:7);
  return {
    side,lift,visible:facing.y>=0,direction:facing.x<0?-1:1,
    angle: .65 + Math.sin(phase) * .18,
    grip:side?{x:-facing.x*14,y:3-lift}:{x:-16+Math.sin(phase)*2,y:-6-lift*.65},
    support:side?{x:facing.x*5,y:-4}:{x:8,y:3}
  };
}
