export const TILE = 16;
export const NORTH = 3; // wall rows at the top of every room (2 wall-face rows + 1 baseboard row)
export const DESK = 4; // a desk cell is DESK x DESK tiles
export const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3, 4, 6];
export const MIN_ZOOM = 0.4;
export const MAX_ZOOM = 6;
export const BG_COLOR = 0x0e0f18;
export const FONT = '"Pixelify Sans", ui-monospace, monospace';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Point {
  x: number;
  y: number;
}
