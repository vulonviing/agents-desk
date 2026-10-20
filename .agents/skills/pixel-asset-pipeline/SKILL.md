---
name: pixel-asset-pipeline
description: Use when generating, adding, cropping or renaming sprites for the Agents Desk office: app/scripts/gen-assets.mjs, the props atlas, LimeZu crops (lz_*), wall/collision tiles, character variants, animation frames, palette and size rules, and asset licences/credits.
---

# Pixel asset pipeline

Goal: every sprite is reproducible, consistently sized and legally clean. Art style rules live in `office-art-direction`; this skill is the mechanics.

## Where assets come from
- **Generated** by `app/scripts/gen-assets.mjs` (pngjs, runs in `npm run build` before tsc): props atlas (`props.png/json`: monitors by state, desks, keyboard, mug, papers,
  chair, racks, printer, cooler, coffee, boards, bubbles…), `walls.png` autotiles (mask N+2E+4S+8W), `collision.png`, `characters/*.png` + `variants.json`.
- **LimeZu free pack** (Room_Builder, Interiors) copied under `app/public/assets/limezu/` with `LICENSE.txt`, `README.txt`, `CREDITS.md`; cropped into the atlas as `lz_*`.
  Licence: **non-commercial only, credit required, do not publish the repo or assets publicly.** Keep `CREDITS.md` current; never copy paid-pack files into the repo.
- Generated art is ours; document it in `CREDITS.md` ("generated").

## Rules
1. **16 px grid.** Props are multiples of 16 in the footprint; characters 16×32 frames, 24 columns, rows run / idle / sit / phone; run order right, up, left, down × 6.
2. **Naming contract**: lower snake case, `<kind>_<variant>[_<state|frame>]` (`monitor_code`, `rack_1`, `lz_plant_a`, `bubble_zzz_1`). Names are referenced from `maps/catalog.ts` and `furniture.ts`; renaming = update all uses + tests.
3. **Palette**: draw from the floor-theme palette (`office-art-direction`); no anti-aliasing, no semi-transparent edges except shadows (max alpha 0.35). New colours need a reason.
4. **States are frames**, not tints: monitor off/code/think/chart/error/done/idle; objects with info (printer, rack) get an *on* and an *off* frame.
5. **Animations**: ≤ 6 frames, defined in `game/assets.ts` (`${variant}:run-<dir>`, `idle-<dir>`, `sit`, `phone`, bubbles). New pose → new row/frames + animation key + test that the key exists.
6. **Deterministic output**: running `gen-assets` twice yields identical files (no timestamps/randomness without a seed).
7. **Hue variants** for characters come from `variants.json` (16 now); name characters after skills/projects, never humans.
8. **Size budget**: the whole atlas < 1 MB; no single sprite > 64×64 except buildings/rugs.

## Checks (must pass before "done")
- `npm run build` in `app/` passes (gen-assets + tsc + vite).
- Test: every atlas frame used by `catalog.ts`/`furniture.ts`/`assets.ts` exists in `props.json`; no duplicate names; frame sizes are multiples of the grid where required.
- Contact sheet: render a PNG of the atlas and view it (`visual-qa`), including every state of monitors/printer/rack.
- `CREDITS.md` and `LICENSE.txt` still match what is shipped.
