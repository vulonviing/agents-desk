import { lstatSync, mkdirSync, readdirSync, readlinkSync, symlinkSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, discoverRepos, loadConfig, slugify } from '../scanner/scan.js';

// Creates workspace/<slug> -> project symlinks. Only touches symlinks inside workspace/.
export function linkWorkspace(config = loadConfig(), dir = join(ROOT, 'workspace')) {
  mkdirSync(dir, { recursive: true });
  const wanted = new Map(discoverRepos(config).map((r) => [slugify(r.name), r.path]));
  const result = { created: [], removed: [], kept: [] };

  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (!lstatSync(p).isSymbolicLink()) continue;
    if (!wanted.has(name) || readlinkSync(p) !== wanted.get(name)) {
      unlinkSync(p);
      result.removed.push(name);
    }
  }
  for (const [slug, target] of wanted) {
    const p = join(dir, slug);
    try {
      lstatSync(p);
      result.kept.push(slug);
    } catch {
      symlinkSync(target, p, 'dir');
      result.created.push(slug);
    }
  }
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = linkWorkspace();
  console.log(`workspace: +${r.created.length} -${r.removed.length} =${r.kept.length}`);
}
