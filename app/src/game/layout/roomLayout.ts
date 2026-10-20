import type { Room, Station } from '../../types';
import { NORTH } from '../constants';
import { officeDesign, type Department } from './officeDesign';

// Pure room-interior layout: stations on a grid with one-tile aisles, a social corner on the right, and the
// walkable tile grid used for path finding. Units are tiles.

// A desk set is 3 tiles wide and 3 tall (desk 32 px + mug and papers) with one aisle tile around it: pitch 4.
export const DESK_W = 3;
export const DESK_H = 3;
export const PITCH = 4;


export function gridFor(n: number) {
  const cols = Math.min(n, Math.max(1, Math.min(6, Math.ceil(Math.sqrt(n * 1.3)))));
  return { cols: Math.max(1, cols), rows: Math.ceil(n / Math.max(1, cols)) };
}

export interface PlacedStation {
  station: Station;
  tx: number;
  ty: number;
  seat: { x: number; y: number };
  access: { x: number; y: number };
}
export type SpotKind = 'coffee' | 'cooler' | 'window' | 'sofa';
export interface Spot {
  id: string;
  kind: SpotKind;
  x: number;
  y: number;
}
export interface RoomProp {
  type: 'window' | 'coffee' | 'cooler' | 'sofa' | 'plant' | 'table' | 'whiteboard';
  tx: number;
  ty: number;
  w: number;
  h: number;
}

export interface DepartmentZone extends Department { x: number; y: number; w: number; h: number; doorX: number; doorY: number; coordinator?: boolean }

export interface RoomLayout {
  departments: DepartmentZone[];
  partitions: boolean[][];
  theme: string;
  openPlan: boolean;
  hallY: number;
  coordinatorDesks: { tx: number; ty: number; access: { x: number; y: number } }[];
  tilesW: number;
  tilesH: number;
  cols: number;
  rows: number;
  xs: number;
  stations: PlacedStation[];
  props: RoomProp[];
  spots: Spot[];
  /** true = walkable */
  grid: boolean[][];
  door: { x: number; w: number };
}

const colsFor = (n: number) => Math.min(4, Math.max(2, Math.ceil(Math.sqrt(n * 1.6))));
const COORD_W = 14;
const COORD_H = 12;

export function layoutRoom(room: Pick<Room, 'id' | 'stations'>): RoomLayout {
  const design = officeDesign(room);
  if (room.stations.length <= 6) return compactRoom(room);
  const coordination = { id: 'coordination', name: 'Koordinatör odası', purpose: 'Ofis koordinasyonu ve CLI oturumları.', dress: 'coordination', step: 'K', stations: [] as Station[], color: '#c6b3e3', floor: design.theme === 'music' ? 'carpetD' : 'herringbone' };
  // the coordinator room leads the north band (next to the door); the departments follow, split over two bands
  const groups = [coordination, ...design.departments];
  const split = Math.ceil(groups.length / 2);
  const bands = [groups.slice(0, split), groups.slice(split)];
  const dims = (g: (typeof groups)[number]) => {
    if (g.id === 'coordination') return { cols: 3, rows: 1, w: COORD_W, h: COORD_H };
    const cols = colsFor(g.stations.length);
    const rows = Math.max(1, Math.ceil(g.stations.length / cols));
    return { cols, rows, w: cols * PITCH + 2, h: rows * PITCH + 4 };
  };
  const bandH = bands.map((b) => Math.max(0, ...b.map((g) => dims(g).h)));
  const bandW = bands.map((b) => 1 + b.reduce((n, g) => n + dims(g).w, 0));
  const corridorY = NORTH + bandH[0]!;
  const southY = corridorY + 5;
  const tilesW = Math.max(26, ...bandW) + 1;
  const tilesH = southY + (bands[1]!.length ? bandH[1]! : 0) + 4;
  const stations: PlacedStation[] = [];
  const departments: DepartmentZone[] = [];
  const coordinatorDesks: RoomLayout['coordinatorDesks'] = [];
  const props: RoomProp[] = [];
  bands.forEach((band, bi) => {
    const south = bi === 1;
    const y = south ? southY : NORTH;
    let x = 1;
    for (const g of band) {
      const d = dims(g);
      const h = bandH[bi]!;
      const zone: DepartmentZone = { ...g, coordinator: g.id === 'coordination', x, y, w: d.w, h, doorX: x + d.w - 4, doorY: south ? y : y + h - 1 };
      departments.push(zone);
      if (zone.coordinator) {
        coordinatorDesks.push({ tx: x + 1, ty: y + 3, access: { x: x + 2, y: y + 2 } });
        props.push({ type: 'table', tx: x + 7, ty: y + 3, w: 3, h: 3 }, { type: 'whiteboard', tx: x + 6, ty: y, w: 2, h: 2 }, { type: 'sofa', tx: x + 2, ty: y + h - 3, w: 3, h: 1 });
      }
      g.stations.forEach((station, n) => {
        const tx = x + 1 + (n % d.cols) * PITCH;
        const ty = y + 3 + Math.floor(n / d.cols) * PITCH;
        stations.push({ station, tx, ty, seat: { x: tx + 1, y: ty }, access: { x: tx + 1, y: ty - 1 } });
      });
      props.push({ type: 'plant', tx: x + 1, ty: y + h - 2, w: 1, h: 1 });
      x += d.w;
    }
  });
  const partitions = Array.from({ length: tilesH }, () => Array<boolean>(tilesW).fill(false));
  for (const z of departments) {
    for (let y = z.y; y < z.y + z.h; y++) for (let x = z.x; x < z.x + z.w; x++) {
      if (x === z.x || x === z.x + z.w - 1 || y <= z.y + 1 || y === z.y + z.h - 1) partitions[y]![x] = true;
    }
    for (let x = z.doorX; x <= z.doorX + 1; x++) {
      partitions[z.doorY]![x] = false;
      if (z.doorY === z.y) { partitions[z.y + 1]![x] = false; partitions[z.y + z.h - 1]![x] = false; }
    }
  }
  const xs = tilesW - 8;
  props.push(
    { type: 'window', tx: tilesW - 5, ty: 0, w: 2, h: 2 },
    { type: 'coffee', tx: 2, ty: corridorY, w: 3, h: 2 },
    { type: 'cooler', tx: tilesW - 3, ty: corridorY + 2, w: 1, h: 1 },
    { type: 'sofa', tx: tilesW - 7, ty: tilesH - 2, w: 3, h: 1 },
    { type: 'plant', tx: tilesW - 2, ty: tilesH - 2, w: 1, h: 1 },
  );
  const spots: Spot[] = [
    { id: 'coffee', kind: 'coffee', x: 2, y: corridorY + 2 },
    { id: 'cooler', kind: 'cooler', x: tilesW - 4, y: corridorY + 2 },
    { id: 'window', kind: 'window', x: Math.floor(tilesW / 2), y: tilesH - 2 },
    { id: 'sofa', kind: 'sofa', x: tilesW - 6, y: tilesH - 3 },
  ];
  const grid = Array.from({ length: tilesH }, (_, y) => Array.from({ length: tilesW }, (_, x) => y >= NORTH && x >= 1 && x < tilesW - 1 && y < tilesH - 1 && !partitions[y]![x]));
  const block = (x: number, y: number, w: number, h: number) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (grid[j]?.[i] !== undefined) grid[j]![i] = false;
  };
  for (const s of stations) block(s.tx, s.ty, DESK_W, DESK_H);
  for (const s of coordinatorDesks) block(s.tx, s.ty, DESK_W, DESK_H);
  for (const p of props) if (p.type === 'cooler' || p.type === 'sofa' || p.type === 'plant' || p.type === 'table') block(p.tx, p.ty, p.w, p.h);
  const rows = bands.reduce((n, b, i) => n + (b.length ? Math.max(...b.map((g) => dims(g).rows)) : 0) * (i ? 1 : 1), 0);
  return { tilesW, tilesH, cols: 4, rows, xs, stations, props, spots, grid, door: { x: 4, w: 2 }, departments, partitions, theme: design.theme, openPlan: false, hallY: corridorY, coordinatorDesks };
}

// Small projects share one room: a block of desks, the coordinator desk beside it and the social corner.
function compactRoom(room: Pick<Room, 'id' | 'stations'>): RoomLayout {
  const design = officeDesign(room);
  const tilesW = 26;
  const rows = Math.max(1, Math.ceil(room.stations.length / 3));
  const tilesH = Math.max(14, NORTH + 1 + rows * PITCH + 3);
  const stations = room.stations.map((station, i) => {
    const tx = 2 + (i % 3) * PITCH, ty = 4 + Math.floor(i / 3) * PITCH;
    return { station, tx, ty, seat: { x: tx + 1, y: ty }, access: { x: tx + 1, y: ty - 1 } };
  });
  const coordinatorDesks = [{ tx: 18, ty: 4, access: { x: 19, y: 3 } }];
  const props: RoomProp[] = [{type:'coffee',tx:18,ty:0,w:2,h:2},{type:'cooler',tx:24,ty:9,w:1,h:1},{type:'sofa',tx:20,ty:tilesH-2,w:3,h:1},{type:'plant',tx:24,ty:tilesH-2,w:1,h:1},{type:'table',tx:21,ty:4,w:3,h:3},...(design.theme==='checker'?[{type:'table' as const,tx:10,ty:8,w:3,h:3}]:[])];
  const spots: Spot[] = [{id:'coffee',kind:'coffee',x:18,y:3},{id:'cooler',kind:'cooler',x:23,y:9},{id:'window',kind:'window',x:17,y:3},{id:'sofa',kind:'sofa',x:21,y:tilesH-3}];
  const grid = Array.from({length:tilesH},(_,y)=>Array.from({length:tilesW},(_,x)=>y>=NORTH && y<tilesH-1 && x>0 && x<tilesW-1));
  for (const s of [...stations,...coordinatorDesks]) for(let y=s.ty;y<s.ty+DESK_H;y++)for(let x=s.tx;x<s.tx+DESK_W;x++)grid[y]![x]=false;
  for(const p of props)if(p.type!=='coffee')for(let y=p.ty;y<p.ty+p.h;y++)for(let x=p.tx;x<p.tx+p.w;x++)grid[y]![x]=false;
  const departments: DepartmentZone[] = [{id:'shared',name:design.theme==='checker'?design.departments[0]!.name:'Ortak çalışma odası',purpose:'Koordinasyon ve uzmanlar aynı çalışma alanında.',dress:design.departments[0]!.dress,step:'',stations:room.stations,color:design.accent,floor:design.departments[0]!.floor,x:1,y:0,w:tilesW-2,h:tilesH-1,doorX:2,doorY:tilesH-1}];
  return {tilesW,tilesH,cols:3,rows,xs:18,stations,props,spots,grid,departments,partitions:Array.from({length:tilesH},()=>Array(tilesW).fill(false)),door:{x:16,w:2},theme:design.theme,openPlan:true,hallY:tilesH-4,coordinatorDesks};
}
