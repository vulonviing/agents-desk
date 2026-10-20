// The shell command that resumes a CLI session in its project folder. Session ids are validated by the caller; the folder is
// single-quoted so no character in a path can end the quote.
export const shellQuote = (value) => `'${String(value).replaceAll("'", `'\\''`)}'`;

export function resumeCommand(provider, sessionId, cwd) {
  const resume = provider === 'codex' ? `codex resume ${sessionId}` : `claude --resume ${sessionId}`;
  return `cd ${shellQuote(cwd)} && ${resume}`;
}
