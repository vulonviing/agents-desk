// The shell command that resumes a CLI session in its project folder. Session ids are validated by the caller; the folder is
// single-quoted so no character in a path can end the quote.
export const shellQuote = (value) => `'${String(value).replaceAll("'", `'\\''`)}'`;

export function resumeCommand(provider, sessionId, cwd) {
  const resume = provider === 'codex' ? `codex resume ${sessionId}` : `claude --resume ${sessionId}`;
  return `cd ${shellQuote(cwd)} && ${resume}`;
}

/** The command that opens a project's own CLI in its folder (archive "bağlan"). Nothing is run by Desk; the user pastes it. */
export function connectCommand(provider, cwd) {
  return `cd ${shellQuote(cwd)} && ${provider === 'codex' ? 'codex' : 'claude'}`;
}
