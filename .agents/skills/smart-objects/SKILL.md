---
name: smart-objects
description: Use when adding or changing office furniture characters interact with (coffee machine, cooler, sofa, window, printer, whiteboard/board, server rack, inbox), the idle/needs model, queues and capacity, or when a prop should carry real information (task done, background run, plan, approval waiting). Sims-style needs and objects that advertise.
---

# Smart objects

Goal: furniture is not decoration. Objects *advertise* what they offer; characters pick by need and distance; some objects also
**show real state**. Intelligence lives in the environment (The Sims' utility AI), so new objects need no character code.

## Needs (per character, simple and bounded)
| Need | Drifts when | Satisfied by |
|---|---|---|
| energy | working/time seated | coffee machine, sofa, (sleep for offline) |
| social | alone for long | kitchen table, another character (visit), cooler chat |
| focus | idle too long / many task switches | window, plant, short walk |
Needs are 0–100, drift slowly, reset partially on use. **Work always overrides needs**; with work pending there is no wandering.

## Object contract (`app/src/game/maps/furniture.ts` + `catalog.ts`)
Every smart object defines:
- `id`, `kind`, `adverts: { need: amount }`, `accessTiles[]` (one or more standing tiles), `capacity`, `duration: [min,max]` s,
  `animation` (character pose + object animation, e.g. coffee pouring), `bubble`, optional `info` binding (below).
- A queue: when full, newcomers wait on the next queue tile (max 3) or choose another object; no stacking, no teleporting.
- Interaction ends by the clock (injected), not by a frame count.

## Choosing (`app/src/game/systems/behavior.ts`)
`score = advert * needCurve(need) / (1 + pathDistance) * (queuePenalty)`; pick **randomly among the top 3** (weighted), via injected `rng`.
`needCurve` is steep near 100 (very tired → coffee wins clearly) and flat near 0. `CALM_CHOICES` (crowded offices) lowers movement frequency.
Replace fixed weight tables (`IDLE_CHOICES`) with this scoring; keep the tables only as test fixtures.

## Implemented needs and reservations
- `Worker.needs` tracks energy/social/focus on an injected clock; choose among the top three need/distance scores. Do not immediately repeat the previous activity.
- Scene provides all workers and busy ids. Visits require an idle, seated, present listener. Coffee/cooler/window/sofa/printer reserve their standing destination before walking; capacity is one with up to three distinct queue tiles. Missing/unreachable queue space means choose again later.
- Work and inferred waiting interrupt queues and release reservations. Queue bodies do not claim they are already drinking/printing. Passing characters are not yet a general pedestrian collision simulation; only interaction destinations/queue positions are reserved.

## Objects that carry information (the claude-office lesson)
| Object | Shows | Source |
|---|---|---|
| printer | a task just finished (paper out, brief animation) | run done / Stop event |
| server rack lights | observed sessions / Desk runs and their count | observer + runs snapshot |
| whiteboard / board | latest Desk observation (e.g. a document handoff, labelled as observation) | observer handoff events |
| inbox tray | optional: legacy approvals waiting (only if an approval UI exists) | approvals |
| desk monitor | station status colours (code/think/chart/error/done/idle) | `stationStatus` |
| coffee counter (optional) | session "coffee" counter / idle time | lifecycle stats |
| window | day/night (see `office-atmosphere`) | clock |
An info binding must be **truthful**: no animation without the underlying event, and it must go away with it.

## Rules
0. Object use is **ambient life** unless a real signal says otherwise; it never implies CLI work (green diamond is reserved for observed work, see `agent-lifecycle`).
1. Add objects by data (catalog entry + placement rule), not by special-casing characters.
2. Capacity and queues are mandatory for coffee/cooler/printer/sofa; windows/plants may allow 2.
3. Every object has an access tile that stays reachable (A*); a layout that blocks it is invalid (`office-layout-design`).
4. Randomness injected; behaviour tests deterministic. Culled (off-screen) characters still progress logically.
5. No behaviour for emrecan-vps beyond display; objects never trigger runs.

## Checks (must pass before "done")
- Unit tests: scoring prefers coffee when energy low; top-3 pick deterministic with a seeded rng; capacity/queue (3 characters, 1 coffee machine → one uses, two queue); work overrides needs; every info binding appears and disappears with its event.
- `visual-qa`: screenshot a queue at the kitchen and each info object in both states.

## Read when needed
- Where objects sit → `office-layout-design`. Sprite/animation frames → `pixel-asset-pipeline`. Character states → `agent-lifecycle`.

## Floor services
Floor kitchen, garden and meeting areas publish reachable social spots. Preview desks and upright furniture block navigation; floor art remains walkable. Use shared queue reservations and valid approach tiles rather than a parametric corridor animation.
