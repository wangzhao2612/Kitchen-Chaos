export interface CameraView { width: number; height: number; zoom: number; top: number; bottom: number }
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Screen-space camera only: never changes the chef's physics or interaction coordinates. */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  private initialized = false;
  reset(): void { this.initialized = false; }
  follow(player: { x: number; y: number }, view: CameraView, dt: number, active: boolean): void {
    this.zoom = view.zoom;
    const centerX = view.width * 0.55;
    const centerY = view.top + Math.max(60, view.height - view.top - view.bottom) * 0.52;
    // Include the restaurant's exterior in the bounds, so approaching edge counters
    // keeps the chef and the interaction target clear of the corner HUD.
    const targetX = clamp(centerX - (80 + player.x) * this.zoom, view.width - 1600 * this.zoom, 340 * this.zoom);
    const targetY = clamp(centerY - (95 + player.y * 0.78) * this.zoom, view.height - view.bottom - 990 * this.zoom, view.top + 230 * this.zoom);
    if (!this.initialized) { this.x = targetX; this.y = targetY; this.initialized = true; return; }
    if (!active) return;
    const easing = 1 - Math.exp(-8 * Math.max(0, dt));
    this.x += (targetX - this.x) * easing;
    this.y += (targetY - this.y) * easing;
  }
  screenPoint(x: number, y: number): { x: number; y: number } { return { x: this.x + x * this.zoom, y: this.y + y * this.zoom }; }
}
