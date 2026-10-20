---
name: tiled-map-pipeline
description: Use when changing how Agents Desk maps are built or consumed: the Tiled-compatible JSON produced by app/src/game/maps/tiled.ts (MapBuilder), tile and object layers, collision, object properties, depth/sorting rules, tilesets/catalog GIDs, and the map tests.
---

# Tiled map pipeline

Goal: maps are data (Tiled JSON), generated from pure layout functions, loaded by Phaser, and checkable by tests — and openable in Tiled for inspection.

## Pipeline
`layout/*.ts` (pure plan) → `maps/{floorMap,roomMap,masterMap}.ts` (use `MapBuilder` in `maps/tiled.ts`, `catalog.ts` GIDs, `furniture.ts` placers)
→ Tiled JSON → `cache.tilemap.add(key, TILED_JSON)` in `OfficeScene` → tile layers + sprites from object layers.

## Layers (stable names)
- Tile layers: `ground`, `walls`, `collision` (invisible; blocks pathfinding). Object layers: `furniture`, `desks`, `zones` (rooms/departments with `roomId`, `kind`, `name`), `spots` (social spots), optional `spawns`.
- Point objects are bottom-centre anchored; properties: `frame`, `role`, `depth`, `layer` (`floor`|`wall`), `anim`. Station desks carry `stationId`/`roomId`.

## Rules
1. **One source of truth**: collision comes from the map's `collision` layer; pathfinding reads it. Never hard-code blocked tiles in the scene.
2. **Depth = foot y**, except explicit `depth` overrides (monitors above desk, chair behind character, plates 5000, banner 0.6). Document every override in `furniture.ts`.
3. **Floor sprites** (`layer: 'floor'`) always draw under characters; wall props over the wall band, under plates.
4. **GIDs only via `catalog.ts`** (`floorGid`, `wallGid`, `faceGid`, `COLLISION_GID`); tilesets are generated PNGs, margin/spacing 0 unless the pack needs it.
5. **Deterministic**: same plan → identical JSON (stable object ids, sorted layers).
6. **Tiled-compatible**: valid `tilesets`, `layers`, `properties` arrays so the JSON opens in Tiled; keep `infinite: false`, `orientation: 'orthogonal'`, tile 16.
7. Map size matches `layoutFloor`/`layoutRoom` tiles (+ margins); camera bounds come from it.

## Checks (must pass before "done")
- `app/src/game/maps/maps.test.ts` extended per change: layer names/sizes, every object frame exists in the atlas, no object outside map bounds, collision matches walls/furniture, all `spots` and desk access tiles walkable, deterministic JSON (stringify twice equal).
- Optional: dump a map to JSON and open in Tiled when debugging.
- `visual-qa` for anything that changes how a map looks.

## Read when needed
- What goes where → `office-layout-design`, `building-shell`. Sprites → `pixel-asset-pipeline`.
