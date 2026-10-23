// Public, bounded context for ambient dialogue. No accounts, transcripts or private files.
import { readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { structureNews } from './news-taxonomy.js';
import { createArticleReader, articleUrl } from './briefing-article.js';
// Public feeds by topic. Every feed names the hosts its links may point to; nothing else is ever followed.
const BBC = ['www.bbc.com', 'www.bbc.co.uk', 'bbc.com', 'bbc.co.uk'];
export const FEEDS = {
  technology: { name: 'BBC Technology', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', hosts: BBC, extra: [{ name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/technology-lab', hosts: ['arstechnica.com', 'www.arstechnica.com'] }] },
  // AI news matters most: new model releases (GPT, Gemini, Claude, Grok …) must not be missed
  ai: { name: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', hosts: ['techcrunch.com', 'www.techcrunch.com'], extra: [
    { name: 'MIT Technology Review', url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed', hosts: ['www.technologyreview.com', 'technologyreview.com'] },
    { name: 'Google AI Blog', url: 'https://blog.google/technology/ai/rss/', hosts: ['blog.google'] },
    { name: 'Google DeepMind', url: 'https://deepmind.google/blog/rss.xml', hosts: ['deepmind.google', 'www.deepmind.google'] },
  ] },
  germany: { name: 'Tagesschau', url: 'https://www.tagesschau.de/index~rss2.xml', hosts: ['www.tagesschau.de', 'tagesschau.de'], extra: [
    { name: 'Spiegel Politik', url: 'https://www.spiegel.de/politik/index.rss', hosts: ['www.spiegel.de', 'spiegel.de'] },
    { name: 'Zeit Politik', url: 'https://newsfeed.zeit.de/politik/index', hosts: ['www.zeit.de', 'zeit.de'] },
    { name: 'DW Germany', url: 'https://rss.dw.com/rdf/rss-en-ger', hosts: ['www.dw.com', 'dw.com'] },
  ] },
  turkey: { name: 'BBC Türkçe', url: 'https://feeds.bbci.co.uk/turkce/rss.xml', hosts: BBC, extra: [{ name: 'Daily Sabah', url: 'https://www.dailysabah.com/rssFeed/turkey', hosts: ['www.dailysabah.com', 'dailysabah.com'] }] },
  europe: { name: 'BBC Europe', url: 'https://feeds.bbci.co.uk/news/world/europe/rss.xml', hosts: BBC },
  science: { name: 'BBC Science', url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml', hosts: BBC },
  culture: { name: 'BBC Culture', url: 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml', hosts: BBC },
  business: { name: 'BBC Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml', hosts: BBC },
};
export const TOPICS = Object.keys(FEEDS);
export const feedsOf = (topic) => [FEEDS[topic], ...(FEEDS[topic].extra ?? [])].map(({ name, url, hosts }) => ({ name, url, hosts }));

// Always-on public searches (cached and shared by every office): the news we must never miss. Flash adds role-specific ones.
export const STANDING_QUERIES = [
  { role: 'genel', topic: 'technology', query: 'critical security vulnerability actively exploited PHP software update' },
  { role: 'genel', topic: 'ai', query: 'artificial intelligence biggest news today' },
  { role: 'genel', topic: 'ai', query: 'OpenAI GPT new model release' },
  { role: 'genel', topic: 'ai', query: 'Google Gemini new model release' },
  { role: 'genel', topic: 'ai', query: 'Anthropic Claude new model release' },
  { role: 'genel', topic: 'ai', query: 'AI agents coding tools research news' },
  { role: 'genel', topic: 'ai', query: 'artificial intelligence regulation business news' },
  { role: 'genel', topic: 'germany', query: 'Deutschland Politik aktuelle Nachrichten Bundesregierung Bundestag' },
  { role: 'genel', topic: 'germany', query: 'Germany politics government coalition election news' },
  { role: 'genel', topic: 'germany', query: 'Merz AfD Bundestag Politik heute' },
  { role: 'genel', topic: 'turkey', query: 'Türkiye siyaset son dakika meclis hükümet muhalefet' },
  { role: 'genel', topic: 'turkey', query: 'Turkey politics government opposition parliament news' },
  { role: 'genel', topic: 'turkey', query: 'Erdoğan CHP TBMM siyaset bugün' },
];
const clean = (value, max = 160) => String(value ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, '').replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, code) => { const value = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code); return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : ''; }).replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;|&gt;/g, '').replace(/\s+/g,' ').trim().slice(0,max);
export function parseFeed(xml, topic, now = Date.now(), source = feedsOf(topic)[0]) {
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)].flatMap(([_, body], i) => {
    const tag = name => body.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1];
    const title = clean(tag('title'), 150), url = clean(tag('link'), 300), publishedAt = Date.parse(tag('pubDate') ?? tag('dc:date') ?? '');
    if (!title || !Number.isFinite(publishedAt) || publishedAt > now + 300_000 || now - publishedAt > 48 * 3_600_000) return [];
    try { const u = new URL(url); if (u.protocol !== 'https:' || u.username || u.password || !source.hosts.includes(u.hostname)) return []; } catch { return []; }
    return [{ id: `${topic}:${createHash('sha256').update(url).digest('hex').slice(0, 10)}:${i}`, kind: 'news', topic, publisher: source.name, discovery: [{ kind: 'feed', rank: i + 1 }], title, description: clean(tag('description'), 400), url, publishedAt, expiresAt: Math.min(publishedAt + 48 * 3_600_000, now + 6 * 3_600_000) }];
  }).slice(0, 12);
}

/** Search results are links only: fetches remain restricted to the Bing RSS endpoint. */
export function parseSearchFeed(xml, role, now = Date.now()) {
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)].flatMap(([_,body],i)=>{
    const tag=name=>body.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1];
    const title=clean(tag('title'),150),publishedAt=Date.parse(tag('pubDate')??'');
    if(!title||!Number.isFinite(publishedAt)||publishedAt>now+300000||now-publishedAt>48*3600000)return [];
    let url;try{
      let u=new URL(clean(tag('link'),1800));
      if(['www.bing.com','bing.com'].includes(u.hostname)&&u.searchParams.has('url'))u=new URL(u.searchParams.get('url'));
      if(u.protocol!=='https:'||u.username||u.password||!u.hostname.includes('.')||/[\[\]:]/.test(u.hostname)||/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)||/\.(local|internal|localhost)$/.test(u.hostname))return [];
      url=u.href;
    }catch{return [];}
    return [{id:'search:'+createHash('sha256').update(url).digest('hex').slice(0,16),kind:'news',publisher:clean(tag('News:Source'),60)||new URL(url).hostname,discovery:[{kind:'search',rank:i+1}],title,description:clean(tag('description'),400),url,publishedAt,expiresAt:Math.min(publishedAt+48*3600000,now+6*3600000),role}];
  }).slice(0,8);
}

async function download(url, fetcher) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(8000), redirect: 'error', headers: { 'user-agent': 'AgentsDesk/0.2 public-office-briefing' } });
  if (!response.ok) throw new Error('source-unavailable');
  const reader = response.body.getReader(); let bytes = 0, text = '';
  const decoder = new TextDecoder();
  try { while (true) { const { value, done } = await reader.read(); if (done) break; bytes += value.length; if (bytes > 256 * 1024) throw new Error('source-too-large'); text += decoder.decode(value, { stream: true }); } }
  finally { await reader.cancel().catch(() => {}); }
  return text;
}
export function createBriefing({ dataDir, fetcher = fetch, now = Date.now, readArticle = createArticleReader() }) {
  const dir = join(dataDir, 'briefings'); const pending = new Map();
  async function cached(key, ttl, produce) {
    const path = join(dir, key + '.json');
    try { const value = JSON.parse(readFileSync(path, 'utf8')); if (now() - value.at < ttl) return value.items.filter(s => s.expiresAt > now()); } catch { /* first read */ }
    if (pending.has(key)) return pending.get(key);
    const promise = (async () => {
      let items = []; try { items = await produce(); } catch { /* no stale facts on failure */ }
      mkdirSync(dir, { recursive: true });
      const tmp = path + '.' + process.pid + '.tmp';
      writeFileSync(tmp, JSON.stringify({ at: now(), items }), { mode: 0o600 }); renameSync(tmp, path);
      return items;
    })().finally(() => pending.delete(key));
    pending.set(key, promise); return promise;
  }
  const hasLocation = (latitude, longitude) => Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
  return { async get({ topic, topics = [], city, latitude, longitude, queries = [], standing = false, fresh = false, articleUrls } = {}) {
    if (articleUrls !== undefined) {
      if (!Array.isArray(articleUrls) || articleUrls.length > 15) throw new Error('invalid-articles');
      articleUrls.forEach(articleUrl);
      const details = await Promise.all([...new Set(articleUrls)].map(async url => {
        try { const value = await readArticle(url); const text = typeof value.text === 'string' ? value.text.slice(0, 16000) : '';
          return { url, text, available: !!text }; }
        catch { return { url, text: '', available: false }; }
      }));
      return { at: now(), sources: [], details };
    }
    const wanted = [...new Set([...(topic ? [topic] : []), ...(Array.isArray(topics) ? topics : [])])].slice(0, 5);
    if (!wanted.length) wanted.push('technology');
    if (wanted.some((t) => !Object.hasOwn(FEEDS, t))) throw new Error('invalid-topic');
    // one cache entry per feed: a failing feed costs nothing else
    const perFeed = await Promise.all(wanted.flatMap((t) => feedsOf(t).map((f) => cached(`feed-${createHash('sha256').update(f.url).digest('hex').slice(0, 16)}`, fresh ? 0 : 60 * 60_000, async () => parseFeed(await download(f.url, fetcher), t, now(), f)))));
    const sources = perFeed.flat();
    // Public community ranking and votes are real signals; they are not readership counts.
    if (wanted.includes('ai')) sources.push(...await cached('hn-top-v1', fresh ? 0 : 60 * 60_000, async () => {
      const ids = JSON.parse(await download('https://hacker-news.firebaseio.com/v0/topstories.json', fetcher));
      if (!Array.isArray(ids)) return [];
      return (await Promise.all(ids.slice(0, 50).map(async (id, i) => {
        if (!Number.isSafeInteger(id) || id < 1) return null;
        try {
          const a = JSON.parse(await download(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, fetcher));
          if (a.type !== 'story' || a.dead || a.deleted || !Number.isFinite(a.time) || !Number.isFinite(a.score)) return null;
          const publishedAt = a.time * 1000;
          if (publishedAt > now() + 300_000 || now() - publishedAt > 48 * 3_600_000) return null;
          const item = structureNews({ id: `hn:${id}`, kind: 'news', topic: 'ai', title: clean(a.title), url: a.url,
            publisher: typeof a.url === 'string' ? new URL(a.url).hostname : '', publishedAt,
            expiresAt: Math.min(publishedAt + 48 * 3_600_000, now() + 6 * 3_600_000),
            discovery: [{ kind: 'community-ranking', source: 'Hacker News', rank: i + 1, votes: Math.max(0, a.score) }] });
          return item;
        } catch { return null; }
      }))).filter(Boolean);
    }));
    const all = [...(standing ? STANDING_QUERIES : []), ...(Array.isArray(queries) ? queries : [])].slice(0, 24);
    const searches=await Promise.all(all.map(async item=>{
      if(typeof item?.query!=='string'||item.query.length>100||!/^[\p{L}\p{N} '\-]+$/u.test(item.query))return [];
      const key='search-'+createHash('sha256').update(item.query).digest('hex').slice(0,24);
      return (await cached(key,fresh ? 0 : 60*60_000,async()=>parseSearchFeed(await download('https://www.bing.com/news/search?format=rss&qft=interval%3D%227%22&setlang=en-US&q='+encodeURIComponent(item.query),fetcher),undefined,now()))).map(s=>structureNews({...s,role:clean(item.role,60),query:item.query,topic:item.topic,tags:item.tags}));
    }));
    let weather = [];
    if (hasLocation(latitude, longitude) || typeof city === 'string' && city.trim() && city.length <= 80) weather = await cached('weather3-' + Buffer.from(city || `${latitude},${longitude}`).toString('hex'), 60 * 60_000, async () => {
      const geo = city ? JSON.parse(await download('https://geocoding-api.open-meteo.com/v1/search?count=1&language=tr&name=' + encodeURIComponent(city), fetcher)) : { results: [{ latitude, longitude, name: 'Yakın çevreniz' }] };
      const place = geo.results?.[0];
      if (!place || !Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) return [];
      // the city of a (rounded) location: one public reverse-geocoding call; failure keeps the generic name
      let where = { city: clean(place.name, 60), region: clean(place.admin1, 60), country: clean(place.country, 60) };
      if (!city) {
        try {
          const r = JSON.parse(await download(`https://api-bdc.io/data/reverse-geocode-client?latitude=${place.latitude}&longitude=${place.longitude}&localityLanguage=tr`, fetcher));
          where = { city: clean(r.city || r.locality, 60) || where.city, region: clean(r.principalSubdivision, 60), country: clean(r.countryName, 60) };
        } catch { /* generic name */ }
      }
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto`;
      const data = JSON.parse(await download(url, fetcher)), c = data.current, d = data.daily ?? {};
      if (!Number.isFinite(c?.temperature_2m) || !Number.isFinite(c?.weather_code)) return [];
      const num = (v) => (Number.isFinite(v) ? v : undefined);
      const hhmm = (v) => (typeof v === 'string' && /T(\d\d:\d\d)/.test(v) ? v.match(/T(\d\d:\d\d)/)[1] : undefined);
      const weatherInfo = Object.fromEntries(Object.entries({
        temperature: c.temperature_2m, code: c.weather_code, precipitation: c.precipitation ?? 0,
        feels: num(c.apparent_temperature), humidity: num(c.relative_humidity_2m), wind: num(c.wind_speed_10m),
        high: num(d.temperature_2m_max?.[0]), low: num(d.temperature_2m_min?.[0]), sunrise: hhmm(d.sunrise?.[0]), sunset: hhmm(d.sunset?.[0]),
        timezone: typeof data.timezone === 'string' && /^[A-Za-z_\/+-]{1,40}$/.test(data.timezone) ? data.timezone : undefined,
        city: where.city || undefined, region: where.region || undefined, country: where.country || undefined,
      }).filter(([, v]) => v !== undefined));
      return [{ id: 'weather:' + now(), kind: 'weather', publisher: 'Open-Meteo', title: `${where.city || 'Yakın çevreniz'}: ${c.temperature_2m} °C, WMO ${c.weather_code}, yağış ${c.precipitation ?? 0} mm`, url: 'https://open-meteo.com/', publishedAt: now(), expiresAt: now() + 2 * 3_600_000, weather: weatherInfo }];
    });
    return { at: now(), sources: [...searches.flat().filter(Boolean), ...sources.map(structureNews).filter(Boolean), ...weather] };
  } };
}
