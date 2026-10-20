// Subscription CLIs for tool-free decisions. No API keys, shell interpolation, or automatic fallback.
import { spawn, execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { ROOT } from '../scanner/scan.js';
import { runChoice, cleanEnv } from './claude.js';
import { routerInput } from './plans.js';

export const PROVIDERS = ['claude', 'codex'];
export function providerOf(value = 'claude') {
  if (!PROVIDERS.includes(value)) throw Object.assign(new Error('CLI Claude veya Codex olmalı.'), { status: 400 });
  return value;
}

const execFileAsync = promisify(execFile);
const catalogs = new Map();
const commandFor = (bin, args) => /\.(mjs|js|cjs)$/.test(bin) ? [process.execPath, [bin, ...args]] : [bin, args];

// Catalog capabilities also control native tools in newer Codex versions. Strip them in addition to
// disabling features: shell_tool=false alone still offers apply_patch and hosted tools on those models.
export function withoutTools(catalog) {
  if (!Array.isArray(catalog.models) || !catalog.models.length) throw new Error('Codex model kataloğu okunamadı.');
  return { ...catalog, models: catalog.models.map((m) => ({ ...m,
    apply_patch_tool_type: null, tool_mode: 'standard', multi_agent_version: 'none',
    experimental_supported_tools: [], supports_search_tool: false, node_repl_disabled: true,
  })) };
}
async function catalogFor(bin, env) {
  if (!catalogs.has(bin)) {
    const [cmd, args] = commandFor(bin, ['debug', 'models', '--bundled']);
    const promise = execFileAsync(cmd, args, { cwd: ROOT, env, maxBuffer: 8_000_000, timeout: 10_000 })
      .then(({ stdout }) => withoutTools(JSON.parse(stdout))).catch((err) => { catalogs.delete(bin); throw err; });
    catalogs.set(bin, promise);
  }
  return catalogs.get(bin);
}

export function codexArgs(schemaPath, catalogPath) {
  return ['exec', '--ignore-user-config', '--ephemeral', '--sandbox', 'read-only', '--json',
    '-c', `model_catalog_json=${JSON.stringify(catalogPath)}`, '-c', 'approval_policy="never"', '-c', 'mcp_servers={}', '-c', 'project_doc_max_bytes=0',
    '-c', 'web_search="disabled"', '-c', 'features.code_mode.enabled=false', '-c', 'tools.view_image=false', '-c', 'model_reasoning_effort="low"',
    ...['shell_tool', 'apps', 'multi_agent', 'plugins', 'remote_plugin', 'hooks', 'browser_use',
      'computer_use', 'image_generation', 'default_mode_request_user_input', 'view_image', 'skill_search', 'goals', 'sleep_tool', 'tool_suggest', 'multi_agent_v2', 'request_permissions_tool', 'skill_mcp_dependency_install'].flatMap((f) => ['--disable', f]),
    '--output-schema', schemaPath, '-'];
}

// Codex requires strict schemas; make every property required, with no additional keys.
export function strictSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  const result = { ...schema };
  if (schema.type === 'object') {
    result.additionalProperties = false;
    result.properties = Object.fromEntries(Object.entries(schema.properties).map(([k, v]) => [k, strictSchema(v)]));
    result.required = Object.keys(schema.properties);
  }
  if (schema.items) result.items = strictSchema(schema.items);
  return result;
}

async function executeDecision(prompt, text, schema, { provider = 'claude', timeoutMs = 120_000, onEvent = () => {}, cwd = ROOT, sessionId = null, persist = false, onSession = () => {} } = {}) {
  providerOf(provider);
  if (provider === 'claude') return runChoice(prompt, text, schema, { cwd: ROOT, timeoutMs });
  const base = join(ROOT, 'data', 'cli');
  mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, 'decision-'));
  const schemaPath = join(dir, 'schema.json');
  writeFileSync(schemaPath, JSON.stringify(strictSchema(schema)), { mode: 0o600 });
  try {
    const bin = process.env.DESK_CODEX_BIN || 'codex';
    const env = cleanEnv();
    for (const k of Object.keys(env)) if (/^(OPENAI_|AZURE_OPENAI_|CODEX_API_KEY$)/.test(k)) delete env[k];
    const catalogPath = join(dir, 'models.json');
    writeFileSync(catalogPath, JSON.stringify(await catalogFor(bin, env)), { mode: 0o600 });
    return await new Promise((resolve, reject) => {
      const args = codexArgs(schemaPath, catalogPath).filter(a => !persist || a !== '--ephemeral');
      if (sessionId) {
        if (!/^[\da-f-]{36}$/i.test(sessionId)) throw new Error('Geçersiz CLI oturum kimliği.');
        args.splice(args.length - 1, 0, 'resume', sessionId);
      }
      const child = spawn(/\.(mjs|js|cjs)$/.test(bin) ? process.execPath : bin,
        /\.(mjs|js|cjs)$/.test(bin) ? [bin, ...args] : args,
        { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
      let buffer = '', stderr = '', answer = '', size = 0;
      let failed = false;
      const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Codex zaman aşımına uğradı.')); }, timeoutMs);
      child.stdout.on('data', (chunk) => {
        size += chunk.length;
        if (size > 1_000_000) { failed = true; child.kill('SIGTERM'); return; }
        buffer += chunk;
        const lines = buffer.split('\n'); buffer = lines.pop();
        for (const line of lines) {
          try {
            const e = JSON.parse(line);
            if (e.type === 'thread.started') { if (typeof e.thread_id === 'string' && /^[\da-f-]{36}$/i.test(e.thread_id)) onSession(e.thread_id); onEvent({ kind: 'status', text: 'Codex oturumu açıldı.' }); }
            if (e.type === 'turn.started') onEvent({ kind: 'status', text: 'Ajan isteği değerlendiriyor…' });
            if (e.type === 'error' || e.type === 'turn.failed') { failed = true; stderr = e.message ?? e.error?.message ?? 'Codex hata verdi.'; }
            if (e.type === 'item.completed' && e.item?.type === 'agent_message') answer = e.item.text;
            // These sessions have no execution rights. Reject any unexpected tool event.
            if (e.item && ['command_execution', 'file_change', 'mcp_tool_call', 'web_search'].includes(e.item.type)) { failed = true; child.kill('SIGTERM'); }
          } catch { /* non-event diagnostic */ }
        }
      });
      child.stderr.on('data', (c) => { stderr = (stderr + c).slice(-2000); });
      child.once('error', (err) => { clearTimeout(timer); reject(new Error(`Codex başlatılamadı: ${err.message}`)); });
      child.once('close', (code) => {
        clearTimeout(timer);
        if (code !== 0 || failed) return reject(new Error(`Codex: ${stderr.trim().slice(-400) || 'Karar üretilemedi.'}`));
        try { resolve(JSON.parse(answer)); } catch { reject(new Error('Codex yanıtı geçerli JSON değil.')); }
      });
      child.stdin.on('error', () => {});
      child.stdin.end(`${prompt}\n\n${routerInput(text)}`);
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}


// Only this invocation's lifecycle and model output are exposed, never environment, auth, prompts or args.
export async function runDecision(prompt, text, schema, options = {}) {
  const provider = providerOf(options.provider);
  const emit = options.onEvent ?? (() => {});
  emit({ kind: 'status', text: `${provider === 'codex' ? 'codex exec' : 'claude -p'} başlatılıyor · araçlar kapalı` });
  try {
    const result = await executeDecision(prompt, text, schema, options);
    emit({ kind: 'output', text: JSON.stringify(result, null, 2) });
    emit({ kind: 'status', text: 'CLI çağrısı tamamlandı.' });
    return result;
  } catch (err) {
    emit({ kind: 'error', text: err.message });
    throw err;
  }
}
