---
name: office-layout-design
description: Use when changing the INSIDE of an office or room in the Agents Desk pixel-art view: office size, office type, desk pods and pitch, zones/departments, walls, doors, walkways, where furniture and social spots go. Not for the building/floor shell (building-shell) or for how things look (office-art-direction).
---

# Office layout design

Goal: an office looks like a place people work in — sized by its content, zoned by purpose, easy to walk through —
not a grid of furniture on a carpet. Skills are grouped into purpose-based departments (`app/src/game/layout/officeDesign.ts`); partitions, open doors and both corridors participate in pathfinding. Layout is **pure, rule-based, and tested** (`app/src/game/layout/roomLayout.ts`,
`app/src/game/maps/{roomMap,furniture,catalog}.ts`).

## Measurements (16 px tiles; constants live in `layout/roomLayout.ts` and `constants.ts`)
- Desk set = `DESK_W x DESK_H` = 3x3 tiles (desk, chair, monitor, mug, papers). Pitch `PITCH` = 4 tiles both ways, so one aisle tile separates desks.
  The **access tile** is the aisle tile directly north of the chair.
- North wall = `NORTH` (3) rows. Walkways ≥ 1 tile; corridors ≥ 2. Never block a door tile or its approach tile.
- Zone width = `cols * PITCH + 2`; height = `rows * PITCH + NORTH + 2`. After placement a zone may keep at most 3 empty rows / 6 empty columns.

## Office types (pick by content, not by a fixed size)
| Type | When | Contents |
|---|---|---|
| solo | 1 station | 1 desk, shelf, plant, window; small room, never padded |
| team | 2–8 stations | 1–2 pods (rows of 2–4), whiteboard, 1 plant per 2 desks |
| lab | 9+ stations | 2+ pods in zones, central aisle, shelves + server rack, break nook |
| coordinator | every office | desk/corner for the office coordinator; ≤ 6 stations share one compact room, larger suites get a coordinator room with shared desks |
| meeting | service | table + chairs (capacity = chairs), screen/board |
| kitchen | service | coffee, cooler, table, fridge; the main social spot |
| server/archive | service | racks, printer, filing cabinets |

## Rules
0. Architectural logic comes first (`architectural-planning`): every room has a door onto circulation; no unreachable furnished space.
1. **Content decides size — never pad.** An office is exactly what its desks need: `officeSize()` in `layout/floorLayout.ts`
   (width = max(10, cols·5+3), height = 4 + rows·5; ≤ 6 desks drawn, 3 columns max). 3 desks = one row = 18×9, not a tall hall.
   **Never stretch a room to fill a row, column or leftover space.** Leftover goes to outside space/façade, a service room, a garden or the corridor — never to an oversized empty office.
   Rule of thumb: desks cover ≥ 30 % of the office interior; if more than ~half of a room's floor is empty, the layout is wrong.
2. **Pods.** Desks come in rows of 2–4 sharing one floor patch; rows align on `PITCH`. Never a rug per desk.
3. **Zones.** Group by purpose (work / meet / store / break) with a visual cue (rug, floor tone), not walls only. Entry side is always the door side.
4. **Door and flow.** Door sits on the corridor side; a straight 1-tile path from the door to the first pod; the aisle is kept clear of furniture.
5. **Wall furniture follows purpose** (board, shelf, window, plate) and never overlaps the name plate (top centre) or the door.
6. **Social spots on the route.** Coffee/cooler/sofa sit between work zones and the door, each with an access tile and capacity (see `smart-objects`); not in a far corner.
7. **Reachability.** Every station and every spot is reachable from the door (A*, `systems/pathfinding.ts`), also with characters at their seats.
8. **Determinism.** Layout is a pure function of the room (stations, kind); same input → same output. No `Math.random` in layout.

## Rooms (oda) inside an office (ofis)
- Departments of a large office are rooms with a door, a plate and a dress (`officeDesign.ts` → `Department.dress/step`, `maps/roomDress.ts`). Order rooms by the workflow they serve and number them.
- A one-room office (≤ 6 stations) is one open room with a dress too (e.g. cv-checker); put a central piece (table, instruments) where the floor would otherwise be empty — empty central floor is the same mistake as a padded office.
- Dress and decoration direction: `floor-interior-design` (kat → ofis → oda).

## Checks (must pass before "done")
- Unit tests (`app/src/game/maps/maps.test.ts`, `game.test.ts`: "no padded offices", "no stretched office"): no overlapping desk cells, all access tiles walkable, all spots reachable, pitch/measure constants, empty-area limits per zone, determinism.
- Add a test for every new rule (a rule without a test is a wish).
- Screenshots of the smallest (1 station), a medium (6–10) and the biggest office (Emrecan CV, 17+) via `visual-qa`; judge them with `office-art-direction`'s checklist.

## Read when needed
- Changing the floor or building around offices → `building-shell`.
- Adding a new object or behaviour → `smart-objects`.
- New furniture sprite or map layer → `pixel-asset-pipeline`, `tiled-map-pipeline`.
