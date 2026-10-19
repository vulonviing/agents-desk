import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export function tmp() {
  return mkdtempSync(join(tmpdir(), 'desk-test-'));
}

export function write(dir, rel, content = '') {
  const p = join(dir, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}

export function git(dir, args, date) {
  const env = { ...process.env };
  if (date) {
    env.GIT_AUTHOR_DATE = date;
    env.GIT_COMMITTER_DATE = date;
  }
  return execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-C', dir, ...args], {
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

// Creates a git repo with one commit per [relPath, isoDate] pair.
export function makeRepo(dir, commits) {
  mkdirSync(dir, { recursive: true });
  git(dir, ['init', '-q', '-b', 'main']);
  for (const [rel, date] of commits) {
    write(dir, rel, `content of ${rel}\n`);
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', `add ${rel}`], date);
  }
}
