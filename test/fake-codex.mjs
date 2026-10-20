// Controlled Codex events; no model or tools run in tests.
import { appendFileSync, readFileSync } from 'node:fs';
const args = process.argv.slice(2);
if (args[0] === 'debug') {
  console.log(JSON.stringify({ models: [{ slug: 'test', apply_patch_tool_type: 'freeform', experimental_supported_tools: ['clock'], tool_mode: 'code_mode_only', multi_agent_version: 'v2' }] }));
  process.exit(0);
}
const flag = (f) => args[args.indexOf(f) + 1];
let input = ''; for await (const c of process.stdin) input += c;
if (process.env.DESK_CODEX_LOG) appendFileSync(process.env.DESK_CODEX_LOG, JSON.stringify({ args, input, schema: JSON.parse(readFileSync(flag('--output-schema'))), apiKeys: Object.keys(process.env).filter((k) => /^(OPENAI_|ANTHROPIC_)/.test(k)) }) + '\n');
const out = (e) => console.log(JSON.stringify(e));
if (process.env.DESK_CODEX_FAIL) { out({type:'turn.failed',error:{message:'quota exhausted'}}); process.exit(1); }
if (process.env.DESK_CODEX_TOOL) { out({type:'item.started',item:{type:'command_execution'}}); await new Promise((r) => setTimeout(r, 1000)); process.exit(0); }
const schema = JSON.parse(readFileSync(flag('--output-schema')));
const result = { reply: 'codex reply', ...(schema.properties?.stationId ? { stationId: process.env.DESK_CODEX_STATION ?? '' } : {}) };
out({type:'thread.started',thread_id:'11111111-1111-4111-8111-111111111111'});
out({ type:'item.completed',item:{type:'agent_message',text:JSON.stringify(result)} });
out({type:'turn.completed'});
