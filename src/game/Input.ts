import type { Control } from './types';
export class Input {
  private keys = new Set<string>();
  private edges = new Set<string>();
  private down = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    const key = event.code;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyJ', 'KeyK', 'KeyP', 'Escape', 'Period', 'Slash', 'Comma', 'Semicolon'].includes(key)) event.preventDefault();
    if (!this.keys.has(key)) this.edges.add(key);
    this.keys.add(key);
  };
  private up = (event: KeyboardEvent) => { this.keys.delete(event.code); };
  constructor() { window.addEventListener('keydown', this.down); window.addEventListener('keyup', this.up); window.addEventListener('blur', () => this.clear()); }
  clear(): void { this.keys.clear(); this.edges.clear(); }
  edge(...keys: string[]): boolean { const found = keys.some(k => this.edges.has(k)); keys.forEach(k => this.edges.delete(k)); return found; }
  held(...keys: string[]): boolean { return keys.some(k => this.keys.has(k)); }
  /** Player 2 (local co-op): arrows to move, . to pick up/place, / to work, , to dash, ; to throw. */
  control2(): Control {
    return { x: Number(this.held('ArrowRight')) - Number(this.held('ArrowLeft')), y: Number(this.held('ArrowDown')) - Number(this.held('ArrowUp')), interact: this.edge('Period'), work: this.held('Slash'), dash: this.edge('Comma'), throwItem: this.edge('Semicolon') };
  }
  /** With `split`, player 1 uses WASD only so the arrow keys are free for player 2. */
  control(split = false): Control {
    const left = split ? ['KeyA'] : ['KeyA', 'ArrowLeft'], right = split ? ['KeyD'] : ['KeyD', 'ArrowRight'], up = split ? ['KeyW'] : ['KeyW', 'ArrowUp'], down = split ? ['KeyS'] : ['KeyS', 'ArrowDown'];
    return { x: Number(this.held(...right)) - Number(this.held(...left)), y: Number(this.held(...down)) - Number(this.held(...up)), interact: this.edge('KeyJ'), work: this.held('Space'), dash: this.edge('KeyK'), throwItem: this.edge('KeyL') };
  }
}
