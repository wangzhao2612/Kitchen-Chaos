export interface CameraView { width: number; height: number; zoom: number; top: number; bottom: number }
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Screen-space camera only: never changes the chef's physics or interaction coordinates. */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  private initialized = false;
  reset(): void { this.initialized = false; }
  /** Follow one chef, or frame both: the focus is their midpoint and the view zooms out (down to 65%) when they drift apart. */
  follow(chef: { x: number; y: number }, view: CameraView, dt: number, active: boolean, partner?: { x: number; y: number } | null): void {
    const player = partner ? { x: (chef.x + partner.x) / 2, y: (chef.y + partner.y) / 2 } : chef;
    let wanted = view.zoom;
    if (partner) {
      const usable = Math.max(60, view.height - view.top - view.bottom);
      const spreadX = Math.max(1, Math.abs(chef.x - partner.x) * view.zoom), spreadY = Math.max(1, Math.abs(chef.y - partner.y) * 0.78 * view.zoom);
      wanted = view.zoom * clamp(Math.min(0.62 * view.width / spreadX, 0.62 * usable / spreadY), 0.65, 1);
    }
    if (!partner || !this.initialized) this.zoom = wanted;
    else if (active) this.zoom += (wanted - this.zoom) * (1 - Math.exp(-5 * Math.max(0, dt)));
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
