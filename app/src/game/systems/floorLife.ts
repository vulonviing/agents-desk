import type { Point } from '../constants';
import type { RoomLayout, PlacedStation, Spot } from '../layout/roomLayout';
import type { Station } from '../../types';
import { propsOf, type TiledMap } from '../maps/tiled';
export interface FloorHome { id: string; seat: Point; access: Point }
export function nearestFree(grid: boolean[][], point: Point): Point {
  const x=Math.round(point.x),y=Math.round(point.y);
  for(let d=0;d<10;d++)for(let dy=-d;dy<=d;dy++)for(let dx=-d;dx<=d;dx++) {
    if(Math.abs(dx)+Math.abs(dy)!==d)continue;
    if(grid[y+dy]?.[x+dx])return {x:x+dx,y:y+dy};
  }
  return {x,y};
}
/** The floor uses the same movement/needs system as offices; walls and doors come from Tiled. */
export function floorWalkLayout(map: TiledMap, homes: FloorHome[]): RoomLayout {
  const collision=map.layers.find(l=>l.name==='collision');
  if(collision?.type!=='tilelayer')throw new Error('Floor collision layer is missing');
  const grid=Array.from({length:map.height},(_,y)=>Array.from({length:map.width},(_,x)=>!collision.data[y*map.width+x]));
  const layer=map.layers.find(l=>l.name==='spots');
  const spots:Spot[]=layer?.type==='objectgroup'?layer.objects.map(o=>{const p=propsOf(o);return {id:o.name,kind:String(p.kind) as Spot['kind'],...nearestFree(grid,{x:Number(p.tx),y:Number(p.ty)})};}):[];
  const stations:PlacedStation[]=homes.map(h=>({station:{id:h.id} as Station,tx:h.seat.x,ty:h.seat.y,seat:nearestFree(grid,h.seat),access:nearestFree(grid,h.access)}));
  return {grid,spots,stations,tilesW:map.width,tilesH:map.height,cols:1,rows:1,xs:0,door:{x:1,w:2},props:[],departments:[],partitions:[],theme:'floor',openPlan:true,hallY:0,coordinatorDesks:[]};
}
