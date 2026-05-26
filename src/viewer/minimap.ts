export type MinimapBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export type MinimapView = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export class Minimap {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private bounds: MinimapBounds | null = null;
  private view: MinimapView | null = null;
  private preview: HTMLCanvasElement | null = null;
  private enabled = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not create minimap 2D context");
    }
    this.ctx = ctx;
    this.canvas.width = 360;
    this.canvas.height = 240;
  }

  setEnabled(enable: boolean): void {
    this.enabled = enable;
    this.canvas.classList.toggle("hidden", !enable);
    if (enable) this.render();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  update(bounds: MinimapBounds | null, view: MinimapView | null): void {
    this.bounds = bounds;
    this.view = view;
    this.render();
  }

  setPreview(preview: HTMLCanvasElement | null): void {
    this.preview = preview;
    this.render();
  }

  screenToWorld(clientX: number, clientY: number): { x: number; y: number } | null {
    if (!this.bounds) return null;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const nx = (clientX - rect.left) / rect.width;
    const ny = (clientY - rect.top) / rect.height;
    const x = this.bounds.minX + nx * (this.bounds.maxX - this.bounds.minX);
    const y = this.bounds.maxY - ny * (this.bounds.maxY - this.bounds.minY);
    return { x, y };
  }

  private render(): void {
    if (!this.enabled) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (this.preview && this.bounds) {
      const sw = this.preview.width;
      const sh = this.preview.height;
      if (sw > 0 && sh > 0) {
        const scale = Math.min(w / sw, h / sh);
        const dw = sw * scale;
        const dh = sh * scale;
        const dx = (w - dw) / 2;
        const dy = (h - dh) / 2;
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(this.preview, dx, dy, dw, dh);
      }
    } else {
      ctx.fillStyle = "rgba(0,0,0,0.15)";
      ctx.fillRect(0, 0, w, h);
    }

    if (!this.bounds) return;
    const bx = this.bounds.maxX - this.bounds.minX;
    const by = this.bounds.maxY - this.bounds.minY;
    if (bx <= 0 || by <= 0) return;

    ctx.strokeStyle = "rgba(220,220,220,0.55)";
    ctx.strokeRect(1, 1, w - 2, h - 2);

    if (!this.view) return;
    const x0 = ((this.view.left - this.bounds.minX) / bx) * w;
    const x1 = ((this.view.right - this.bounds.minX) / bx) * w;
    const y0 = ((this.bounds.maxY - this.view.top) / by) * h;
    const y1 = ((this.bounds.maxY - this.view.bottom) / by) * h;

    const vx = Math.min(x0, x1);
    const vy = Math.min(y0, y1);
    const vw = Math.max(8, Math.abs(x1 - x0));
    const vh = Math.max(8, Math.abs(y1 - y0));
    ctx.fillStyle = "rgba(79,141,255,0.18)";
    ctx.strokeStyle = "rgba(79,141,255,0.95)";
    ctx.lineWidth = 2;
    ctx.fillRect(vx, vy, vw, vh);
    ctx.strokeRect(vx, vy, vw, vh);
  }
}
