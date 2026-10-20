---
name: office-ui-hud
description: Use when changing the Agents Desk React UI around the canvas: HUD stats, the toolbar (Master, floors, CLI selection), the dock (roster, profile, chat, terminal), tooltips, camera controls, plates/labels drawn by the scene, safe Markdown rendering, mobile layout, accessibility and Turkish UI copy.
---

# Office UI / HUD

Goal: the UI explains the office at a glance and never fights the canvas. React UI is separate from the Phaser loop (state in Zustand; the game reads it through `GameHost`).

## Structure
- `app/src/App.tsx`: `OfficeHUD` (stats + toolbar: Master, floor navigation — expanded by default, none highlighted while in Master's office — and CLI selection), `GameCanvas` + `AgentTooltip` + `GameControls`, `DockPanel`.
- Dock: office roster ("Ajanlar", coordinators first), agent **Profil** (mission + conversation first, technical details collapsed), Master Chat/Terminal (opened by clicking Master's sim). **There is no Task tab, plan form or "Görev bırak" button**; no manager cards or chat inputs in the toolbar.
- Chat text goes through the safe renderer `components/Chat/FormattedMessage.tsx` (paragraphs, headings, lists, emphasis, code, HTTPS links; never raw HTML).
- Stores: `officeStore` (view/selection, `inMaster`), `chatStore`, `managersStore`. Services: `services/{api,agentAdapter}`; demo data only via `?demo=1`, labelled DEMO.

## Rules
1. **Language**: UI text Turkish; code/comments English. Vocabulary: kat → ofis → oda; never "Emre/Fatma"-style names — characters are skills/projects.
2. **Information hierarchy**: HUD/toolbar (global) > plates (where) > dock (details). Hover shows tooltip; click selects; Esc steps back (manager → station → agent → office).
3. **Never block the game**: panels resize the canvas (`ResizeObserver` + per-frame safety net in `GameHost`); the camera refits unless the user moved it.
4. **Status language**: one colour + icon + word per status (çalışıyor, düşünüyor, bekliyor ✋, tamamlandı ✔, hata ⛔, çevrimdışı); colour is never the only signal.
5. **Accessibility**: real `<button>`s, `aria-label`s for icon buttons, visible focus ring, keyboard path to select agents/offices (list in the dock), `aria-live` for chat and routing results, contrast ≥ 4.5:1, honour `prefers-reduced-motion`.
6. **Mobile (≤ 800 px)**: dock becomes a bottom sheet (≤ 48 vh), controls ≥ 40 px touch targets, pinch/zoom work, no horizontal page scroll.
7. **Plates drawn by the scene** follow `office-art-direction` typography; text is truncated with `…`, never overflows.
8. **Chat/routing never run work**: Master routes and explains with no tools; coordinator chats are read-only; legacy plan/run APIs stay protected by `server/policy.js` and are not a UI workflow. Never imply an external terminal is interactively controlled.
9. **Errors are shown, not swallowed**: failed requests show a short Turkish message; connection state is always visible in the HUD.

## Checks (must pass before "done")
- Component/store tests for new logic; `npx tsc --noEmit` and `npm run build` pass.
- `visual-qa`: desktop + mobile screenshots (also 1710×930, 1470×850, 1280×760), dock open/closed, Master chat with a routing choice, keyboard walk-through (Tab/Esc).
- Quick a11y pass: tab order, labels, contrast spot-check.

## Read when needed
- Plate/typography details → `office-art-direction`. Shell signage → `building-shell`.

## Coordinator roster identity
Coordinator cards use a distinct dark green background and green border, with readable pale text. Keep coordinators first and retain textual role labels; color alone must not convey the role.

## Speech readability
Ambient and observed speech use 10 px world text, wider padded bubbles, and counter-scaling below 1.8× camera zoom. Keep text around 18 screen pixels or larger at fit zoom; constrain bubbles to the visible canvas. Verify floor fit, office fit, zoomed view and mobile.

## Conversation indicators and plates
Active paired conversations show a small clickable chat badge beside both sims. The badge opens the same live conversation popup and disappears when the exchange ends or is interrupted; it never opens coordinator CLI chat. Office/floor plates use 10 px titles, 8 px secondary text and padded backgrounds, with counter-scaling below 1.2× zoom. Check all floors for window/door overlaps after enlarging them.

Speech cards consume pointer clicks before any floor room zone, station or agent underneath. Clicking any part of a visible card opens its conversation (or single utterance); source links belong in that popup. Never let a bubble click navigate into an office.
