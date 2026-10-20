import Phaser from 'phaser';
import { MAX_ZOOM, MIN_ZOOM, ZOOM_STEPS } from '../constants';

// Camera input: wheel zoom around the pointer, drag to pan, two-finger pinch, animated focus, fit-to-view.
// Pixels stay sharp because the game runs with pixelArt + roundPixels.

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export class CameraController {
  private world = { w: 1, h: 1 };
  private dragging = false;
  private moved = false;
  private last = { x: 0, y: 0 };
  private pinch: { dist: number; zoom: number } | null = null;
  private fitZoom = 1;
  /** true once the user zoomed or panned: then a resize keeps their view instead of re-fitting */
  private userMoved = false;
  onZoom: (zoom: number) => void = () => {};
  /** set while a pointer interaction was a drag, so the scene does not treat its release as a click */
  get wasDrag() { return this.moved; }

  constructor(private readonly scene: Phaser.Scene) {
    const cam = scene.cameras.main;
    cam.setRoundPixels(true);
    scene.input.addPointer(1);
    scene.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => this.zoomAt(p.x, p.y, Math.exp(-dy * 0.0016)));
    scene.scale.on(Phaser.Scale.Events.RESIZE, () => {
      if (this.world.w <= 1) return;
      if (!this.userMoved) this.fit();
      else this.updateBounds();
    });
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.moved = false;
      if (scene.input.pointer1.isDown && scene.input.pointer2.isDown) {
        this.pinch = { dist: Phaser.Math.Distance.Between(scene.input.pointer1.x, scene.input.pointer1.y, scene.input.pointer2.x, scene.input.pointer2.y), zoom: cam.zoom };
        this.dragging = false;
      } else {
        this.dragging = true;
        this.last = { x: p.x, y: p.y };
      }
    });
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const { pointer1: a, pointer2: b } = scene.input;
      if (this.pinch && a.isDown && b.isDown) {
        const dist = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
        this.setZoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, this.pinch.zoom * (dist / Math.max(1, this.pinch.dist)));
        this.moved = true;
        return;
      }
      if (!this.dragging || !p.isDown) return;
      const dx = p.x - this.last.x;
      const dy = p.y - this.last.y;
      if (!this.moved && Math.hypot(p.x - p.downX, p.y - p.downY) < 5) return;
      this.moved = true;
      this.userMoved = true;
      cam.scrollX -= dx / cam.zoom;
      cam.scrollY -= dy / cam.zoom;
      this.last = { x: p.x, y: p.y };
    });
    const end = () => {
      if (!scene.input.pointer1.isDown || !scene.input.pointer2.isDown) this.pinch = null;
      this.dragging = false;
    };
    scene.input.on('pointerup', end);
    scene.input.on('pointerupoutside', end);
  }

  /** Tell the controller how big the world is; the camera cannot leave it by more than a margin. */
  setWorld(w: number, h: number) {
    this.world = { w, h };
    this.updateBounds();
  }

  /** Bounds are the world plus a margin, and never smaller than the view, so a small world stays centered. */
  private updateBounds() {
    const cam = this.scene.cameras.main;
    const pad = 64;
    const bw = Math.max(this.world.w + pad * 2, cam.width / cam.zoom);
    const bh = Math.max(this.world.h + pad * 2, cam.height / cam.zoom);
    cam.setBounds(this.world.w / 2 - bw / 2, this.world.h / 2 - bh / 2, bw, bh);
  }

  fit(animate = false) {
    this.userMoved = false;
    const cam = this.scene.cameras.main;
    const z = clamp(Math.min(cam.width / (this.world.w + 24), cam.height / (this.world.h + 24)), MIN_ZOOM, MAX_ZOOM);
    this.fitZoom = z;
    if (animate) {
      cam.pan(this.world.w / 2, this.world.h / 2, 350, 'Sine.easeInOut', true);
      cam.zoomTo(z, 350, 'Sine.easeInOut', true);
    } else {
      cam.setZoom(z);
      this.updateBounds();
      cam.centerOn(this.world.w / 2, this.world.h / 2);
    }
    this.onZoom(z);
  }

  focusOn(x: number, y: number, zoom: number, duration = 450) {
    this.userMoved = true;
    const cam = this.scene.cameras.main;
    cam.pan(x, y, duration, 'Sine.easeInOut', true);
    cam.zoomTo(clamp(zoom, MIN_ZOOM, MAX_ZOOM), duration, 'Sine.easeInOut', true);
    this.scene.time.delayedCall(duration + 20, () => this.onZoom(cam.zoom));
  }

  zoomBy(factor: number) {
    const cam = this.scene.cameras.main;
    this.zoomAt(cam.width / 2, cam.height / 2, factor);
  }

  // snap to the next/previous zoom step (used by the + / - buttons)
  stepZoom(dir: 1 | -1) {
    const cam = this.scene.cameras.main;
    const steps = [...ZOOM_STEPS, this.fitZoom].sort((a, b) => a - b);
    const next = dir > 0 ? steps.find((s) => s > cam.zoom + 0.01) : [...steps].reverse().find((s) => s < cam.zoom - 0.01);
    if (next) this.setZoomAt(cam.width / 2, cam.height / 2, next);
  }

  private zoomAt(sx: number, sy: number, factor: number) {
    this.setZoomAt(sx, sy, this.scene.cameras.main.zoom * factor);
  }

  private setZoomAt(sx: number, sy: number, zoom: number) {
    this.userMoved = true;
    const cam = this.scene.cameras.main;
    const z = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    const before = cam.getWorldPoint(sx, sy);
    cam.setZoom(z);
    this.updateBounds();
    const after = cam.getWorldPoint(sx, sy);
    cam.scrollX += before.x - after.x;
    cam.scrollY += before.y - after.y;
    this.onZoom(z);
  }
}
