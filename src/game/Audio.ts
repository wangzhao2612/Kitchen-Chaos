import type { EventKind } from './types';
import type { SaveData } from './Save';
interface TrackMeta { file: string; fallback?: string; seconds: number; bpm: number; bars: number }
interface AudioManifest { tracks: Record<string, TrackMeta> }
/** Audio is unlocked by a user gesture. All loops use decoded PCM buffers. */
export class AudioManager {
  private context: AudioContext | null = null;
  private musicBus: GainNode | null = null;
  private effectsBus: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private source: AudioBufferSourceNode | null = null;
  private urgency: AudioBufferSourceNode | null = null;
  private urgencyGain: GainNode | null = null;
  private manifest: AudioManifest | null = null;
  private requested = 'menu';
  private generation = 0;
  private lastEffect = new Map<string, number>();
  private loadPromise: Promise<void> | null = null;
  private paused = false;
  private urgent = false;
  available = false;
  diagnostics(): { context: string; playing: boolean; track: string; decoded: number; urgent: boolean; playbackRate: number } { return { context: this.context?.state ?? 'locked', playing: this.source !== null && !this.paused, track: this.requested, decoded: this.buffers.size, urgent:this.urgent, playbackRate:this.source?.playbackRate.value??1 }; }
  constructor(private readonly settings: SaveData) {}
  async unlock(): Promise<void> {
    try {
      if (!this.context) {
        this.context = new AudioContext(); this.musicBus = this.context.createGain(); this.effectsBus = this.context.createGain();
        const limiter = this.context.createDynamicsCompressor(); limiter.threshold.value = -5; limiter.knee.value = 3; limiter.ratio.value = 10;
        this.musicBus.connect(limiter); this.effectsBus.connect(limiter); limiter.connect(this.context.destination);
        this.updateVolume();
      }
      if (!this.paused) await this.context.resume();
      this.available = true;
      if (!this.loadPromise) this.loadPromise = this.loadManifest();
      await this.loadPromise;
      if (!this.source && !this.paused) await this.play(this.requested);
    } catch { this.available = false; }
  }
  private async loadManifest(): Promise<void> {
    try { const response = await fetch(`${import.meta.env.BASE_URL}audio/manifest.json`); if (response.ok) this.manifest = await response.json() as AudioManifest; } catch { /* Interaction effects still work without music downloads. */ }
  }
  private async buffer(id: string): Promise<AudioBuffer | null> {
    if (this.buffers.has(id)) return this.buffers.get(id)!;
    if (!this.context || !this.manifest?.tracks[id]) return null;
    const track = this.manifest.tracks[id];
    for (const file of [track.file, track.fallback].filter(Boolean)) {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}audio/${file}`);
        if (!response.ok) continue;
        const decoded = await this.context.decodeAudioData(await response.arrayBuffer()); this.buffers.set(id, decoded); return decoded;
      } catch { /* Try the alternative codec supported by this browser. */ }
    }
    return null;
  }
  async play(id: string): Promise<void> {
    this.requested = id;
    this.urgent=false;
    if (!this.context || !this.musicBus || this.paused) return;
    const ticket = ++this.generation;
    const buffer = await this.buffer(id);
    if (ticket !== this.generation || this.paused) return;
    this.stopSources();
    if (!buffer) return;
    this.source = this.context.createBufferSource(); this.source.buffer = buffer; this.source.loop = !['success','failure'].includes(id);
    this.source.loopEnd = Math.min(buffer.duration, this.manifest?.tracks[id]?.seconds ?? buffer.duration);
    const source = this.source;
    source.onended = () => { if (this.source === source) this.source = null; source.disconnect(); };
    const started = this.context.currentTime;
    this.source.connect(this.musicBus); this.source.start(started);
    const layer = await this.buffer(`${id}-urgent`);
    if (!layer || ticket !== this.generation || this.paused) return;
    this.urgency = this.context.createBufferSource(); this.urgency.buffer = layer; this.urgency.loop = true;
    this.urgencyGain = this.context.createGain(); this.urgencyGain.gain.value = this.urgent?.85:0;
    this.urgency.playbackRate.value=this.source.playbackRate.value;
    this.urgency.connect(this.urgencyGain); this.urgencyGain.connect(this.musicBus);
    // Start layers on the same musical phase, even if loading took time.
    const phase = (this.context.currentTime - started) % layer.duration;
    this.urgency.start(0, phase);
  }
  private stopSources(): void { for (const s of [this.source, this.urgency]) { try { s?.stop(); s?.disconnect(); } catch { /* Already ended. */ } } this.source = null; this.urgency = null; this.urgencyGain = null; }
  updateUrgency(seconds: number): void {
    if(!this.context||!this.requested.startsWith('level')||!this.source)return;
    const urgent=seconds<30;
    if(urgent===this.urgent)return;
    this.urgent=urgent;
    // Both synchronized layers accelerate together, keeping their musical phase aligned.
    for(const source of [this.source,this.urgency])source?.playbackRate.setTargetAtTime(urgent?1.18:1,this.context.currentTime,.65);
    this.urgencyGain?.gain.setTargetAtTime(urgent?.85:0,this.context.currentTime,.65);
  }
  async pause(value: boolean): Promise<void> { this.paused = value; if (this.context) { if (value) await this.context.suspend(); else { await this.context.resume(); if (!this.source) await this.play(this.requested); } } }
  updateVolume(): void { if (!this.context) return; this.musicBus?.gain.setTargetAtTime(this.settings.muted ? 0 : this.settings.music * 0.72, this.context.currentTime, 0.04); this.effectsBus?.gain.setTargetAtTime(this.settings.muted ? 0 : this.settings.effects * 0.5, this.context.currentTime, 0.02); }
  effect(kind: EventKind | 'step' | 'sizzle'): void {
    const ctx = this.context; if (!ctx || ctx.state !== 'running' || !this.effectsBus) return;
    const now = ctx.currentTime;
    const throttle = kind === 'sizzle' ? 0.5 : kind === 'extinguish' ? 0.12 : kind === 'step' ? 0.2 : kind === 'wash' ? 0.12 : 0.06;
    if (now - (this.lastEffect.get(kind) ?? -10) < throttle) return;
    this.lastEffect.set(kind, now);
    if (['wash','extinguish','sizzle'].includes(kind)) {
      const duration = kind === 'sizzle' ? 0.55 : 0.2;
      const buffer=ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate), samples=buffer.getChannelData(0);
      for(let i=0;i<samples.length;i++) samples[i]=(Math.random()*2-1)*Math.sin(Math.PI*i/samples.length);
      const source=ctx.createBufferSource(), filter=ctx.createBiquadFilter(), gain=ctx.createGain(); source.buffer=buffer;
      filter.type='bandpass'; filter.frequency.value=kind==='sizzle'?1700:2500; filter.Q.value=.5; gain.gain.value=kind==='sizzle'?.035:.08;
      source.connect(filter); filter.connect(gain); gain.connect(this.effectsBus); source.start(); source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
    }
    const notes: Partial<Record<EventKind | 'step' | 'sizzle', number[]>> = { pickup: [660, 880], place: [430, 300], chop: [190], wash: [580], ready: [660, 880, 1100], serve: [523, 659, 784, 1047], fail: [260, 210, 170], fire: [740, 540, 740, 540], dash: [220, 420], finish: [523, 659, 784, 1047, 1319], extinguish: [420], step: [110], hint: [330] };
    (notes[kind] ?? []).forEach((freq, i) => {
      const oscillator = ctx.createOscillator(), gain = ctx.createGain();
      const start = now + i * 0.085, duration = ['chop', 'step'].includes(kind) ? 0.035 : kind === 'extinguish' ? 0.12 : 0.15;
      oscillator.type = ['chop', 'step', 'place'].includes(kind) ? 'triangle' : 'sine'; oscillator.frequency.setValueAtTime(freq, start);
      if (kind === 'dash' || kind === 'chop') oscillator.frequency.exponentialRampToValueAtTime(freq * 0.4, start + duration);
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(kind === 'step' ? 0.03 : 0.18, start + 0.005); gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      oscillator.connect(gain); gain.connect(this.effectsBus!); oscillator.start(start); oscillator.stop(start + duration + 0.01);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    });
  }
}
