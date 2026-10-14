import { Simulation } from './Simulation';
import { Input } from './Input';
import { Save } from './Save';
import { AudioManager } from './Audio';
import { Renderer } from '../rendering/Renderer';
import { UI } from '../ui/UI';
import { LEVELS } from '../levels/data';
export type Screen = 'menu' | 'briefing' | 'playing' | 'paused' | 'results';
export class Game {
  readonly input = new Input();
  readonly save = new Save();
  readonly audio = new AudioManager(this.save.data);
  readonly ui: UI;
  readonly renderer: Renderer;
  simulation = new Simulation(LEVELS[0]);
  screen: Screen = 'menu';
  private accumulator = 0;
  private lastFrame = performance.now();
  private stepClock = 0;
  private alertClock = 0;
  private readonly debug: HTMLElement | null;
  constructor(root: HTMLElement) {
    window.addEventListener('keydown', () => { void this.audio.unlock(); }, { once: true, capture: true });
    this.ui = new UI(root, this.save, {
      start: id => this.start(id), pause: () => this.pause(), resume: () => this.resume(), menu: () => this.menu(), restart: () => this.start(this.simulation.level.id), recipes: () => this.recipes(),
      mute: () => { this.save.data.muted = !this.save.data.muted; this.save.write(); this.audio.updateVolume(); },
      volume: (music, effects) => { this.save.data.music = music; this.save.data.effects = effects; this.save.write(); this.audio.updateVolume(); }
    });
    this.renderer = new Renderer(this.ui.canvas);
    if (import.meta.env.DEV) { this.debug = document.createElement('output'); this.debug.id = 'game-debug'; this.debug.hidden = true; root.append(this.debug); } else this.debug = null;
    root.addEventListener('pointerdown', () => { void this.audio.unlock(); });
    window.addEventListener('blur', () => { if (this.screen === 'playing') this.pause(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.screen === 'playing') this.pause(); });
    this.ui.mainMenu();
    this.ui.setScreen(this.screen);
    requestAnimationFrame(this.frame);
  }
  start(id: number): void {
    const level = LEVELS[id - 1];
    if (!level || !this.save.unlocked(id)) return;
    this.simulation = new Simulation(level); this.screen = 'briefing'; this.accumulator = 0; this.alertClock = 0; this.input.clear(); this.renderer.clearEffects();
    this.ui.setPlaying(level); this.ui.briefing(level);
    void this.audio.pause(false); void this.audio.play(`level${id}`);
  }
  resume(): void {
    if (this.screen !== 'paused' && this.screen !== 'briefing') return;
    this.screen = 'playing'; this.input.clear(); this.accumulator = 0; this.lastFrame = performance.now(); this.ui.hide(); void this.audio.pause(false);
  }
  pause(): void {
    if (this.screen !== 'playing') return;
    this.screen = 'paused'; this.accumulator = 0; this.input.clear(); this.ui.pause(); void this.audio.pause(true);
  }
  menu(): void {
    this.screen = 'menu'; this.input.clear(); this.accumulator = 0; this.renderer.clearEffects(); this.ui.mainMenu(); void this.audio.pause(false); void this.audio.play('menu');
  }
  recipes(): void {
    if (this.ui.recipesOpen) {
      if (this.screen === 'paused' || this.screen === 'briefing') this.resume();
      else this.menu();
      return;
    }
    const playing = this.screen === 'playing' || this.screen === 'paused' || this.screen === 'briefing';
    if (this.screen === 'playing') this.pause();
    this.ui.recipes(playing ? 'resume' : 'menu');
  }
  private frame = (now: number): void => {
    const dt = Math.min(0.1, Math.max(0, (now - this.lastFrame) / 1000)); this.lastFrame = now;
    if (this.input.edge('KeyP', 'Escape')) { if (this.screen === 'playing') this.pause(); else if (this.screen === 'paused') this.resume(); else if (this.screen === 'briefing') this.resume(); else this.menu(); }
    if (this.input.edge('KeyR')) this.recipes();
    if (this.input.edge('KeyM')) { this.save.data.muted = !this.save.data.muted; this.save.write(); this.audio.updateVolume(); this.ui.updateMute(); }
    if (this.screen === 'playing') {
      this.accumulator += dt;
      while (this.accumulator + 1e-9 >= 1 / 60 && this.screen === 'playing') {
        this.simulation.update(1 / 60, this.input.control()); this.accumulator -= 1 / 60;
        for (const event of this.simulation.events) { this.renderer.event(event); this.audio.effect(event.kind); if (event.kind === 'hint' || event.kind === 'fire') this.ui.toast(event.text!); }
        if (this.simulation.finished) {
          const result = this.simulation.result(); this.save.record(result.level, result.score, result.stars); this.screen = 'results'; this.ui.results(result); void this.audio.play(result.stars > 0 ? 'success' : 'failure');
        }
      }
      if (Math.hypot(this.simulation.player.vx, this.simulation.player.vy) > 35) { this.stepClock += dt; if (this.stepClock > 0.24) { this.audio.effect('step'); this.stepClock = 0; } }
      if (this.simulation.stations.some(s => s.stoveState === 'ON_FIRE')) { this.alertClock += dt; if (this.alertClock > 2.2) { this.audio.effect('fire'); this.alertClock = 0; } }
      this.audio.updateUrgency(this.simulation.time);
      if(this.simulation.stations.some(s=>s.stoveState==='COOKING')) this.audio.effect('sizzle');
    }
    this.renderer.draw(this.simulation, dt, this.screen === 'playing' || this.screen === 'menu', this.ui.inKitchen, this.ui.cameraInsets());
    if (this.screen !== 'menu') this.ui.update(this.simulation, now / 1000);
    this.ui.setScreen(this.screen);
    if (this.debug) this.debug.textContent = JSON.stringify({ screen: this.screen, time: this.simulation.time, score: this.simulation.score, served: this.simulation.served, stars: this.simulation.stars, result: this.simulation.result(), failed: this.simulation.failed, player: this.simulation.player, target: this.simulation.target?.id, stations: this.simulation.stations, orders: this.simulation.orders, restaurant: { customers: this.simulation.restaurant.customers, deliveries: this.simulation.restaurant.deliveries, returning: this.simulation.restaurant.returning }, clean: this.simulation.cleanPlates, dirty: this.simulation.dirtyPlates, plateCount: this.simulation.plateCount(), obstacles: this.simulation.activeObstacles(), unlocked: LEVELS.filter(l => this.save.unlocked(l.id)).map(l => l.id), character: { loaded: this.renderer.character.loaded, pose: this.renderer.character.lastPose }, kitchen: { cols: this.simulation.level.cols, rows: this.simulation.level.rows }, camera: { x: this.renderer.camera.x, y: this.renderer.camera.y, zoom: this.renderer.camera.zoom, width: this.renderer.width, height: this.renderer.height }, audio: this.audio.diagnostics() });
    requestAnimationFrame(this.frame);
  };
}
