import { Simulation } from '../game/Simulation';
import { INGREDIENTS, WASH_SECONDS, TILE } from '../game/types';
import type { GameEvent, Item, Station } from '../game/types';
import { Camera } from './Camera';
import { CharacterArt } from './Character';
import { choppingToolPose } from './ChoppingPose';
import { drawRestaurant } from './RestaurantArt';
import { dishIcon, ellipse, ingredientIcon, itemIcon, rounded } from './art';
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number };
type Floating = { x: number; y: number; text: string; life: number; age: number; good: boolean };
export class Renderer {
  readonly context: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private floating: Floating[] = [];
  private shake = 0;
  private flights: { from: { x: number; y: number }; to: { x: number; y: number }; item: Item; age: number }[] = [];
  private clock = 0;
  readonly width = 1280;
  height = 820;
  readonly camera = new Camera();
  readonly character = new CharacterArt();
  constructor(readonly canvas: HTMLCanvasElement) { this.context = canvas.getContext('2d')!; this.resize(); window.addEventListener('resize', () => this.resize()); new ResizeObserver(() => this.resize()).observe(canvas); }
  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const height = Math.round(this.width * (this.canvas.clientHeight || 820) / (this.canvas.clientWidth || 1280));
    if (this.canvas.width === this.width * dpr && this.canvas.height === Math.round(height * dpr)) return;
    this.height = height;
    this.camera.reset();
    this.canvas.width = this.width * dpr; this.canvas.height = Math.round(this.height * dpr);
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  project(x: number, y: number): { x: number; y: number } { return { x: 80 + x, y: 95 + y * 0.78 }; }
  event(event: GameEvent): void {
    const pos = this.project(event.x, event.y);
    if (event.kind === 'throw' && event.from && event.item) this.flights.push({ from: this.project(event.from.x, event.from.y), to: this.project(event.x, event.y), item: event.item, age: 0 });
    if (event.kind === 'serve') this.shake = .22; else if (event.kind === 'fail') this.shake = Math.max(this.shake, .3);
    if (event.text && event.kind !== 'hint') this.floating.push({ ...pos, text: event.text, life: 1.8, age: 0, good: !['fire', 'fail'].includes(event.kind) });
    const color = event.kind === 'serve' ? '#f6d379' : event.kind === 'wash' || event.kind === 'extinguish' ? '#c8eced' : '#fff0c5';
    const colors = event.kind === 'serve' ? ['#f6d379', '#ff9f7a', '#fff6c8', '#9be0b0'] : event.kind === 'ready' ? ['#fff6c8', '#ffd479'] : [color];
    const count = event.kind === 'serve' ? 30 : event.kind === 'ready' ? 8 : event.kind === 'extinguish' ? 2 : ['pickup', 'place', 'chop', 'wash', 'dash'].includes(event.kind) ? 4 : 0;
    for (let i = 0; i < count; i++) { const life = 0.4 + Math.random() * 0.5; const burst = event.kind === 'serve' ? 1.5 : 1; this.particles.push({ x: pos.x, y: pos.y - 20, vx: (Math.random() - 0.5) * 110 * burst, vy: (-35 - Math.random() * 80) * burst, life, max: life, color: colors[i % colors.length], size: 2 + Math.random() * 3 }); }
    if (this.particles.length > 220) this.particles.splice(0, this.particles.length - 220);
  }
  clearEffects(): void { this.flights = []; this.shake = 0; this.particles = []; this.floating = []; this.camera.reset(); }
  draw(sim: Simulation, dt: number, active: boolean, inKitchen = false, insets = { top: 72, bottom: 90 }): void {
    const c = this.context;
    if (active) this.clock += dt;
    const t = this.clock, theme = sim.level.theme;
    c.clearRect(0, 0, this.width, this.height);
    const background = c.createLinearGradient(0, 0, 0, this.height); background.addColorStop(0, theme.outside); background.addColorStop(1, '#263c3c');
    c.fillStyle = background; c.fillRect(0, 0, this.width, this.height);
    c.save();
    if (inKitchen) {
      const cssWidth = this.canvas.clientWidth || 1280, cssHeight = this.canvas.clientHeight || 820;
      const scale = cssWidth / this.width;
      const pixelScale = Math.max(0.9, Math.min(1.65, Math.min(cssWidth / 960, cssHeight / 560) * 1.7));
      this.camera.follow(sim.player, { width: this.width, height: this.height, zoom: pixelScale / scale, top: insets.top / scale, bottom: insets.bottom / scale }, dt, active);
      this.backdrop(theme.outside);
      if (active) this.shake = Math.max(0, this.shake - dt);
      const amp = this.shake * 9;
      c.translate(this.camera.x + Math.sin(t * 90) * amp, this.camera.y + Math.cos(t * 77) * amp * .7); c.scale(this.camera.zoom, this.camera.zoom);
    }
    this.outside(sim, !inKitchen);
    const roomWidth=sim.level.cols*TILE,roomHeight=sim.level.rows*TILE*.78;
    rounded(c,60,115,roomWidth+40,roomHeight+31,18,'#162d2b70');
    rounded(c,73,106,roomWidth+14,roomHeight+18,10,'#987d5f');
    rounded(c,80,95,roomWidth,roomHeight,4,theme.floor);
    for(let row=0;row<sim.level.rows;row++) for(let col=0;col<sim.level.cols;col++) {
      const p=this.project(col*TILE,row*TILE);
      rounded(c,p.x+1,p.y+1,TILE-2,TILE*.78-2,5,(col+row)%2?theme.tile:theme.floor,'#927d5730');
      if((col*7+row*3)%13===0){ellipse(c,p.x+17,p.y+16,1.7,1.2,'#8d806b30');ellipse(c,p.x+43,p.y+30,2,1,'#fff9e533');}
    }
    const light=c.createRadialGradient(260,155,40,630,340,680); light.addColorStop(0,'#fff9cb30'); light.addColorStop(.55,'#fff8d005'); light.addColorStop(1,'#5b614b18'); c.fillStyle=light; c.fillRect(80,95,roomWidth,roomHeight);
    const obstacles = sim.activeObstacles();
    for (const o of obstacles) {
      if (!o.gate && o.x === 0 && o.w === TILE && o.y === TILE) continue;
      const p = this.project(o.x, o.y);
      if (o.gate) {
        const warning = sim.elapsed % 12 > 10;
        rounded(c, p.x + 3, p.y + 10, o.w - 6, o.h * 0.78 - 3, 4, '#553e32'); rounded(c, p.x + 3, p.y - 2, o.w - 6, 25, 4, warning ? '#eb955b' : '#ccab67', '#8b6d43');
        c.save(); c.beginPath(); c.rect(p.x + 5, p.y, o.w - 10, 20); c.clip(); for (let i = -20; i < o.w + 20; i += 18) { c.beginPath(); c.moveTo(p.x + i, p.y + 20); c.lineTo(p.x + i + 13, p.y); c.strokeStyle = '#654e3c'; c.lineWidth = 8; c.stroke(); } c.restore();
      } else {
        rounded(c, p.x, p.y - 6, o.w, o.h * 0.78 + 5, 2, theme.cabinet); rounded(c, p.x, p.y - 12, o.w, Math.min(22, o.h * 0.78), 2, theme.wall, '#a7866744');
        c.strokeStyle='#634c352b'; c.lineWidth=1;
        if(o.w<TILE*2) for(let k=1;k<Math.floor(o.h/36);k++){ c.beginPath();c.moveTo(p.x+7,p.y+k*28);c.lineTo(p.x+o.w-7,p.y+k*28);c.stroke(); }
      }
    }
    drawRestaurant(c, sim);
    // Render by foot position, so chef and counters occlude correctly.
    const objects = sim.stations.map(s => ({ depth: s.y + TILE, draw: () => this.station(s, sim, t) }));
    objects.push({ depth: sim.player.y + 5, draw: () => this.chef(sim, t) });
    objects.sort((a, b) => a.depth - b.depth).forEach(o => o.draw());
    this.chopping(sim);
    for (const s of sim.stations) this.status(s, sim, t);
    for (const p of this.particles) { if (active) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 80 * dt; } c.globalAlpha = Math.max(0, p.life / p.max); ellipse(c, p.x, p.y, p.size, p.size * 0.7, p.color); }
    c.globalAlpha = 1; this.particles = this.particles.filter(p => p.life > 0);
    for (const fl of this.flights) {
      if (active) fl.age += dt;
      const k = Math.min(1, fl.age / .32), x = fl.from.x + (fl.to.x - fl.from.x) * k, y = fl.from.y + (fl.to.y - fl.from.y) * k - Math.sin(k * Math.PI) * 38;
      ellipse(c, fl.from.x + (fl.to.x - fl.from.x) * k, fl.from.y + (fl.to.y - fl.from.y) * k + 22, 9, 4, '#21392a44');
      c.save(); c.translate(x, y); c.rotate(k * Math.PI * 3); itemIcon(c, fl.item, 0, 0, 26); c.restore();
    }
    this.flights = this.flights.filter(fl => fl.age < .32);
    for (const f of this.floating) { if (active) { f.life -= dt; f.age += dt; f.y -= dt * 25; } const pop = 1 + Math.max(0, .3 - f.age) * 2.2; c.globalAlpha = Math.min(1, f.life * 2); c.save(); c.translate(f.x, f.y - 44); c.scale(pop, pop); c.font = '800 24px "Noto Sans SC", sans-serif'; c.textAlign = 'center'; c.lineWidth = 5; c.strokeStyle = '#294440'; c.strokeText(f.text, 0, 0); c.fillStyle = f.good ? '#ffecad' : '#ffd0b2'; c.fillText(f.text, 0, 0); c.restore(); }
    c.globalAlpha = 1; this.floating = this.floating.filter(f => f.life > 0);
    if (sim.level.dynamic) {
      const seconds = Math.ceil(12 - sim.elapsed % 12);
      rounded(c, 80+roomWidth/2-141, 95+roomHeight+20, 283, 32, 12, '#294943cc'); c.font = '700 14px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#f4e3bd'; c.fillText(`通道 ${seconds <= 2 ? '即将切换' : `${seconds} 秒后切换`} · 另一条路始终开放`, 80+roomWidth/2, 95+roomHeight+41);
    }
    c.restore();
  }
  private backdrop(color: string): void {
    const c = this.context;
    // Courtyard paving moves more slowly than the kitchen, adding depth to the pan.
    c.save(); c.translate((this.camera.x * 0.22) % 184, (this.camera.y * 0.22) % 128);
    for (let row = -3; row < this.height / 64 + 3; row++) for (let col = -3; col < this.width / 92 + 3; col++) {
      rounded(c, col * 92, row * 64, 89, 61, 6, (row + col) % 2 ? color : '#577b69', '#274d3b30');
    }
    c.restore();
  }
  private outside(sim: Simulation, showTitle: boolean): void {
    const c = this.context, theme = sim.level.theme;
    const width=sim.level.cols*TILE,height=sim.level.rows*TILE*.78,center=80+width/2;
    // Original restaurant facade, awning, dining nooks and plants.
    rounded(c, 71, 14, width+18, 87, 8, '#1e393a80');
    rounded(c, 86, 24, width-12, 67, 5, theme.wall);
    for (let x = 110; x < 80+width-60; x += 90) {
      rounded(c, x, 28, 65, 33, 4, '#5e8b8299', '#a18967'); rounded(c, x + 3, 31, 59, 24, 2, '#a9cfc0');
      c.fillStyle = '#eef4d954'; c.beginPath(); c.moveTo(x + 7, 32); c.lineTo(x + 34, 32); c.lineTo(x + 13, 51); c.lineTo(x + 7, 51); c.fill();
    }
    rounded(c, center-215, 19, 430, 56, 10, theme.cabinet, '#f5d9a0'); rounded(c, center-208, 23, 416, 45, 7, theme.accent);
    if (showTitle) { c.font = '900 26px Georgia, serif'; c.fillStyle = '#fff3d7'; c.textAlign = 'center'; c.fillText('KITCHEN CHAOS', center, 53); }
    else { for (let i = -2; i <= 2; i++) ingredientIcon(c, ['tomato', 'lettuce', 'carrot', 'bread', 'cheese'][i + 2] as import('../game/types').IngredientKind, center + i * 54, 45, 28); }
    for (let i = 0; i < Math.ceil(width/40); i++) { rounded(c, 80 + i * 40, 74, Math.min(40,width-i*40), 22, 6, i % 2 ? '#fff0cf' : theme.accent); }
    for (const x of [80+width+30]) {
      for (let y = 151; y < 95+height-40; y += 140) {
        ellipse(c, x, y + 29, 22, 13, '#152e2966'); rounded(c, x - 13, y + 5, 26, 24, 5, '#af754e', '#764e37'); ellipse(c, x, y + 4, 16, 7, '#775943');
        for (let k = 0; k < 5; k++) ellipse(c, x + Math.sin(k * 2) * 11, y - 5 + Math.cos(k * 2) * 10, 13, 9, k % 2 ? '#90b766' : '#5f934e');
      }
    }
    if (showTitle) { c.font = '600 15px sans-serif'; c.fillStyle = '#e8e3c891'; c.textAlign = 'center'; c.fillText('FRESH FOOD · HAPPY LITTLE CHAOS', center, 95+height+144); }
  }
  private station(s: Station, sim: Simulation, t: number): void {
    const c = this.context, theme = sim.level.theme, p = this.project(s.x, s.y);
    const x = p.x, y = p.y, w = TILE, h = TILE * 0.78;
    ellipse(c, x + w / 2 + 4, y + h + 4, w * 0.53, 8, '#65523935');
    const cabinet=c.createLinearGradient(x,y+10,x,y+h+10); cabinet.addColorStop(0,theme.cabinet);cabinet.addColorStop(1,'#74503a');
    rounded(c, x + 1, y + 10, w - 2, h - 1, 4, cabinet, '#684a3333');
    rounded(c, x + 7, y + h - 5, w - 14, 10, 2, '#00000017'); rounded(c, x + w / 2 - 8, y + h - 3, 16, 3, 1, '#e7c191');
    const selected = sim.target === s;
    if (selected) { c.shadowColor = '#ffe2a4'; c.shadowBlur = 12; }
    const surface=c.createLinearGradient(x,y-7,x,y+h);surface.addColorStop(0,s.kind==='stove'||s.kind==='sink'?'#d9e0d3':theme.counter);surface.addColorStop(1,s.kind==='stove'||s.kind==='sink'?'#91ada4':theme.counter);
    rounded(c, x, y - 7, w, h, 4, surface, selected ? '#fff2bb' : '#f8e6b35c'); c.shadowBlur = 0;
    rounded(c,x+3,y-5,w-6,3,1,'#fffbe478');
    rounded(c,x+3,y+h-11,w-6,3,1,'#72543b25');
    c.lineWidth = 1;
    if (s.kind === 'counter' || s.kind === 'board' || s.kind === 'crate') {
      for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(x + 4, y + 3 + k * 8); c.bezierCurveTo(x + 18, y + k * 8, x + 36, y + 6 + k * 8, x + 52, y + 3 + k * 8); c.strokeStyle = '#9e724126'; c.stroke(); }
    }
    const cx = x + w / 2, cy = y + 13;
    if (s.kind === 'crate') {
      rounded(c, x + 5, y - 4, w - 10, h - 8, 3, '#a16d40'); rounded(c, x + 8, y - 1, w - 16, h - 13, 2, '#795a3c');
      for (let k = 0; k < 3; k++) ingredientIcon(c, s.ingredient!, cx + (k - 1) * 12, cy - 2 + (k % 2) * 4, 29);
      rounded(c, x + 13, y + h - 19, w - 26, 19, 2, '#fbf0d4', '#b69766'); ingredientIcon(c, s.ingredient!, cx, y + h - 10, 20);
    }
    if (s.kind === 'board') {
      rounded(c, x + 5, y - 3, 46, 31, 4, '#dcb174', '#a87843');
      for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(x + 9 + i * 10, y + 1); c.lineTo(x + 7 + i * 10, y + 24); c.strokeStyle = '#a66f3b33'; c.stroke(); }
      if(!(sim.target===s&&sim.player.activity==='chop')) {
        c.save(); c.translate(x + 40, y + 4); c.rotate(-0.4); rounded(c, -3, -7, 5, 10, 2, '#544b3c'); rounded(c, -4, 1, 10, 17, 2, '#e3e7de', '#7b8e89'); c.restore();
      }
    }
    if (s.kind === 'stove') {
      rounded(c, x + 4, y - 3, 48, 35, 3, '#647a73');
      const heating = ['COOKING', 'READY', 'BURNING', 'BURNT'].includes(s.stoveState);
      ellipse(c, cx, cy + 3, 19, 13, heating ? '#da8055' : '#364b46'); ellipse(c, cx, cy + 3, 15, 10, '#273b36');
      if (heating) { c.strokeStyle = s.stoveState === 'BURNING' || s.stoveState === 'BURNT' ? '#f1793e' : '#81beea'; c.lineWidth = 3; c.beginPath(); c.ellipse(cx, cy + 3, 17, 11, 0, 0, Math.PI * 2); c.stroke(); }
      rounded(c, cx - 18, cy - 5, 36, 15, 7, '#7c908a', '#435853'); ellipse(c, cx, cy - 5, 18, 11, '#dce2d3', '#586d63'); ellipse(c, cx, cy - 6, 14, 8, s.stoveState === 'BURNT' || s.stoveState === 'ON_FIRE' ? '#4c3d35' : '#9aab93'); rounded(c, cx + 15, cy - 5, 14, 6, 2, '#3d514a');
      if (s.item?.type === 'food') s.item.components.forEach((part, i) => ingredientIcon(c, part.kind, cx + (s.item?.type === 'food' && s.item.components.length > 1 ? (i - 0.5) * 12 : 0), cy - 6, 25, part.state));
      if (heating) for (let k = 0; k < 3; k++) { const phase = (t * 0.7 + k * 0.3) % 1; c.globalAlpha = (1 - phase) * 0.65; ellipse(c, cx - 9 + k * 8 + Math.sin(t + k) * 5, cy - 18 - phase * 26, 3 + phase * 4, 4 + phase * 6, s.stoveState === 'BURNT' ? '#63584f' : '#fff6de'); } c.globalAlpha = 1;
      if (s.stoveState === 'ON_FIRE') for (let k = 0; k < 7; k++) {
        const fx = cx + Math.sin(k * 4) * 17, fy = cy - 2, height = 26 + Math.sin(t * 12 + k) * 10;
        c.beginPath(); c.moveTo(fx - 9, fy); c.quadraticCurveTo(fx - 11, fy - height / 2, fx + Math.sin(t * 8 + k) * 6, fy - height); c.quadraticCurveTo(fx + 15, fy - 12, fx + 8, fy); c.fillStyle = k % 2 ? '#ffaf3f' : '#ef6b3b'; c.fill(); ellipse(c, fx, fy - 6, 4, 7, '#ffe896');
      }
    }
    if (s.kind === 'sink') {
      rounded(c, x + 5, y - 3, 46, 33, 6, '#677f7c', '#d3ded2'); rounded(c, x + 9, y + 2, 38, 25, 6, '#527b81'); ellipse(c, cx, cy + 5, 4, 2.6, '#364f53');
      c.beginPath(); c.moveTo(cx + 4, y - 7); c.lineTo(cx + 4, y - 17); c.quadraticCurveTo(cx + 4, y - 24, cx - 4, y - 23); c.lineTo(cx - 5, y - 9); c.strokeStyle = '#dfe8dc'; c.lineWidth = 5; c.stroke();
      for (let i = 0; i < Math.min(sim.dirtyQueue.length, 4); i++) itemIcon(c, sim.dirtyQueue[i], cx, cy + 5 - i * 3, 30);
      const chefAtSink=sim.player.y<s.y&&Math.abs(sim.player.x-(s.x+TILE/2))<TILE;
      const labelX=cx+(chefAtSink?70:0);
      if(chefAtSink){c.beginPath();c.moveTo(cx+19,y-11);c.lineTo(labelX,y-32);c.strokeStyle='#fcebc3';c.lineWidth=2;c.stroke();}
      rounded(c, labelX - 40, y - 56, 80, 23, 7, '#285c63', '#fff0be');
      c.font = '800 16px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#fff7dd'; c.fillText(`脏盘 ×${sim.dirtyPlates}`, labelX, y - 39);
      if (s.item?.type === 'plate' && s.item.dirty && sim.target === s && sim.player.activity === 'wash') {
        c.fillStyle = '#bbe5df'; c.fillRect(cx - 6, y - 8, 3, 25);
        for (let k = 0; k < 5; k++) { const ph = (t * 2 + k * 0.2) % 1; ellipse(c, x + 13 + k * 7, y + 17 - ph * 14, 3 + ph, 2 + ph, '#e5f5e9aa', '#fffbed'); }
      }
    }
    if (s.kind === 'plates' || s.kind === 'return') {
      const count = s.kind === 'plates' ? sim.cleanPlates : sim.dirtyPlates;
      rounded(c, x + 5, y - 2, 46, 29, 3, '#8c9c7c');
      for (let k = 0; k < Math.min(count, 5); k++) itemIcon(c, { type: 'plate', components: [], dirty: s.kind === 'return', progress: 0 }, cx, cy + 6 - k * 3, 31);
      if (!count) { ellipse(c, cx, cy + 2, 16, 10, '#0000001a'); }
    }
    if (s.kind === 'serve') {
      rounded(c, x + 2, y - 21, 52, 26, 3, '#714b3e');
      for (let k = 0; k < 4; k++) rounded(c, x + 3 + k * 13, y - 25, 13, 12, 2, k % 2 ? '#fff1d4' : theme.accent);
      rounded(c, x + 5, y - 13, 46, 15, 3, '#f4ddae'); c.font = '900 12px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#7d5744'; c.fillText('出 餐', cx, y - 1);
      rounded(c, x + 5, y + 8, 46, 18, 3, '#847b69'); c.fillStyle = '#fff3c6'; c.beginPath(); c.moveTo(cx, y + 9); c.lineTo(cx - 7, y + 20); c.lineTo(cx + 7, y + 20); c.fill();
    }
    if (s.kind === 'trash') { rounded(c, x + 11, y - 1, 34, 30, 4, '#678276', '#445d51'); ellipse(c, cx, y - 1, 19, 8, '#87968a'); ellipse(c, cx, y - 2, 11, 4, '#344e40'); for (let k = 0; k < 3; k++) rounded(c, x + 17 + k * 9, y + 8, 3, 14, 1, '#4e6a5d'); }
    if (s.kind === 'extinguisher') { rounded(c, x + 10, y - 5, 36, 34, 3, '#e7c9a5', '#a8815c'); c.font = '900 15px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#b4553d'; c.fillText('FIRE', cx, y + 5); }
    const liftedPlate=s.kind==='sink'&&sim.target===s&&sim.player.activity==='wash';
    if (s.item && s.kind !== 'stove' && !liftedPlate) itemIcon(c, s.item, cx, cy + (s.kind === 'sink' ? 5 : 0), 34);
    if (s.moving) { for (const wx of [x + 8, x + 47]) ellipse(c, wx, y + h + 7, 4, 4, '#425c54'); c.fillStyle = '#4f7163'; c.font = 'bold 13px sans-serif'; c.textAlign = 'center'; c.fillText('↔', cx, y + h - 2); }
  }
  private status(s: Station, sim: Simulation, t: number): void {
    const c = this.context, p = this.project(s.x + TILE / 2, s.y);
    let progress = -1, color = '#71b595', label = '';
    if (s.kind === 'board' && s.item?.type === 'food' && s.item.progress > 0) { progress = s.item.progress / INGREDIENTS[s.item.components[0].kind].chop; label = progress >= 1 ? '✓' : ''; }
    if (s.kind === 'sink' && s.item?.type === 'plate' && s.item.dirty && s.item.progress > 0) progress = s.item.progress / WASH_SECONDS;
    if (s.kind === 'stove') {
      if (s.stoveState === 'COOKING') progress = s.elapsed / s.cookTime;
      if (s.stoveState === 'READY') { progress = 1 - s.elapsed / 12; color = '#71b595'; label = '✓'; }
      if (s.stoveState === 'BURNING') { progress = 1 - s.elapsed / 5; color = '#e7a448'; label = '!'; }
      if (s.stoveState === 'BURNT') { progress = 1; color = '#9c7564'; label = '×'; }
      if (s.stoveState === 'ON_FIRE') { progress = s.extinguish / 3; color = '#86cdd2'; label = '!'; }
      if (s.stoveState === 'IDLE' && s.item) { c.font = '800 15px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#fff4d4'; c.fillText('+', p.x, p.y - 21); }
    }
    if (progress >= 0) {
      const chefAbove=sim.player.y<s.y&&Math.abs(sim.player.x-(s.x+TILE/2))<TILE;
      const barY=chefAbove?p.y+TILE*.78+20:p.y-30;
      rounded(c, p.x - 25, barY, 50, 9, 4, '#354d46', '#fff1ca'); rounded(c, p.x - 23, barY+2, Math.max(0.2, Math.min(1, progress) * 46), 5, 2, color);
      if (label) { ellipse(c, p.x + 30, barY+4, 9, 8, color); c.font = '900 12px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#fff9e4'; c.fillText(label, p.x + 30, barY+8); }
    }
    if (sim.target === s) { const glow = 0.5 + Math.sin(t * 4) * 0.1; c.globalAlpha = glow; rounded(c, p.x - TILE / 2 - 2, p.y - 9, TILE + 4, TILE * 0.78 + 5, 6, '#ffffff00', '#fff0ac'); c.globalAlpha = 1; }
  }
  private chef(sim: Simulation, _t: number): void {
    const c = this.context, player = sim.player, p = this.project(player.x, player.y);
    ellipse(c,p.x+3,p.y+5,23,9,'#3144394a');
    c.beginPath();c.ellipse(p.x,p.y+1,23,15,0,0,Math.PI*2);c.strokeStyle=player.dash>0?'#ffe3a0':'#f4d27b';c.lineWidth=3;c.stroke();
    if(player.dash>0)for(let i=0;i<3;i++)ellipse(c,p.x-player.facing.x*(20+i*8),p.y-player.facing.y*(15+i*6),5-i,3,'#ffedb966');
    const board=sim.target?.kind==='board'&&player.activity==='chop'?this.project(sim.target.x+TILE/2,sim.target.y):null;
    c.save();c.translate(p.x,p.y);this.character.draw(c,player,sim.target?.kind==='sink'?sim.target.item:null,board?{x:board.x-p.x,y:board.y+13-p.y}:undefined);c.restore();
  }
  private chopping(sim:Simulation):void {
    const s=sim.target;if(s?.kind!=='board'||sim.player.activity!=='chop'||s.item?.type!=='food')return;
    // The back-facing working area sits behind the head/body; only sleeve motion is visible.
    if(sim.player.facing.y<0)return;
    const c=this.context,p=this.project(s.x,s.y),cx=p.x+TILE/2,cy=p.y+13;
    const tool=choppingToolPose(sim.player.facing,sim.player.workTime),lift=tool.lift;
    if(tool.side) {
      c.save();c.translate(cx,cy-lift);c.scale(tool.direction,1);c.lineWidth=1.5;
      ellipse(c,5,-4+lift,4.5,3.5,'#f2be92','#9d634a');
      rounded(c,-21,0,15,5,2,'#594436','#342b28');
      const metal=c.createLinearGradient(-7,0,11,7);metal.addColorStop(0,'#f7fdff');metal.addColorStop(1,'#91aeb7');
      rounded(c,-7,0,18,7,1.5,metal,'#3c5d69');rounded(c,-5,1,12,1,0.5,'#fff');
      ellipse(c,-14,3,4.5,3.5,'#f2be92','#9d634a');
      c.restore();return;
    }
    // The grip is exactly the projected right-hand anchor used by CharacterArt.
    ellipse(c,cx+tool.support.x,cy+tool.support.y,5,4,'#f2be92','#c48b64');
    c.save();c.translate(cx+tool.grip.x,cy+tool.grip.y);c.rotate(tool.angle);
    rounded(c,-12,-3,15,6,2,'#594436','#342b28');
    const metal=c.createLinearGradient(3,-4,23,7);metal.addColorStop(0,'#fff');metal.addColorStop(1,'#91aeb7');
    rounded(c,3,-4,20,11,2,metal,'#3c5d69');rounded(c,5,-2,15,2,1,'#ffffff');
    ellipse(c,0,0,4.5,3.5,'#f2be92','#9d634a');c.restore();
    if(lift<3)for(let i=0;i<3;i++)ellipse(c,cx-6+i*6,cy+8,1.5,1,'#fff3a6');
  }
}
export function drawDishPreview(canvas: HTMLCanvasElement, id: string): void { const c = canvas.getContext('2d')!; c.clearRect(0, 0, canvas.width, canvas.height); dishIcon(c, id, canvas.width / 2, canvas.height / 2, canvas.width * 0.8); }
