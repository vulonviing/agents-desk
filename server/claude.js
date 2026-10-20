import { spawn } from 'node:child_process';
import { PLAN_SCHEMA, extractPlanJson, routerInput, routerPrompt } from './plans.js';

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

export const ROUTER_TOOLS = 'Read,Grep,Glob';

export function routerArgs(room) {
  return [
    '-p', '--output-format', 'json', '--json-schema', JSON.stringify(PLAN_SCHEMA),
    '--restricted', '--tools', ROUTER_TOOLS, '--permission-prompts', 'none', '--no-session-persistence', '--strict-mcp-config',
    '--append-system-prompt', routerPrompt(room),
  ];
}

// Runs the read-only router in the project's folder and resolves with the raw plan object.
export function runRouter(room, text, { timeoutMs = 180_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnClaude(routerArgs(room), { cwd: room.path });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Yönlendirici zaman aşımına uğradı.'));
    }, timeoutMs);
    child.stdout.on('data', (c) => (out += c));
    child.stderr.on('data', (c) => (err = (err + c).slice(-2000)));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`claude başlatılamadı: ${e.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && !out.trim()) return reject(new Error(`Yönlendirici çıkış kodu ${code}: ${err.trim().slice(0, 200)}`));
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

// A manager's decision: picks one id from a list. No tools at all.
export function runChoice(systemPrompt, text, schema, { cwd, timeoutMs = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    const args = ['-p', '--output-format', 'json', '--json-schema', JSON.stringify(schema), '--restricted', '--tools', '', '--permission-prompts', 'none', '--no-session-persistence', '--strict-mcp-config', '--append-system-prompt', systemPrompt];
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
