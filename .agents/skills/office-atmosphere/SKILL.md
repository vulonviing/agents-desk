---
name: office-atmosphere
description: Use when adding life to the Agents Desk office beyond direct task state: day/night through windows, ambient lighting, small ambient props and animations, rare office events (pizza delivery, printer jam, fire drill, power flicker), and any sound or particle effect. Rules that keep it meaningful and cheap.
---

# Office atmosphere

Goal: the office feels alive without lying and without noise. Atmosphere never contradicts or hides real agent state.

## Allowed
- **Day/night** from the real clock: window sprites switch sky frame (day / dusk / night); optional warm light overlay on desks at night. No whole-room darkening.
- **Ambient props**: wall clock showing real time (analog frame set), plants swaying (2 frames), blinking server LEDs, steam from coffee, dust motes in dormant offices.
- **Rare events** (cause required, low frequency, opt-out):
  - *pizza delivery* — when ≥ N tasks completed within an hour (celebration, a visitor from the door);
  - *printer jam* — only if a run failed; clears when the next run succeeds;
  - *fire drill / red beacon* — only for real alarms (many errors at once); never random;
  - *power flicker* — when the server connection drops (`connection: reconnecting`).
- **Mood overlays**: dormant = desaturate + dust; celebration = confetti for 2 s on `completed`.

## Rules
1. **Cause for everything.** An event is bound to a real signal or the real clock. Pure-random events are limited to harmless cosmetics (plant sway) and must not move characters.
2. **Budget**: ≤ 5 % of frame time; effects are sprites/tweens, no per-frame allocations; paused when the tab is hidden; culled off-screen.
3. **Opt-out**: one setting turns events off; reduced-motion preference disables flicker/confetti.
4. **Never hide information**: overlays stay below plates/bubbles (depth) and never cover status icons.
5. **No sound by default.** If added: off by default, per-event mute, no autoplay.
6. Time and randomness injected; tests use a fake clock.

## Checks
- Unit tests: event triggers fire only on their cause; cool-downs; reduced-motion off-switch; day/night frame by hour.
- `visual-qa`: screenshots of day and night windows, a dormant office, one event in progress; FPS unchanged with effects on.

## Read when needed
- Objects that carry state (printer/rack/board) → `smart-objects`. Frames and palette → `pixel-asset-pipeline`, `office-art-direction`.
