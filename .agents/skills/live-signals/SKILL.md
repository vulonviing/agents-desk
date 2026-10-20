---
name: live-signals
description: Use when changing how Agents Desk learns what Claude Code or Codex sessions are doing: the native log watcher (scanner/watch.js), the observer (scanner/observer.js), transcript classification (scanner/sessions.js, scanner/activity.js), session binding to coordinators, optional CLI hooks and their installer, privacy of the signals. Not for how characters react (agent-lifecycle).
---

# Live signals

Goal: when a CLI session starts working, the office reflects it within ~150 ms with only safe metadata, one sim per session.
Current contract: `.agents/architecture.md` ("Event-driven observation") — read it first; it is the source of truth.

## Primary source: passive observation (already built)
- `scanner/watch.js` — native filesystem notifications on `~/.claude/projects`, `~/.codex/sessions` and projects' `.agents`/`.claude` skill dirs; 100 ms coalescing; **no periodic transcript scan**
  (one-shot timers handle expiry; SSE heartbeat only). Config: `sessions.projectsDir`, `sessions.codexSessionsDir`, `sessions.liveMinutes`, `sessions.observeExternal`.
- `scanner/observer.js` — incremental, bounded log reads; skips symlinks; no history replay; stores metadata only (provider, cwd→project, model, tool, known station, timestamps, sanitized artifact basenames).
- `scanner/{sessions,activity}.js` — working/waiting classification and tool → station mapping. Skill calls and SKILL.md reads establish station context; a new prompt clears it.
- Server binds new sessions to coordinators (`server/coordinators.js`) and pushes SSE `office` frames.

## Explicit turn endings
- Passive observer now emits `completed` and `error` lifecycle metadata for supported turn-end records, without retaining response text. Suppress cold replay.
- Watcher seeds existing top-level log metadata and deduplicates identical native file notifications, avoiding FSEvents creation replay as phantom extra updates. No periodic transcript scan was added.

## Known gaps (what extra signals could fix)
- An interactive CLI that has not written a log yet is invisible; an idle terminal's exit is not detectable (sims expire after the retention window).
- "Waiting for permission" is inferred from a stale pending tool call, not an explicit event.
- Codex tool attribution to skills is weaker than Claude's.

## Optional second source: CLI hooks (opt-in, user level only)
Use only to close the gaps above, and only if the user asks for it. Never required: the office must work fully without hooks.
- **Never install or write hooks inside other repositories** (AGENTS.md hard rule). The only permitted install is the user-level opt-in installer from this repo.
- `hooks/desk-hook.mjs` (in this repo): reads Claude's stdin JSON or Codex's argv, POSTs `{event, sessionId, cwd, tool, file, ts, cli}` to `127.0.0.1:4317/api/hook`;
  1 s timeout, always exit 0, no stdout, silent when the desk is down. Events: SessionStart, UserPromptSubmit, PreToolUse/PostToolUse, PermissionRequest, Stop, SessionEnd.
  **Re-check the current hook docs (Context7/official) before implementing**; event names and payloads change.
- `hooks/README.md`: what it is for, exactly what is sent, how to disable — so nobody asks "what is this?".
- `scripts/install-hooks.mjs`: idempotent, merges tagged entries into `~/.claude/settings.json` / `~/.codex/hooks.json`, timestamped backup, `--dry-run`, `--uninstall`,
  absolute paths resolved at install time (so it works after cloning on another machine). **Ask the user before the real write.**
- `/api/hook` merges into the same session registry as the observer (same session id mapping, same privacy filter); the observer stays the fallback.

## Privacy and safety (hard rules)
- Keep only tool names, project-relative file paths/safe basenames, event names, hashed session ids, timestamps, model. Never prompts, command bodies, tool output, secrets or transcript text; nothing persisted to disk.
- CLI thread ids stay server-side (needed for validated resume); the browser sees private hashes. The one exception is the user's explicit "Resume kopyala" click (`GET /api/agents/:id/resume`, loopback, validated, shell-quoted).
- Failed tools, secret/outside paths and unknown tool formats never imply activity or document transfers.
- emrecan-vps may be *observed*; nothing is ever run for it from the office.
- Hooks (if installed) only observe: they never return permission decisions and never block the CLI.

## Checks (must pass before "done")
- Unit tests next to `scanner/*.test` / `test/`: partial log lines, symlinks, replay suppression, secret/failure filtering, concurrent sessions, expiry, watcher discovery of new roots.
- If hooks are touched: payload parsing (Claude stdin / Codex argv), `/api/hook` validation (types, lengths, loopback only), hook exit 0 in < 1.2 s with the desk down, installer dry-run/idempotence/uninstall byte-identical.
- Latency check with a fixture log → SSE → sim (target ≤ 200 ms) and a `visual-qa` sequence of arrive → work → wait → finish.

## Read when needed
- Reactions on screen → `agent-lifecycle`. Station mapping details → `scanner/activity.js`. Architecture → `.agents/architecture.md`.
