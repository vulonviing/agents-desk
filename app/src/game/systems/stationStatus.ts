import type { StationActivity } from '../../types';

// A station's activity record turned into what the scene shows: lamp, dust, a short label, hot (somebody works there).

export const HOT_MS = 120_000;
const DAY = 86400000;

export interface StationStatus {
  lamp: 'active' | 'week' | 'idle';
  dust: 0 | 1 | 2;
  label: string;
  live: boolean;
  hot: boolean;
  days: number | null;
  count7d: number;
  byDay: number[] | null;
  lastTool: string | null;
}

export function daysBetween(iso: string | null | undefined, now: number): number | null {
  return iso ? Math.max(0, Math.floor((now - Date.parse(iso)) / DAY)) : null;
}

export function stationStatus(stationId: string, activity: Record<string, StationActivity> | undefined, liveStationId: string | null, now: number): StationStatus {
  const a = activity?.[stationId];
  const days = daysBetween(a?.lastAt, now);
  const hot = !!a?.lastAt && now - Date.parse(a.lastAt) <= HOT_MS;
  const live = liveStationId === stationId;
  let lamp: StationStatus['lamp'] = 'idle';
  let dust: StationStatus['dust'] = 2;
  let label = '14+ gün sessiz';
  if (days !== null) {
    if (days < 1) [lamp, dust, label] = ['active', 0, 'bugün'];
    else if (days < 7) [lamp, dust, label] = ['week', 0, days === 1 ? 'dün' : `${days} gün önce`];
    else [lamp, dust, label] = ['idle', 1, `${days} gün önce`];
  }
  if (live) [lamp, dust, label] = ['active', 0, 'çalışıyor'];
  return { lamp, dust, label, live, hot: hot || live, days, count7d: a?.count7d ?? 0, byDay: a?.byDay ?? null, lastTool: a?.lastTool ?? null };
}
