# Agents Desk

One wide pixel-art open office where every desk is a project folder from `~/Documents`.
Each desk has one permanent coordinator. Click a desk (or its character) and you chat with a real,
**read-only** Claude or Codex CLI session running inside that project. When nobody is working, the
colleagues live their own lives: they visit each other, gaze out of the window, make coffee, gather
around the fireplace at night and pet the office cat.

| Day: sun shafts, weather board, LED news | Night: moonlight, fireplace, colleagues' break |
| --- | --- |
| ![Office by day](docs/img/office-day.png) | ![Office by night](docs/img/office-night.png) |

The UI is bilingual (TR | EN, switch on the cork board). Code, comments and docs are English.

## Purpose

Agents Desk turns a folder of projects into a place you can look at. It is an ambient dashboard and a
chat front end in one:

- **See** which projects have an active CLI, what the news desk is preparing and how much quota is left.
- **Ask** a project's coordinator about its code, read-only, through the same resumable CLI session you
  would use in a terminal.
- **Keep company**: the office stays alive, with dialogue written by Gemini Flash from pooled lines, never
  one model call per spoken line.

## Functions

- **Coordinator chats.** One session per coordinator until you press "Yeni konuşma". Every message resumes
  it; switching CLI switches the thread without resetting one. "Resume kopyala" copies
  `cd '<project>' && claude --resume <id>` (or `codex resume <id>`) for your own terminal. Chats run in the
  project folder with read tools only (Claude `-p --restricted`, Codex `--sandbox read-only`). There is no
  embedded terminal and no write capability.
- **Hourly news desk (Bora).** Each edition has exactly 15 events: 2 German politics, 2 Turkish politics and
  11 AI/technology. Flash writes bilingual headlines; public article evidence is read through the Desk-owned
  briefing MCP (bounded, memory-only). The wall LED rotates headlines every 12 seconds. "Ask Bora" opens the
  same chat with the selected article. Likes mark an event consumed for later editions.
- **Application Studio (Deniz) and CV Clinic (Ece).** Deniz mirrors the external CV repository read-only
  (collector → search, evaluation → evaluate, documents → prepare). The floor display shows a job table, a
  Germany map of pending CVs or submitted applications, and CLI usage. Geography is local; no application data
  goes to geocoding services or models.
- **Cork board.** The control surface: CLI in use (red pin), TR/EN, location (rounded locally to 0.1°) with
  weather, board refresh and usage taps. Physical controls are operated by Leya with 75% probability when she
  is eligible, otherwise by a free colleague.
- **Usage.** Normalized Claude/Codex/Antigravity quota read read-only from the Agents Deck history store.
- **Session continuity.** A page refresh resumes the office moment for moment (scene snapshot every 300 ms in
  `localStorage`, chat session ids in `data/chat-sessions.json`, never message text).
- **External monitor companion.** A native macOS window (`app/monitor/Monitor.swift`) shows the same office on
  a selected external display only, never activating or stealing focus.

## Animation tree

```text
Office
├── Day / night (window clock, override with window.OFFICE_HOUR)
│   ├── 08–17  full daylight, sun shafts through the windows
│   ├── 17–21  dusk, shafts fade out
│   └── 21–05  night: moonlight shafts, fireplace light, hearth gathering
├── Coordinators (Deniz, Ece, Bora)
│   ├── At desk: typing, replying, application / news preparation scenes
│   ├── Ambient life (only while nothing is working; a pinned chat never joins)
│   │   ├── Visit another desk (up to four dialogue turns)
│   │   ├── Window gazing
│   │   ├── Coffee and water cooler
│   │   │   └── Kitchen lifecycle: cup fills → carried by hand → sits on desk 2–4 min with sips
│   │   │       → returned to the dirty counter → at 8 dishes a free sim opens the tap, scrubs, rinses, dries
│   │   ├── Comment on the LED news
│   │   └── Breaks (first after 3–7 min, 2–3 min long, then 12–20 min apart)
│   │       ├── Day: routed seating, seated stretches, small talk, Leya interactions
│   │       └── Night hearth (darkness ≥ 0.45, all coordinators idle): three chairs, fireplace dialogue
│   ├── Physical controls: walk to a pad, jump on it, tap a board card
│   └── News delivery: Bora takes the disk from his desk and inserts it below the LED
├── Leya the cat
│   ├── Long naps, grooming, kneading, stretching, play
│   ├── Visits: rubs against a free colleague, receives gentle petting (hearts, purr)
│   ├── Environment trips: window watching and meowing, counter jump / walk / descent, floor-LED corner nap
│   ├── Hearth: walks to her cushion, kneads, naps by the fire
│   └── Controls: floor-display ON/OFF pads, board paw taps (never during an open or working chat)
├── Monitor screens (idle desks, randomized, last three excluded)
│   ├── Excel · X/Instagram/Facebook · WhatsApp · Chrome
│   ├── VS Code · Claude · Codex · Copilot · Antigravity
│   ├── Football · basketball · tennis
│   └── Real activity always wins: active CLI screen, News Desk preparation progress
├── Wall LED: headline + summary pager, 12 s rotation
├── Floor LED: job table / Germany map / usage, fiber pulses, green connector lamps, ON/OFF pads
└── Cork board: weather card, CLI pin flight, tap glow on refresh and usage
```

Full, code-derived inventory (files, timings, state machines, how to add one): [`docs/animations.md`](docs/animations.md).

## Run

```sh
node server/server.js          # or: nohup node server/server.js &  (keeps the office alive)
open http://127.0.0.1:4317
```

- Node ≥ 22, no npm dependencies, no build step for the front end (`office/public/`).
- Desks are listed in `desk.config.json`; each needs a project folder and a coordinator name.
- `npm test` runs the server and logic tests (`node:test`).
- External monitor (macOS): `npm run monitor:build` once, then `npm run monitor`.

## Layout

| Path | Contents |
| --- | --- |
| `server/` | HTTP + SSE, chat/CLI sessions, dialogue pools, news desk, briefing MCP, application board, usage |
| `office/public/js/` | Canvas office: `office.js` (render, camera), `life.js` (ambient director), `leya.js`, `kitchen-life.js`, `fireplace-life.js`, `screens.js`, `layout.js`, `nav.js`, `news.js`, `application-*.js`, `chat.js`, `i18n.js` |
| `app/monitor/` | macOS external-monitor companion (Swift) |
| `test/` | `node:test` suites |
| `data/` | Runtime state (git-ignored) |
| `docs/` | `animations.md` (animation inventory), `img/` (screenshots) |
| `AGENTS.md` | Binding rules for agents working in this repo |

## Safety

Everything runs from this repository. Other project folders are read-only inputs; chats never get write,
network or MCP access beyond the Desk-owned briefing MCP; secret files are never opened. Transcripts, prompts
and credentials are never persisted. See `AGENTS.md` for the full list.

## Credits

The scene, sprites and LED panel are adapted from the studio office of `muratceme/minik-ajanlar`. Germany
boundaries are Natural Earth (public domain); city coordinates are GeoNames (CC BY).
