---
name: embedded-terminal
description: Use when adding or changing the in-office terminal for a coordinator: a pseudo-terminal (PTY) running the real Claude Code/Codex CLI in an office's repo, the xterm.js view, the WebSocket transport, resize/reconnect/cleanup, the "open in system Terminal" alternative, and its security limits. Not for what the coordinator is (coordinator-sessions) or the chat layout (chat-experience).
---

# Embedded terminal

Goal: click a coordinator → the real CLI session of that repo shows up as a terminal at the top of the view (or a side/bottom pane), you can type in it, and everything it does is reflected on the sims.

## Reality check (do not over-promise)
- You **cannot attach** to a terminal that is already open in Terminal/iTerm: the OS does not hand a TTY to another app. The office can (a) **start/resume** the session in its own PTY
  (`claude --resume <id>` / `codex resume <id>`), or (b) **open the system Terminal** with the same resume command and only observe it (log).
- The UI states which of the two applies. Never label an observed external terminal as controlled.

## Design
- **Server**: `node-pty` spawns the CLI with `cwd` = the office repo (validated), env = `cleanEnv()` (no `ANTHROPIC_*`). One PTY per coordinator session; reuse if it exists.
  Native dependency → needs an explicit exception to "no npm dependencies" (decision recorded in `AGENTS.md`/`architecture.md`); pin the version and document build requirements (Xcode CLT).
- **Transport**: WebSocket `/api/terminal/<id>` on 127.0.0.1 only; Host/Origin check as for other endpoints; short-lived per-session token issued by an authenticated POST; messages: `data`, `resize`, `exit`.
- **Client**: `@xterm/xterm` + fit addon in a dock/top pane; lazy-loaded; theme matches the pixel UI; copy/paste works; resize on pane change (reuse the `ResizeObserver` + per-frame safety net pattern from `GameHost`).
- **Lifecycle**: opening a second view of the same session attaches to the same PTY (multi-view, one writer); closing the pane keeps the PTY for N minutes (configurable) then ends it; server shutdown kills all PTYs; no zombie processes.
- **Scrollback**: bounded in memory (e.g. 2,000 lines). Never written to disk, never logged, never sent anywhere except the connected view.

## Security (hard rules)
- Loopback only; no remote access; refuse when Host/Origin is foreign.
- No terminal for `emrecan-vps`. Never start a PTY in a directory outside a scanned office.
- Never auto-answer CLI permission prompts and never inject input the user did not type (no scripted "yes").
- Do not add `--dangerously-skip-permissions`. The CLI's own permission system is the safety layer (see `coordinator-sessions`).
- Output is untrusted text: render only in xterm (no HTML injection); title/OSC sequences are not allowed to open links or run anything.

## Reflecting activity on the sims
Terminal output is **not** parsed for meaning (fragile, may contain secrets). Reflection comes from the CLI's logs via `live-signals`/`agent-lifecycle`.
Optional, narrow: detect a permission prompt only through hooks or a log signal, not by scraping the screen.

## Checks (must pass before "done")
- Tests with a fake CLI (like `test/fake-claude.mjs`): spawn/resume args, env stripped, cwd validated, one PTY per session, resize, exit, cleanup on server close, 403 on foreign Origin, refused for emrecan-vps.
- Browser (`visual-qa`): open from a coordinator, type, resize the dock, close and reopen (same session), narrow viewport; no console errors; FPS of the canvas unaffected.
- Manual: a harmless real session in a scratch project; the skill run shows on the skill's sim.

## Read when needed
- Session semantics → `coordinator-sessions`. Pane layout → `chat-experience`, `office-ui-hud`.
