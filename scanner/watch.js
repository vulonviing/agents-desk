import { existsSync, lstatSync, watch } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';

// Native filesystem notifications; no periodic directory scan. Coalesce editor/log bursts.
export function createActivityWatch(onChange, debounceMs = 100) {
  const watchers = new Map();
  let timer = null, skillsChanged = false, closed = false, latestData, latestConfig;
  const queue = skills => {
    skillsChanged ||= skills;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const changed = skillsChanged; skillsChanged = false;
      configure(latestData, latestConfig);
      onChange({ skillsChanged: changed });
    }, debounceMs);
    timer.unref();
  };
  function configure(data, config = {}) {
    latestData = data; latestConfig = config;
    if (closed) return;
    const wanted = new Map();
    const add = (path, kind, recursive = true, filter = null) => {
      if (!path) return;
      path = resolve(path.replace(/^~/, homedir()));
      // A missing session/skill root is discovered through its nearest existing ancestor.
      if (!existsSync(path)) {
        let parent = dirname(path);
        while (!existsSync(parent) && dirname(parent) !== parent) parent = dirname(parent);
        wanted.set(`${parent}:discover:${path}`, { path: parent, recursive: false, kind: 'discover', child: relative(parent, path).split(sep)[0], skills: kind === 'skills' });
        return;
      }
      try { if (!lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink()) return; } catch { return; }
      wanted.set(`${path}:${kind}`, { path, recursive, kind, filter });
    };
    if (config.sessions?.observeExternal !== false) {
      if (config.sessions?.projectsDir !== false) add(config.sessions?.projectsDir ?? '~/.claude/projects', 'session');
      if (config.sessions?.codexSessionsDir !== false) add(config.sessions?.codexSessionsDir ?? '~/.codex/sessions', 'session');
    }
    for (const room of data?.floors.flatMap(f => f.rooms) ?? []) for (const project of [room, ...(room.embedded ?? [])]) {
      add(join(project.path, '.agents'), 'skills');
      add(join(project.path, '.claude'), 'skills');
      // Discover a newly created root without watching project build outputs recursively.
      add(project.path, 'project', false);
    }
    for (const [key, w] of watchers) if (!wanted.has(key)) { w.handle.close(); watchers.delete(key); }
    for (const [key, spec] of wanted) {
      if (watchers.has(key)) continue;
      try {
        const handle = watch(spec.path, { recursive: spec.recursive, persistent: false }, (_type, filename) => {
          const name = String(filename ?? '').replaceAll('\\', '/');
          if (spec.kind === 'discover' && name && name.split('/')[0] !== spec.child) return;
          if (spec.kind === 'session' && name && !name.endsWith('.jsonl') && name.includes('.')) return;
          if (spec.kind === 'project' && name !== '.agents' && name !== '.claude') return;
          if (spec.kind === 'skills' && name && !/(^|\/)(skills|SKILL\.md|AGENTS\.md)(\/|$)/.test(name)) return;
          queue(spec.kind === 'skills' || spec.kind === 'project' || spec.kind === 'discover' && spec.skills);
        });
        handle.on('error', () => { handle.close(); watchers.delete(key); });
        watchers.set(key, { ...spec, handle });
      } catch { /* Unavailable roots remain discoverable through their parent watcher. */ }
    }
  }
  return { configure, get count() { return watchers.size; }, close() { closed = true; clearTimeout(timer); for (const w of watchers.values()) w.handle.close(); watchers.clear(); } };
}
