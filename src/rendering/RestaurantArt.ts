import type { Simulation } from '../game/Simulation';
import { TILE } from '../game/types';
import { BELT_SPEED_SCALE, SEATS } from '../restaurant/Restaurant';
import type { Delivery, PlateReturn } from '../restaurant/Restaurant';
import type { Station } from '../game/types';
import { customerMood } from './CustomerMood';
import type { Mood } from './CustomerMood';
import { dishIcon, ellipse, itemIcon, rounded } from './art';

type Point = { x: number; y: number };
export function diningLayout(rows: number) {
  const top = 95 + TILE * .78, bottom = 95 + (rows - 1) * TILE * .78;
  return { top, bottom, beltX: 114, seatY: (seat: number) => bottom - 24 - seat * (bottom - top - 48) / (SEATS - 1) };
}
function along(points: Point[], fraction: number): Point {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  let distance = Math.min(1, Math.max(0, fraction)) * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (distance <= lengths[i]) { const f = distance / Math.max(1, lengths[i]); return { x: points[i].x + (points[i + 1].x - points[i].x) * f, y: points[i].y + (points[i + 1].y - points[i].y) * f }; }
    distance -= lengths[i];
  }
  return points.at(-1)!;
}
export function deliveryPosition(rows: number, delivery: Delivery, seat: number): Point {
  const l = diningLayout(rows), x = 80 + delivery.source.x, y = 95 + delivery.source.y * .78 - 17;
  return along([{ x, y }, { x, y: l.bottom + 20 }, { x: l.beltX, y: l.bottom + 20 }, { x: l.beltX, y: l.seatY(seat) }, { x: 88, y: l.seatY(seat) }], delivery.elapsed / delivery.duration);
}
export function plateReturnPosition(rows: number, returned: PlateReturn, sink: Station): Point {
  const l = diningLayout(rows), x = 80 + sink.x + TILE / 2, y = 95 + sink.y * .78 + 13;
  return along([{ x: 88, y: l.seatY(returned.seat) }, { x: l.beltX, y: l.seatY(returned.seat) }, { x: l.beltX, y }, { x, y }], returned.elapsed / returned.duration);
}

/** Original counter-service dining art. All guests and food belong to the simulation. */
export function drawRestaurant(c: CanvasRenderingContext2D, sim: Simulation): void {
  const l = diningLayout(sim.level.rows), t = sim.elapsed, theme = sim.level.theme;
  rounded(c, -77, l.top - 16, 154, l.bottom - l.top + 68, 17, '#233d3552');
  rounded(c, -70, l.top - 23, 145, l.bottom - l.top + 66, 14, '#719381', '#adc1a0');
  for (let y = l.top; y < l.bottom + 30; y += 43) {
    c.strokeStyle = '#284d3b25'; c.lineWidth = 1; c.beginPath(); c.moveTo(-65, y); c.lineTo(74, y); c.stroke();
  }
  rounded(c, -65, l.bottom + 26, 129, 30, 7, theme.accent, '#fff0bf');
  c.font = '800 13px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#fff7df'; c.fillText('WELCOME · 欢迎入座', -1, l.bottom + 46);
  rounded(c, 75, l.top - 10, 65, l.bottom - l.top + 18, 6, '#61412f');
  const wood = c.createLinearGradient(76, 0, 138, 0); wood.addColorStop(0, '#ffe0a0'); wood.addColorStop(.14, '#d59b5d'); wood.addColorStop(1, '#aa734b');
  rounded(c, 78, l.top - 17, 58, l.bottom - l.top + 20, 5, wood, '#f5d5a1');
  for (let y = l.top + 12; y < l.bottom; y += 36) {
    c.strokeStyle = '#7e4d302d'; c.lineWidth = 1; c.beginPath(); c.moveTo(81, y); c.bezierCurveTo(100, y + 3, 115, y - 2, 134, y); c.stroke();
  }
  // The two output windows feed the same belt, outside the walkable kitchen.
  const belt = (points: Point[]) => {
    c.lineJoin = 'round'; c.lineCap = 'round';
    const path = () => { c.beginPath(); points.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); };
    path(); c.lineWidth = 24; c.strokeStyle = '#d4c69c'; c.stroke();
    path(); c.lineWidth = 19; c.strokeStyle = '#334d48'; c.stroke();
    path(); c.lineWidth = 14; c.strokeStyle = '#58776d'; c.stroke();
    const length = points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0);
    for (let f = (t * 55 * BELT_SPEED_SCALE) % 13; f < length; f += 13) {
      if (f > length) break;
      const p = along(points, f / length), next = along(points, Math.min(1, (f + 1) / length));
      const vertical = Math.abs(next.y - p.y) > Math.abs(next.x - p.x);
      c.strokeStyle = '#b3c4a861'; c.lineWidth = 2; c.beginPath(); c.moveTo(p.x - (vertical ? 6 : 0), p.y - (vertical ? 0 : 6)); c.lineTo(p.x + (vertical ? 6 : 0), p.y + (vertical ? 0 : 6)); c.stroke();
    }
  };
  const ports = sim.stations.filter(s => s.kind === 'serve');
  const far = Math.max(...ports.map(s => 80 + s.x + TILE / 2));
  const sink = sim.stations.find(s => s.kind === 'sink');
  const end = sink ? { x: 80 + sink.x + TILE / 2, y: 95 + sink.y * .78 + 13 } : { x: l.beltX, y: l.top };
  belt([{ x: far, y: l.bottom + 20 }, { x: l.beltX, y: l.bottom + 20 }, { x: l.beltX, y: end.y }, end]);
  for (const s of ports) { const x = 80 + s.x + TILE / 2; belt([{ x, y: 95 + (s.y + TILE) * .78 - 17 }, { x, y: l.bottom + 20 }]); }
  // Stools remain when guests leave, making the dining counter recognizable.
  for (let seat = 0; seat < SEATS; seat++) {
    const y = l.seatY(seat);
    ellipse(c, 41, y + 17, 17, 7, '#203c3355'); rounded(c, 35, y + 6, 12, 12, 3, '#503c32');
    ellipse(c, 41, y + 5, 17, 10, '#7c5237', '#f0c082'); ellipse(c, 41, y + 2, 14, 8, theme.accent);
    rounded(c, 79, y - 6, 18, 12, 3, '#f3e3bf'); ellipse(c, 88, y - 1, 6, 4, '#fff5d8', '#c8b994');
  }
  for (const guest of [...sim.restaurant.customers].sort((a, b) => a.seat - b.seat)) {
    const seatedY = l.seatY(guest.seat), coming = guest.state === 'ARRIVING', leaving = guest.state === 'LEAVING';
    const f = coming ? Math.min(1, Math.max(0, guest.age / 1.25)) : leaving ? Math.min(1, guest.age / .7) : 1;
    const x = coming ? -39 + 80 * f : leaving ? 41 - 80 * f : 41;
    const y = coming ? l.bottom + 12 + (seatedY - l.bottom - 12) * f : leaving ? seatedY + (l.bottom + 12 - seatedY) * f : seatedY;
    const walking = coming || leaving, bob = walking ? Math.sin(t * 15 + guest.id) * 1.4 : guest.state === 'EATING' ? Math.sin(guest.age * 3.5) * .8 : 0;
    c.save(); c.translate(x, y + bob);
    const shirt = ['#dd8660', '#8cb9c3', '#b39bc5', '#e5c365', '#629f89'][guest.id % 5], skin = ['#e6b889', '#ba825b', '#f1cba5'][guest.id % 3];
    ellipse(c, 0, 9, 15, 6, '#21392a44');
    for (const sign of [-1, 1]) { const stride = walking ? Math.sin(t * 15 + guest.id) * sign * 3 : 0; ellipse(c, sign * 6 + stride, 7, 6, 3.5, '#493e37'); }
    ellipse(c, 0, -2, 13, 13, shirt, '#557468');
    const bite=guest.state==='EATING'?(1+Math.sin(guest.age*3))/2:1,handX=8+17*bite,handY=-15+8*bite;
    c.beginPath();c.moveTo(8,-10);c.lineTo(handX,handY);c.lineWidth=6;c.strokeStyle=shirt;c.lineCap='round';c.stroke();ellipse(c,handX,handY,4,3,skin);
    ellipse(c, 1, -18, 11, 11, skin, '#8d674d');
    ellipse(c, -1, -25, 11, 5.5, guest.id % 3 === 0 ? '#8e6640' : '#4b3b32');
    ellipse(c, -7, -20, 5, 8, guest.id % 3 === 0 ? '#8e6640' : '#4b3b32');
    ellipse(c, 10, -17, 4, 3, skin); ellipse(c, 7, -21, 1.4, 2, '#3b3632'); ellipse(c, 8, -13, 2.5, 1, guest.unhappy ? '#763c33' : '#a7664c');
    if (guest.id % 4 === 0) { rounded(c, 3, -25, 8, 7, 2, '#ffffff22', '#394e4b'); }
    c.restore();
    if (['CHOOSING', 'QUEUED', 'WAITING'].includes(guest.state)) {
      rounded(c, x - 33, y - 48, 29, 24, 6, '#fff8da', '#d4ac73');
      if (guest.state === 'CHOOSING') { c.font = '900 16px sans-serif'; c.fillStyle = '#658576'; c.textAlign = 'center'; c.fillText('…', x - 18, y - 31); }
      else dishIcon(c, guest.recipeId, x - 18, y - 36, 23);
    }
    const mood=customerMood(guest);if(mood)drawMood(c,mood,x+25,y-42);
    if (guest.plate) itemIcon(c, guest.plate, 88, seatedY - 3, 28);
    if (leaving && !guest.unhappy) { c.font = '900 17px sans-serif'; c.fillStyle = guest.unhappy ? '#e19369' : '#fff0a4'; c.textAlign = 'center'; c.fillText(guest.unhappy ? '…' : '♥', x, y - 35); }
  }
  for (const delivery of sim.restaurant.deliveries) {
    const guest = sim.restaurant.customers.find(g => g.id === delivery.customerId);
    if (guest) { const p = deliveryPosition(sim.level.rows, delivery, guest.seat); ellipse(c, p.x + 1, p.y + 3, 15, 5, '#20392b55'); itemIcon(c, delivery.plate, p.x, p.y - 2, 30); }
  }
  if (sink) for (const returned of sim.restaurant.returning) {
    const p = plateReturnPosition(sim.level.rows, returned, sink);
    ellipse(c, p.x + 1, p.y + 3, 14, 5, '#20392b55'); itemIcon(c, returned.plate, p.x, p.y - 2, 28);
  }
}

function drawMood(c:CanvasRenderingContext2D,mood:Mood,x:number,y:number):void {
  c.save();c.translate(x,y);c.lineWidth=1.5;
  c.beginPath();c.moveTo(-6,8);c.lineTo(-11,15);c.lineTo(0,10);c.fillStyle='#fff7da';c.fill();
  ellipse(c,0,0,12,11,'#fff8dc','#b49b68');ellipse(c,0,0,9,8,mood==='relaxed'?'#f5d58c':mood==='uneasy'?'#eeb773':'#ee9071');
  ellipse(c,-3.5,-1.5,1,1.5,'#65513b');ellipse(c,3.5,-1.5,1,1.5,'#65513b');c.strokeStyle='#65513b';c.lineCap='round';
  c.beginPath();c.moveTo(-4,3);if(mood==='relaxed')c.quadraticCurveTo(0,7,4,3);else if(mood==='uneasy')c.lineTo(4,3);else c.quadraticCurveTo(0,-1,4,3);c.stroke();
  if(mood==='angry'){c.beginPath();c.moveTo(-6,-5);c.lineTo(-2,-3);c.moveTo(6,-5);c.lineTo(2,-3);c.stroke();}
  if(mood==='uneasy'){ellipse(c,7,-5,1,2,'#b7dfdd');}c.restore();
}
