# Agents Desk runtime

The Node server serves the React/Phaser app from `app/dist`, falling back to the archived `office`
front end when no build exists. Other repositories remain read-only inputs. UI language is Turkish.
The app starts in the Master's furnished office. One toolbar contains Master, floors and CLI selection.
Floor navigation starts expanded; no floor is highlighted while visiting Master.

## Master routing

`server/managers.js` defines exactly one Master. It receives all eligible offices with their floor
locations, summaries and skills. `/api/dispatch` makes one selected-CLI decision directly to an office.
There are no floor managers, intermediate floor decisions, keyword rankings or fallback routes.
Unknown destinations are rejected, and emrecan-vps is excluded from offered targets.

Ambiguous requests produce a short question and up to two offices; the UI adds an explanation option.
An offered choice is validated and navigates without another model call. Explanations reconsider the
original request. Provider-scoped continuations stay in bounded memory. Master never produces plans
or executes work. Chat and Terminal open by clicking its sim; terminal output is bounded and excludes
prompts, credentials and hidden reasoning. Responses retain Markdown line breaks and use a safe React
renderer for paragraphs, headings, lists, emphasis, code and HTTPS links; raw HTML is never rendered.

## Office coordinators and conversations

`server/coordinators.js` gives every office a named permanent coordinator. The first observed CLI
session binds to that sim; further sessions spawn additional coordinators with stable session identities.
Coordinators stay first in the Ajanlar roster, followed by skill and task/script workers. Clicking a row
focuses its sim and opens Profil. The profile begins with the agent's mission and conversation, with
technical details collapsed. There is no Task tab, separate plan form or Görev bırak button.

Coordinator chat starts the selected subscription CLI in the project folder. Claude uses restricted
Read/Grep/Glob/Skill tools and resumes its conversation. Codex uses a persistent, tool-free read-only
thread, resumes it by id, and may select one validated station. A follow-up real Codex turn receives
that skill's bounded, in-project SKILL.md contract and supplied project context. It does not gain tools,
read arbitrary project files or execute commands. Actual delegation emits an application activity event.
Neither provider silently falls back or claims unavailable tools ran.

A bound external session retains its provider. A known, idle session can resume from its stored CLI
thread; working external turns are rejected with 409. This is not a live PTY connection: an already open
external terminal's screen/in-memory state is not controlled or mirrored. Chat history contains only
Desk's own bounded messages, never imported external transcript bodies. Missing/unidentifiable session
ids cannot be resumed. The legacy plan/run endpoints and `server/policy.js` remain protected for
compatibility, outside the current UI. Removing their UI does not grant write or execution permissions.

`server/llm.js` removes API-key environment variables and disables tools, MCP, plugins, apps, shell,
image generation, delegation and network search for Master/Codex decision calls. Its sanitized model
catalog also removes advertised native execution capabilities. Unexpected execution events fail closed.
Persistent coordinator threads are the explicit exception to ephemeral decision sessions; their turns
retain the same no-tools boundary. Codex resume follows the
[official CLI reference](https://learn.chatgpt.com/docs/developer-commands#codex-exec).

## Event-driven observation

`scanner/watch.js` uses native filesystem notifications for `~/.claude/projects`, `~/.codex/sessions`,
and scanned projects' `.agents`/`.claude` skill directories. It discovers newly created roots through
parent watches, coalesces write bursts for 100 ms and disposes handles on server shutdown. Skill changes
rescan allowed project metadata and emit updated projects over SSE. There is no periodic transcript
scan; one-shot timers handle state expiration, while SSE has its lightweight connection heartbeat.
Configuration: `sessions.projectsDir`, `sessions.codexSessionsDir` (false disables Codex observation),
`sessions.liveMinutes` (recent-session retention), and `sessions.observeExternal: false`.

`scanner/observer.js` consumes bounded log chunks incrementally, skips symlinks, suppresses initial
history replay and stores bounded metadata only. Session ids are private hashes of log identity; real
CLI thread ids remain server-side for validated resume. Metadata includes provider, cwd mapping, model,
tool, known station, timestamps and sanitized artifact basenames. No prompts, command bodies, tool
outputs, secrets or transcript text are retained. New session records bind/spawn coordinators; an
interactive CLI that has not written a log cannot yet be detected. Recent logs cannot prove an idle
terminal process remains open; session sims expire after the retention window rather than on TTY exit.

Claude Skill calls and explicit SKILL.md reads establish station context. New prompts clear prior
station attribution. Successful writes followed by successful reads at another station correlate a
private project-relative file hash. Only a safe basename appears in a handoff bubble. Failed tools,
secret/outside paths, mere station changes and unknown tool formats never imply a document transfer.
Codex supplies session/turn/tool activity; arbitrary code-mode JavaScript is not interpreted as telemetry.
When a native tool does not identify a skill, activity remains at the coordinator/project level. Codex
artifact output formats do not currently establish supported successful Read/Write pairs. Local log
formats are best-effort adapters; ephemeral, remote or inaccessible logs cannot be passively watched.

## Simulation and interiors

`officeDesign.ts` groups stations by purpose, independently of routing. Emrecan CV has opportunity
collection/filtering, CV tailoring, cover-letter review, quality/delivery and evidence-library departments.
Mahur uses original purple acoustic tiles, vinyl art and music/design workspaces; PaperHub uses teal
research walls, paper boards and book storage. Offices with up to six stations share one compact room
and coordinator corner. Larger suites add a coordinator room with shared desks. Partitions, furniture,
open doors and the central shared corridor participate in pathfinding.

Floor footprints reflect coordinator and station population. Small floors use two office rows and one
central corridor; large floors use three rows, two corridors and a central connector. Floor actors have
separate coordinator positions and up to six visible station workers per office. Actual collision cells
and service spots drive cross-office navigation; there are no decorative perimeter corridors.

Idle residents stagger walks, coffee/water breaks, window visits and short social exchanges. These are
explicitly ambient life and never start models or imply CLI work. A real assignment selects one stable
presentation style: a message, phone call or personal visit. Message/call recipients briefly look at their
phone, then abandon the break and return to their station. Personal visits meet the resident before
releasing it to the desk. Coordinators use their room/corner for remote dispatch and return after visits.
Job-notification bubbles are labeled separately from literal CLI observations. A green diamond reflects
actual observed work, an active Desk chat, or its real delegated skill turn. File handoff animations are
separate evidence-backed events and do not claim semantic content or independent agents exchanging messages.

## Verification

Server and application tests cover Master-only scope, immediate choices, persistent coordinators,
one-to-one session binding, script workers, native watch/discovery, partial logs, secret/failure filtering,
concurrent sessions, CLI resume, room connectivity, communication styles and safe Markdown rendering.
A real Codex smoke test created a persistent thread and resumed the same id successfully. Browser QA
uses fixture logs and CLIs for log → native watch → SSE → sim spawn/activity → same-session Claude resume;
notification-to-browser latency measured 131–155 ms in these fixtures, not a universal startup guarantee.
It checks dedicated/shared rooms, messages/calls/visits and return-to-desk behavior, plus 1710×930,
1470×850 and 1280×760 laptop viewports. The observed local screen is 2560×1664 Retina, scaled to
1710×1112 by macOS, matching [Apple's M4 MacBook Air specifications](https://support.apple.com/en-ie/122209).

## Ambient dialogue and public briefings

Dialogue pools use the newest available low-effort Gemini Flash through the user's Antigravity CLI.
Lazy 90-minute refreshes and persisted call/token/quota guards bound consumption; no model runs per bubble.
`server/briefing-mcp.js` exposes a Desk-owned public-news/weather tool, called by `briefing-client.js`.
Curator roles shape discussion without granting tools to project coordinators. News is dated and expires;
weather requires explicit browser geolocation, stored rounded locally and omitted from model input.
Source-bound bubbles link to the original public source. No private conversation text enters the pool.

Observed turn endings drive completion/error indicators and service-printer visits. Session visitors use
walkable arrival/departure paths. Ambient activities use needs, service reservations and bounded queues;
work/waiting preempts them. Office-life controls expose atmosphere opt-out and weather-location removal.

Shared floor pools and office pools use four-turn conversations, proximity holds and interruption. Floor navigation reuses the office needs controller over actual Tiled collision cells, allowing cross-office visits. Ambient positions reset when changing views. North office departments meet the external wall, eliminating the unused upper hallway.

`dialogue-creator.js` makes daily Flash editorial plans from role missions. The public-briefing MCP searches Bing News for these professional queries; both editorial and dialogue calls share the persistent budget. Speech avoids skill-name addresses and topic headings. Clicking either participant opens a live popup of spoken turns only; the last 20 ambient exchanges remain in scene memory, never on disk.

Readable speech uses 18-screen-pixel minimum text at ordinary fit zoom. Conversation turns last 6.5–11.5 seconds and share an SMS-style three-card stack, with non-overlapping screen placement. A small chat badge beside each active participant opens the spoken-turn popup. Plates use larger titles and secondary counts.
