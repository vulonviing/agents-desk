import type { TiledTileset } from './tiled';

// Tilesets and tile choices. Room Builder is the LimeZu free sheet (17 x 23 tiles); walls are generated
// auto-tiles (index = N + 2E + 4S + 8W); collision is one marker tile.

export const TS_ROOM = 1; // firstgid
export const TS_WALLS = 392;
export const TS_THEMES = 409;
export const TS_COLLISION = 408;
export const COLLISION_GID = TS_COLLISION;
export const TS_THEMEFLOORS = 415; // generated floor materials: slate, parquet, warm wood, lilac, blue, sage, sand carpets (3 x 14 tiles)

export const themeGid = (theme: string, kind: 0 | 1 | 2) => TS_THEMES + (theme === 'research' ? 3 : 0) + kind;

export const TILESETS: TiledTileset[] = [
  { firstgid: TS_ROOM, name: 'roombuilder', image: 'limezu/Room_Builder_free_16x16.png', imagewidth: 272, imageheight: 368, tilewidth: 16, tileheight: 16, columns: 17, tilecount: 391, margin: 0, spacing: 0 },
  { firstgid: TS_WALLS, name: 'walls', image: 'generated/walls.png', imagewidth: 64, imageheight: 64, tilewidth: 16, tileheight: 16, columns: 4, tilecount: 16, margin: 0, spacing: 0 },
  { firstgid: TS_COLLISION, name: 'collision', image: 'generated/collision.png', imagewidth: 16, imageheight: 16, tilewidth: 16, tileheight: 16, columns: 1, tilecount: 1, margin: 0, spacing: 0 },
  { firstgid: TS_THEMES, name: 'themes', image: 'generated/office-themes.png', imagewidth: 96, imageheight: 16, tilewidth: 16, tileheight: 16, columns: 6, tilecount: 6, margin: 0, spacing: 0 },
  { firstgid: TS_THEMEFLOORS, name: 'themefloors', image: 'generated/theme-floors.png', imagewidth: 48, imageheight: 224, tilewidth: 16, tileheight: 16, columns: 3, tilecount: 42, margin: 0, spacing: 0 },
];

const roomGid = (col: number, row: number) => TS_ROOM + row * 17 + col;
export const wallGid = (mask: number) => TS_WALLS + mask;

// Floor patterns are 3 x 2 tiles that repeat seamlessly.
export interface FloorStyle {
  col: number;
  row: number;
}
export const FLOORS: Record<string, FloorStyle> = {
  carpetA: { col: 14, row: 5 },
  carpetB: { col: 14, row: 7 },
  carpetC: { col: 14, row: 9 },
  carpetD: { col: 14, row: 11 },
  tileRed: { col: 11, row: 5 },
  tileYellow: { col: 11, row: 7 },
  tileTeal: { col: 11, row: 9 },
  tileGray: { col: 11, row: 11 },
  herringbone: { col: 11, row: 13 },
};
export const PROJECT_FLOORS = ['carpetA', 'carpetB', 'carpetC', 'carpetD', 'herringbone', 'tileYellow'];

export const MATERIALS: Record<string, number> = { 'mat:slate': 0, 'mat:parquet': 1, 'mat:warmwood': 2, 'mat:lilac': 3, 'mat:blue': 4, 'mat:sage': 5, 'mat:sand': 6 };

export function floorGid(style: string, x: number, y: number): number {
  const m = MATERIALS[style];
  if (m !== undefined) return TS_THEMEFLOORS + (m * 2 + (y % 2)) * 3 + (x % 3);
  const f = FLOORS[style] ?? FLOORS.tileGray!;
  return roomGid(f.col + (x % 3), f.row + (y % 2));
}

// Wall faces are two rows tall; the plain middle column is repeated along the wall.
export const WALL_FACE_ROWS = [5, 7, 9, 11, 13, 15, 17, 19];
export const faceGid = (colorIndex: number, row: 0 | 1) => roomGid(1, WALL_FACE_ROWS[colorIndex % WALL_FACE_ROWS.length]! + row);

// Every floor has its own character: palette, materials and a signature set of props (see the floor-interior-design skill).
export interface Piece { frame: string; dx: number; dy?: number; layer?: 'floor' | 'wall' }
export interface Vignette { name: string; w: number; pieces: Piece[] }
export interface FloorTheme {
  /** short name of the idea behind the floor */
  concept: string;
  /** corridor floor material (FLOORS key) */
  corridor: string;
  projectFloors: string[];
  /** indices into WALL_FACE_ROWS */
  wallFaces: number[];
  /** plate border colour */
  accent: number;
  plants: string[];
  /** hung/leaning along the north wall of corridors */
  wallArt: string[];
  /** furnished set pieces placed along corridors (south side) */
  vignettes: Vignette[];
  /** a long runner along the middle of every corridor: the floor's signature colour */
  runner: string;
  /** the connector's / lobby's signature group */
  centerpiece: Piece[];
}
export const FLOOR_THEMES: Record<string, FloorTheme> = {
  products: {
    concept: 'Maker floor: slate concrete, electric blue, signal orange; prototypes, roadmaps and launch energy',
    corridor: 'mat:slate', runner: 'runner_blue', projectFloors: ['carpetA', 'tileGray', 'carpetC'], wallFaces: [1, 4, 5], accent: 0x6fb3ff,
    plants: ['lz_plant_b', 'lz_plant_b', 'flowerbox'],
    wallArt: ['kanban', 'neon_ship', 'roadmap', 'poster_blueprint', 'whiteboard', 'tv'],
    vignettes: [
      { name: 'showcase', w: 80, pieces: [{ frame: 'runner_blue', dx: 0, dy: -2, layer: 'floor' }, { frame: 'pedestal_device', dx: -16 }, { frame: 'pedestal_device', dx: 16 }] },
      { name: 'maker corner', w: 84, pieces: [{ frame: 'printer3d', dx: -20 }, { frame: 'beanbag_orange', dx: 6, dy: -2 }, { frame: 'beanbag_blue', dx: 26, dy: -2 }] },
      { name: 'snack bar', w: 70, pieces: [{ frame: 'vending', dx: -14 }, { frame: 'cooler', dx: 8 }, { frame: 'lz_plant_b', dx: 26 }] },
    ],
    centerpiece: [{ frame: 'runner_blue', dx: 0, dy: -4, layer: 'floor' }, { frame: 'pedestal_device', dx: -10, dy: -6 }, { frame: 'beanbag_blue', dx: 14, dy: -4 }],
  },
  research: {
    concept: 'Library & observatory: deep violet, brass, parchment; books, stars, instruments',
    corridor: 'mat:parquet', runner: 'runner_violet', projectFloors: ['carpetB', 'carpetC', 'tileGray'], wallFaces: [0, 2, 6], accent: 0xa58bff,
    plants: ['fern', 'fern', 'lz_plant_a'],
    wallArt: ['poster_atom', 'blackboard', 'poster_stars', 'diploma', 'paper_wall', 'lz_shelf_books_a'],
    vignettes: [
      { name: 'reading nook', w: 84, pieces: [{ frame: 'runner_violet', dx: 0, dy: -2, layer: 'floor' }, { frame: 'armchair_violet', dx: -20 }, { frame: 'floor_lamp', dx: 2 }, { frame: 'globe', dx: 24 }] },
      { name: 'lab bench', w: 70, pieces: [{ frame: 'microscope_table', dx: 0 }, { frame: 'fern', dx: -26 }] },
      { name: 'observatory', w: 64, pieces: [{ frame: 'telescope', dx: -8 }, { frame: 'fern', dx: 18 }] },
    ],
    centerpiece: [{ frame: 'runner_violet', dx: 0, dy: -4, layer: 'floor' }, { frame: 'globe', dx: -12, dy: -6 }, { frame: 'armchair_violet', dx: 14, dy: -4 }],
  },
  growth: {
    concept: 'Studio & wellness: terracotta, sage, cream; light wood, plants, calm corners',
    corridor: 'mat:warmwood', runner: 'runner_terracotta', projectFloors: ['carpetD', 'herringbone', 'tileYellow'], wallFaces: [3, 7, 4], accent: 0xf0a060,
    plants: ['indoor_tree', 'flowerbox', 'lz_plant_a'],
    wallArt: ['poster_sun', 'vision_board', 'mandala', 'poster_leaf', 'clock', 'hangplant'],
    vignettes: [
      { name: 'yoga corner', w: 84, pieces: [{ frame: 'yoga_mat', dx: -14, dy: -2, layer: 'floor' }, { frame: 'yoga_mat', dx: 14, dy: -2, layer: 'floor' }, { frame: 'cushion', dx: -14, dy: -4 }, { frame: 'cushion', dx: 14, dy: -4 }] },
      { name: 'tea corner', w: 80, pieces: [{ frame: 'runner_terracotta', dx: 0, dy: -2, layer: 'floor' }, { frame: 'tea_table', dx: 0 }, { frame: 'cushion', dx: -24 }, { frame: 'cushion', dx: 24 }] },
      { name: 'water garden', w: 66, pieces: [{ frame: 'fountain', dx: 0 }, { frame: 'fern', dx: -22 }, { frame: 'fern', dx: 22 }] },
    ],
    centerpiece: [{ frame: 'runner_terracotta', dx: 0, dy: -4, layer: 'floor' }, { frame: 'fountain', dx: 0, dy: -6 }, { frame: 'indoor_tree', dx: 24 }],
  },
};
const THEME_ORDER = ['products', 'research', 'growth'];
export const themeOf = (floorId: string, index = 0): FloorTheme => FLOOR_THEMES[floorId] ?? FLOOR_THEMES[THEME_ORDER[index % THEME_ORDER.length]!]!;

export function hash(s: string): number {
  let n = 7;
  for (let i = 0; i < s.length; i++) n = (Math.imul(n, 31) + s.charCodeAt(i)) | 0;
  return n >>> 0;
}
