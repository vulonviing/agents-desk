---
name: office-dialogues
description: Use when changing the ambient talk of Agents Desk characters (coffee, water, window, news, visits, desk murmurs): the dialogue pool (server/dialogues.js, services/dialogues.ts), the small-model (Haiku) refill, token budgets, line validation, how the scene picks lines, or when adding new ambient behaviours that speak. Decisions on cost, privacy and realism of ambient conversation.
---

# Office dialogues (ambient talk that costs almost nothing)

Goal: sims chat believably — a coffee run, reading the news, a short exchange between two roles — **without a model call per line**.
Ambient talk is life, not work: it never claims real work (green diamond rules in `agent-lifecycle`).

## Decisions (user-approved)
1. **Pool, not live generation.** Each office has a *pool* of short lines (`kind` = coffee | water | window | news | visit | desk). Characters **pull** from the pool locally; no model runs when a sim speaks.
2. **Small model refills the pool, rarely.** One call to **Haiku** (`claude --model haiku`, no tools) per office per refresh. Defaults (`desk.config.json` → `dialogues`): `refreshHours: 12`, `maxCallsPerDay: 10`, `linesPerRefresh: 36`, `poolMax: 120`, `enabled: true`.
3. **Lazy and bounded.** A pool is refilled only when an office's sims actually speak (first `GET /api/dialogues?office=ID`), only when stale, only while the daily call budget lasts, one refill per office at a time. Reads are free.
4. **Always works offline.** Built-in lines (`BUILTIN` in `server/dialogues.js`, every kind covered) are served immediately and when the CLI is missing, fails or the budget is spent. Failures are silent and never block the UI.
5. **Cached on disk.** `data/dialogues/<office>.json` (git-ignored); survives restarts; newest lines first, duplicates dropped, oldest trimmed at `poolMax`.
6. **Provider.** The refill uses Claude Haiku. If only Codex is installed, built-in lines are used (no silent switch of provider for this feature).

## What the model sees (privacy, hard rule)
Office name, floor name, up to 10 role names with a one-line mission (station description / README summary), and the **names** of the 3 most recently touched stations. **Never** chat text, prompts, tool bodies, file contents or transcript text. "Realistic talk from recent chats" means *flavour from roles and recent activity names*, not from conversations. Using chat content would need a new explicit decision in `AGENTS.md`.

## Line rules (validated server-side, `validateLines`)
- Turkish, ≤ 80 characters, one line, warm and lightly humorous, mundane office life shaped by the roles.
- Kinds are whitelisted. `visit` is a two-line exchange (`text` + `reply`) with `{name}` (the first speaker) and `{other}` (the listener).
- Rejected: links, emails, markdown/backticks, over-long text, duplicates (normalised), one-sided visits. No real people, no work reports.
- Optional `who` (an agent name) marks a role-specific line; the picker prefers it ~60 % of the time for that agent.

## Picking (`app/src/services/dialogues.ts`, `OfficeScene`)
- `pickLine(officeId, kind, who, other, rng)`: not one of the last 12 used lines of that office; prefers `who` matches; fills `{name}`/`{other}` (names shortened to 16 chars); falls back to the whole kind if everything was used.
- Behaviour → kind: coffee → `coffee`, cooler → `water`, window → `window`, sofa → `news`, visit with a neighbour → `visit` (reply shown ~1.8 s later), otherwise → `desk`. Idle seated residents murmur a `desk` line every 40–90 s. Floor view uses the same pools.
- Randomness is injected (`rng`) so tests are deterministic. Lines are shown with `say(text)` (not "observed"): no green diamond.

## Cost model (state it in reports)
One refill ≈ 600 input + ≈ 900 output tokens on Haiku; at most 10 per day ⇒ a few thousand tokens per day, independent of how many sims talk. Raising `linesPerRefresh` or `maxCallsPerDay` is the only way cost grows.

## Checks (must pass before "done")
- Server: validation, one background refill when stale, reuse without further calls, per-day cap and reset, disabled flag, persistence, failure fallback (`test/dialogues.test.js`, API test in `test/server.test.js`).
- Client: one fetch per office, cooldown, `{name}/{other}` filling, role preference, server-down fallback (`services/dialogues.test.ts`).
- `visual-qa`: bubbles appear for coffee, water, news, window and a two-line visit; no bubble claims real work; no model call is made while only reading the pool (`/api/dialogues/status` call counter).

## Read when needed
- Ambient vs real work and bubbles → `agent-lifecycle`. Day/night and events → `office-atmosphere`. Object use → `smart-objects`.
