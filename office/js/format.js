const DAY = 86400000;

export function daysSince(iso, now = Date.now()) {
  if (!iso) return null;
  return Math.max(0, Math.floor((now - Date.parse(iso)) / DAY));
}

export function timeAgo(days) {
  if (days === null) return 'commit yok';
  if (days === 0) return 'bugün';
  if (days === 1) return 'dün';
  if (days < 60) return `${days} gün önce`;
  if (days < 730) return `${Math.round(days / 30)} ay önce`;
  return `${Math.round(days / 365)} yıl önce`;
}

export function fullDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export const LAMP_TEXT = {
  active: 'Bugün aktif',
  week: 'Bu hafta dokunuldu',
  idle: 'Sessiz',
  unpushed: 'Kaydedilmemiş ya da gönderilmemiş değişiklik var',
};

export const DUST_TEXT = ['', 'Hafif tozlu', 'Tozlu', 'Çok tozlu, ajan uyuyor'];
