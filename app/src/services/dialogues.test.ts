import { describe, expect, it, beforeEach } from 'vitest';
import { ensurePool, pickLine, resetDialogues, refreshLoadedPool, type Line } from './dialogues';

const lines: Line[] = [
  { kind: 'coffee', text: 'Kahve 1.' }, { kind: 'coffee', text: 'Kahve 2.' }, { kind: 'coffee', text: 'Kahve 3.' },
  { kind: 'visit', text: '{other}, selam!', reply: 'Selam {name}.' },
  { kind: 'desk', text: 'Rol satırı.', who: 'cv-check' }, { kind: 'desk', text: 'Genel satır.' },
];
const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]!; };

describe('dialogue pools', () => {
  beforeEach(() => resetDialogues());

  it('uses the built-in lines before the pool loads and the loaded pool afterwards, with one fetch per office', async () => {
    expect(pickLine('o', 'coffee', 'A', undefined, () => 0)?.text).toMatch(/kahve/i);
    let fetches = 0;
    const fetcher = async () => { fetches++; return { lines }; };
    await ensurePool('o2', fetcher);
    await ensurePool('o2', fetcher);
    await ensurePool('o2', fetcher);
    expect(fetches).toBe(1);
    expect(pickLine('o2', 'coffee', 'A', undefined, () => 0)?.text).toBe('Kahve 1.');
  });

  it('does not repeat a line within the cooldown window and stays quiet when everything was used', async () => {
    await ensurePool('o', async () => ({ lines }));
    const got = [0, 0, 0].map(() => pickLine('o', 'coffee', 'A', undefined, () => 0)!.text);
    expect(new Set(got).size).toBe(3);
    expect(pickLine('o', 'coffee', 'A', undefined, () => 0)).toBeNull();
    expect(pickLine('o', 'coffee', 'A', undefined, () => 0, Date.now() + 10 * 60_000 + 1)).not.toBeNull();
  });

  it('removes legacy name placeholders instead of speaking skill names', async () => {
    await ensurePool('o', async () => ({ lines }));
    const v = pickLine('o', 'visit', 'cv-tailoring-deep-long-name', 'Ana kütüphane', () => 0)!;
    expect(v.text).toBe('selam!');
    expect(v.reply).toBe('Selam.');
  });

  it('prefers lines written for the speaker (who) but still serves generic ones', async () => {
    await ensurePool('o', async () => ({ lines }));
    expect(pickLine('o', 'desk', 'cv-check', undefined, seq(0.1, 0))!.text).toBe('Rol satırı.');
    resetDialogues();
    await ensurePool('o', async () => ({ lines }));
    expect(pickLine('o', 'desk', 'other-agent', undefined, () => 0)!.text).toBe('Genel satır.');
  });

  it('survives a failing server', async () => {
    await ensurePool('o', async () => { throw new Error('down'); });
    expect(pickLine('o', 'news', 'A', undefined, () => 0)).not.toBeNull();
  });
});

it('expired sourced lines and lines for another role are never borrowed by the speaker', async () => {
  resetDialogues();
  await ensurePool('sources', async () => ({lines:[{kind:'news',text:'Expired.',source:{kind:'news',publisher:'BBC',url:'https://www.bbc.com/',publishedAt:0,expiresAt:10}},{kind:'news',text:'Other role.',who:'B'}]}));
  expect(pickLine('sources','news','A',undefined,()=>0,100)).toBeNull();
});
it('loads a shared floor scope and retains all four conversation turns', async()=>{
 resetDialogues();let path='';
 await ensurePool('floor:growth',async p=>{path=p;return {lines:[{kind:'visit',text:'{other}, fikrin ne?',reply:'Örnek iyi.',followUp:'{name} sorsun.',answer:'Birlikte bakalım.'}]};});
 expect(path).toBe('/api/dialogues?floor=growth');
 const line=pickLine('floor:growth','visit','A','B',()=>0)!;
 expect([line.text,line.reply,line.followUp,line.answer]).toEqual(['fikrin ne?','Örnek iyi.','sorsun.','Birlikte bakalım.']);
});

it('a completed refill push reloads only an already displayed scope immediately', async()=>{
 resetDialogues();let reads=0;const fetcher=async()=>{reads++;return {lines:[{kind:'desk' as const,text:'Yeni düşünce.'}]};};
 await refreshLoadedPool('unseen',fetcher);expect(reads).toBe(0);
 await ensurePool('seen',async()=>({lines}));await refreshLoadedPool('seen',fetcher);
 expect(reads).toBe(1);expect(pickLine('seen','desk','A',undefined,()=>0)?.text).toBe('Yeni düşünce.');
});
