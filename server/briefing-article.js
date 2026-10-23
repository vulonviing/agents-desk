// Ephemeral public article evidence. Bodies are bounded, never cached or persisted.
import { request } from 'node:https';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
const blocked = new BlockList();
for (const [ip, prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]]) blocked.addSubnet(ip, prefix);
blocked.addSubnet('2001:db8::',32,'ipv6');
blocked.addSubnet('2001::',23,'ipv6');
blocked.addSubnet('2002::',16,'ipv6');
export const publicAddress = ip => isIP(ip) === 4 ? !blocked.check(ip, 'ipv4') : isIP(ip) === 6 && /^[23][0-9a-f]{3}:/i.test(ip) && !blocked.check(ip,'ipv6');
export function articleUrl(value) {
  const u = new URL(value);
  if (typeof value !== 'string' || value.length > 300 || u.protocol !== 'https:' || u.username || u.password || u.port || isIP(u.hostname.replace(/^\[|\]$/g,'')) || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname) || /\.(?:local|localhost|internal|test|invalid)$/i.test(u.hostname)) throw new Error('briefing-invalid-article');
  return u;
}
const entities = s => s.replace(/&(?:amp|quot|apos|lt|gt|nbsp);|&#(?:x[0-9a-f]+|\d+);/gi, x => {
  const named = {'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' '};
  if (named[x.toLowerCase()]) return named[x.toLowerCase()];
  const n = parseInt(x.slice(2,-1).replace(/^x/i,''), /^&#x/i.test(x) ? 16 : 10);
  return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ' ';
});
export function articleText(html) {
  let value = html.replace(/<!--[^]*?-->/g,' ').replace(/<(script|style|nav|header|footer|aside|form)\b[^>]*>[^]*?<\/\1\s*>/gi,' ');
  value = value.match(/<article\b[^>]*>([^]*?)<\/article\s*>/i)?.[1] ?? value.match(/<main\b[^>]*>([^]*?)<\/main\s*>/i)?.[1] ?? value;
  return entities(value.replace(/<\/(?:td|th)>/gi,' | ').replace(/<\/(?:p|div|tr|h[1-6]|li)>/gi,'\n').replace(/<[^>]*>/g,' ')).replace(/[\t ]+/g,' ').replace(/\s*\n\s*/g,'\n').trim().slice(0,16000);
}
export function createArticleReader({ resolveHost = host => lookup(host,{all:true}), transport = request } = {}) {
  return async value => {
    const signal = AbortSignal.timeout(10_000);
    const visit = async (value, redirects = 0) => {
      const u = articleUrl(value);
      const addresses = await new Promise((resolve,reject) => {
        const abort = () => reject(new Error('briefing-article-timeout'));
        signal.addEventListener('abort',abort,{once:true});
        Promise.resolve().then(()=>resolveHost(u.hostname)).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
      });
      signal.throwIfAborted();
      if (!addresses.length || addresses.some(a=>!publicAddress(a.address))) throw new Error('briefing-private-article');
      const address = addresses.find(a=>a.family===4) ?? addresses[0];
      const result = await new Promise((resolve,reject) => {
        const req = transport(u,{signal,agent:false,headers:{accept:'text/html','user-agent':'AgentsDesk-PublicBriefing/1.0'},lookup:(_host,opts,cb)=>opts.all ? cb(null,[address]) : cb(null,address.address,address.family)},res=>{
          if (res.statusCode>=300 && res.statusCode<400 && res.headers.location) { res.resume(); return resolve({redirect:new URL(res.headers.location,u).href}); }
          if (res.statusCode!==200 || !/^text\/html\b/i.test(res.headers['content-type'] ?? '') || !/^(?:identity)?$/i.test(res.headers['content-encoding'] ?? '')) { res.resume(); return reject(new Error('briefing-article-unavailable')); }
          let html='', bytes=0;
          res.setEncoding('utf8');
          res.on('data',chunk=>{ bytes+=Buffer.byteLength(chunk); if(bytes>512*1024) { req.destroy(); reject(new Error('briefing-article-too-large')); } else html+=chunk; });
          res.on('end',()=>resolve({text:articleText(html)})); res.on('error',reject);
        });
        req.on('error',reject); req.end();
      });
      if(result.redirect) { if(redirects>=3) throw new Error('briefing-article-redirects'); return visit(result.redirect,redirects+1); }
      return {url:value,text:result.text};
    };
    return visit(value);
  };
}
