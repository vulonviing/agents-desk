---
name: office-art-direction
description: Use when a change affects how the Agents Desk pixel-art office LOOKS: choosing or drawing sprites, floor/wall materials, colours, lighting, shadows, name plates, prop density, or reviewing a screenshot for visual quality. Not for layout rules (office-layout-design) or sprite generation mechanics (pixel-asset-pipeline).
---

# Office art direction (style bible)

Goal: every screenshot reads as one coherent, lived-in office — like the best pixel-art office visualizers
(pixel-agents, claude-office) — not as a grid of unrelated pack sprites.

## Non-negotiables
1. **16 px tiles, one tilt.** Everything is drawn at the same ¾ top-down angle: floor plus the *front face* of furniture.
   Never mix a flat top-view sprite with a front-view one in the same room (Pixelblog #35).
2. **Wall band.** Every room has a 3-row north wall (`NORTH` in `app/src/game/constants.ts`): 2 face rows + baseboard,
   darker than the floor. Windows, shelves, boards and doors hang on it. It creates the depth that stops the floor reading as a flat plane.
3. **Pixel-perfect.** Integer positions, `roundPixels`, nearest-neighbour. No blurred or scaled-fraction sprites; text uses `setResolution(4)` with the pixel font.
4. **One palette per floor theme.** A floor (`office-themes.png`) picks 1 floor material + 1 wall tone + 1 accent. Neighbouring offices differ in
   floor material, not in sprite style. Max ~12 colours of "ink" outside of floors.
5. **Shadows and depth.** Every upright object has a 1–2 px contact shadow (ellipse or baked); depth = foot `y` (see `tiled-map-pipeline`).
6. **Information beats decoration.** A prop must either carry meaning (printer, rack, board — see `smart-objects`) or support the room's purpose
   (shelf, plant). Decor-only props are limited to ≤ 1 per 12 floor tiles.

## Density and rhythm
- Fill walls first (shelves, window, board), floor last. An office of N desks needs: 1 plant per 2 desks, 1 wall prop per 4 wall tiles, 1 rug under a pod (not per desk).
- Leave breathing room: 40–60 % of floor tiles stay empty (walkable). A room that is >70 % furniture reads as clutter.
- Repetition is allowed for desks (that is an office) but vary chair colour, mug, paper stack and monitor state per desk.

## Lighting and atmosphere
- Offline/dormant offices: desaturate ~35 %, dust overlay by `dust` level, monitors off, lamp off. Active: monitors lit (state colour = station status).
- A subtle vignette is allowed at the camera level; never darken whole rooms to hide empty space.
- Day/night belongs to `office-atmosphere`, not to individual sprites.

## Typography
- Pixel font (`FONT` in constants). Plate = dark fill `#151624`, 1 px border `#8f85a9`, white title 8 px, sub-line 6 px. Titles upper-case, truncated with `…`.
- Hierarchy on screen: floor banner (corridor) > office plate (wall top centre) > desk label (only on hover/selection). Never two plates overlapping.

## Reviewing a screenshot (checklist)
- [ ] One tilt, one pixel scale, no blurred edges.
- [ ] Wall band present; nothing floats above the wall or inside it.
- [ ] Heads and monitors never hidden by desks; chairs tuck under desks.
- [ ] No sprite cut by a room edge; plates readable at fit zoom and at 300 %.
- [ ] Palette: floors differ per office, ink colours consistent.
- [ ] ≥ 40 % empty walkable floor; no decor without purpose.
Run this together with `visual-qa` (hard gate).

## Sources of art
Free LimeZu pack (non-commercial, credit required, never publish the repo publicly) + our generated art. Details, naming and licences: `pixel-asset-pipeline`.
If a needed prop does not exist, generate it (consistent palette/size) instead of stretching a mismatched one.

## References (read only when needed)
- `references/palette.md` — hex values per floor theme and plate colours (create when a theme is added).
