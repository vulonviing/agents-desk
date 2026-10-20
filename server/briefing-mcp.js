// Desk-owned MCP server: one read-only tool, public RSS and optional city-level weather.
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBriefing } from './briefing.js';
export const BRIEFING_TOOL = { name: 'get_daily_briefing', description: 'Get dated public news headlines and optional city weather for ambient office discussion.', inputSchema: { type: 'object', properties: { topic: { type: 'string', enum: ['technology','ai','germany','turkey','europe','science','culture','business'] }, topics: { type: 'array', maxItems: 5, items: { type: 'string', enum: ['technology','ai','germany','turkey','europe','science','culture','business'] } }, standing: { type: 'boolean' }, queries: {type:'array',maxItems:18,items:{type:'object',properties:{query:{type:'string',maxLength:100},role:{type:'string',maxLength:60}},required:['query','role'],additionalProperties:false}}, city: { type: 'string', maxLength: 80 }, latitude: { type: 'number', minimum: -90, maximum: 90 }, longitude: { type: 'number', minimum: -180, maximum: 180 } }, additionalProperties: false } };
export function createBriefingMcp(briefing) {
  return async request => {
    if (!('id' in request)) return null;
    let result;
    try {
      if (request.method === 'initialize') result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'desk-public-briefing', version: '1.0.0' } };
      else if (request.method === 'tools/list') result = { tools: [BRIEFING_TOOL] };
      else if (request.method === 'tools/call' && request.params?.name === BRIEFING_TOOL.name) {
        const args = request.params.arguments ?? {};
        if ('latitude' in args && (!Number.isFinite(args.latitude) || !Number.isFinite(args.longitude) || Math.abs(args.latitude) > 90 || Math.abs(args.longitude) > 180)) throw new Error('invalid-location');
        if (Object.keys(args).some(k => !['topic','topics','standing','city','latitude','longitude','queries'].includes(k))) throw new Error('invalid-arguments');
        if ('queries' in args && (!Array.isArray(args.queries)||args.queries.length>18||args.queries.some(q=>!q||typeof q.query!=='string'||q.query.length>100||!/^[\p{L}\p{N} '\-]+$/u.test(q.query)||typeof q.role!=='string'||q.role.length>60))) throw new Error('invalid-queries');
        result = { content: [{ type: 'text', text: JSON.stringify(await briefing.get(args)) }] };
      } else return { jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Unknown method or tool' } };
      return { jsonrpc: '2.0', id: request.id, result };
    } catch { return { jsonrpc: '2.0', id: request.id, error: { code: -32602, message: 'Briefing unavailable or invalid arguments' } }; }
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const handler = createBriefingMcp(createBriefing({ dataDir: resolve(process.argv[2] ?? 'data') }));
  for await (const line of createInterface({ input: process.stdin })) {
    if (line.length > 4096) continue;
    try { const response = await handler(JSON.parse(line)); if (response) process.stdout.write(JSON.stringify(response) + '\n'); } catch { /* malformed input */ }
  }
}
