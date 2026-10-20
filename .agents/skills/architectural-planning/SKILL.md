---
name: architectural-planning
description: Use BEFORE designing or changing any floor plan, building shell or office arrangement in Agents Desk, to apply real architectural reasoning: circulation (one legible central corridor, double-loaded plan), access and egress (no enclosed room without a door), adjacency of functions, proportions, daylight, structural logic and wayfinding. Read first, then use building-shell / office-layout-design for the concrete rules.
---

# Architectural planning (think like an architect, then draw)

Goal: floors that a visitor would call "a real office building" at first glance. Pretty furniture cannot rescue a plan that is illogical.
Method: decide the **circulation** first, then the rooms around it, then the furniture. Never the other way round.

## 1. Circulation first
- Primary circulation = the **central corridor (spine)**: continuous, direct, readable without signs, running the full length of the floor and ending at a landmark (elevator/lobby, window).
- **Double-loaded plan**: offices on BOTH sides of the one spine, each opening onto it. No wings, no side gutters, no loops that exist only because the generator produced them.
- The core (elevator, later stairs/WC) sits at the spine's end; the floor plaque hangs there so arrival is obvious.
- Corridor width ≥ 5 walkable tiles here (it carries everyone); the middle lane stays free of furniture; doors never open into furniture.

## 2. Access and egress (hard rules, testable)
- **Every room has a door onto circulation.** No enclosed space (garden, "light well", storage) may be furnished or occupiable unless it is reachable. Unreachable areas are either outside space or solid; never a decorated room nobody can enter.
- Doorways are ≥ 2 tiles tall (≥ 1.5 m reads as a door) in the wall facing the spine, never in a corner and never in the exterior wall.
- Every walkable tile on a floor is reachable from the spine (flood-fill test). A second way out (stairs) is required once the floor exceeds the stairs rule — until stairs exist, say so in the report.
- Dead ends longer than ~6 tiles are not allowed except at the elevator end.

## 2b. Plan types by size (the corridor stays in the middle)
- **Small floors (≤ 8 rooms):** two rows of offices with ONE corridor between them.
- **Large floors (≥ 9 rooms):** three rows with TWO corridors, joined by a **central connector** (≥ 5 tiles) that splits the middle row into a left and a right half. The footprint stays a compact rectangle (aspect ≈ 0.6–2.6), never a long strip.
- The middle row touches both corridors, so it only takes standard-height rooms; tall offices go to the outer rows. A row that ends early leaves outside space beyond it (stepped façade), not an enlarged room.

## 2c. Area efficiency (no padding)
- **Content decides size.** Rooms are sized by what they hold. Never enlarge an office to even out a row or column; absorb leftovers with outside space, gardens/service rooms or circulation.
- An office with ≤ 3 desks is small (≈ 18×9 tiles). A big empty room is an architectural error, as bad as a room without a door.

## 2d. Each floor has its own character
- Floors differ in finishes and furniture, not in logic: floor materials, wall colours, plate accent, corridor plants/wall items and one seating nook (`FLOOR_THEMES` in `maps/catalog.ts`). Products = cool/technical, Research = library/academic, Personal growth = warm/home.
- A new floor gets a theme entry; two floors must never look identical. The creative direction (palette, materials, wall art, set pieces) is in `floor-interior-design`.

## 3. Adjacency and zoning
- Group by function along the spine: work offices together, meeting rooms near the core, **kitchen/social at the middle** of the spine (people cross paths there), quiet archive/server away from the kitchen.
- Services are spread along the spine, not stacked at one end. Large offices do not sit next to each other if a service room can separate them.
- Public (corridor, meeting, kitchen) → semi-public (team offices) → private (solo/manager). Depth of the plan follows that order away from the core.

## 4. Proportions and structure
- Offices are rectangles with a plausible aspect (≤ 2:1), widths in whole structural bays (here multiples of 2 tiles), one common spine-side wall line, ragged exterior wall allowed only where it reads as a stepped façade (outside space beyond it).
- Wall thickness is consistent (1 tile partitions, 3-row north face). No wall pieces that end in the middle of nowhere.
- The ratio of circulation to floor area stays reasonable (~15–25 %). A huge empty corridor is as wrong as no corridor.

## 5. Daylight and façade
- Rooms on the exterior carry windows on the exterior wall; the interior side opens onto the spine. Outer façades are continuous walls, never open edges.
- Dormant or dark rooms are still rooms (lights off), not holes.

## 6. Wayfinding
- Floor plaque at the core; office plates on the room's wall (readable at fit zoom through counter-scaling); consistent order (kat → ofis → oda).
- Landmarks: elevator at one end, kitchen mid-spine, windows at the other end. A visitor should find "kitchen" and "exit" without a sign.

## Review ritual (do this on every floor-plan change, write 3 lines in the report)
1. Draw the circulation: where does a person arrive, walk, turn? Is there exactly one obvious path?
2. For each room ask "how do I get in?" — point at the door.
3. Squint at the screenshot: does it look like a building you could draw a fire-escape map of?

## Checks (tests; see `app/src/game/game.test.ts`, `maps/maps.test.ts`)
- Small floors: one corridor; large floors: two corridors + central connector (`CONNECTOR_W`); every door in a wall touching a corridor; aspect within bounds.
- Flood fill from the spine reaches every walkable ground tile (no enclosed rooms).
- Offices equal `officeSize()` (no stretching), desks fill ≥ 30 % of an office, rows have no gaps, deterministic output.
- `visual-qa` screenshots of every floor plus the review ritual above.

## Read when needed
- Concrete shell rules → `building-shell`. Interior of offices → `office-layout-design`. Look and finish → `office-art-direction`.
- Background used for these rules: double-loaded corridors, primary circulation/core logic and egress (workplace design references).
