---
name: coordinator-sessions
description: Use when changing what an office coordinator IS and how it is driven: binding a real Claude Code/Codex CLI session to a coordinator, resuming or starting sessions, provider choice, several sessions per office, permissions/safety of coordinator sessions, delegation to skills, and failure handling (server/coordinators.js, server/chat.js, server/llm.js, scanner/observer.js). Not for the terminal widget (embedded-terminal) or chat layout (chat-experience).
---

# Coordinator sessions

Target design (user-approved direction): **a coordinator is a real, capable CLI session** the user runs in that project's repo
(Claude Code or Codex) — not a separate restricted model call that imitates one. Whatever the CLI really does (run a skill, read files,
edit) is what the office shows, through observation (`live-signals`) and lifecycle animations (`agent-lifecycle`).

> **Status:** today `server/chat.js` runs restricted, read-only calls (Claude: Read/Grep/Glob/Skill; Codex: no tools, two-step skill contract).
> `AGENTS.md` currently requires read-only coordinator chats. Moving to full-capability sessions **changes those hard rules**: do it only
> together with an explicit `AGENTS.md` update (see Safety below). Until then, keep the read-only behaviour.

## Model
- One permanent, named **coordinator per office** (`server/coordinators.js`). Its first observed CLI session binds to it; each further session spawns an additional
  coordinator with a stable, hashed session identity. Coordinators are first in the roster (`Ajanlar`).
- A coordinator has: `provider` (claude | codex), `sessionId` (real thread id, server-side only), `cwd` (the office's repo), `state` (idle, working, waiting, unbound), `lastEvent`.
- Starting: if no session is bound, clicking "Başlat" creates one in the office repo (`claude` / `codex` via the embedded terminal, see `embedded-terminal`). Resuming: `claude --resume <id>` / `codex resume <id>`
  only for a known, **idle** session; a working external turn answers 409. Missing/unknown ids cannot be resumed. Never silently switch provider or session.
- Provider is chosen explicitly in the toolbar (CLI selection) and stays with the bound session.

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
- Terminal widget → `embedded-terminal`. Chat layout/streaming → `chat-experience`. Signals → `live-signals`. Sim reactions → `agent-lifecycle`.
