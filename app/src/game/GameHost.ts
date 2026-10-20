import Phaser from 'phaser';
import { emptyState, type GameBridge, type HostState } from './bridge';
import { BG_COLOR } from './constants';
import { BootScene } from './scenes/BootScene';
import { OfficeScene } from './scenes/OfficeScene';

// Owns the Phaser.Game. React talks to this class only: it never touches scenes directly, and the game
// is created once (changing state does not re-initialize the canvas).
export class GameHost {
  private game: Phaser.Game;
  private scene: OfficeScene | null = null;
  private state: HostState = emptyState();
  private resizeObserver: ResizeObserver;

  constructor(private readonly parent: HTMLElement, bridge: GameBridge) {
    const wrapped: GameBridge = {
      ...bridge,
      onReady: () => {
        this.scene = this.game.scene.getScene('office') as OfficeScene;
        this.scene.apply(this.state);
        bridge.onReady();
      },
    };
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      backgroundColor: BG_COLOR,
      pixelArt: true,
      roundPixels: true,
      antialias: false,
      disableContextMenu: true,
      scale: { mode: Phaser.Scale.RESIZE, width: Math.max(1, parent.clientWidth), height: Math.max(1, parent.clientHeight) },
      scene: [BootScene, OfficeScene],
      input: { windowEvents: false },
      fps: { target: 60, smoothStep: true },
      banner: false,
    });
    this.game.registry.set('bridge', wrapped);
    this.game.registry.set('state', this.state);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(parent);
    // safety net: if the observer misses a layout change (panel opened/closed), the next frame catches it
    this.game.events.on(Phaser.Core.Events.PRE_STEP, () => {
      if (parent.clientWidth !== this.game.scale.width || parent.clientHeight !== this.game.scale.height) this.resize();
    });
  }

  setState(next: HostState) {
    const stageWidth = this.parent.closest('.stage')?.clientWidth ?? this.parent.clientWidth;
    next = { ...next, floorAspect: stageWidth / Math.max(1, this.parent.clientHeight) };
    this.state = next;
    this.game.registry.set('state', next);
    this.scene?.apply(next);
  }

  resize() {
    const w = Math.max(1, this.parent.clientWidth);
    const h = Math.max(1, this.parent.clientHeight);
    this.game.scale.resize(w, h);
    this.setState(this.state);
  }

  focusAgent(id: string) { this.scene?.focusAgent(id); }
  focusStation(id: string) { this.scene?.focusStation(id); }
  zoomIn() { this.scene?.zoomStep(1); }
  zoomOut() { this.scene?.zoomStep(-1); }
  resetZoom() { this.scene?.resetZoom(); }
  agentPosition(id: string) { return this.scene?.agentPosition(id) ?? null; }
  debugInfo() { return this.scene?.debugInfo() ?? null; }

  destroy() {
    this.resizeObserver.disconnect();
    this.game.destroy(true);
    this.scene = null;
  }
}
