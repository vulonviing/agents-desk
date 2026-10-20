#!/usr/bin/env node
// Permission bridge for sessions started from the office: `claude --permission-prompt-tool mcp__desk__approve`.
// The CLI calls the `approve` tool for every action it may not do on its own; we forward the request to
// the desk server, which applies the room's policy and, when needed, waits for the user's decision.
// Line-based JSON-RPC over stdio (the MCP stdio transport). No dependencies.
import http from 'node:http';
import { createInterface } from 'node:readline';

const { DESK_APPROVE_URL: URL_, DESK_RUN_ID: RUN_ID, DESK_RUN_TOKEN: TOKEN } = process.env;

const send = (obj) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...obj }) + '\n');

function ask(payload) {
  return new Promise((resolve) => {
    const deny = (message) => resolve({ behavior: 'deny', message });
    if (!URL_ || !RUN_ID || !TOKEN) return deny('Ofis bağlantısı yapılandırılmamış; işlem reddedildi.');
    const body = JSON.stringify({ ...payload, runId: RUN_ID, token: TOKEN });
    const req = http.request(URL_, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          deny('Ofisten geçersiz cevap; işlem reddedildi.');
        }
      });
    });
    req.setTimeout(0); // the user may take a long time to decide
    req.on('error', () => deny('Ofis sunucusuna ulaşılamadı; işlem reddedildi.'));
    req.end(body);
  });
}

const TOOL = {
  name: 'approve',
  description: 'Asks the Agents Desk office whether a tool call is allowed.',
  inputSchema: {
    type: 'object',
    properties: { tool_name: { type: 'string' }, input: { type: 'object' }, tool_use_id: { type: 'string' } },
    required: ['tool_name', 'input'],
  },
};

createInterface({ input: process.stdin }).on('line', async (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  const { id, method, params } = msg;
  if (method === 'initialize') {
    return send({ id, result: { protocolVersion: params?.protocolVersion || '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'desk', version: '1.0.0' } } });
  }
  if (method === 'ping') return send({ id, result: {} });
  if (method === 'tools/list') return send({ id, result: { tools: [TOOL] } });
  if (method === 'tools/call') {
    const args = params?.arguments ?? {};
    const verdict = await ask({ tool_name: args.tool_name, input: args.input ?? {}, tool_use_id: args.tool_use_id ?? null });
    const out = verdict.behavior === 'allow' ? { behavior: 'allow', updatedInput: args.input ?? {} } : { behavior: 'deny', message: verdict.message || 'Reddedildi.' };
    return send({ id, result: { content: [{ type: 'text', text: JSON.stringify(out) }] } });
  }
  if (id !== undefined && id !== null) send({ id, error: { code: -32601, message: `Unsupported method: ${method}` } });
}).on('close', () => process.exit(0));
