---
name: building-shell
description: Use when changing the building and floor SHELL of the Agents Desk office: the floor plan (wings, corridors, connector), service rooms per floor, the building entrance/lobby, elevator or stairs, floor-to-floor navigation, the master manager's permanent office, and the floor → office → room signage hierarchy. Not for what is inside an office (office-layout-design).
---

# Building shell

Goal: the building reads as one real place: you arrive at an entrance, ride to a floor, walk a corridor, enter an office.
Hierarchy everywhere (code, UI, signage): **building → floor (kat) → office (ofis, = project) → room (oda, = skill area)**.

## What exists (read before changing)
- **Read `architectural-planning` first.** `app/src/game/layout/floorLayout.ts` — `layoutFloor(floor, floorIndex)`: small floors = two rows of offices around ONE corridor; large floors (≥ 9 rooms) = three rows, TWO corridors (`SPINE_H`) and a central connector (`CONNECTOR_W`) between them.
  Every office opens onto a corridor through a `door` rect; services (`SERVICES` per floor index) are spread between offices; office size comes from `officeSize()` (desks), never stretched; short rows and ragged edges = outside space (`terrace`, `outside`).
- Floor character (concept, palette, materials, wall art, set pieces) lives in `FLOOR_THEMES` (`maps/catalog.ts`) and is governed by the `floor-interior-design` skill. Each floor must look different. The elevator stands in the axis of the central connector (mid-corridor on small floors), the stairs far from it on the last corridor's south wall, and offices next to the connector have a second doorway onto it.
- The app opens in the **Master's furnished office** (default view); one toolbar has Master, floor navigation and CLI selection (`.agents/architecture.md`). Floor footprints are viewport-aware wings; long entrance/lounge strips and reception desks were deliberately removed — keep any lobby/elevator **compact** (no new long strips).
- `app/src/game/maps/floorMap.ts` — builds the Tiled-compatible map of a floor; `masterMap.ts` — the master manager's permanent office
  (`MASTER_ID = 'manager:master'`); `officeDesign.ts` — per-office design data.
- `OfficeScene` draws signs: office plates (wall top centre), corridor banner "<KAT> KATI · N ofis · M ajan", office view plate "Kat › Ofis".

## Target shell (build toward this, one slice at a time)
1. **Entrance/lobby** (compact, ground level): doorway and a floor directory board next to the Master's office; session sims may arrive here (see `agent-lifecycle`). No long strips, no reception-desk filler.
2. **Vertical circulation**: elevator (and/or stairs) in the connector. Selecting a floor tab animates "going up"; characters can use the elevator between floors.
3. **Floor shell**: exterior wall, corridors through the middle of the plan, the elevator and floor plaque on the first corridor's north wall.
   **Circulation (hard rule):** corridors are in the middle with offices on both sides; no side gutters, no 1-tile gaps, no corridor that only exists at an edge. Large floors link their two corridors with a wide central connector. Corridors ≥ 5 tiles; the middle lane stays clear.
4. **Service rooms** per floor are fixed in kind but sized to content: meeting, kitchen/garden, server/archive. Kitchen is the social heart (see `smart-objects`).
5. **Doors**: every office opens on a corridor; door position is deterministic from the room; corridor-side approach tile always free.

## Rules
- Layout functions stay **pure** (floor in → plan out). Same input → same plan. No randomness, no DOM/Phaser inside `layout/`.
- **No enclosed rooms.** Every walkable tile (and every furnished space) must be reachable from the spine; outside space is empty and walled, never decorated. Flood-fill test required.
- Look at the circulation as a visitor would: one obvious path, every room has a visible door.
- Aspect: plans target the viewport (`targetAspect`); never produce a single endless corridor.
- Signage: floor banner > office plate > room/desk label. One plate per office, never overlapping a door or window.
- There is exactly one Master and **no floor managers**; floors are destinations, not another management layer (AGENTS.md). Offices have their own coordinators.
- Dormant offices keep their place (dust, lights off); never hide or reorder offices by activity.
- Nothing in the shell may depend on emrecan-vps being run; it is a normal, read-only office.

## Checks (must pass before "done")
- Unit tests for the plan (one/two corridors, connector centred and linking both, content-sized offices, no stretching, reachability): no overlapping rects, every door on a corridor, full connectivity, deterministic output, sensible aspect for 4/9/12 offices,
  one spine ≥ 5 wide, rooms on both sides, doors facing the spine, and a flood fill from the spine reaching every walkable tile (see `game.test.ts` "ONE central corridor" and `maps.test.ts` "every walkable tile is reachable").
- `visual-qa` screenshots of every floor (4, 9 and 12 offices) at fit zoom, and the entrance/elevator once they exist.
- Judge with `office-art-direction` (wall band, plates, palette) and `office-ui-hud` (banner/plate readability).

## Read when needed
- Interiors → `office-layout-design`. Map JSON/collision/depth → `tiled-map-pipeline`. Visitors and arrivals → `agent-lifecycle`.

## Useful circulation
Do not add a corridor merely to border a room or repeat an existing route. Every strip must connect a real destination; avoid unused perimeter gutters at floor and office levels.
