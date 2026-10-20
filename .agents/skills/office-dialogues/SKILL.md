---
name: office-dialogues
description: Change ambient office conversations, creative role-based scenes, pooled Gemini Flash generation through Antigravity, daily quota limits, sourced news/weather MCP briefings, or local speech selection.
---

# Office dialogues

Dialogue is ambient simulation; a speaking character never claims CLI work. Keep the hierarchy **floor → office → room**: floor culture informs office topics; each room's roles bring a different perspective.

## Provider and budget (user decisions, 2026-10-20)
- Always use **Antigravity Gemini Flash**, never Haiku or an automatic cross-provider fallback. `server/antigravity.js` selects the newest numeric `gemini-*-flash-low` advertised by `agy models`. Unknown/unavailable models use the existing pool.
- Generate a **pool**, never a model call per speech bubble. Default: 128 lines per active office or shared floor, lazy refresh every 90 minutes, at most 720 cached lines. Concurrent readers share one refresh; all scope refills serialize globally.
- User accepts roughly **20–30% of quota daily** for better dialogue. `/usage` is a zero-model-turn CLI command. Before/after each refill, count positive changes in the **Gemini Models five-hour bucket**, provided its reset is unchanged. Accumulate percentage points per UTC day, stop new refills at 30; never intentionally spend to reach a target. This bucket is shared with Gemini Pro; the delta is an upper bound during concurrent account use, not an invoice for Desk alone. Reserve at least 10% remaining capacity.
- Additional guards: 160 calls and 12,000,000 conservatively charged tokens per UTC day. Reserve 80,000 tokens before a call; replace with measured usage on success. Failed/unmeasured calls keep their reservation. Usage survives server restarts. Quota unavailable → token/call guards still apply. Failures back off 30 minutes.
- CLI overhead is substantial: measured sample ~27k input + 3.5k output tokens for 36 lines. Report actual counts from `/api/dialogues/status`; do not reuse the old “600 + 900 tokens” estimate.
- CLI runs in a Desk-owned directory with plan mode, sandbox, slash expansion disabled and bounded output/deadline (300 seconds provider-side). Streaming progress is discarded, with a 256 KB event bound and 8 MB aggregate ceiling; do not confuse repeated progress events with the final JSON size. Reject unexpected tool/delegation steps (the structured-output `finish` helper is allowed). Do not claim the CLI advertises zero tools: the installed CLI still advertises capabilities. Never grant bypass-permission flags or alter user/global provider settings.

## Creative direction
- Mostly natural, short exchanges: professional curiosity, a small disagreement, a useful question, everyday rituals. No constant “Mola” heading, slogans, aphorisms or forced coffee metaphors.
- Products: prototype backstage, user perspective, design clinic, tradeoffs. Research: methods, strength of evidence, curiosity wall, questioning headlines. Personal growth: application backstage, interview practice, writing clinic, portfolio choices.
- At least 55% desk/visit lines; coffee + water at most 15% of a substantial refresh (server enforces the drink cap). At least half generic lines, remaining lines assigned to exact role names. No fictitious completed tasks or inter-agent handoffs.
- Suitable curator role per office is selected from its station metadata, falling back to its coordinator. This is a presentation responsibility: **Desk's own service calls MCP**, not a tool-enabled CLI launched inside the external project. No green diamond for news or weather reading.
- Visits contain four substantive alternating turns (`text`, `reply`, `followUp`, `answer`); never end with only a greeting and acceptance. `ConversationDirector` holds both nearby participants for the complete exchange, with at most one concurrent conversation and a 60-second participant cooldown. New work, waiting, separation, expiry or scene changes cancel it.

## Public context and privacy
- `server/briefing-mcp.js` implements a real stdio MCP `get_daily_briefing` tool; `briefing-client.js` performs initialize → initialized → tools/call. `briefing.js` uses allowlisted public RSS and Open-Meteo, bounded bodies/timeouts, hourly shared caches and dated sources. It accepts no arbitrary URL, credentials or filesystem tools.
- Office topics select technology, science, culture or business feeds. Only short headlines and source metadata enter the prompt; no article bodies. News expires within six hours of retrieval and no later than 48 hours after publication.
- Weather is **opt-in via browser geolocation** in “Ofis yaşamı → Konumumu kullan”. Store coordinates rounded to 0.1 degrees locally; only the weather service receives them. Gemini receives weather facts, never coordinates. “Hava konumunu sil” removes the location and invalidates active weather dialogue. Denied/unavailable location means no invented local weather.
- Source-bound generated lines must refer to a supplied `sourceId`; server attaches the trusted URL/date/expiry. The picker removes expired context. A small bubble arrow opens the public source; the conversation popup shows publisher and date.
- Model sees bounded office/station names and missions, recent station names, creative concept and vetted public briefing. **Never** private chat, prompts, transcripts, tool bodies or private document contents. Headlines/role descriptions are untrusted data, not instructions.

## Selection and offline behavior
- `app/src/services/dialogues.ts` loads the pool once and rechecks at bounded intervals. Background-refresh polling stops after four retries; a `dialogues` SSE event immediately reloads an already displayed scope when generation finishes, including slow queued refills. Generic built-ins cover missing role/kind combinations.
- Match role-specific lines only to that role. Avoid the last 12 texts, never repeat a text within 60 seconds; silence is preferable to instant repetition. At most one new ambient speech every ten seconds per displayed scene.
- Preserve source metadata and expiry through cache/load/selection. Refresh cache version when generation contracts change.
- Everyday activities are need/distance driven (`smart-objects`), not a scheduled coffee announcement. Real work and observed waiting interrupt them.

## Verification
- Server: validation, single refresh, persistent budgets, failure backoff, provider/model selection, quota parsing, sources and expiry, MCP tool restrictions, opt-in location and clearing.
- Client: role filtering, cooldown/silence, bounded fetch retries, template names, expired sources, source links and location-denied states.
- Run `visual-qa`: ordinary speech without “Mola”, two-person conversation, news heading, weather permission flow, queues and work interruption. Distinguish real provider/feed checks from fixture-only animation checks.

Official integration references: [Antigravity headless](https://www.antigravity.google/docs/cli/headless/), [MCP stdio](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports), [Open-Meteo](https://open-meteo.com/en/docs).

## Shared spaces and encounters
- Floor views use a shared `floor:<id>` pool informed by all offices; generic lines dominate so strangers can converse. There is no floor manager or extra routing call.
- Both floor and office views use walkable collision paths, social needs and group-aware destinations. Floor residents may visit other offices; department residents may visit other rooms. Do not restrict conversation to a home office.
- Nearby available sims may spontaneously converse while passing. Reserve both participants, face them toward each other, and continue all four turns. Destinations and service queues remain bounded; ambient travel never means a real assignment.
- Vary observation, friendly disagreement, design questions, news interpretation, writing, weather and ordinary life. Avoid stock eye-rest/window announcements and automatic coffee introductions. Built-ins must also contain complete exchanges.

## Reading a conversation
Do not show creative concept labels above speech. Clicking either participant opens a small popup with already-spoken turns, speaker names and live additions; never reveal future replies. Retain only the last 20 ambient conversations in scene memory and clear them on view changes. Closing the popup must keep it closed during later replies; clicking a participant opens it again. No transcript persistence or model submission.

## Gemini dialogue creator and daily AI-assisted news search
- `server/dialogue-creator.js` is the editorial module. Once per UTC day and scope/role signature, Flash selects up to three public professional search queries grounded in actual role missions. Cache the query plan; rotate interests over days. Never search personal names, private project names, paths or chat content.
- The Desk-owned MCP executes these queries against Bing News RSS, alongside topic feeds and opt-in weather. Keep only dated results from the last 48 hours, up to three per query; cache searches six hours. Source URLs are public HTTPS links, never fetched by the search service. No fabricated search result or article body.
- Both curation and generation call the same accounted Flash runner, queue and daily budget. There is no unmetered second model call or provider fallback. First daily refill normally takes two model calls; later refills reuse the editorial plan.
- Around one-third of scenarios concern everyday life, time, success, luck, learning, rest and friendly philosophical disagreement. Use candid, conversational, lightly irreverent sports-commentary energy, without slogans, personal insults or imitation catchphrases. Keep real disagreement and unfinished questions; avoid preaching.
- Never address a sim by a skill/project name. Speak without names, using sen/ben. Reject exact role names and legacy `{name}`/`{other}` templates in new generated speech; remove placeholders from legacy client lines. Role labels may identify speakers in the popup.
- No topic headings above bubbles. Public-source speech retains a small clickable arrow; the conversation popup shows the publisher link.

## Reading pace and SMS stacks
Each turn lasts 6.5–11.5 seconds, scaled to text length. Keep the latest three spoken cards in one shared conversation stack: a new card appears below earlier cards, which move upward instead of being replaced. Fit stacks within the canvas; reserve separate rectangles for different threads so cards cannot overlap. Small viewports may hide older cards; the live popup retains every spoken turn. Active participants show a clickable chat badge until the exchange ends or real work interrupts it.
