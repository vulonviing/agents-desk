import Phaser from 'phaser';

// Asset keys, the character variants and the animations that every variant gets.

export const VARIANTS = ['adam0', 'adam1', 'adam2', 'adam3', 'alex0', 'alex1', 'alex2', 'alex3', 'amelia0', 'amelia1', 'amelia2', 'amelia3', 'bob0', 'bob1', 'bob2', 'bob3'];
export const COLS = 24; // frames per row of a variant sheet
const ROW = { run: 0, idle: 1, sit: 2, phone: 3 } as const;
const DIRS = ['right', 'up', 'left', 'down'] as const;

export const assetUrl = (path: string) => `assets/${path}`;

export function createCharacterAnims(scene: Phaser.Scene) {
  const frames = (key: string, row: number, start: number, end: number) => scene.anims.generateFrameNumbers(key, { start: row * COLS + start, end: row * COLS + end });
  for (const v of VARIANTS) {
    DIRS.forEach((d, i) => {
      scene.anims.create({ key: `${v}:run-${d}`, frames: frames(v, ROW.run, i * 6, i * 6 + 5), frameRate: 10, repeat: -1 });
      scene.anims.create({ key: `${v}:idle-${d}`, frames: frames(v, ROW.idle, i * 6, i * 6 + 5), frameRate: 5, repeat: -1 });
    });
    scene.anims.create({ key: `${v}:sit`, frames: frames(v, ROW.sit, 0, 11), frameRate: 6, repeat: -1 });
    scene.anims.create({ key: `${v}:phone`, frames: frames(v, ROW.phone, 0, 8), frameRate: 6, repeat: -1 });
  }
  const bubble = (key: string, names: string[], rate: number) =>
    scene.anims.create({ key, frames: names.map((n) => ({ key: 'props', frame: n })), frameRate: rate, repeat: -1 });
  bubble('bubble:think', ['bubble_think_0', 'bubble_think_1', 'bubble_think_2'], 4);
  bubble('bubble:zzz', ['bubble_zzz_0', 'bubble_zzz_1'], 1.5);
  bubble('bubble:coffee', ['bubble_coffee_0', 'bubble_coffee_1'], 2);
  scene.anims.create({ key: 'butterfly', frames: [0, 1, 2, 1].map((f) => ({ key: 'props', frame: `butterfly_${f}` })), frameRate: 5, repeat: -1 });
  scene.anims.create({ key: 'rack', frames: ['rack_0', 'rack_1', 'rack_2'].map((n) => ({ key: 'props', frame: n })), frameRate: 2, repeat: -1 });
}
