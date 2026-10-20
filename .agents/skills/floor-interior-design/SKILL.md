---
name: floor-interior-design
description: Use when decorating ANY level of the Agents Desk building — floor (kat), office (ofis) or room (oda): corridors and connector, each level's concept, colour palette, materials (floor tiles, carpets, runners, wall colours), wall art, set pieces, signature props, room dresses, and when adding a new theme, dress or decoration sprites. Creative direction (the look and story), not circulation (architectural-planning) or room geometry (office-layout-design).
---

# Interior design for floors, offices and rooms (decoration with a concept)

The same method applies at all three levels: **concept → palette → material → art → set pieces**. Floors use `FLOOR_THEMES`; offices and rooms use `officeDesign.ts` + room dresses (`maps/roomDress.ts`).

Goal: walking from one floor to another must feel like entering a different place with its own spirit — in one glance and without reading a sign.
Architecture (`architectural-planning`) decides where things go; this skill decides **what the place feels like**. Never trade circulation for decoration.

## 1. Every floor has a concept (one sentence) and four layers
Write the concept first (`FloorTheme.concept` in `app/src/game/maps/catalog.ts`), then express it in four layers, strongest first:
1. **Palette** — 1 dominant, 1 supporting, 1 accent colour. Never the same dominant colour on two floors.
2. **Materials** — corridor floor (generated seamless patterns `theme-floors.png`, keys `mat:*`), the runner (a coloured lane down the corridor), wall-face colours (`wallFaces`), plate accent (`accent`).
3. **Wall art** (`wallArt`) — what hangs on the corridor's north wall: art that tells the floor's story (posters, boards, charts, boards of ideas).
4. **Set pieces / vignettes** (`vignettes`, `centerpiece`) — small furnished scenes with a purpose, placed along the corridor and in the connector.

| Floor | Concept | Palette | Materials | Signature pieces |
|---|---|---|---|---|
| Ürünler (products) | Maker floor: prototypes, roadmaps, launch energy | slate grey, electric blue, signal orange | slate tiles, blue runner | kanban, roadmap, neon "SHIP", blueprint, device pedestals (showcase), 3D printer + beanbags (maker corner), vending (snack bar) |
| Araştırma (research) | Library & observatory | deep violet, brass, parchment | dark violet parquet, violet runner | atom/star posters, blackboard, diplomas, paper wall, reading nook (armchair, lamp, globe), lab bench (microscope), telescope, ferns |
| Kişisel Gelişim (growth) | Studio & wellness | terracotta, sage, cream | warm light wood, terracotta runner | sun/leaf posters, vision board, mandala, hanging plants, yoga corner, tea corner, water garden (fountain), indoor trees |

New floor → new concept, palette, material, runner, wall art and ≥ 3 vignettes. If it can be confused with another floor in a thumbnail, it is not distinct enough.

## 1b. Kat → ofis → oda: the concept flows down
- **Kat (floor)** sets the palette and materials of corridors and halls (`FLOOR_THEMES`). The office hall inside an office uses the floor's corridor material and runner, so entering an office still feels like the same floor.
- **Ofis (office)** has its own story (Emrecan CV = the application pipeline; cv-checker = a review laboratory) expressed through its rooms.
- **Oda (room)** has its own identity inside the office: a **dress** (`maps/roomDress.ts`) = floor material, wall colour, back-wall art and corner pieces. **No two rooms of one office share a floor material.** Rooms of a pipeline are numbered on their plates in workflow order (`1 ▸ İlan radar odası`, `2 ▸ CV atölyesi`, …); coordination (K) and support (D) rooms carry no number.
- Dress rooms by what happens in them: radar (radar screen, map with pins, job board), tailor (CV drafts board, tape measure, mannequin, fabric rolls), letters (quote wall, typewriter desk, lamp, letters), delivery (checklist, mailboxes, stamp desk, parcel shelf), archive (shelves, cabinets, scanner), checker (resume wall, score board, review table with magnifier and scanner).
- New office or room kind → add a dress (and sprites in `gen-decor.mjs`), never reuse a neighbour's.

## 2. Principles that make it look designed (not scattered)
- **Rhythm**: along a corridor alternate art (north) and set pieces (south) at a steady pitch (~88 px); repeat a motif 2–3 times with variation, never the same sprite back to back.
- **Hierarchy**: one focal point per space (the connector centerpiece, the elevator lobby); supporting pieces are smaller and quieter.
- **Layering**: floor material → runner → rugs → furniture → wall art → plants. Each layer visible in a screenshot.
- **Story**: every prop is a believable item of that floor's work (research: instruments, papers; products: prototypes, boards; growth: calm, nature, reflection).
- **Biophilic touch** on every floor (plants chosen per theme: ferns, snake plants, indoor trees) — nature softens corridors and aids wayfinding.
- **Functional art**: murals/boards double as wayfinding (floor plaque by the elevator, stairs plate, theme colour on plates).
- **Restraint**: ≥ 40 % of corridor floor stays empty; the middle lane is walkable; never block doorways (keep 18 px clearance), the connector or the elevator/stairs.
- **Texture over noise**: prefer one material with subtle variation to many competing patterns.

## 3. Doing it in code
- Themes: `FLOOR_THEMES` / `themeOf(floorId, index)` in `maps/catalog.ts`. Placement: `decorateCorridor`, `decorateConnector`, `decorateLobby` in `maps/floorMap.ts` (reads the theme only; no per-floor `if`s).
- Sprites: generated in `app/scripts/gen-decor.mjs` (registered by `gen-assets.mjs`); materials in `buildThemeFloors()`. Follow `pixel-asset-pipeline` (16 px grid, palette per theme, deterministic) and `office-art-direction`.
- A piece is `{ frame, dx, dy?, layer? }` relative to the vignette's centre/bottom; rugs and runners use `layer: 'floor'`.
- Keep placement deterministic (no random): same floor → same dressing.

## 4. Checks (must pass before "done")
- Interiors: test "office interiors" — rooms of an office have distinct floor materials, pipeline steps 1–4 in order, every dress uses real atlas frames.
- Test "every floor has its own character": distinct corridor material, runner and accent; ≥ 5 wall-art frames and ≥ 3 vignettes per theme; every frame exists in the atlas; elevator and stairs present.
- `visual-qa` screenshots of **all floors**, side by side mentally: can you name each floor's concept without reading? Are doors, connector and lane clear? Is any sprite clipped, floating or overlapping a plate?
- Review ritual: (1) concept in one sentence, (2) three colours, (3) one material, (4) one focal point, (5) one story prop per 10 tiles.

## Inspiration used
Biophilic corridors (plants, natural motifs), functional murals and wayfinding graphics, textured finishes and framed art as focal points, themed zones in workplace design (research/library, product showcase, wellness).

## Read when needed
- Circulation, access, sizes → `architectural-planning`, `building-shell`. Sprite mechanics → `pixel-asset-pipeline`. Look and finish → `office-art-direction`.

## Living space before decorative space
Decoration does not justify an unused corridor. Preserve the liked floor → office → room identity while removing redundant strips; keep social areas purposeful and accessible.
