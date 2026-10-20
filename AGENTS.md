# agents-desk — Agent Instructions

## Project

One wide pixel-art open office. Every desk is a project folder from `~/Documents`; each desk has one permanent
coordinator. Clicking a desk (or its character) opens that coordinator's chat, backed by a real, read-only CLI session.
Colleagues live ambient lives (visiting each other, looking out of the window, coffee, water, LED news) from pooled
dialogues written by Gemini Flash. Everything is deliberately minimal: more of the office is filled in step by step.

- Back end: `server/` (Node >= 22, ES modules, no npm dependencies). Front end: `office/public/` (vanilla JS canvas, no build step).
- There is no Master or manager; the office is only desks and their coordinators.
- Desks are listed in `desk.config.json` → `desks` (`id`, `name`, `path`, `coordinator`, `description`, `topic`, `concept`).
- The office scene, sprites and LED panel are ported from the studio office of `muratceme/minik-ajanlar`
  (`sprites.js`, `sfx.js`, `markdown.js` and the pixel routines in `bg.js`/`office.js` are adapted from it).

## Layout of the code

- `server/server.js` — HTTP + SSE; `server/chat.js`, `llm.js`, `claude.js`, `resume.js` — coordinator chat and CLI sessions.
- `server/dialogues.js`, `dialogue-creator.js`, `antigravity.js`, `briefing*.js`, `news-*.js` — news, dialogue pools, Flash refills, LED board.
- `office/public/js/i18n.js` (TR/EN), `screens.js` (monitor scenes: Excel, X, Instagram, VS Code, Claude, Codex, sports …),
  `layout.js` (world, desk slots, spots, the kitchen L), `office.js` (render, camera), `nav.js` (A* walking),
  `life.js` (ambient director and dialogue pools), `news.js` (LED data, popup, weather), `chat.js` (chat panel), `app.js` (boot).

## Languages (TR | EN)

- The language switch lives on the cork board (TR | EN) and applies to everything on screen: board, LED, name plates, popups,
  chat panel, speech bubbles. Chats are told which language to answer in (`lang` in the chat POST).
- Every pooled dialogue line carries an optional `en` mirror and every news article `titleTr/titleEn/explanation/explanationEn`.
  Gemini Flash writes both languages in the same call (`server/dialogues.js`, `server/news-board.js`); legacy lines are translated by
  a bounded backfill (`translate()` via `warm()`) through the same queue and daily budget. Until a line has an English mirror it is
  shown in Turkish. New UI strings go into `office/public/js/i18n.js` (both languages), never as literals.

## Coordinator chats (hard rule)

- **One session per coordinator chat.** Every message resumes the same CLI session until the user presses "Yeni konuşma";
  switching CLI switches the thread and never resets one.
- "Resume kopyala" copies `cd '<project>' && claude --resume <id>` / `codex resume <id>`; the user pastes it in their own
  terminal. This explicit click (`GET /api/agents/:id/resume`) is the only way a real session id leaves the server.
- **No embedded terminal.** Never add PTY/xterm code or `node-pty`; Desk never hosts a full-capability CLI session.
- Coordinator chats run in the project's own folder, read-only. Claude: `-p --restricted` with Read/Grep/Glob/Skill.
  Codex: `codex exec --sandbox read-only` (read/search commands only; no writes, no network, no MCP, no web).
  Both are told never to open secret files; Codex's sandbox cannot enforce that, so it is prompt-level only.
- The "CLI çıktısı" toggle shows a bounded log of status/output/errors, never prompts. Never claim unavailable tools ran.
- Never add `--dangerously-skip-permissions` or write/edit capability to a chat.

## Office life, news and LED

- Ambient walking, talking and window gazing continue while nothing is working; they never imply real CLI work.
- Lines come from per-desk and shared pools (`server/dialogues.js`) refilled rarely by Antigravity Gemini Flash within persisted
  daily call/token/quota budgets. Never call a model per spoken line. Talk is rare: 25 s global gap, no text repeated within
  10 minutes. Never feed chat, prompt or transcript text into the pool.
- Kitchen lifecycle: coffee, water and fridge visits leave a mug, glass or plate on the lower counter (`view.addDish`); at `DISH_LIMIT` (8) a free sim walks over and washes
  them away one by one (`life.clean`). Capacity is `DISH_MAX` (12). Dishes live only in browser memory.
- Activities that must stay: visits between desks (up to four turns), window gazing, coffee, water cooler, commenting on the LED news.
  A coordinator whose chat is open stays at its desk and is never pulled into ambient life.
- The LED panel shows the public news board and weather. News/weather come only through the Desk-owned briefing MCP.
  Location needs browser permission, is rounded locally (0.1°) and never reaches the dialogue model; the same permission feeds `GET /api/weather`
  (Open-Meteo forecast plus one public reverse-geocoding call to api-bdc.io for the city name; only the rounded coordinates leave the machine).
- The cork board at the left end of the wall is the control surface: the red pin marks the CLI in use (an agent moves it), the
  "Konum: açık/kapalı" label is rewritten by an agent, and with location on the weather and city cards are pinned beside it.
- News conversations open bottom-right. Only public metadata and ratings persist (`data/news/preferences.json`); chat turns,
  private text and freeform feedback are never saved or sent to Gemini. Rating itself never calls a model.

## Session continuity

- A page refresh resumes the same office, moment for moment. The server keeps the real state (coordinator chat sessions: CLI session ids in
  `data/chat-sessions.json`, never message text; news, dialogue pools, location). The page snapshots the whole scene every 300 ms to
  `localStorage` (`desk-session-v2`): walkers mid-stride, speech, running animations, the LED news position, dishes, camera, open chat. On load
  the sim clock is offset so time continues from the snapshot (`view.snapshot/restore`, `life.snapshot/restore`). Beyond 90 s away the moving
  parts start fresh. Walks, bubbles and timers carry plain-data `act` descriptors, never closures; add new behaviours the same way
  (`life.onWalk`, `onSched`, `onAct`).
- Run the server detached (`nohup node server/server.js &`) so closing the terminal does not end the office.

## Safety

- Everything runs from this repo. Never edit, commit, or push in another repo under `~/Documents`; they are read-only inputs.
- Nothing is written outside this repo. Chat sessions only read project folders.
- The only read outside the repo and `~/Documents` is the optional `GET /api/usage`: `server/usage.js` queries the "latest usage" rows of the user's
  Agents Deck app (`~/Library/Application Support/Agents Deck/History/History.store`) read-only with the system `sqlite3` and keeps one used-percentage
  per provider (Claude/Codex 5-hour, Antigravity weekly Gemini 4 Argon). It never touches tokens, accounts or transcripts; without the app the board shows dashes.
- Creating a GitHub repo or pushing needs explicit user approval each time.
- Retain only bounded event metadata in memory. Never persist transcript text, prompts, tool bodies, or credentials.

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
- When the file exceeds ~58 KB, compact it to the 10 most recent steps (tag git history first).

## Documentation Rules

- Do not create micro-level README files by default. Keep docs current; mark superseded docs as archive.

## Planning-Mode User Decisions (hard rule)

- No auto-resolution timers for user decisions; wait for an explicit answer unless a default was already authorized.
- In Plan Mode, ask every critical decision (scope, sources, output locations, repository rules) before locking it into a plan.

## Language

UI text is Turkish; code, comments, and docs are English.

## Testing

- `npm test` runs the server tests (`node:test`). Visual changes to the office need a Playwright screenshot check
  (desks, LED, a visit, window gazing, chat open) before they are called done; unit tests alone never close a visual change.
