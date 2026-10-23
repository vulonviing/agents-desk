// Observe only executable names, working directories and output-file metadata.
// Never read CLI arguments, prompts, transcripts or application document contents.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { watch, existsSync } from 'node:fs';
import { basename, resolve, sep } from 'node:path';

const exec = promisify(execFile);
const TTL = 120_000;
export function artifactPhase(file) {
  const p = String(file).replaceAll('\\', '/');
  if (/^application_preparer\/applications\/.+\/(?:job-posting\.md|added-skills\.md|application-package\.md|Emrecan CV - .+\.(?:json|tex|pdf)|Cover Letter - .+\.(?:md|tex|pdf)|Bundle(?: CL)? - .+\.pdf)$/.test(p)) return 'prepare';
  if (/^linkedin_collector\/(?:state\.json|accepted\.md|rejected\.md|classified\.md)$/.test(p) || /^jobbot\/state\/inbox\/.+\.json$/.test(p)) return 'evaluate';
  if (/^linkedin_collector\/(?:descriptions\.json|library\.json|prefilter\.json|survivors\.md)$/.test(p) || /^jobbot\/state\/collect\/(?:seen\.json|runs\.log|steps\.log|outbox\/[^/]+\.json)$/.test(p)) return 'search';
  return null;
}

export async function cliProviders(root, run = exec) {
  const { stdout } = await run('/bin/ps', ['-axo', 'pid=,comm='], { timeout: 2500, maxBuffer: 512 * 1024 });
  const candidates = stdout.split('\n').flatMap(line => {
    const m = line.trim().match(/^(\d+)\s+(.+)$/);
    const provider = m && basename(m[2]);
    return ['claude', 'codex'].includes(provider) ? [{ pid: m[1], provider }] : [];
  }).slice(0, 64);
  if (!candidates.length) return [];
  // cwd only: lsof never lists open document bodies or command arguments.
  let output;
  try { output = (await run('/usr/sbin/lsof', ['-a', '-p', candidates.map(c => c.pid).join(','), '-d', 'cwd', '-Fn'], { timeout: 3500, maxBuffer: 64 * 1024 })).stdout; }
  catch (err) { if (!err.stdout) throw err; output = err.stdout; }
  const found = new Set(); let pid;
  for (const line of output.split('\n')) {
    if (line.startsWith('p')) pid = line.slice(1);
    if (!line.startsWith('n')) continue;
    const cwd = resolve(line.slice(1)), target = resolve(root);
    if (cwd === target || cwd.startsWith(target + sep)) {
      const c = candidates.find(c => c.pid === pid); if (c) found.add(c.provider);
    }
  }
  return [...found].sort();
}

export function createApplicationActivity({ root, onChange = () => {}, now = Date.now, providers = cliProviders, intervalMs = 4000 } = {}) {
  let state = null, evidence = null, watcher, timer, pending = false, stopped = false;
  const publish = next => { if (JSON.stringify(next) !== JSON.stringify(state)) { state = next; onChange(); } };
  function observe(file) {
    const phase = artifactPhase(file);
    if (!phase) return;
    const at = now();
    // One write batch often touches both library and evaluation files.
    const priority = { search: 1, evaluate: 2, prepare: 3 };
    if (evidence && at - evidence.at < 1500 && priority[phase] < priority[evidence.phase]) return;
    evidence = { phase, at };
  }
  async function poll() {
    if (stopped || pending || !root) return;
    pending = true;
    try {
      const active = await providers(root);
      if (!stopped) publish(active.length && evidence && now() - evidence.at < TTL
        ? { phase: evidence.phase, providers: active, observedAt: evidence.at } : null);
      if (!active.length) evidence = null;
    } catch { if (!stopped) { evidence = null; publish(null); } }
    finally { pending = false; }
  }
  return {
    snapshot: () => state,
    observe, poll,
    start() {
      if (!root || !existsSync(root) || timer) return;
      stopped = false;
      try { watcher = watch(root, { recursive: true }, (_event, file) => { if (file) observe(file); }); watcher.on('error', () => { evidence = null; publish(null); }); watcher.unref(); } catch { return; }
      timer = setInterval(() => void poll(), intervalMs); timer.unref(); void poll();
    },
    stop() { stopped = true; watcher?.close(); clearInterval(timer); timer = null; },
  };
}
