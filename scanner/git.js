import { execFileSync } from 'node:child_process';

// Read-only git access. --no-optional-locks keeps `status` from refreshing the index.
function git(repo, args) {
  try {
    // Repo-local config is untrusted input: disable fsmonitor (it can run a hook) and the pager.
    return execFileSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.pager=cat', '-C', repo, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
      timeout: 20000,
    }).trim();
  } catch {
    return null;
  }
}

function countLines(out) {
  return out ? out.split('\n').filter(Boolean).length : 0;
}

// subpath (optional) scopes the commit and dirty info to a folder of the repo.
export function gitInfo(repo, subpath) {
  const scope = subpath ? ['--', subpath] : [];
  const log = git(repo, ['log', '-1', '--format=%cI%x09%s', ...scope]);
  let lastCommit = null;
  if (log) {
    const [date, ...rest] = log.split('\t');
    lastCommit = { date, subject: rest.join('\t') };
  }
  const aheadRaw = git(repo, ['rev-list', '--count', '@{u}..HEAD']);
  return {
    lastCommit,
    branch: git(repo, ['branch', '--show-current']) || null,
    dirty: countLines(git(repo, ['status', '--porcelain', ...scope])),
    ahead: aheadRaw === null ? null : Number(aheadRaw),
    remote: git(repo, ['remote', 'get-url', 'origin']),
  };
}
