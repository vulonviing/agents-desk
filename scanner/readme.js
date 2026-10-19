import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MAX = 280;

// First prose paragraph of a README: skips headings, badges, images, HTML, blockquote disclaimers.
export function summarize(markdown) {
  const paragraphs = markdown.split(/\r?\n\s*\r?\n/);
  for (const p of paragraphs) {
    const text = p.trim();
    if (!text || /^(#|!\[|\[!\[|<|>|```|\||---|[-*]\s)/.test(text)) continue;
    const flat = text
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[*_`]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (flat) return flat.length > MAX ? flat.slice(0, MAX - 3) + '...' : flat;
  }
  return '';
}

export function readSummary(dir) {
  try {
    return summarize(readFileSync(join(dir, 'README.md'), 'utf8'));
  } catch {
    return '';
  }
}
