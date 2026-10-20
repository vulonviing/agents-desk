# .agents

Single source of truth for agent skills and reference docs, read by both
Claude Code and Codex CLI.

- `skills/<name>/SKILL.md` — Agent Skills open-standard format
  (frontmatter: `name` + `description`). `.claude/skills` symlinks here.
- Other `*.md` files — reference docs that `AGENTS.md` points to on demand.

Add project-specific skills here; keep `AGENTS.md` short and route to them.
`AGENTS.md` ("Skill routing") says which skill applies to which kind of change.

Skills: `office-art-direction`, `office-layout-design`, `building-shell`, `agent-lifecycle`,
`smart-objects`, `live-signals`, `visual-qa` (mandatory gate), `pixel-asset-pipeline`,
`office-atmosphere`, `tiled-map-pipeline`, `office-ui-hud`, `coordinator-sessions`,
`embedded-terminal`, `chat-experience`, `architectural-planning`, `floor-interior-design`, `office-dialogues`. Each is one `SKILL.md`
(English, < 500 lines; put long detail in `references/` and say when to read it).
