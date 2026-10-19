# agents-desk — Agent Instructions

## Project

Goal: a simulation-style desk that shows and manages every repo and agent in
`~/Documents`. Fill in architecture and current state here as the project
takes shape; link to `.agents/` docs for detail instead of inlining it.

## graphify

If `graphify-out/` exists, run `graphify query "<question>"` before browsing or
grepping source, and `graphify update .` after modifying code. When the user
types `/graphify`, invoke the `graphify` skill first.

## Skills

Skills live in `.agents/skills/<name>/SKILL.md` (symlinked at
`.claude/skills`). Read a skill only when its task comes up; do not load all of
them at once. When spawning a subagent, name the skills it must use in the
prompt.

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
- When the file exceeds ~58 KB, compact it to the 10 most recent steps
  (tag git history first).

## Documentation Rules

- Do not create micro-level README files by default. Allow them only for
  durable public surfaces, subsystem contracts, generated run artifacts, or
  folders needing provenance. Prefer the nearest parent README or docstrings.
- Keep docs current; mark superseded docs as archive instead of leaving them
  ambiguous.

## Planning-Mode User Decisions (hard rule)

- No auto-resolution timers for user decisions; wait for an explicit answer
  unless a default was already authorized.
- In Plan Mode, ask every critical decision (scope, sources, output
  locations, repository rules) before locking it into a plan.

## Glossary

- **Building** = Agents Desk (the whole app). **Floor** = category of projects.
- **Room** = a project with its own subsystems (e.g. Emrecan CV). **Desk** = one project or subsystem.
- **Book** = a skill installed in a project. **Character** = a live agent session (later sprint).
- **Lobby** = shared services (reception, library, bulletin, approvals; later sprints).
- **Dust** = how long a project has had no commit; it clears on the next commit.

## Safety

- Everything runs from this repo. Never edit, commit, or push in another repo
  under `~/Documents`; they are read-only inputs.
- The scanner reads git metadata via `git --no-optional-locks -C <repo>` and
  README/AGENTS.md/SKILL.md files only. It never reads `.env*`, `node_modules`,
  or `.git` internals, and never follows symlinks outside the repo.
- Nothing is written outside this repo. The `workspace/<slug>` symlinks live
  here and point at the projects.
- Creating a GitHub repo or pushing needs explicit user approval each time.

## Language

UI text is Turkish; code, comments, and docs are English.

## Code Style

- Node >= 22, ES modules, no npm dependencies; built-in `node:test` for tests.
- Vanilla JS canvas front end (`office/`), no build step.
