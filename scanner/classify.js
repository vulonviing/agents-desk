const DAY = 86400000;

// Floor for a repo: explicit assignment first, then the default floor.
export function classify(name, config) {
  return config.assignments?.[name] ?? config.defaultFloor;
}

export function ageInDays(isoDate, now = Date.now()) {
  if (!isoDate) return null;
  return Math.max(0, Math.floor((now - Date.parse(isoDate)) / DAY));
}

// 0 = fresh, 3 = heavy dust. No commit at all counts as heavy dust.
export function dustLevel(ageDays, dust) {
  if (ageDays === null) return 3;
  if (ageDays < dust.light) return 0;
  if (ageDays < dust.medium) return 1;
  if (ageDays < dust.heavy) return 2;
  return 3;
}

export function lampState({ ageDays, dirty, ahead }, lamp) {
  if ((ahead ?? 0) > 0 || dirty > 0) return 'unpushed';
  if (ageDays !== null && ageDays <= lamp.activeDays) return 'active';
  if (ageDays !== null && ageDays <= lamp.weekDays) return 'week';
  return 'idle';
}
