# agents-desk — Agent Instructions

## Project

Goal: a simulation-style desk that shows and manages every repo and agent in
`~/Documents`. Fill in architecture and current state here as the project
takes shape; link to `.agents/` docs for detail instead of inlining it.
Current runtime and routing contracts: [.agents/architecture.md](.agents/architecture.md).

## graphify

If `graphify-out/` exists, run `graphify query "<question>"` before browsing or
grepping source, and `graphify update .` after modifying code. When the user
types `/graphify`, invoke the `graphify` skill first.

## Skills

`.agents/` is the single source of truth for skills and reference docs, shared by
Claude Code and Codex. Skills live in `.agents/skills/<name>/SKILL.md`; `.claude/skills`
is a symlink to `../.agents/skills`. Never copy skills into `.claude/`; add new ones
only under `.agents/skills/` (and re-create the symlink if it is missing). Read a skill
only when its task comes up; do not load all of them at once. When spawning a subagent,
name the skills it must use in the prompt.

### Skill routing (use the skill when the trigger applies)

| Trigger | Skill (then) |
|---|---|
| Decorating floors: corridor/connector dressing, floor concepts, palettes, materials, wall art, set pieces, new theme sprites | `floor-interior-design` → `visual-qa` |
| ANY floor-plan, building or office-arrangement change: circulation, access, adjacency, proportions (read first) | `architectural-planning` |
| Floor plan (central corridor),  entrance/lobby, elevator, floor navigation, Master's office shell, kat → ofis → oda signage | `building-shell` → `visual-qa` |
| Inside an office: size, type, desk pods/pitch, departments, walls, doors, walkways, where furniture goes | `office-layout-design` (+ `office-art-direction` for looks) → `visual-qa` |
| How anything looks: palette, wall band, shadows, plates, prop density, reviewing a screenshot | `office-art-direction` |
| Furniture characters use (coffee, cooler, sofa, printer, board, rack), needs, queues, info-carrying props | `smart-objects` → `visual-qa` |
| Character states, arriving/leaving, poses, ambient life vs real work, event → animation mapping | `agent-lifecycle` (+ `live-signals` if the source changes) → `visual-qa` |
| Log watcher/observer, session binding, CLI hooks and installer, signal privacy | `live-signals` |
| What a coordinator is, binding/resuming real CLI sessions, providers, delegation to skills, coordinator permissions | `coordinator-sessions` |
| In-office terminal (PTY, xterm.js, WebSocket), "open in Terminal", terminal security | `embedded-terminal` (+ `coordinator-sessions`) |
| Chat panel with Master/coordinators: layout, streaming, activity cards, Markdown, chat ↔ sim reflection | `chat-experience` → `visual-qa` |
| Sprites, atlas, `gen-assets`, palette/size rules, licences and credits | `pixel-asset-pipeline` |
| Tiled JSON, layers, collision, depth, GIDs, map tests | `tiled-map-pipeline` |
| Day/night, ambient props, rare events, effects | `office-atmosphere` → `visual-qa` |
| React UI: HUD, toolbar, dock, chat rendering, tooltips, mobile, accessibility | `office-ui-hud` → `visual-qa` |

**Hard rule:** any visual or game change (layout, sprites, furniture, characters, signs, HUD,
camera, lifecycle) is not "done" until `visual-qa` has run (Playwright screenshots, checklist,
performance sample) and its report states what was and was not checked. Unit tests alone
never close a visual change.

**Pending direction (not yet in force):** coordinators becoming real, full-capability CLI sessions
with an embedded terminal would change the read-only coordinator rules above. Those rules stay
as written until the change is implemented together with an explicit update of this file; the
design lives in `coordinator-sessions` and `embedded-terminal`.

## Workflow Logging

Append every completed chat-session step to `ai_usage/steps_logs.md`.

```text
## Step <N> — YYYY-MM-DD HH:MM
**<Short title>**
- <bullet ≤15 words>
- <up to 4 bullets total>
```

- English only; step numbers monotonically increasing; append-only.
- At most 4 bullets per step, each at most 15 words.
- When the file exceeds ~58 KB, compact it to the 10 most recent steps
  (tag git history first).

## Documentation Rules

- Do not create micro-level README files by default. Allow them only for
  durable public surfaces, subsystem contracts, generated run artifacts, or
  folders needing provenance. Prefer the nearest parent README or docstrings.
- Keep docs current; mark superseded docs as archive instead of leaving them
  ambiguous.

## Planning-Mode User Decisions (hard rule)

- No auto-resolution timers for user decisions; wait for an explicit answer
  unless a default was already authorized.
- In Plan Mode, ask every critical decision (scope, sources, output
  locations, repository rules) before locking it into a plan.

## Glossary

- **Building** = Agents Desk (the whole app). **Hierarchy**: floor → office → room.
- **Floor** (kat) = a top-down floor plan for one category of projects.
- **Office** (ofis) = one project (UI word "ofis"; code and API still say `room`). On the floor it is a compact office along the corridor; entering it opens the full office view.
- **Room** (oda) = a purpose-based department inside an office, grouping related skill/task stations.
- **Manager** = a user-selected Claude Code or Codex CLI agent that only decides and routes. Exactly one **master manager** routes directly to offices. Each office has its own **coordinators** for CLI conversations.
- **Station** = one thing the project can do: a SKILL.md skill, or a task from `projects/<slug>.json`
  (projects with neither get a baseline derived from their scripts). Stations are desks in the room.
- **Worker** = the character that walks between stations, drinks coffee, and sits at the station that is in use.
- **Level** = what the room may run (`plan` | `read-only` | `approve`); set in `desk.config.json` `levels`, then the manifest.
- **Book** = a skill. **Lobby** = shared services (reception, library, bulletin, approvals; later).
- **Dust** = how long a project has had no commit; it clears on the next commit.

## Safety

- Everything runs from this repo. Never edit, commit, or push in another repo
  under `~/Documents`; they are read-only inputs.
- The scanner reads git metadata via `git --no-optional-locks -C <repo>` and
  README/AGENTS.md/SKILL.md files only. It never reads `.env*`, `node_modules`,
  or `.git` internals, and never follows symlinks outside the repo.
- Nothing is written outside this repo. The `workspace/<slug>` symlinks live
  here and point at the projects.
- Creating a GitHub repo or pushing needs explicit user approval each time.
- Sessions started from the office (the room's "Görev" tab) run `claude` in `--restricted` mode in the
  project's own folder, with the level enforced by `server/policy.js` on every tool call: `plan` runs
  nothing, `read-only` only reads, `approve` asks for every edit/command/network call. SSH, sudo,
  firewall/service commands, git push and secret files are denied at every level. Never add
  `--dangerously-skip-permissions`, never loosen `policy.js` without tests, and never run anything for
  emrecan-vps from the office (its level is read-only and its stations run on the server).
- External conversation text is read only on request in "Oturumlar"; it is never cached or written.
  CLI resume uses the CLI’s own stored thread; Desk never imports transcript bodies into chat history.

## Master and office coordinators (hard rule)

- There is exactly one Master; never create floor managers. Master routes directly to office ids.
  Floor ids are destination locations, not another model call or management layer.
- Master’s simulated office is the default view. Clicking Master opens Chat and Terminal in the sidebar.
  The toolbar contains Master, floor navigation and CLI selection; never manager cards or chat inputs.
  Floor navigation starts expanded; no floor is highlighted while visiting Master.
- Master offers up to two offices and an explanation alternative. An explicit offered choice navigates
  immediately without another LLM call. Routing uses the selected real CLI without keyword fallbacks.
- Master has no tools (Claude: `--tools ""`; Codex: native tool capabilities/features disabled).
  Validate every destination against offered offices; never route work to emrecan-vps.
- Every office has one permanent, named coordinator. Bind its first observed CLI session to that sim;
  additional sessions receive separate coordinators. Keep coordinators first in the agent roster.
- Coordinator chat starts or resumes the selected real CLI. Bound sessions retain their provider;
  reject concurrent sends while an external turn is working. Never imply an external terminal is
  interactively controlled when only its log is observable. Do not silently switch providers or sessions.
- Coordinator chats retain read-only permissions. Claude may read and invoke skills; Codex has no tools
  and receives validated skill contracts for a real follow-up CLI turn. Never claim unavailable tools ran.
- There is no Task tab or separate plan form. Legacy planning/run APIs and policy remain protected,
  but are not the current UI workflow. Never weaken execution policy to compensate for removed UI.

## Office life and observation

- Ambient walking, breaks, and social bubbles continue while projects are inactive; they never imply real CLI work.
- Green character diamonds represent observed CLI activity or Desk runs, not ambient motion or historical station hits.
- `scanner/watch.js` watches Claude/Codex session roots and project `.agents`/`.claude` skill roots.
  Native notifications trigger debounced snapshots; no periodic transcript scan is allowed.
- Large offices group skills by purpose and provide a shared coordinator room. Small offices share one room.
  Message, phone and visit delivery styles represent actual observed assignments, never fabricated work.
  Assigned residents interrupt breaks and return to their own stations.
- `scanner/observer.js` passively adapts local Claude/Codex tool metadata; never install hooks in other repositories.
  The only allowed hook path is the optional, user-approved, user-level installer from this repo
  (`hooks/` + `scripts/install-hooks.mjs`, see the `live-signals` skill); the office must work without it.
- Retain only bounded event metadata in memory. Never persist transcript text, prompts, tool bodies, or credentials.
- A document handoff requires a successful write followed by a successful read at another station.
  Label bubbles as Desk observations; never invent transferred content or claim independent agents exchanged messages.
- Unknown/code-mode tool arguments stay unattributed project activity; do not interpret arbitrary code as telemetry.

## Language

UI text is Turkish; code, comments, and docs are English.

## Code Style

- Node >= 22, ES modules, no npm dependencies; built-in `node:test` for tests.
- Main front end: TypeScript, React, Phaser, Zustand in `app/`; build with `npm run build --prefix app`.
- Legacy front end: vanilla JS canvas in `office/`; retained as a fallback.
