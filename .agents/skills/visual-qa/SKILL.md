---
name: visual-qa
description: MANDATORY before calling any visual or game change to the Agents Desk office "done" (layout, sprites, furniture, characters, signs, HUD, camera, lifecycle). Playwright screenshot protocol, checklist, performance budget and what to report.
---

# Visual QA (hard gate)

No visual/game change is finished until this has run. Say plainly what was and was not checked.

## 1. Set up (never the real emrecan-vps)
- `cd app && npm run build`, then run the desk with demo data: `DESK_CONFIG=<demo config> DESK_CLAUDE_BIN=test/fake-claude.mjs node server/server.js`
  (demo config/fake CLI patterns: see `test/fake-claude.mjs`, `test/server.test.js`). Scratch files go in the session scratchpad, not `/tmp`.
- Playwright: viewport 1440×900 (desktop) and 390×844 (mobile).

## 2. Shots to take (each **after** `waitForTimeout(2500)`; the first frame after navigation can be blank — screenshot twice if blank)
| # | Scene | Why |
|---|---|---|
| 1 | Every floor at fit zoom (4, 9, 12 offices) | shell, plates, banner, corridors |
| 2 | Smallest office (1 station) | not padded, still purposeful |
| 3 | Medium office (6–10) | pods, aisles, social spots |
| 4 | Biggest office (Emrecan CV, 17+) | zones, density, performance |
| 5 | Office with the dock open | camera refit, nothing cut |
| 6 | Dormant office vs active office | dust/lights/monitors differ |
| 7 | Lifecycle sequence: arrive, sit, type, ✋, printer, leave | each step visible (+ `window.__office.scene.debugInfo()`) |
| 8 | Queue at coffee/printer with 3 characters | capacity/queue works |
| 9 | Mobile viewport + a pinch/zoom step | layout, controls reachable |

## 3. Checklist (one line per item in the report: ✅ / ❌ / not checked)
- [ ] No overlapping or clipped sprites; no desk in a wall; no character on furniture; heads/monitors visible.
- [ ] Wall band, one tilt, pixel-crisp (no blur); palette consistent (`office-art-direction`).
- [ ] Empty floor is intentional (40–60 % walkable); no decor-only clutter.
- [ ] Architecture (see `architectural-planning`): corridors in the middle, offices on both sides, every room has a visible door, no enclosed/unreachable rooms, no side gutters.
- [ ] No padded rooms: no office with large empty floor (desks fill ≥ 30 % of an office); floors visibly differ in character (palette, floor material, runner, wall art, set pieces — `floor-interior-design`).
- [ ] Plates/banner readable at fit and at 300 %; no plate covers a door, window or character.
- [ ] Characters sit at desks, walk aisles, queue, use coffee/printer; nothing moves without a cause (`agent-lifecycle`, `smart-objects`).
- [ ] Info objects truthful: printer/rack/board/inbox appear and disappear with their events.
- [ ] Console has no errors or warnings from our code.
- [ ] Performance: steady frame rate with the biggest office open (sample `game.loop.actualFps` over 5 s; target ≥ 55 on desktop, ≥ 30 mobile), draw objects culled when off-screen.
- [ ] Mobile: HUD, dock and controls usable; no horizontal page scroll.

## 4. Golden images
Keep reference screenshots under `app/qa/golden/` (committed only when the user asks). A change that alters a golden image must say why; unexplained diffs fail the gate.

## 5. Report
List the shots taken (paths), the checklist results, failures fixed, and anything not checked (e.g. "mobile pinch not tested"). Fix failures before reporting; do not claim success from unit tests alone.

## Read when needed
- Judging looks → `office-art-direction`. Layout rules → `office-layout-design`. Shell → `building-shell`. HUD → `office-ui-hud`.
