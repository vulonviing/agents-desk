import Phaser from 'phaser';
import { FONT } from '../constants';
import type { Dir } from '../systems/behavior';

// One office character: a 16x32 sprite with a soft shadow, a status bubble above the head, a selection ring
// and a name label. The container's depth follows the feet so characters sort correctly with the furniture.

export type Visual = 'idle' | 'work' | 'think-seated' | 'think' | 'wait' | 'walk' | 'complete' | 'error' | 'offline' | 'coffee' | 'cooler' | 'sofa' | 'window' | 'visit' | 'queue' | 'printer' | 'read';

export class AgentSprite {
  readonly id: string;
  readonly container: Phaser.GameObjects.Container;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly bubble: Phaser.GameObjects.Sprite;
  private readonly ring: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly activity: Phaser.GameObjects.Graphics;
  private speech: Phaser.GameObjects.Container | null = null;
  private speechUntil = 0;
  private speechWidth = 0;
  private speechHeight = 0;
  private speechObserved = false;
  private variant: string;
  private visual: Visual | null = null;
  private dir: Dir = 'down';
  private selected = false;
  private hovered = false;
  private tween: Phaser.Tweens.Tween | null = null;
  private pulse: Phaser.Tweens.Tween | null = null;

  constructor(private readonly scene: Phaser.Scene, id: string, variant: string, name: string) {
    this.id = id;
    this.variant = variant;
    const shadow = scene.add.ellipse(0, -1, 14, 5, 0x000000, 0.28);
    this.sprite = scene.add.sprite(0, 0, variant, 18 + 24).setOrigin(0.5, 1);
    this.bubble = scene.add.sprite(0, -35, 'props', 'bubble_check').setOrigin(0.5, 1).setVisible(false);
    this.ring = scene.add.graphics();
    this.ring.lineStyle(1, 0x7c5cff, 1);
    this.ring.strokeEllipse(0, -1, 20, 8);
    this.ring.fillStyle(0x7c5cff, 0.18);
    this.ring.fillEllipse(0, -1, 20, 8);
    this.ring.setVisible(false);
    this.label = scene.add.text(0, -42, name, { fontFamily: FONT, fontSize: '7px', color: '#ffffff', backgroundColor: 'rgba(14,15,24,0.75)', padding: { x: 2, y: 1 } }).setOrigin(0.5, 1).setResolution(4).setVisible(false);
    this.activity = scene.add.graphics();
    this.activity.fillStyle(0x67e7a3).fillPoints([{x: -13, y: -43}, {x: -9, y: -36}, {x: -13, y: -29}, {x: -17, y: -36}], true);
    this.activity.lineStyle(1, 0xd5ffe7).strokePoints([{x: -13, y: -43}, {x: -9, y: -36}, {x: -13, y: -29}, {x: -17, y: -36}], true);
    this.activity.setVisible(false);
    this.container = scene.add.container(0, 0, [this.ring, shadow, this.sprite, this.bubble, this.label, this.activity]);
    this.setVisual('idle', 'down');
  }

  // feet position in world pixels
  setFeet(x: number, y: number) {
    this.container.setPosition(Math.round(x), Math.round(y));
    this.container.setDepth(Math.round(y));
  }
  get x() { return this.container.x; }
  get y() { return this.container.y; }

  hit(wx: number, wy: number): boolean {
    return Math.abs(wx - this.container.x) <= 9 && wy <= this.container.y + 2 && wy >= this.container.y - 34;
  }

  setActive(on: boolean) {
    this.activity.setVisible(on);
    if (on && !this.speechObserved) { this.speech?.destroy(true); this.speech = null; }
  }

  clearAmbientSpeech() { if (!this.speechObserved) { this.speech?.destroy(true); this.speech = null; } }

  say(text: string, observed = false, duration = 4200, heading?: string, sourceUrl?: string) {
    this.speech?.destroy(true);
    this.speechObserved = observed;
    const label = this.scene.add.text(0, 0, `${heading ?? (observed ? 'CLI gözlemi\n' : '')}${heading ? '\n' : ''}${text}${sourceUrl ? ' ↗' : ''}`, { fontFamily: FONT, fontSize: '10px', color: observed ? '#245b48' : '#51475c', wordWrap: { width: 152 }, lineSpacing: 4 }).setResolution(4);
    if (sourceUrl && /^https:\/\//.test(sourceUrl)) label.setInteractive({ useHandCursor: true }).on('pointerup', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation(); window.open(sourceUrl, '_blank', 'noopener,noreferrer');
    });
    const width = Math.max(88, label.width + 24), height = label.height + 20;
    const bg = this.scene.add.graphics().fillStyle(observed ? 0xe3fff0 : 0xfff8e8).fillRoundedRect(-width / 2, -height, width, height, 4);
    bg.fillTriangle(-4, -1, 4, -1, 0, 5);
    label.setPosition(-width / 2 + 12, -height + 10);
    this.speech = this.scene.add.container(this.x, this.y - 44, [bg, label]).setDepth(5500);
    this.speechWidth = width; this.speechHeight = height;
    this.speechUntil = this.scene.time.now + duration;
    this.positionSpeech();
  }

  updateSpeech() {
    if (!this.speech) return;
    if (this.scene.time.now > this.speechUntil) { this.speech.destroy(true); this.speech = null; }
    else this.positionSpeech();
  }

  private positionSpeech() {
    if (!this.speech) return;
    const camera = this.scene.cameras.main, zoom = camera.zoom;
    // Maintain readable text at floor-fit zoom and keep bubbles within the visible canvas.
    const scale = Math.min(Math.max(1, 1.8 / zoom), (camera.width - 24) / (this.speechWidth * zoom));
    this.speech.setScale(scale);
    this.speech.setVisible(camera.worldView.contains(this.x, this.y));
    const half = this.speechWidth * scale / 2, margin = 8 / zoom, view = camera.worldView;
    const x = Phaser.Math.Clamp(this.x, view.left + half + margin, view.right - half - margin);
    const y = Math.max(view.top + this.speechHeight * scale + margin, this.y - 44);
    this.speech.setPosition(x, y);
  }

  setVariant(variant: string) {
    if (variant === this.variant) return;
    this.variant = variant;
    this.sprite.setTexture(variant);
    this.visual = null;
  }

  setName(name: string) {
    this.label.setText(name);
  }

  setSelected(on: boolean) {
    if (on === this.selected) return;
    this.selected = on;
    this.ring.setVisible(on);
    this.pulse?.remove();
    this.pulse = on ? this.scene.tweens.add({ targets: this.ring, alpha: { from: 1, to: 0.45 }, duration: 700, yoyo: true, repeat: -1 }) : null;
    if (!on) this.ring.setAlpha(1);
    this.label.setVisible(this.selected || this.hovered);
  }

  setHovered(on: boolean) {
    this.hovered = on;
    this.label.setVisible(this.selected || on);
  }

  setVisual(v: Visual, dir: Dir = this.dir) {
    if (v === this.visual && dir === this.dir) return;
    const changed = v !== this.visual;
    this.visual = v;
    this.dir = dir;
    const key = (name: string) => `${this.variant}:${name}`;
    let anim = key('idle-down');
    let bubble: { anim?: string; frame?: string } | null = null;
    let tint = 0xffffff;
    let alpha = 1;
    switch (v) {
      case 'work': anim = key('sit'); break;
      case 'think-seated': anim = key('sit'); bubble = { anim: 'bubble:think' }; break;
      case 'think': bubble = { anim: 'bubble:think' }; break;
      case 'read': anim = key('sit'); bubble = { frame: 'papers' }; break;
      case 'printer': anim = key('idle-up'); break;
      case 'queue': anim = key('phone'); break;
      case 'wait': bubble = { frame: 'bubble_question' }; break;
      case 'walk': anim = key(`run-${dir}`); break;
      case 'complete': bubble = { frame: 'bubble_check' }; break;
      case 'error': bubble = { frame: 'bubble_alert' }; break;
      case 'offline': bubble = { anim: 'bubble:zzz' }; tint = 0x8d8dac; alpha = 0.9; break;
      case 'coffee': case 'cooler': bubble = { anim: 'bubble:coffee' }; anim = key('idle-down'); break;
      case 'sofa': anim = key('phone'); break;
      case 'window': anim = key('idle-up'); break;
      case 'visit': break;
      case 'idle': break;
    }
    if (v === 'offline') {
      this.sprite.anims.stop();
      this.sprite.setFrame(24 + 18);
    } else {
      this.sprite.play(anim, true);
    }
    this.sprite.setTint(tint).setAlpha(alpha);
    if (bubble) {
      this.bubble.setVisible(true);
      if (bubble.anim) this.bubble.play(bubble.anim, true);
      else {
        this.bubble.anims.stop();
        this.bubble.setFrame(bubble.frame!);
      }
    } else {
      this.bubble.setVisible(false);
      this.bubble.anims.stop();
    }
    if (changed) this.reactions(v);
  }

  // short one-off reactions: a small hop when a task is done, a shake on errors
  private reactions(v: Visual) {
    this.tween?.remove();
    this.sprite.setY(0).setX(0);
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    if (v === 'complete') {
      this.tween = this.scene.tweens.add({ targets: this.sprite, y: -4, duration: 160, yoyo: true, repeat: 2, ease: 'Sine.easeOut', onComplete: () => this.sprite.setY(0) });
    } else if (v === 'error') {
      this.tween = this.scene.tweens.add({ targets: this.sprite, x: { from: -1, to: 1 }, duration: 60, yoyo: true, repeat: 6, onComplete: () => this.sprite.setX(0) });
    }
  }

  setVisibleInView(on: boolean) {
    this.container.setVisible(on);
  }

  destroy() {
    this.tween?.remove();
    this.pulse?.remove();
    this.speech?.destroy(true);
    this.container.destroy(true);
  }
}
