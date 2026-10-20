import { drawBehind, drawBubble, drawChair, drawHands, drawSleeper, drawWeb } from './character.js';
import { blend, rng } from './util.js';

// One 64x64 desk cell, redrawn every frame: chair, character, desk, monitor, keyboard, dust.
// occupied=false draws an empty desk (a station nobody sits at right now).
export const LAMP = { active: '#7be0a3', week: '#7c9cff', unpushed: '#ffb454', idle: '#4a4f73' };
const DUST = [0, 0.2, 0.45, 0.7];
const SPECKS = [0, 8, 20, 40];

const R = (ctx, x, y, w, h, c) => {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
};

// mode: 'idle' | 'sleep' | 'work' | 'wait'. A live session clears the dust: the desk is in use again.
export function drawDeskCell(ctx, x, y, { desk, mode, look, f, live, occupied = true }) {
  const dust = live ? 0 : desk.dust;
  const dim = DUST[dust];
  const wood = blend('#b5835a', '#8d8a82', dim);
  const lampColor = blend(LAMP[desk.lamp], '#3b3d4a', dim);

  if (occupied) drawBehind(ctx, x, y, mode, look, f);
  else drawChair(ctx, x, y);

  // desk top
  R(ctx, x + 6, y + 26, 52, 22, wood);
  R(ctx, x + 6, y + 26, 52, 2, blend(wood, '#ffffff', 0.2));
  R(ctx, x + 6, y + 46, 52, 3, blend(wood, '#000000', 0.35));
  R(ctx, x + 8, y + 49, 3, 5, '#4a3a2f');
  R(ctx, x + 53, y + 49, 3, 5, '#4a3a2f');

  // monitor: bezel, screen, stand
  R(ctx, x + 29, y + 33, 6, 3, '#2a2d44');
  R(ctx, x + 31, y + 29, 2, 5, '#2a2d44');
  R(ctx, x + 18, y + 14, 28, 17, '#22253a');
  const screen = mode === 'sleep' ? '#10131f' : mode === 'work' ? '#16204a' : blend(LAMP[desk.lamp], '#10131f', 0.55);
  R(ctx, x + 20, y + 16, 24, 13, screen);
  if (mode === 'work') {
    ctx.fillStyle = 'rgba(190,215,255,0.8)';
    for (let i = 0; i < 4; i++) ctx.fillRect(x + 22, y + 18 + i * 3, 5 + ((f + i * 3) % 14), 1);
  } else if (mode !== 'sleep') {
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (let i = 0; i < 3; i++) ctx.fillRect(x + 22, y + 19 + i * 3, 10 + i * 4, 1);
  }

  // keyboard, mouse, mug, papers
  R(ctx, x + 22, y + 39, 20, 6, '#d6dae6');
  for (let i = 0; i < 6; i++) R(ctx, x + 23 + i * 3, y + 40, 2, 1, '#9aa0b5');
  R(ctx, x + 46, y + 40, 4, 6, '#d6dae6');
  R(ctx, x + 11, y + 33, 6, 7, '#e8e9f3');
  R(ctx, x + 17, y + 35, 2, 3, '#e8e9f3');
  R(ctx, x + 12, y + 34, 4, 1, '#6b4330');
  R(ctx, x + 47, y + 30, 8, 7, '#f4f5f9');
  R(ctx, x + 48, y + 32, 6, 1, '#9aa0b5');

  // desk lamp (its color is the project's status)
  R(ctx, x + 10, y + 27, 2, 6, '#555a7a');
  R(ctx, x + 8, y + 25, 7, 3, lampColor);

  if (occupied) {
    drawHands(ctx, x, y, mode, look, f);
    if (mode === 'sleep') drawSleeper(ctx, x, y, look, f);
  }

  // dust: tint and deterministic specks
  if (dust > 0) {
    const rand = rng(desk.id);
    ctx.fillStyle = `rgba(200,196,180,${dim * 0.35})`;
    ctx.fillRect(x + 6, y + 26, 52, 22);
    for (let i = 0; i < SPECKS[dust]; i++) {
      const onMonitor = rand() < 0.3;
      const px = onMonitor ? x + 20 + Math.floor(rand() * 24) : x + 6 + Math.floor(rand() * 52);
      const py = onMonitor ? y + 16 + Math.floor(rand() * 13) : y + 26 + Math.floor(rand() * 22);
      ctx.fillStyle = 'rgba(232,227,212,0.65)';
      ctx.fillRect(px, py, rand() < 0.25 ? 2 : 1, 1);
    }
    if (dust === 3) drawWeb(ctx, x, y);
  }
  if (desk.lamp === 'active' || live) {
    ctx.fillStyle = 'rgba(255,238,170,0.10)';
    ctx.fillRect(x + 2, y + 22, 60, 38);
  }
  if (occupied && (mode === 'work' || mode === 'wait')) drawBubble(ctx, x, y, mode, f);
}
