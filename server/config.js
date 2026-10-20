import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const expandHome = (p) => (p.startsWith('~') ? join(homedir(), p.slice(1)) : p);

// DESK_CONFIG lets tests and demos point at another config without touching the real one.
export function loadConfig(path = process.env.DESK_CONFIG || join(ROOT, 'desk.config.json')) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** The desks of the office: one per project, each with one permanent coordinator. Read-only inputs; Desk never writes there. */
export function loadDesks(config) {
  return (config.desks ?? []).map((d) => ({ ...d, path: d.path ? expandHome(d.path) : null }));
}
