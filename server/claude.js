import { spawn } from 'node:child_process';


const clip = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};

// What goes to a decision call's stdin: the user's text, fenced so it cannot close the fence.
export const routerInput = (text) => `<görev>\n${String(text).replaceAll('</görev>', '< /görev>')}\n</görev>`;

// `claude --output-format json` prints one JSON object; the answer is in structured_output or in the result text.
export function extractPlanJson(stdout) {
  let out;
  try {
    out = JSON.parse(stdout);
  } catch {
    throw new Error('Yönetici çıktısı okunamadı.');
  }
  if (out?.is_error) throw new Error(`Yönetici hata verdi: ${clip(out.result, 200)}`);
  if (out?.structured_output && typeof out.structured_output === 'object') return out.structured_output;
  const text = String(out?.result ?? '').replace(/```(?:json)?/g, '');
  const from = text.indexOf('{');
  const to = text.lastIndexOf('}');
  if (from < 0 || to <= from) throw new Error('Yönetici bir yanıt üretmedi.');
  try {
    return JSON.parse(text.slice(from, to + 1));
  } catch {
    throw new Error('Yöneticinin yanıtı geçerli JSON değil.');
  }
}

// Starting the Claude Code CLI. DESK_CLAUDE_BIN swaps the binary (tests use a fake one).

export function claudeCommand(args) {
  const bin = process.env.DESK_CLAUDE_BIN || 'claude';
  return /\.(mjs|js|cjs)$/.test(bin) ? { cmd: process.execPath, args: [bin, ...args] } : { cmd: bin, args };
}

// The CLI must use the user's subscription login, never an API key that happens to be in the environment.
export function cleanEnv(extra = {}) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('ANTHROPIC_')) delete env[k];
  return { ...env, ...extra };
}

export function spawnClaude(args, { cwd, env }) {
  const { cmd, args: full } = claudeCommand(args);
  return spawn(cmd, full, { cwd, env: cleanEnv(env), stdio: ['pipe', 'pipe', 'pipe'] });
}

// A manager's decision: picks one id from a list. No tools at all.
export function runChoice(systemPrompt, text, schema, { cwd, timeoutMs = 120_000, model } = {}) {
  return new Promise((resolve, reject) => {
    const args = ['-p', '--output-format', 'json', '--json-schema', JSON.stringify(schema), '--restricted', '--tools', '', '--permission-prompts', 'none', '--no-session-persistence', '--strict-mcp-config', ...(model ? ['--model', model] : []), '--append-system-prompt', systemPrompt];
    const child = spawnClaude(args, { cwd });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Yönetici zaman aşımına uğradı.'));
    }, timeoutMs);
    child.stdout.on('data', (c) => (out += c));
    child.stderr.on('data', (c) => (err = (err + c).slice(-2000)));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`claude başlatılamadı: ${e.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && !out.trim()) return reject(new Error(`Yönetici çıkış kodu ${code}: ${err.trim().slice(0, 200)}`));
      try {
        resolve(extractPlanJson(out));
      } catch (e) {
        reject(e);
      }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(routerInput(text));
  });
}
