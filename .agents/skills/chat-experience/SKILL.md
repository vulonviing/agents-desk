---
name: chat-experience
description: Use when designing or changing the conversation UI with Master and coordinators: the left chat panel, how messages stream, tool/skill activity cards ("cv-search çalışıyor…"), Markdown rendering, history, the Master's CLI-output toggle, empty/error states, and how a chat turn is reflected on the sims. Not for the session model (coordinator-sessions). There is no embedded terminal (user decision).
---

# Chat experience

Goal: talking to a coordinator feels like talking to that repo's real CLI session — and the office shows what the session is doing while you talk.

## Decisions (user-approved, 2026-10-20)
- **One session, one chat.** A coordinator conversation is a single CLI session resumed on every message (`--resume`/`resume`); never start a fresh session per message. It continues until the user presses **Yeni konuşma** — switching CLI, floor or office never resets it (the Master keeps one thread per CLI: `threadKey`).
- **No accidental loss.** Leaving a floor/office by mistake does not end the chat: the panel is kept for a **keep-alive time (20 min, `desk-chat-keep-min`)** and reopens by itself when the user returns (`chatMemory` in `officeStore`); after the time it is not restored, and a chat closed on purpose is forgotten. The CLI session/history stays, so the user can still reopen it.
- **Resume command.** A coordinator with a real session has a **"Resume kopyala"** button: it copies `cd '<project>' && claude --resume <id>` or `codex resume <id>` so the user continues the same session in their own terminal. Desk never types into a terminal. The real thread id is returned only by this explicit GET (loopback, validated, shell-quoted) — see `coordinator-sessions`.
- **No "Tur tamamlandı" log.** Completed turns are not shown in the chat timeline, the profile "İş akışı" list, or as a sim bubble (the answer in chat is the signal); errors ("Tur kesildi") still show.
- **CLI çıktısı toggle** is on every coordinator chat too (`GET /api/agents/:id/terminal`, same bounded log and SSE `manager-cli`; status/output/error only, never prompts).
- **Master = coordinator layout.** The Master uses the same `ChatShell` (header, log, composer, "Yeni konuşma") as every coordinator, in the same left panel; only its routing choices ("Ofise git", clarification options) and a "CLI çıktısı" toggle are Master-specific.

## Layout (target)
- Clicking a coordinator (or Master) opens a **chat panel on the left**; the canvas stays visible beside it and focuses the sim. The terminal (when available) opens in a pane at the top; chat and terminal are two views of the **same session** (toggle, not two sessions).
- Header: name, office, provider (Claude/Codex), state (hazır, çalışıyor, yanıt bekliyor, bağlı değil) and a "Sime git" button. Technical details (ids, model, paths) collapsed.
- Today's right-dock profile (mission + chat) is the starting point (`app/src/components/AgentPanel/ChatBox.tsx`, `RoomPanel/DockPanel.tsx`); moving it left is a layout change handled with `office-ui-hud` rules.

## Messages and activity
- Streaming text as it arrives; Markdown through the **safe renderer** (`components/Chat/FormattedMessage.tsx`): paragraphs, headings, lists, emphasis, code, HTTPS links, never raw HTML.
- **Activity cards** between messages when the session does something observable: "Skill çalışıyor: cv-search", "Dosya okundu: <basename>", "Bekliyor ✋ izin". Sourced from observed events only (`live-signals`), never invented; each card links to the sim ("Sime git").
- Input: Enter sends, Shift+Enter newline, length limits shown, disabled while a turn is working (409 shown in Turkish), "durdur" only if the session really supports interrupt.
- History: bounded (Desk's own messages only; never imported external transcripts); "Görünümü temizle" clears the view only and says so.
- Errors: short Turkish message + what to do; an unknown skill/station choice is **not** an error (see `coordinator-sessions`); connection loss shows state, not an empty panel.

## Reflection on the sims (the point of the feature)
Sending "cv ara" → the real CLI runs the skill → observer sees Skill/SKILL.md events → the skill's sim walks to its desk, green diamond while observed work lasts → the activity card appears in chat → on completion the printer/✔ bubble.
The sim reaction must never run ahead of, or without, a real event; no fake "working" while the model merely thinks about a reply (use the thinking state for that).

## Rules
1. One source of truth per session: chat view, terminal and sims read the same session state.
2. Accessible: `aria-live` for new messages, focus stays in the input after send, keyboard path to open/close, contrast ≥ 4.5:1.
3. Mobile: chat becomes a bottom sheet; terminal is optional there.
4. Privacy: nothing in chat is persisted to disk; tool bodies and prompts never leave the server except the user's own messages shown back.
5. Turkish UI strings; code and comments English.

## Checks (must pass before "done")
- Component tests: Markdown safety (no HTML), streaming append, disabled/409 states, activity cards only from events, clear-view semantics.
- `visual-qa`: screenshots with chat left + canvas, an activity card, an error state, mobile bottom sheet, and the cv-search sequence (message → card → skill desk lights up → done).

## Read when needed
- Session rules → `coordinator-sessions`; panel/layout rules → `office-ui-hud`; signals → `live-signals`.

## Turn status clarity
Merge real observation cards chronologically with messages; never append old outcomes below the latest user turn. Collapse duplicate terminal observations and omit an outcome already represented by a nearby Desk answer/error. Show one live indicator for busy or externally working state, replacing the separate typing bubble. Filter observations by bound provider and disable sends during external activity.
