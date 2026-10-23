// A real MCP client used by the Desk's briefing curator, independent of project CLIs.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export function getBriefing(dataDir, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL('./briefing-mcp.js', import.meta.url)), dataDir], { stdio: ['pipe','pipe','ignore'] });
    let buffer = '', bytes = 0, done = false;
    const finish = (error, value) => { if (done) return; done = true; clearTimeout(timer); child.kill(); error ? reject(error) : resolve(value); };
    const timer = setTimeout(() => finish(new Error('briefing-timeout')), args.articleUrls ? 30_000 : 40_000);
    child.stdout.on('data', chunk => {
      bytes += chunk.length; if (bytes > (args.articleUrls ? 1024 * 1024 : 512 * 1024)) return finish(new Error('briefing-too-large'));
      buffer += chunk; let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0,end); buffer = buffer.slice(end+1);
        try { const message = JSON.parse(line); if (message.id === 1) {
          child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
          child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'get_daily_briefing',arguments:args}})+'\n');
        } else if (message.id === 2) {
          if (message.error) return finish(new Error('briefing-unavailable'));
          finish(null,JSON.parse(message.result.content[0].text));
        } } catch { finish(new Error('briefing-invalid-output')); }
      }
    });
    child.on('error',()=>finish(new Error('briefing-unavailable')));
    child.on('close',()=>{if(!done)finish(new Error('briefing-unavailable'));});
    child.stdin.on('error',()=>finish(new Error('briefing-unavailable')));
    child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'agents-desk-curator',version:'1.0.0'}}})+'\n');
  });
}
