// Subscription CLI only: no credentials are inspected and no other provider is used.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export function latestFlash(text) {
  const models = text.split(/\r?\n/).map(s => s.split(/\s+/)[0]).filter(s => /^gemini-\d+(?:\.\d+)?-flash-low$/.test(s));
  models.sort((a, b) => b.localeCompare(a, 'en', { numeric: true }));
  if (!models.length) throw new Error('flash-unavailable');
  return models[0];
}

export function geminiQuota(envelope) {
  const group = envelope?.command?.data?.groups?.find(g => g.name === 'Gemini Models');
  const bucket = group?.buckets?.find(b => b.id === 'gemini-5h' && !b.disabled);
  return Number.isFinite(bucket?.remaining_fraction) && bucket.remaining_fraction >= 0 && bucket.remaining_fraction <= 1
    ? { remaining: bucket.remaining_fraction, resetAt: bucket.reset_time } : null;
}

export function createAntigravityRunner({ dataDir, bin = process.env.DESK_AGY_BIN || 'agy' }) {
  const cwd = join(dataDir, 'dialogue-runtime');
  mkdirSync(cwd, { recursive: true });
  let selected;
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => ['HOME', 'USER', 'LOGNAME', 'TMPDIR', 'PATH', 'LANG', 'DESK_FAKE_AGY'].includes(k)));
  function command(args, { stream = false, timeoutMs = 330_000 } = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
      let output = '', pending = '', diagnostic = '', result, failure, bytes = 0;
      const category = value => /quota|rate.?limit|resource.exhausted|capacity|429/i.test(value) ? 'antigravity-quota-or-capacity' : /timeout|timed out/i.test(value) ? 'antigravity-timeout' : /schema|json/i.test(value) ? 'antigravity-schema' : /auth|sign.in|login/i.test(value) ? 'antigravity-auth' : 'antigravity-failed';
      const stop = reason => { failure = new Error(reason); child.kill('SIGKILL'); };
      const timer = setTimeout(() => stop('antigravity-timeout'), timeoutMs);
      child.stdout.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > (stream ? 8 * 1024 * 1024 : 256 * 1024)) return stop('antigravity-output-limit');
        if (!stream) { output += chunk; return; }
        pending += chunk;
        if (pending.length > 256 * 1024) return stop('antigravity-event-limit');
        let end;
        while ((end = pending.indexOf('\n')) >= 0) {
          const line = pending.slice(0, end); pending = pending.slice(end + 1);
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.step_update?.step_type === 'tool' && event.step_update?.tool_name !== 'finish' || event.step_update?.subagent_info) return stop('antigravity-unexpected-tool:' + String(event.step_update?.tool_name ?? 'unknown').replace(/[^\w.-]/g, '').slice(0, 50));
            if (event.event === 'result') result = event.result;
          } catch { stop('antigravity-invalid-output'); }
        }
      });
      child.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk).slice(-3000); bytes += chunk.length; if (bytes > (stream ? 8 * 1024 * 1024 : 256 * 1024)) stop('antigravity-output-limit'); });
      child.on('error', () => { clearTimeout(timer); reject(new Error('antigravity-unavailable')); });
      child.on('close', code => {
        clearTimeout(timer);
        if (failure || code !== 0) return reject(failure || new Error(category(diagnostic)));
        if (!stream) return resolve(output);
        if (result?.status !== 'SUCCESS') return reject(new Error(category(String(result?.error ?? ''))));
        try {
          const value = result.structured_output ?? JSON.parse(result.response);
          resolve({ ...value, usage: result.usage, model: selected });
        } catch { reject(new Error('antigravity-invalid-json')); }
      });
      child.stdin.end();
    });
  }
  return async (system, input, schema, { model = 'latest-flash' } = {}) => {
    let before = null;
    try { before = geminiQuota(JSON.parse(await command(['-p', '/usage', '--output-format', 'json', '--print-timeout', '10s'], { timeoutMs: 15_000 }))); } catch { /* token/call caps still apply */ }
    if (before && before.remaining < 0.1) throw new Error('antigravity-quota-low');
    selected = model === 'latest-flash' ? latestFlash(await command(['models'], { timeoutMs: 15_000 })) : model;
    if (!/^gemini-\d+(?:\.\d+)?-flash-low$/.test(selected)) throw new Error('flash-model-required');
    const result = await command(['-p', `${system}\n\n${input}\nUse no tools, files, browsing, skills or delegation. Answer from supplied metadata only.`, '--model', selected,
      '--mode', 'plan', '--sandbox', '--disable-slash-commands', '--output-format', 'stream-json', '--json-schema', JSON.stringify(schema), '--print-timeout', '300s'], { stream: true });
    let after = null;
    try { after = geminiQuota(JSON.parse(await command(['-p', '/usage', '--output-format', 'json', '--print-timeout', '10s'], { timeoutMs: 15_000 }))); } catch { /* missing quota never triggers more model calls */ }
    return { ...result, quota: { before, after, points: before && after && before.resetAt === after.resetAt ? Math.max(0, before.remaining - after.remaining) * 100 : null } };
  };
}
