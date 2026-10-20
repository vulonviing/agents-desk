const DAY = 86400000;

export function daysSince(iso: string | null | undefined, now = Date.now()): number | null {
  return iso ? Math.max(0, Math.floor((now - Date.parse(iso)) / DAY)) : null;
}

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const sec = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (sec < 10) return 'az önce';
  if (sec < 60) return `${sec} sn önce`;
  if (sec < 3600) return `${Math.round(sec / 60)} dk önce`;
  if (sec < 86400) return `${Math.round(sec / 3600)} sa önce`;
  const d = Math.floor(sec / 86400);
  if (d === 1) return 'dün';
  if (d < 60) return `${d} gün önce`;
  if (d < 730) return `${Math.round(d / 30)} ay önce`;
  return `${Math.round(d / 365)} yıl önce`;
}

export function fullDate(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
}

export function clock(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';
}

export const STATUS_TEXT: Record<string, string> = {
  idle: 'Boşta',
  working: 'Çalışıyor',
  thinking: 'Düşünüyor',
  moving: 'Yürüyor',
  completed: 'Tamamladı',
  error: 'Hata',
  offline: 'Çevrimdışı',
};

export const LEVEL_TEXT: Record<string, string> = { plan: 'seviye: plan', 'read-only': 'seviye: salt-okunur', approve: 'seviye: onaylı' };
