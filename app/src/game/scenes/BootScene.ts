import Phaser from 'phaser';
import { assetUrl, createCharacterAnims, VARIANTS } from '../assets';
import { BG_COLOR, FONT } from '../constants';
import type { GameBridge, HostState } from '../bridge';

// Loads everything once (tiles, props atlas, character sheets), builds the animations, then starts the office.

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor(BG_COLOR);
    const bar = this.add.graphics();
    const text = this.add.text(width / 2, height / 2 - 18, 'Ofis hazırlanıyor…', { fontFamily: FONT, fontSize: '14px', color: '#9a9db8' }).setOrigin(0.5);
    this.load.on('progress', (v: number) => {
      bar.clear().fillStyle(0x2f3350).fillRect(width / 2 - 120, height / 2, 240, 8).fillStyle(0x7c5cff).fillRect(width / 2 - 120, height / 2, 240 * v, 8);
    });
    this.load.on('complete', () => {
      bar.destroy();
      text.destroy();
    });
    this.load.image('roombuilder', assetUrl('limezu/Room_Builder_free_16x16.png'));
    this.load.image('walls', assetUrl('generated/walls.png'));
    this.load.image('themes', assetUrl('generated/office-themes.png'));
    this.load.image('collision', assetUrl('generated/collision.png'));
    this.load.image('themefloors', assetUrl('generated/theme-floors.png'));
    this.load.atlas('props', assetUrl('generated/props.png'), assetUrl('generated/props.json'));
    for (const v of VARIANTS) this.load.spritesheet(v, assetUrl(`generated/characters/${v}.png`), { frameWidth: 16, frameHeight: 32 });
  }

  create() {
    createCharacterAnims(this);
    const bridge = this.registry.get('bridge') as GameBridge;
    const state = this.registry.get('state') as HostState;
    this.scene.start('office', { bridge, state });
  }
}
