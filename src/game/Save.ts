export interface SaveData { version: 1; stars: number[]; scores: number[]; muted: boolean; music: number; effects: number }
const KEY = 'kitchen-chaos-v1';
export class Save {
  data: SaveData = { version: 1, stars: [0, 0, 0, 0, 0], scores: [0, 0, 0, 0, 0], muted: false, music: 0.55, effects: 0.75 };
  constructor() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<SaveData> | null;
      if (raw?.version === 1) {
        if (Array.isArray(raw.stars) && raw.stars.length === 5) this.data.stars = raw.stars.map(n => Number.isFinite(n) ? Math.max(0, Math.min(3, Math.floor(n))) : 0);
        if (Array.isArray(raw.scores) && raw.scores.length === 5) this.data.scores = raw.scores.map(n => Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);
        this.data.muted = raw.muted === true;
        if (typeof raw.music === 'number' && Number.isFinite(raw.music)) this.data.music = Math.max(0, Math.min(1, raw.music));
        if (typeof raw.effects === 'number' && Number.isFinite(raw.effects)) this.data.effects = Math.max(0, Math.min(1, raw.effects));
      }
    } catch { /* Storage denial or an older/corrupt save must not prevent play. */ }
  }
  write(): void { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* Game remains usable with in-memory progress. */ } }
  unlocked(id: number): boolean { return id === 1 || this.data.stars[id - 2] > 0; }
  record(id: number, score: number, stars: number): void { this.data.scores[id - 1] = Math.max(this.data.scores[id - 1], score); this.data.stars[id - 1] = Math.max(this.data.stars[id - 1], stars); this.write(); }
}
