// Public, bounded context for ambient dialogue. No accounts, transcripts or private files.
import { readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
export const FEEDS = {
  technology: { name: 'BBC Technology', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml' },
  science: { name: 'BBC Science', url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml' },
  culture: { name: 'BBC Culture', url: 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml' },
  business: { name: 'BBC Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml' },
};
const clean = (value, max = 160) => String(value ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, '').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;|&gt;/g, '').replace(/\s+/g,' ').trim().slice(0,max);
export function parseFeed(xml, feed, now = Date.now()) {
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)].flatMap(([_, body], i) => {
    const tag = name => body.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1];
    const title = clean(tag('title'), 150), url = clean(tag('link'), 300), publishedAt = Date.parse(tag('pubDate') ?? '');
    if (!title || !Number.isFinite(publishedAt) || publishedAt > now + 300_000 || now - publishedAt > 48 * 3_600_000) return [];
    try { const u = new URL(url); if (u.protocol !== 'https:' || !['www.bbc.com', 'www.bbc.co.uk', 'bbc.com', 'bbc.co.uk'].includes(u.hostname)) return []; } catch { return []; }
    return [{ id: `${feed}:${i}:${publishedAt}`, kind: 'news', publisher: FEEDS[feed].name, title, url, publishedAt, expiresAt: Math.min(publishedAt + 48 * 3_600_000, now + 6 * 3_600_000) }];
  }).slice(0, 3);
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
    return [{id:'search:'+createHash('sha256').update(url).digest('hex').slice(0,16),kind:'news',publisher:clean(tag('News:Source'),60)||'Bing News',title,url,publishedAt,expiresAt:Math.min(publishedAt+48*3600000,now+6*3600000),role}];
  }).slice(0,3);
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
export function createBriefing({ dataDir, fetcher = fetch, now = Date.now }) {
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
  return { async get({ topic = 'technology', city, latitude, longitude, queries = [] } = {}) {
    if (!Object.hasOwn(FEEDS, topic)) throw new Error('invalid-topic');
    const sources = await cached(topic, 60 * 60_000, async () => parseFeed(await download(FEEDS[topic].url, fetcher), topic, now()));
    const searches=await Promise.all((Array.isArray(queries)?queries:[]).slice(0,3).map(async item=>{
      if(typeof item?.query!=='string'||item.query.length>100||!/^[\p{L}\p{N} '\-]+$/u.test(item.query))return [];
      const key='search-'+createHash('sha256').update(item.query).digest('hex').slice(0,24);
      return (await cached(key,6*3600000,async()=>parseSearchFeed(await download('https://www.bing.com/news/search?format=rss&qft=interval%3D%227%22&setlang=en-US&q='+encodeURIComponent(item.query),fetcher),undefined,now()))).map(s=>({...s,role:clean(item.role,60)}));
    }));
    let weather = [];
    if (Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 || typeof city === 'string' && city.trim() && city.length <= 80) weather = await cached('weather-' + Buffer.from(city || `${latitude},${longitude}`).toString('hex'), 60 * 60_000, async () => {
      const geo = city ? JSON.parse(await download('https://geocoding-api.open-meteo.com/v1/search?count=1&language=tr&name=' + encodeURIComponent(city), fetcher)) : { results: [{ latitude, longitude, name: 'Yakın çevreniz' }] };
      const place = geo.results?.[0];
      if (!place || !Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) return [];
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,precipitation,weather_code&timezone=auto`;
      const data = JSON.parse(await download(url, fetcher)), c = data.current;
      if (!Number.isFinite(c?.temperature_2m) || !Number.isFinite(c?.weather_code)) return [];
      return [{ id: 'weather:' + now(), kind: 'weather', publisher: 'Open-Meteo', title: `${clean(place.name, 60)}: ${c.temperature_2m} °C, WMO ${c.weather_code}, yağış ${c.precipitation ?? 0} mm`, url: 'https://open-meteo.com/', publishedAt: now(), expiresAt: now() + 2 * 3_600_000 }];
    });
    return { at: now(), sources: [...searches.flat(), ...sources, ...weather] };
  } };
}
