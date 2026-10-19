# .agents

Single source of truth for agent skills and reference docs, read by both
Claude Code and Codex CLI.

- `skills/<name>/SKILL.md` — Agent Skills open-standard format
  (frontmatter: `name` + `description`). `.claude/skills` symlinks here.
- Other `*.md` files — reference docs that `AGENTS.md` points to on demand.

Add project-specific skills here; keep `AGENTS.md` short and route to them.
