import type { Control } from './types';
export class Input {
  private keys = new Set<string>();
  private edges = new Set<string>();
  private down = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    const key = event.code;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyJ', 'KeyK', 'KeyP', 'Escape'].includes(key)) event.preventDefault();
    if (!this.keys.has(key)) this.edges.add(key);
    this.keys.add(key);
  };
  private up = (event: KeyboardEvent) => { this.keys.delete(event.code); };
  constructor() { window.addEventListener('keydown', this.down); window.addEventListener('keyup', this.up); window.addEventListener('blur', () => this.clear()); }
  clear(): void { this.keys.clear(); this.edges.clear(); }
  edge(...keys: string[]): boolean { const found = keys.some(k => this.edges.has(k)); keys.forEach(k => this.edges.delete(k)); return found; }
  held(...keys: string[]): boolean { return keys.some(k => this.keys.has(k)); }
  control(): Control {
    return { x: Number(this.held('KeyD', 'ArrowRight')) - Number(this.held('KeyA', 'ArrowLeft')), y: Number(this.held('KeyS', 'ArrowDown')) - Number(this.held('KeyW', 'ArrowUp')), interact: this.edge('KeyJ'), work: this.held('Space'), dash: this.edge('KeyK') };
  }
}
