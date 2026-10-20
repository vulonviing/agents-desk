// Pure: turns a station's activity record (from /api/activity) and the room's live session into what
// the scene shows: lamp color, dust level, a short label, and whether somebody should be working there.

const DAY = 86400000;
export const HOT_MS = 120_000; // a station used in the last two minutes has a worker at it

export function daysBetween(iso, now) {
  return iso ? Math.max(0, Math.floor((now - Date.parse(iso)) / DAY)) : null;
}

// liveStationId: the station the room's newest live session is working at (or null).
export function stationStatus(station, activity, liveStationId, now) {
  const a = activity?.[station.id];
  const days = daysBetween(a?.lastAt, now);
  const hot = !!a?.lastAt && now - Date.parse(a.lastAt) <= HOT_MS;
  const live = liveStationId === station.id;
  let lamp = 'idle';
  let dust = 2;
  let label = '14+ gün sessiz';
  if (days !== null) {
    if (days < 1) [lamp, dust, label] = ['active', 0, 'bugün'];
    else if (days < 7) [lamp, dust, label] = ['week', 0, days === 1 ? 'dün' : `${days} gün önce`];
    else [lamp, dust, label] = ['idle', 1, `${days} gün önce`];
  }
  if (live) [lamp, dust, label] = ['active', 0, 'çalışıyor'];
  return { lamp, dust, label, live, hot: hot || live, days, count7d: a?.count7d ?? 0, byDay: a?.byDay ?? null, lastTool: a?.lastTool ?? null };
}

// Stations that need a worker right now: the live one first, then recently used ones, at most `max`.
export function demandList(stations, activity, liveStationId, now, max = 3) {
  const hot = stations
    .filter((s) => s.id !== liveStationId && activity?.[s.id]?.lastAt && now - Date.parse(activity[s.id].lastAt) <= HOT_MS)
    .sort((x, y) => activity[y.id].lastAt.localeCompare(activity[x.id].lastAt))
    .map((s) => s.id);
  return [...(liveStationId ? [liveStationId] : []), ...hot].slice(0, max);
}
