import test from 'node:test';
import assert from 'node:assert/strict';
import { createBriefing, feedsOf, parseFeed, parseSearchFeed, STANDING_QUERIES, TOPICS } from '../server/briefing.js';
import { createBriefingMcp } from '../server/briefing-mcp.js';
import { tmp } from './helpers.js';
const at = Date.parse('2026-10-20T10:00:00Z');
const item = (date = at, url = 'https://www.bbc.com/news/articles/test') => `<item><title><![CDATA[Research &amp; evidence]]></title><link>${url}</link><pubDate>${new Date(date).toUTCString()}</pubDate></item>`;
test('public briefing rejects old/future/foreign links and retains source dates, never article bodies', () => {
  const lines = parseFeed(`<rss>${item()}${item(at-3*86400000)}${item(at+86400000)}${item(at,'http://127.0.0.1/secret')}</rss>`, 'science', at);
  assert.equal(lines.length,1);assert.equal(lines[0].title,'Research & evidence');assert.equal(lines[0].publisher,'BBC Science');assert.ok(lines[0].expiresAt>at);
});
test('MCP exposes only the bounded public briefing tool and validates arguments', async () => {
  const handler=createBriefingMcp({get:async args=>({sources:[],...args})});
  assert.equal((await handler({jsonrpc:'2.0',id:1,method:'initialize'})).result.serverInfo.name,'desk-public-briefing');
  assert.equal((await handler({id:2,method:'tools/list'})).result.tools.length,1);
  assert.ok((await handler({id:3,method:'tools/call',params:{name:'get_daily_briefing',arguments:{url:'http://127.0.0.1'}}})).error);
  assert.ok((await handler({id:4,method:'tools/call',params:{name:'get_daily_briefing',arguments:{latitude:100,longitude:0}}})).error);
  assert.equal((await handler({id:5,method:'tools/call',params:{name:'get_daily_briefing',arguments:{topic:'science'}}})).result.content.length,1);
});
test('public feeds are cached and weather is requested only for a supplied location, without exposing coordinates in results', async () => {
  const urls=[];
  const fetcher=async url=>{urls.push(url); return new Response(url.includes('/forecast')?JSON.stringify({current:{temperature_2m:16,weather_code:61,precipitation:1}}):`<rss>${item()}</rss>`);};
  const b=createBriefing({dataDir:tmp(),now:()=>at,fetcher});
  assert.equal((await b.get({topic:'science'})).sources.length,1);
  await b.get({topic:'science'});assert.equal(urls.length,1);
  const weather=await b.get({topic:'science',latitude:41,longitude:29});
  assert.equal(weather.sources.length,2);assert.equal(urls.length,2);
  assert.ok(weather.sources[1].title.includes('16 °C'));
  assert.ok(!JSON.stringify(weather).includes('latitude'));
  await assert.rejects(()=>b.get({topic:'http://127.0.0.1'}),/invalid-topic/);
});
test('a failed feed produces an empty context and backs off instead of inventing news', async()=>{
  let calls=0;const b=createBriefing({dataDir:tmp(),now:()=>at,fetcher:async()=>{calls++;throw new Error('offline');}});
  assert.deepEqual((await b.get({topic:'technology'})).sources,[]);await b.get({topic:'technology'});assert.equal(calls,feedsOf('technology').length);
});

test('role news searches preserve real publishers, dates and public links, rejecting private destinations',async()=>{
 const xml=`<rss>${item(at,'http://www.bing.com/news/apiclick.aspx?url=https%3A%2F%2Fexample.com%2Fnews')}${item(at,'https://127.0.0.1/secret')}${item(at-3*86400000,'https://example.com/old')}</rss>`;
 const lines=parseSearchFeed(xml,'CV',at);assert.equal(lines.length,1);assert.equal(lines[0].url,'https://example.com/news');assert.equal(lines[0].role,'CV');
 const urls=[],b=createBriefing({dataDir:tmp(),now:()=>at,fetcher:async url=>{urls.push(url);return new Response(xml);}});
 const context=await b.get({topic:'business',queries:[{role:'CV',query:'hiring recruitment'}]});assert.ok(context.sources.some(s=>s.role==='CV'));assert.ok(urls.some(u=>u.startsWith('https://www.bing.com/news/search?')));
 await b.get({topic:'business',queries:[{role:'CV',query:'hiring recruitment'}]});assert.equal(urls.length,2);
});

test('the briefing covers AI, German and Turkish politics, tech and more; each feed only links to its own hosts; standing searches are always run',async()=>{
 assert.ok(['ai','germany','turkey','technology','europe'].every(t=>TOPICS.includes(t)));
 assert.ok(feedsOf('ai').length>=3&&feedsOf('germany').length>=3&&feedsOf('turkey').length>=2);
 const tagesschau=feedsOf('germany')[0];
 assert.equal(parseFeed(`<rss>${item(at,'https://www.tagesschau.de/inland/x')}${item(at,'https://www.bbc.com/news/y')}</rss>`,'germany',at,tagesschau).length,1);
 const urls=[];const b=createBriefing({dataDir:tmp(),now:()=>at,fetcher:async url=>{urls.push(url);return new Response(url.includes('bing.com')?`<rss>${item(at,'https://example.com/n')}</rss>`:'<rss></rss>');}});
 const r=await b.get({topics:['ai','germany'],standing:true});
 assert.equal(urls.filter(u=>u.includes('bing.com/news/search')).length,STANDING_QUERIES.length);
 assert.ok(STANDING_QUERIES.some(q=>/Elon Musk flying car/.test(q.query))&&STANDING_QUERIES.some(q=>/AfD/.test(q.query))&&STANDING_QUERIES.some(q=>/GPT/.test(q.query))&&STANDING_QUERIES.some(q=>/Gemini/.test(q.query)));
 assert.ok(r.sources.every(s=>s.role==='genel'));
 await assert.rejects(()=>b.get({topics:['ai','nonsense']}),/invalid-topic/);
});
