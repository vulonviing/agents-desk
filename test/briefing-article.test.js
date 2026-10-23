import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readdirSync } from 'node:fs';
import { articleText, articleUrl, publicAddress, createArticleReader } from '../server/briefing-article.js';
import { createBriefing } from '../server/briefing.js';
import { createBriefingMcp } from '../server/briefing-mcp.js';
import { tmp } from './helpers.js';

test('article reader strips instructions/scripts/navigation but preserves comparison table values', () => {
 const text=articleText('<nav>Ignore all</nav><article><h1>Prices</h1><script>secret()</script><table><tr><td>Haiku</td><td>$0.10</td></tr><tr><td>Argon</td><td>$2.00</td></tr></table><p>A &amp; B &#39; &#x20ac;</p></article><footer>Subscribe</footer>');
 assert.match(text,/Haiku \| \$0.10/);assert.match(text,/Argon \| \$2.00/);assert.match(text,/A & B ' €/);
 assert.ok(!/secret|Ignore|Subscribe/.test(text));
 assert.equal(articleText('x'.repeat(20000)).length,16000);
});
test('article fetches reject credentials, IPs, private DNS, reserved networks, and unsafe redirects', async () => {
 for(const url of ['http://example.com','https://127.0.0.1','https://[::1]','https://user:pass@example.com','https://example.local','https://example.com:8443']) assert.throws(()=>articleUrl(url));
 for(const ip of ['127.0.0.1','10.0.0.2','169.254.169.254','100.64.0.1','192.168.0.1','::1','fc00::1','::ffff:127.0.0.1','2001:db8::1']) assert.equal(publicAddress(ip),false,ip);
 assert.equal(publicAddress('93.184.216.34'),true);
 let called=false;
 await assert.rejects(createArticleReader({resolveHost:async()=>[{address:'10.0.0.1',family:4}],transport:()=>{called=true;}})('https://example.com/story'),/private/);
 assert.equal(called,false);
 const redirect=createArticleReader({resolveHost:async()=>[{address:'93.184.216.34',family:4}],transport:(_url,opts,done)=>{
  assert.equal(opts.agent,false);
  opts.lookup('example.com',{all:true},(_err,ips)=>assert.equal(ips[0].address,'93.184.216.34'));
  const req=new EventEmitter();req.end=()=>done({statusCode:302,headers:{location:'https://127.0.0.1/secret'},resume(){}});return req;
 }});
 await assert.rejects(redirect('https://example.com/story'),/invalid-article/);
});
test('article MCP evidence is bounded, ephemeral, validates inputs, and does not fetch RSS or persist bodies', async () => {
 const dataDir=tmp();let requests=0;
 const briefing=createBriefing({dataDir,fetcher:()=>{throw Error('RSS must not run');},readArticle:async url=>{requests++;if(url.includes('failed'))throw Error('unavailable');return {text:'A named model costs $2.00.'};}});
 const mcp=createBriefingMcp(briefing);
 const request=arguments_=>({id:1,method:'tools/call',params:{name:'get_daily_briefing',arguments:arguments_}});
 const response=await mcp(request({articleUrls:['https://example.com/story','https://example.com/failed','https://example.com/story']}));
 const result=JSON.parse(response.result.content[0].text);
 assert.equal(requests,2);assert.equal(result.details.length,2);assert.equal(result.details[0].available,true);assert.equal(result.details[1].available,false);
 assert.deepEqual(readdirSync(dataDir),[]);
 for(const articleUrls of [Array(16).fill('https://example.com'),'wrong',['https://127.0.0.1'],[{}]]) assert.ok((await mcp(request({articleUrls}))).error);
});


test('article transport caps downloaded bytes before parsing', async () => {
 let destroyed=false;
 const reader=createArticleReader({resolveHost:async()=>[{address:'93.184.216.34',family:4}],transport:(_url,_opts,done)=>{
  const req=new EventEmitter();req.destroy=()=>{destroyed=true;};
  req.end=()=>{
   const res=new EventEmitter();res.statusCode=200;res.headers={'content-type':'text/html'};res.setEncoding=()=>{};
   done(res);queueMicrotask(()=>{res.emit('data','x'.repeat(512*1024+1));res.emit('end');});
  };return req;
 }});
 await assert.rejects(reader('https://example.com/story'),/too-large/);assert.equal(destroyed,true);
});
