import { createHash } from 'node:crypto';

// Public headline metadata only: labels are deterministic hints, not claims about an article body.
export const NEWS_TOPICS = ['ai', 'technology', 'germany', 'turkey', 'europe', 'science', 'culture', 'business', 'general'];
export const isCriticalSecurity = s => /security|güvenlik|sicherheits|vulnerabil|açık|CVE-|\bRCE\b|remote.code.execution/i.test(`${s.title ?? ''} ${s.description ?? ''} ${s.titleTr ?? ''} ${s.explanation ?? ''}`) && /critical|kritik|kritisch|severe|zero.day|RCE|remote.code|uzaktan.kod|actively.exploit|CVSS.{0,10}[9]/i.test(`${s.title ?? ''} ${s.description ?? ''} ${s.titleTr ?? ''} ${s.explanation ?? ''}`);
const RULES = [
  ['technology', 'critical-security', /critical.*security|kritik.*güvenlik|remote code execution|zero.day/i],
  ['ai', 'ai-agents', /\bagent[s]?\b|autonom|otonom|yardımcı bot/i],
  ['ai', 'model-releases', /\bgpt\b|gemini|claude|grok|model release|yeni model|openai|anthropic/i],
  ['ai', 'coding-tools', /coding|code assistant|copilot|cursor|kodlama/i],
  ['ai', 'ai-policy', /ai.*regulat|yapay zek.*düzenle|ai act/i],
  ['technology', 'chips', /\bchip|semiconductor|nvidia|çip/i],
  ['technology', 'space', /spacex|rocket|satellite|uzay/i],
  ['technology', 'mobility', /flying car|tesla|electric vehicle|uçan araba/i],
  ['germany', 'german-politics', /\bafd\b|merz|german|almanya/i],
  ['turkey', 'turkish-politics', /erdo[gğ]an|turkey politic|türkiye.*siyas/i],
  ['business', 'careers', /recruit|hiring|resume|job market|işe alım|istihdam|kariyer/i],
  ['technology', 'design', /\bdesign|portfolio|tasarım/i],
  ['science', 'research', /research|scientific|araştırma|bilim/i],
];
export const NEWS_TAGS = RULES.map(r => r[1]);
export function structureNews(source) {
  if (source?.kind !== 'news' || typeof source.url !== 'string') return null;
  let url;
  try {
    const u = new URL(source.url);
    if (u.protocol !== 'https:' || u.username || u.password || !u.hostname.includes('.') || /[\[\]:]/.test(u.hostname) || /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) || /\.(local|internal|localhost)$/.test(u.hostname)) return null;
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) if (/^utm_|^(fbclid|gclid)$/i.test(k)) u.searchParams.delete(k);
    u.searchParams.sort(); url = u.href;
  } catch { return null; }
  const title = String(source.title ?? '').replace(/<[^>]*>/g, '').slice(0, 160);
  const text = `${title} ${source.query ?? ''} ${source.explanation ?? ''}`;
  const matches = RULES.filter(([, , pattern]) => pattern.test(text));
  const category = isCriticalSecurity(source) && !/\bAI\b|yapay zek|artificial intelligence|\bLLM|OpenAI|Anthropic|Gemini|Claude/i.test(title) ? 'technology' : NEWS_TOPICS.includes(source.topic) ? source.topic : matches[0]?.[0] ?? 'general';
  const tags = [...new Set([...(Array.isArray(source.tags) ? source.tags.filter(t => NEWS_TAGS.includes(t)) : []), ...matches.map(r => r[1])])].slice(0, 6);
  return { ...source, schemaVersion: 1, articleId: `news:${createHash('sha256').update(url).digest('hex').slice(0, 24)}`, url, title, topic: category, category, tags, origin: source.query ? 'search' : 'feed' };
}
