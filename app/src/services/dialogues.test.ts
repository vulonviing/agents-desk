import { describe, expect, it, beforeEach } from 'vitest';
import { ensurePool, pickLine, resetDialogues, type Line } from './dialogues';

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

  it('does not repeat a line within the cooldown window and falls back when everything was used', async () => {
    await ensurePool('o', async () => ({ lines }));
    const got = [0, 0, 0].map(() => pickLine('o', 'coffee', 'A', undefined, () => 0)!.text);
    expect(new Set(got).size).toBe(3);
    expect(pickLine('o', 'coffee', 'A', undefined, () => 0)).not.toBeNull();
  });

  it('fills {name} and {other} for a two-line visit and shortens long names', async () => {
    await ensurePool('o', async () => ({ lines }));
    const v = pickLine('o', 'visit', 'cv-tailoring-deep-long-name', 'Ana kütüphane', () => 0)!;
    expect(v.text).toBe('Ana kütüphane, selam!');
    expect(v.reply).toMatch(/^Selam cv-tailoring-de…\./);
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
