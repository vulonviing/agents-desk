---
name: agent-lifecycle
description: Use when changing how Agents Desk characters live: their states (idle, working, thinking, moving, completed, error, offline), arriving through the door, sitting at a desk, reading/writing/waiting animations, using the printer, leaving, sleeping/dust, or mapping real CLI events to what a character does. Not for the event source itself (live-signals) or for furniture behaviour (smart-objects).
---

# Agent lifecycle

Goal: what you see is what the agent really does. Every *work* movement and animation has a **cause** (an observed event or a real assignment).
Ambient life (breaks, walks, small talk) is allowed but is need-driven (`smart-objects`), clearly separate from work, and never pretends to be work.

## Kinds of characters (see `.agents/architecture.md`, `server/coordinators.js`, `server/agents.js`)
- **Master**: one, in its own furnished office; routes only, never works.
- **Coordinator**: one permanent, named coordinator per office. The first observed CLI session binds to it; **each further session spawns an additional coordinator** with a stable session identity (one sim per session). Coordinators come first in the roster.
- **Residents**: skill and task/script workers (`kind: 'skill' | 'project'`), named after the skill/script/project, never human names. Offline → asleep with dust.
- Session sims enter through the office door, work at a desk and leave when the retention window expires (`sessions.liveMinutes`); a closed terminal cannot be detected, so do not animate a "terminal closed" exit.

## Lifecycle of a session visitor
`arrive → walk to desk → sit → work loop → finish → printer → leave` (observed session visitors now walk in/out through the office door; permanent residents retain their desks)

Events come from `live-signals` (watcher/observer; hooks only if installed):

| Event | Character does |
|---|---|
| SessionStart | spawns at the lobby/office door, walks to the desk of the station in use (or the project desk) |
| UserPromptSubmit / thinking | sits, thought bubble, monitor `think` |
| Read/Grep/Glob tool | reading pose (monitor `code`, papers), bubble 📖 |
| Edit/Write tool | typing pose, monitor `code`, desk lamp on |
| Bash/test tool | typing + monitor `chart` or `error` on failure |
| Skill tool | walks to that skill's desk (`stationStatus`), stays there while the skill runs |
| PermissionRequest / waiting | raises hand, bubble ✋, desk flag, floor/office plate shows "bekliyor" |
| Stop (turn done) | completed bubble ✔, walks to the printer (printer animates), returns or leaves |
| SessionEnd / idle past `liveMinutes` | walks to the door and leaves; seat empties |
| Error / failed run | ⛔ bubble, monitor `error`, office plate shows "hata" (60 s) |

Resident rules: `offline` = asleep at desk (zzz, dust level by `dust`); a commit or activity wakes them (dust clears). `completed` shows for ~8 s, `error` for ~60 s.

## Ambient life vs real work (hard rule from AGENTS.md)
- Idle residents stagger walks, coffee/water breaks, window visits and short social exchanges — **ambient only**; it never starts models and never implies CLI work.
- A **green diamond** means observed CLI activity, an active Desk chat or a real delegated skill turn — nothing else. Never show it for ambient motion or historical hits.
- A real assignment picks one stable style: message, phone call or personal visit; message/call recipients look at their phone, abandon the break and return to their desk; visits meet the resident, then release it.
- File handoff animations need a successful write then a successful read at another station; label bubbles as Desk observations; never invent content or imply agents talk to each other.

- Ambient lines (coffee, water, window, news, visits, desk murmurs) are picked from the office dialogue pool (`office-dialogues`); they are never "observed" speech and never claim work.

## Current implementation notes
- `scanner/observer.js` emits metadata-only `completed` for Claude `end_turn` / Codex `task_complete`, and `error` for Codex `task_aborted`. Cold history and mere inactivity do not emit completion.
- Successful/failed Desk chat and legacy run endings also publish metadata-only lifecycle observations; failed replies never become success receipts.
- Session visitors enter at the door, follow walkable paths, and leave on retention expiry. A known permanent coordinator remains after a session expires.
- Completed observers can visit the service printer; new work/waiting cancels the visit. The receipt represents observed turn completion, never proof that the CLI printed a document.
- Waiting on user input after a completed turn is ordinary idle; stale pending tools remain inferred waiting. Do not label inference as confirmed permission denial.
- Read/Grep/Glob use a reading indicator; waiting is visible and does not wander. Green diamonds still depend solely on `cliActive`.

## Design rules
1. **State comes from the server, movement from the game.** `AgentDTO.status` is truth (`server/agents.js`); `moving` is set client-side while walking. UI shows `moving` only while a path is active.
2. **One state machine** (`app/src/game/systems/behavior.ts`: seated / walking / doing / sleeping + new `arriving` / `leaving`). Transitions are a table, not scattered `if`s; each transition has a test.
3. **Cause for every action**: work demand beats needs; needs beat staying put; "visit" requires another character. No random walking while work is pending.
4. **Queues, not stacking**: two characters never occupy the same tile/seat; a taken seat sends the newcomer to the next free desk of that office.
5. **Time and randomness injected** (`rng`, clock) so tests are deterministic.
6. **Budget**: a lifecycle tick is O(characters); culling stays on; no per-frame allocations in hot paths.
7. **Privacy**: events carry tool and file names only — never prompt text, command text or file contents.

## Checks (must pass before "done")
- Unit tests: every row of the event table → expected state/animation; arrive → sit → work → printer → leave on a fixed clock; no two characters on one tile; offline → asleep → woken.
- `visual-qa`: record a short sequence (arrive, type, ✋, printer, leave) with `window.__office.scene.debugInfo()` plus screenshots at each step.

## Read when needed
- Where events come from / hooks → `live-signals`. Objects they walk to → `smart-objects`. Pixel poses/frames → `pixel-asset-pipeline`.

## Floor and department social travel
Use the same collision-aware needs controller in floor and office views. Floor residents can visit another office, department residents another room, and nearby available sims can start a held four-turn conversation. Real activity interrupts ambient speech and travel immediately. Never represent ambient cross-office walks as observed assignments; view switches rebuild ambient positions.
