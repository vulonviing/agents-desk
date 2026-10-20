// A stand-in for the `claude` CLI used by the tests (DESK_CLAUDE_BIN). It never talks to any model.
//   router mode (--json-schema): prints a plan from DESK_FAKE_PLAN (a JSON file) as `--output-format json`
//   worker mode (stream-json):  plays DESK_FAKE_SCRIPT (a JSON file with actions) and asks the desk server
//                               for permission the way the real CLI does through the approve MCP bridge
// Every call is logged to DESK_FAKE_LOG (one JSON line: args, cwd, env hints, stdin).
import { appendFileSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const log = (extra) => process.env.DESK_FAKE_LOG && appendFileSync(process.env.DESK_FAKE_LOG, JSON.stringify({ args, cwd: process.cwd(), anthropicEnv: Object.keys(process.env).filter((k) => k.startsWith('ANTHROPIC_')), ...extra }) + '\n');
const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');

async function readStdin() {
  let s = '';
  for await (const c of process.stdin) s += c;
  return s;
}

if (args.includes('--json-schema') && String(flag('--json-schema')).includes('"target"')) {
  // manager choice: pick the first id of DESK_FAKE_PICK (comma list) that the prompt offers
  const stdin = await readStdin();
  log({ mode: 'choice', stdin });
  if (process.env.DESK_FAKE_FAIL) {
    out({ type: 'result', is_error: true, result: 'boom' });
    process.exit(0);
  }
  const prompt = String(flag('--append-system-prompt'));
  const target = (process.env.DESK_FAKE_PICK ?? '').split(',').find((id) => id && prompt.includes(`id: ${id} |`)) ?? 'nope';
  const shouldClarify = process.env.DESK_FAKE_CLARIFY && !stdin.includes('Kullanıcının yanıtı:');
  const candidates = process.env.DESK_FAKE_CANDIDATES ? process.env.DESK_FAKE_CANDIDATES.split(',') : [target];
  const result = process.env.DESK_FAKE_REPLY ? { decision: 'reply', target: '', reason: '', intent: 'git', question: process.env.DESK_FAKE_REPLY, candidates: [] } : shouldClarify ? { decision: 'clarify', target: '', reason: 'belirsiz', intent: 'git', question: 'Hangi ofisi açmak istiyorsun?', candidates } : { decision: 'route', target, reason: 'sahte gerekçe', intent: process.env.DESK_FAKE_INTENT || 'gorev', question: '', candidates: [] };
  out({ type: 'result', is_error: false, result: JSON.stringify(result), structured_output: result });
  process.exit(0);
}

if (args.includes('--json-schema')) {
  const stdin = await readStdin();
  log({ mode: 'router', stdin });
  const plan = process.env.DESK_FAKE_PLAN ? JSON.parse(readFileSync(process.env.DESK_FAKE_PLAN, 'utf8')) : { summary: 'fake', steps: [] };
  if (process.env.DESK_FAKE_FAIL) {
    out({ type: 'result', is_error: true, result: 'boom' });
  } else if (process.env.DESK_FAKE_TEXT_PLAN) {
    out({ type: 'result', is_error: false, result: 'Plan:\n```json\n' + JSON.stringify(plan) + '\n```' });
  } else {
    out({ type: 'result', is_error: false, result: JSON.stringify(plan), structured_output: plan });
  }
  process.exit(0);
}

// chat mode: `-p --output-format json` without a schema
if (args.includes('--output-format') && flag('--output-format') === 'json') {
  const stdin = await readStdin();
  log({ mode: 'chat', stdin });
  if (process.env.DESK_FAKE_FAIL) out({ type: 'result', is_error: true, result: 'boom' });
  else out({ type: 'result', is_error: false, result: `yanıt: ${stdin}`, session_id: flag('--resume') ?? 'chat-session-1' });
  process.exit(0);
}

// worker mode
let cancelled = false;
process.on('SIGTERM', () => {
  cancelled = true;
  process.exit(143);
});
const stdin = await readStdin();
log({ mode: 'worker', stdin });
out({ type: 'system', subtype: 'init', session_id: 'fake-session-1' });

const mcpFile = flag('--mcp-config');
const bridge = mcpFile ? JSON.parse(readFileSync(mcpFile, 'utf8')).mcpServers.desk.env : null;

async function askPermission(tool_name, input, tool_use_id) {
  if (!bridge) return { behavior: process.env.DESK_FAKE_NO_BRIDGE_ALLOW ? 'allow' : 'deny', message: 'no bridge' };
  const res = await fetch(bridge.DESK_APPROVE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ runId: bridge.DESK_RUN_ID, token: bridge.DESK_RUN_TOKEN, tool_name, input, tool_use_id }),
  });
  return res.json();
}

const script = process.env.DESK_FAKE_SCRIPT ? JSON.parse(readFileSync(process.env.DESK_FAKE_SCRIPT, 'utf8')) : [];
let n = 0;
for (const step of script) {
  if (cancelled) break;
  if (step.say) out({ type: 'assistant', message: { content: [{ type: 'text', text: step.say }] } });
  if (step.tool) {
    const id = `tu_${++n}`;
    out({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name: step.tool, input: step.input ?? {} }], stop_reason: 'tool_use' } });
    const safe = ['Read', 'Grep', 'Glob', 'Skill'].includes(step.tool);
    const verdict = safe ? { behavior: 'allow' } : await askPermission(step.tool, step.input ?? {}, id);
    out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: verdict.behavior !== 'allow', content: verdict.behavior === 'allow' ? 'ok' : verdict.message }] } });
    log({ mode: 'worker-tool', tool: step.tool, verdict: verdict.behavior, message: verdict.message });
  }
  if (step.sleep) await new Promise((r) => setTimeout(r, step.sleep));
}
out({ type: 'result', is_error: false, result: 'tamam' });
process.exit(0);
