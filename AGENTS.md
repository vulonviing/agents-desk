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

- `README.md` — overview, animation tree, run instructions; `docs/img/` — screenshots; `docs/animations.md` — animation inventory (update it when animations change).
- `server/server.js` — HTTP + SSE; `server/chat.js`, `llm.js`, `claude.js`, `resume.js` — coordinator chat and CLI sessions.
- `server/dialogues.js`, `dialogue-creator.js`, `antigravity.js`, `briefing*.js`, `news-*.js` — news, dialogue pools, Flash refills, LED board.
- `office/public/js/i18n.js` (TR/EN), `screens.js` (monitor scenes: Excel, X, Instagram, VS Code, Claude, Codex, sports …),
  `layout.js` (world, desk slots, spots, the kitchen L), `office.js` (render, camera), `nav.js` (A* walking),
  `life.js` (ambient director and dialogue pools), `fireplace-life.js` (night seating and companionship), `news.js` (LED data, popup, weather), `chat.js` (chat panel), `app.js` (boot).

## Languages (TR | EN)

- The language switch lives on the cork board (TR | EN) and applies to everything on screen: board, LED, name plates, popups,
  chat panel, speech bubbles. Chats are told which language to answer in (`lang` in the chat POST).
- Every pooled dialogue line carries an optional `en` mirror and every news article `titleTr/titleEn/explanation/explanationEn`.
  Gemini Flash writes both languages in the same call (`server/dialogues.js`, `server/news-board.js`); legacy lines are translated by
  a bounded backfill (`translate()` via `warm()`) through the same serialized queue without local spending caps. Until a line has an English mirror it is
  shown in Turkish. New UI strings go into `office/public/js/i18n.js` (both languages), never as literals.

## Coordinator chats (hard rule)

- **One session per coordinator chat.** Every message resumes the same CLI session until the user presses "Yeni konuşma";
  switching CLI switches the thread and never resets one.
- "Resume kopyala" copies `cd '<project>' && claude --resume <id>` / `codex resume <id>`; the user pastes it in their own
  terminal. This explicit click (`GET /api/agents/:id/resume`) is the only way a real session id leaves the server.
- **No embedded terminal.** Never add PTY/xterm code or `node-pty`; Desk never hosts a full-capability CLI session.
- Coordinator chats run in the project's own folder, read-only. Claude: `-p --restricted` with Read/Grep/Glob/Skill.
  Codex: `codex exec --sandbox read-only` (read/search commands only; no writes, no network, no MCP, no web).
  User-authorized News Desk research is an exception to offline tool restrictions: native Codex live web search or Claude WebSearch/WebFetch may research public sources, with shell/file edits and MCP still disabled. It keeps the same CLI thread.
  Both are told never to open secret files; Codex's sandbox cannot enforce that, so it is prompt-level only.
- The "CLI çıktısı" toggle shows a bounded log of status/output/errors, never prompts. Never claim unavailable tools ran.
- Never add `--dangerously-skip-permissions` or write/edit capability to a chat.

## Office life, news and LED

- Ambient walking, talking and window gazing continue while nothing is working; they never imply real CLI work.
- Lines come from per-desk and shared pools (`server/dialogues.js`) refilled rarely by Antigravity Gemini Flash through a serialized queue. There are no Desk-owned daily call, token, or point caps; usage counters are informational.
  Only actual provider quota/capacity failures stop generation. Never call a model per spoken line. Talk is rare: 25 s global gap, no text repeated within
  10 minutes. Never feed chat, prompt or transcript text into the pool.
- Kitchen lifecycle: `kitchen-life.js` owns plain-data drink and wash choreography. Coffee/water cups fill at the source, travel in a hand, sit on the desk for 2–4 minutes with periodic sips, and return by hand to the dirty counter. At `DISH_LIMIT` (8), a free sim opens the tap, carries each dish to the sink, scrubs, rinses, dries and stores it, then closes the tap. Capacity is `DISH_MAX` (12). Drinks, held dishes and stages survive scene refresh; chat/real work takes priority.
- Night hearth: `fireplace-life.js` owns the lower-parquet fireplace, three chairs, and Leya's cushion. At darkness ≥0.45, available colleagues walk over and sit for a few minutes only when all coordinators are idle and no chat, workflow, news preparation/delivery, or physical control is active. Real work dismisses the gathering; changing between night and day ends the current session; walkers turn back from their actual positions. Leya walks to her cushion, kneads, naps, and receives gentle, bounded sprite-frame petting. Scene, turn, cooldown, and cat ownership survive refresh.
- Daytime breaks use the same routed seating, small seated stretches, conversations, and Leya interactions. The first eligible break waits 3–7 minutes, lasts 2–3 minutes, then waits 12–20 minutes before another. Breaks reuse the existing shared Flash `visit` pool with bilingual daytime fallbacks; night-only fire dialogue and lighting remain separate. Mode and the next appointment persist across refresh. Two-person gatherings use the outer chairs so someone remains beside Leya.
- `fireplace` exchanges use four bilingual turns from the shared Flash queue. The shared night library contains at most 32 exchanges, refreshes every eight hours, and can prepare independently of news publication. It stores only generated ambient dialogue in `data/dialogues/_meta/fireplace.json`, respects provider backoff, and never receives private feelings, chats, or transcripts. Selection is local with ten-minute repeat spacing; dialogue gaps leave quiet fireside moments. Fireplace light restores actual scene pixels through a feathered mask rather than rectangular actor cutouts.
- Activities that must stay: visits between desks (up to four turns), window gazing, coffee, water cooler, commenting on the LED news.
  A coordinator whose chat is open stays at its desk and is never pulled into ambient life.
- The cork-board refresh button reloads published news, weather, and normalized usage without starting model work. Buried fiber routes connect usage and the application studio to the floor display. The floor display defaults off. ON/OFF pressure pads request a free coordinator, who walks over, jumps onto the selected pad, and starts power delivery only on landing. The UI stays dark until the four-second fiber signal arrives; OFF takes effect on landing. Clicking the display surface never changes power. An unpinned display requests the same physical OFF sequence after five idle minutes; Keep on and focused/fullscreen viewing disable the countdown. In-flight jumps and pending power requests survive refresh. Only a transition from off to on lights both routes. Green connector lamps stay visible; buried pulse brightness is attenuated and exposed ends brighten. The desk connector is wider. Four-second pulses and a subtle active-display halo emit above nighttime shading; plain-data pulses persist and respect reduced motion.
- Open ambient conversation popups append actual spoken turns and clear their talking indicator on completion/interruption. Updates preserve existing feedback controls.
- A second LED display is flush-mounted in the lower-right parquet (`FLOOR_LED`).
  `application-board.js` projects an interactive job table or Germany application map onto its glass.
  `server/application-board.js` reads bounded posting/evaluation metadata from Emrecan CV without modifying that repository.
  The table uses `reviewed/`; the Jobs preview and optional focused city view map only those pending CVs. The distant display gives the left half to Germany and the right half to counts and city rankings; the Jobs header switches between the original table and its pending-CV map. View choice survives refresh. Jobs preview counters show reviewed jobs, prepared CVs, and pending-CV cities; Map preview counters show filtered submitted applications, mapped applications, and submitted cities. Focused maps filter locally by company, package-date range, and explicit job type (including unknown). Default package-date start is 2026-08-01; pending/submitted filters persist separately. Filters rebuild city bubbles, counts, company totals, and unmapped records from the same filtered metadata. Package dates never imply verified submission dates. Numeric counters and bubble counts retain Pixelify Sans; the original Desk Five subset overrides only U+0035 for legibility; empty preview footers stay hidden. Submitted city counts use Unicode-normalized `BAŞVURULDU/`, deduplicate posting URLs,
  and separate remote, unknown and multiple-city records. Folder dates are never presented as submission dates.
  Geography is local: Natural Earth public-domain boundaries and GeoNames CC BY city coordinates, credited on screen.
  Never send application data to geocoding services or models, except user-authorized job-type classification: the selected tool-free Claude/Codex CLI may receive bounded public posting titles and descriptions only. Never include CV contents, fit evaluations, tailoring notes, chat text, or transcripts. Cache classification labels and public-input hashes in this repository; refresh classifies new or changed postings. Do not serve arbitrary project files.
  Floor content uses a transparent sprite foreground so Leya and walkers retain pixel-alpha occlusion and name plates.
  Display mode, sorting, filters, selected city and desk-window positions survive refresh; application records are not stored in localStorage.
  `desk-popup.js` anchors News Desk and Application Studio menus beside their characters until dragged;
  Application Studio offers explicit chat, job-board and map actions.
  Ambient `floorLed` visits use bilingual remarks, ten-minute repeat spacing, and serializable walk acts.
- The wall LED shows the current bilingual headline and its flowing, outcome-focused paragraph summary.
  Flash titles are capped at 72 characters and 12 words; summaries at 220 characters and 40 words, per language.
  No Problem / Method / Result labels. Prefer concrete findings, named comparison winners, prices, and metrics; never invent them.
  Before summarizing, the Desk-owned briefing MCP reads bounded public article evidence, including price tables.
  Article text stays ephemeral: HTTPS only, public DNS pinned per request, redirects revalidated, 512 KB downloads,
  16,000 extracted characters per article, fifteen articles maximum, and ten-second deadlines. Never persist article bodies.
  Headlines rotate every 12 seconds. The former next-headline and weather footer lines are removed; weather remains on the cork board. News/weather come only through the Desk-owned briefing MCP.
  Location needs browser permission, is rounded locally (0.1°) and never reaches the dialogue model; the same permission feeds `GET /api/weather`
  (Open-Meteo forecast plus one public reverse-geocoding call to api-bdc.io for the city name; only the rounded coordinates leave the machine).
- The cork board at the left end of the wall is the control surface: the red pin marks the CLI in use (an agent moves it), the
  "Konum +/−" label is rewritten by an agent, and with location on the weather and city cards are pinned beside it.
- News conversations open bottom-right. Only public metadata and ratings persist (`data/news/preferences.json`); chat turns,
  private text and freeform feedback are never saved or sent to Gemini. Rating itself never calls a model.

## Hourly news desk

- Deniz (Application Studio), Ece (CV Clinic), and Bora (News Desk) share ambient visits and breaks.
- The news desk uses Gemini Flash only through the existing serialized dialogue queue; usage is recorded without local budget caps; article discussions use the selected read-only Claude/Codex chat in this repository.
- `server/news-session.js` prepares one edition hourly: fresh bilingual headlines, explanations, and all desk/shared dialogue pools.
- Each edition re-fetches public feeds/searches once; all dialogue pools reuse those verified sources.
- Each new edition has exactly 15 distinct events: 2 German politics, 2 Turkish politics, and 11 AI/technology slots (at most two critical security exceptions).
  `server/news-selection.js` groups cross-language/cross-publisher coverage through the shared Flash queue before summarizing.
- Likes mark an event consumed for subsequent editions, including coverage from other sites; the current edition stays visible.
  Persist public event IDs/keys with ratings. Undoing a like removes its consumed marker.
- Eligible events are ordered by measured publisher coverage, feed/search prominence, freshness, and Hacker News ranking/votes.
  These are popularity proxies, never worldwide readership counts. Topic classification uses actual content, not query country.
- Negative preference scores normally exclude events. At most one worldwide-event exception per edition requires Flash's major flag,
  five independent publisher families, three trusted families, two prominent placements, and coverage within twelve hours.
  Consumed events and explicitly disliked events never receive that exception. Popups expose coverage and exception metadata.
- Freeze selected article IDs per edition. Insufficient eligible coverage keeps the old edition; never fill quotas with repeats.
  Reject stale prepared editions after selection-policy or preference-revision changes, including across restarts.
- Hourly dialogue calls request at most 32 bilingual lines per scope, with English required in the response schema.
- Progress reports actual phases and batch counts. Failures retain bounded codes/counts, never raw errors or model output.
- Preparation never replaces the published edition. Completed draft stages are checkpointed; quota exhaustion stops model calls.
- A failed attempt resumes its fresh checkpoint on retry; drafts older than one hour restart with fresh searches.
- Unexpected CLI tools remain denied. An hourly pool may retry once with at most eight lines, through the same serialized queue.
- A complete edition persists in `data/news/session.json` until Bora takes a disk from his desk and inserts it below the LED.
- Publishing requires the prepared edition ID and is idempotent. Plain-data delivery stages survive page refresh.
- News cards include “Ask Bora”: open the same resumable CLI chat with the selected article context.
  Resolve article IDs server-side; retrieve public evidence through the briefing MCP, bounded and memory-only.
  Switching articles keeps the CLI session but replaces active evidence. Article metadata survives browser refresh.
  News conversations never enter Flash dialogue pools. No embedded terminal or write capability.
- Clicking the News Desk opens its TR/EN menu: actual completed-stage progress, publication times, and manual preparation.
- Manual refresh bypasses scheduling and transient retry delays, never provider quota/capacity backoff or an active/ready edition.
- Preparation continues without a browser; a ready edition waits for Bora when the office is open.

## Leya and monitor scenes

- Leya is a slightly plump female grey cat. Her right eye (viewer-left) is cloudy; her other eye is muted amber.
  Keep fur silver-grey without orange patches. Her small sprite and name plate are separate from desk scaling.
- `office/public/js/leya.js` owns her plain-data behavior: long naps, grooming, kneading, stretching, play, and visits.
  Rare environment trips include window watching/meowing, counter jumps/walking/descent, and floor-LED corner naps.
  Routes, jumps, surface, timers, and toy state survive refresh. Never interrupt an open or working coordinator chat.
- Idle monitors draw independently randomized scenes, excluding the last three selections, with randomized starts and durations.
  Persist RNG state, history and scene phase in snapshots; pause the idle stream during actual work.
  Active CLI screens and the News Desk's real preparation-progress screen override entertainment.
- Physical controls share one selection policy: choose Leya with 75% probability when eligible, otherwise a free sim. This covers floor-display ON/OFF, CLI/language/location cards, board refresh, and usage-logo taps. Refresh and usage actions fire on the actual paw tap or human contact and emit a brief green glow; never duplicate callbacks. Busy cats and open or working *chats* retain their guards; News Desk preparation and Application Studio workflow scenes do not block Leya (`view.st[id].chatting`, set in `app.js` `applyStatuses`).
- Leya handles user-requested power or board controls: a routed approach, pad jump or paw tap, and varied bilingual meows. No control trip begins during an open/working coordinator chat. The control descriptor survives refresh.
- Objects attached to an actor share its depth order. Pressure pads are painted before actors; their transparent DOM hit targets never cover sprites.
- Floor-display emission uses actual sprite-alpha occlusion; never dark rectangular cutouts around cats or walkers.

## External Application Studio activity

- `server/application-activity.js` observes the Emrecan CV repository read-only using filesystem events.
  It checks Claude/Codex executable names and working directories with `ps`/`lsof`; never arguments or transcripts.
- Output changes identify three phases: collector outputs → search, evaluation outputs → evaluate,
  application documents/build outputs → prepare. A CLI in that repository must also be present.
  Merely opening a CLI, editing the queue, or changing source code never implies work.
- Signals expire after two minutes without output changes, or when the CLI exits. Detection starts with
  the next observed output change after Desk starts. Only phase, provider names and observation time reach the browser.
- `application-workflow.js` owns nine desk/character/monitor scenes and sparse phase-specific speech.
  Generated `work-search`, `work-evaluate`, `work-prepare` lines share the existing Flash pool queue;
  bilingual fallback lines live in `i18n.js`. Never include application content or claim task success.
- Deniz stays at his desk while working. Ece can reply from her desk only when free; open chats suppress
  workflow speech. Scene clocks, pending replies and repeat spacing survive refresh as plain data.

## Session continuity

- A page refresh resumes the same office, moment for moment. The server keeps the real state (coordinator chat sessions: CLI session ids in
  `data/chat-sessions.json`, never message text; news, dialogue pools, location). The page snapshots the whole scene every 300 ms to
  `localStorage` (`desk-session-v2`): walkers mid-stride, speech, running animations, the LED news position, dishes, camera, open chat. On load
  the sim clock is offset so time continues from the snapshot (`view.snapshot/restore`, `life.snapshot/restore`). Beyond 90 s away the moving
  parts start fresh. Walks, bubbles and timers carry plain-data `act` descriptors, never closures; add new behaviours the same way
  (`life.onWalk`, `onSched`, `onAct`).
- Run the server detached (`nohup node server/server.js &`) so closing the terminal does not end the office.

## Shared scene across screens

- Every browser and screen shows the same office. One visible page leads (the first to claim it, 4 s lease): it runs the
  simulation and publishes its plain-data snapshot every 300 ms to `POST /api/scene/sync`. All other pages are followers: they restore
  that snapshot and never decide anything (`view.follower` guards `life.tick`, `view.update`, and Leya's transitions).
  Hidden pages only follow; a closing or hidden leader releases the lead at once (`/api/scene/release`).
- `server/scene-share.js` keeps the snapshot in memory only (bounded to 400 KB), never on disk. Chat text, prompts and transcripts never pass through it.
- Per screen, never shared: camera/zoom, display profile, chat panel, application filters, language and CLI choice. A follower's open chat is
  reported as a pin so the leader keeps that colleague at the desk.
- Follower clicks that start scene animations (props, Leya, floor-display ON/OFF) travel as plain-data commands to the leader
  (`interact`, `poke`, `power`, `cancelPower`). Board controls (language, CLI, refresh) take effect on the follower's own screen at once; their pin animation plays only on the leader.
- New behaviour that decides or randomizes must stay behind the follower guard; new state must be part of the snapshots.

## External monitor companion

- User-authorized macOS display integration lives in `app/monitor/Monitor.swift`; build with `npm run monitor:build`.
  `npm run monitor` enables it for the running local server. The normal server entry point automatically launches
  an enabled, already-built companion through `server/external-monitor.js`; tests and other platforms never launch it.
- Identify the selected external monitor by its persistent CoreGraphics UUID. Never select the built-in display.
  The user's Samsung monitor uses extended desktop mode; remove its mirroring group when necessary and keep
  the laptop primary. Reconnection shows the same borderless office window on the selected external screen only.
- Never activate the companion or make its window key automatically. Disconnect, disabled viewing, and an offline
  office server hide the window rather than migrating it onto the laptop. Preserve the user's laptop work and focus.
- The accessory menu offers display enable/disable, reload, and quit. Native labels originate in both languages
  in `i18n.js` and are packaged by the build script. Follow the office language when it changes.
- Settings, bounded scene snapshots, and status stay in ignored `data/monitor-*.json`; compiled app files stay in
  ignored `app/dist/`. The WebKit store is nonpersistent; only the existing scene snapshot is copied between launches.
  Never store chat messages, prompts, credentials, or arbitrary WebKit storage. macOS may request Documents access
  once for this app to read/write its own repo state. Pass the server port by arguments and local notification,
  avoiding reads of other applications' files. No Accessibility or screen-recording permission is required.
- `?display=external` defaults to the distance profile in `display-profile.js`. The display-mode card is removed from the cork board; use the monitor’s existing upper controls. Persist the manual selection as `view.displayMode`; it overrides the URL on subsequent loads. Use shared normal entity geometry, moderate chat/popup/speech/label/LED enlargement, and identical floor-display sizing, tabs, and typography in both modes. Never reset chat, camera, floor filters, or quota readings when toggling. Large LED summaries
  page within the existing headline interval rather than shrinking. Never infer this profile from viewport width.
- The watcher remains available while the server is active; it does not create a system login service or change
  other applications. Display preference changes are limited to the user-requested extended desktop setup.

## Safety

- Threat model: Desk only ever runs on the owner's own machine (loopback, single user). Findings that assume an outside attacker
  (for example prompt injection through news articles steering web fetches, or other local processes poking the monitor companion)
  are accepted risks by owner decision; do not re-raise or fix them unless the owner asks. Never expose the server beyond `127.0.0.1`.

- Everything runs from this repo. Never edit, commit, or push in another repo under `~/Documents`; they are read-only inputs.
- Nothing is written outside this repo. Chat sessions only read project folders.
- Usage endpoints may read the user's Agents Deck history store (`~/Library/Application Support/Agents Deck/History/History.store`) read-only through system `sqlite3`. Allowlist normalized quota snapshots, daily quota observations, Claude aggregate cache statistics, and Codex aggregate account token buckets. Never read credentials, raw sessions, or transcripts. Bound queries, output, and cache lifetimes; missing data remains unavailable. Clicking usage opens the shared floor display; no CLI/model is invoked.
- Creating a GitHub repo or pushing needs explicit user approval each time.
- Retain only bounded event metadata in memory. Never persist transcript text, prompts, tool bodies, or credentials.

## Workflow Logging

Append every completed chat-session step to `ai_usage/steps_logs.md`. The `ai_usage/` folder is git-ignored (local only, never committed).

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
- `README.md` is the public overview (purpose, functions, animation tree, run); keep its animation tree and screenshots in step with behaviour changes.
  Screenshots live in `docs/img/`; take them with Playwright at 1600×900, use `window.OFFICE_HOUR` for day/night, keep the floor display off
  and never show application data. Use a non-personal location (Munich, mocked via `/api/weather` routing, never the owner's real one).
- Skills/plugin routing lives in `PLUGINS.md`; this repo ships no skills of its own.

## Planning-Mode User Decisions (hard rule)

- No auto-resolution timers for user decisions; wait for an explicit answer unless a default was already authorized.
- In Plan Mode, ask every critical decision (scope, sources, output locations, repository rules) before locking it into a plan.

## Language

UI text is Turkish; code, comments, and docs are English.

## Testing

- `npm test` runs the server tests (`node:test`). Visual changes to the office need a Playwright screenshot check
  (desks, LED, a visit, window gazing, chat open) before they are called done; unit tests alone never close a visual change.
