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
  const fetcher=async url=>{urls.push(url); return new Response(url.includes('/forecast')?JSON.stringify({timezone:'Europe/Istanbul',current:{temperature_2m:16,apparent_temperature:14,relative_humidity_2m:70,wind_speed_10m:12,weather_code:61,precipitation:1},daily:{sunrise:['2026-10-20T06:42'],sunset:['2026-10-20T17:58'],temperature_2m_max:[18],temperature_2m_min:[11]}}):url.includes('reverse-geocode')?JSON.stringify({city:'İstanbul',principalSubdivision:'İstanbul',countryName:'Türkiye'}):`<rss>${item()}</rss>`);};
  const b=createBriefing({dataDir:tmp(),now:()=>at,fetcher});
  assert.equal((await b.get({topic:'science'})).sources.length,1);
  await b.get({topic:'science'});assert.equal(urls.length,1);
  const weather=await b.get({topic:'science',latitude:41,longitude:29});
  assert.equal(weather.sources.length,2);assert.equal(urls.length,3);
  assert.ok(weather.sources[1].title.includes('16 °C'));
  assert.deepEqual(weather.sources[1].weather,{temperature:16,code:61,precipitation:1,feels:14,humidity:70,wind:12,high:18,low:11,sunrise:'06:42',sunset:'17:58',timezone:'Europe/Istanbul',city:'İstanbul',region:'İstanbul',country:'Türkiye'});
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
 assert.ok(STANDING_QUERIES.some(q=>/Türkiye siyaset/.test(q.query))&&STANDING_QUERIES.some(q=>/AfD/.test(q.query))&&STANDING_QUERIES.some(q=>/GPT/.test(q.query))&&STANDING_QUERIES.some(q=>/Gemini/.test(q.query)));
 assert.ok(r.sources.every(s=>s.role==='genel'));
 await assert.rejects(()=>b.get({topics:['ai','nonsense']}),/invalid-topic/);
});

test('explicit refresh fetches public feeds and searches again while ordinary reads share their cache', async () => {
  const urls = [];
  const briefing = createBriefing({ dataDir: tmp(), now: () => at, fetcher: async url => {
    urls.push(url);
    return new Response(`<rss>${item(at, url.includes('bing.com') ? 'https://example.com/fresh' : 'https://www.bbc.com/news/articles/test')}</rss>`);
  } });
  const args = { topic: 'science', queries: [{ role: 'genel', query: 'public science news' }] };
  await briefing.get(args); assert.equal(urls.length, 2);
  await briefing.get(args); assert.equal(urls.length, 2);
  const fresh = await briefing.get({ ...args, fresh: true });
  assert.equal(urls.length, 4);
  assert.ok(fresh.sources.some(s => s.id.startsWith('search:')));
  const handler = createBriefingMcp(briefing);
  assert.ok((await handler({ id: 7, method: 'tools/call', params: { name: 'get_daily_briefing', arguments: { fresh: 'yes' } } })).error);
});

test('AI discovery retains real community rank and votes without reading discussion or account data', async () => {
  const urls = [], dataDir = tmp();
  const b = createBriefing({ dataDir, now: () => at, fetcher: async url => {
    urls.push(url);
    if (url.endsWith('/topstories.json')) return new Response(JSON.stringify([123, 124, 125]));
    if (url.endsWith('/item/123.json')) return new Response(JSON.stringify({ type: 'story', time: at / 1000, score: 315, title: 'New AI model', url: 'https://example.com/model', kids: [999], by: 'PRIVATE_ACCOUNT_UNUSED', text: 'DISCUSSION_UNUSED' }));
    if (url.endsWith('/item/124.json')) return new Response(JSON.stringify({ type: 'story', time: at / 1000, score: 10, title: 'Invalid target', url: 'https://127.0.0.1/private' }));
    if (url.endsWith('/item/125.json')) return new Response(JSON.stringify({ type: 'story', time: at / 1000 - 3 * 86400, score: 10, title: 'Old', url: 'https://example.com/old' }));
    return new Response('<rss></rss>');
  } });
  const result = await b.get({ topics: ['ai'] });
  assert.equal(result.sources.length, 1);
  assert.deepEqual(result.sources[0].discovery, [{ kind: 'community-ranking', source: 'Hacker News', rank: 1, votes: 315 }]);
  assert.ok(!JSON.stringify(result).includes('PRIVATE_ACCOUNT_UNUSED'));
  assert.ok(!JSON.stringify(result).includes('DISCUSSION_UNUSED'));
  assert.ok(!urls.some(u => /999|user\//.test(u)));
  const count = urls.length; await b.get({ topics: ['ai'] }); assert.equal(urls.length, count);
});
