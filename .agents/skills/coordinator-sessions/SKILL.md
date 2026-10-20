---
name: coordinator-sessions
description: Use when changing what an office coordinator IS and how it is driven: binding a real Claude Code/Codex CLI session to a coordinator, resuming or starting sessions, provider choice, several sessions per office, permissions/safety of coordinator sessions, delegation to skills, and failure handling (server/coordinators.js, server/chat.js, server/llm.js, scanner/observer.js). Not for chat layout (chat-experience). No embedded terminal exists (user decision).
---

# Coordinator sessions

Decision (user, 2026-10-20): a coordinator chat is **Desk's own read-only conversation with one persistent CLI session** per office/CLI
(`server/chat.js`: Claude with Read/Grep/Glob/Skill, Codex tool-free with a validated skill contract). **There is no embedded terminal and no
full-capability session launched from Desk.** The user's *real* terminal sessions are only **observed** (`live-signals`), shown as coordinators and
reflected on the sims; when the user wants to work in a terminal, "Resume kopyala" gives them the exact resume command to paste themselves.

## Model
- One permanent, named **coordinator per office** (`server/coordinators.js`). Its first observed CLI session binds to it; each further session spawns an additional
  coordinator with a stable, hashed session identity. Coordinators are first in the roster (`Ajanlar`).
- A coordinator has: `provider` (claude | codex), `sessionId` (real thread id, server-side; returned only by the explicit resume endpoint), `cwd` (the office's repo), `state` (idle, working, waiting, unbound), `lastEvent`.
- Starting: the first message creates Desk's chat session in the office repo; later messages resume it (`--resume` / `resume <id>`). An observed external session is resumed only when it is **idle**; a working external turn answers 409. Unknown ids cannot be resumed. Never silently switch provider or session.
- Provider is chosen explicitly in the toolbar (CLI selection) and stays with the bound session.

## Single session and resume (user-approved)
- One coordinator chat = one CLI session, resumed every turn until the user resets it; keep the resume id server-side (`chats.state(id).sessionId`) and bind observed external sessions when they exist.
- `GET /api/agents/:id/resume` (`server/resume.js`) returns `{ provider, cwd, command }` for the coordinator's session (observed session first, else Desk's own). The id must match `^[A-Za-z0-9_-]{8,80}$`, the folder is single-quoted. This is the **only** place a real thread id reaches the browser, and only on the user's click to copy.
- Navigation never ends a session; the UI keep-alive timer only decides whether the panel reopens (see `chat-experience`). A running turn is allowed to finish.

## Delegation and skills ("CV ara" → the CLI runs the skill)
- Natural language goes to the real CLI as a normal prompt; the CLI decides which skill to run (Skill tool / SKILL.md reads / scripts).
- The office does **not** pre-select skills. It observes: Skill call or SKILL.md read → station context → that skill's sim walks to its desk and gets the green diamond (observed work).
- If the observer cannot attribute a tool to a skill, activity stays at the coordinator/project level (never guess).
- **Failure rule:** an unknown or missing skill/station choice must degrade to a normal answer, never an error that blocks chat
  (bug seen: "Koordinatör geçerli bir skill seçemedi" in `server/chat.js` when the model returns an id that does not exist).

## Safety (hard rules; update AGENTS.md before relaxing anything)
- The CLI runs with **its own permission system**; the office never answers permission prompts for the user and never passes `--dangerously-skip-permissions`.
- `ANTHROPIC_*` keys are stripped from the environment (subscription login only, `cleanEnv`); no secrets are read or forwarded.
- `emrecan-vps`: no coordinator session, terminal or delegation can be started from the office (read-only observation only).
- A coordinator session only runs in its own office's folder; no path from another project; no `workspace/` traversal.
- The office never claims to control a terminal it does not own; an externally opened terminal is observed only (log), clearly labelled.
- Retained data: bounded metadata only (provider, model, tool, station, timestamps, safe basenames). No prompts/tool outputs/transcripts persisted.

## Checks (must pass before "done")
- Tests: bind first session / spawn additional coordinators; resume only idle known sessions (409 otherwise); provider stays bound; unknown skill id → normal reply; emrecan-vps refused; env stripped of API keys.
- Browser (`visual-qa`): start a session in a scratch project → sim appears, runs a skill → skill desk activates → green diamond; second session → second coordinator.

## Read when needed
- Chat layout/streaming → `chat-experience`. Signals → `live-signals`. Sim reactions → `agent-lifecycle`.
