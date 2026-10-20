import type { Room, Station } from '../../types';

// Curated from project README and skill contracts. These are visual departments, never routing rules.
export interface Department { id: string; name: string; purpose: string; stations: Station[]; color: string; floor: string; /** key of the room dress (maps/roomDress.ts) */ dress: string; /** workflow step shown on the door plate: 1..n, K = coordination, D = support */ step: string }
export function officeDesign(room: Pick<Room, 'id' | 'stations'>) {
  const music = room.id === 'mahur';
  const research = /paperhub|normalcy|thesis|paper|research/.test(room.id);
  const theme = music ? 'music' : research ? 'research' : room.id === 'emrecan-cv' ? 'career' : room.id === 'cv-checker' ? 'checker' : 'studio';
  const palette = music ? ['#b39ae8', '#d1a2cb', '#a5b0ed'] : research ? ['#8ccac4', '#a2bddd', '#b7cba0'] : ['#8bbdb0', '#c6a1cb', '#d5b582', '#97b9d6', '#b7bf91'];
  const definitions: [string, string, string, (s: Station) => boolean][] = room.id === 'emrecan-cv' ? [
    ['opportunities', 'İlan radar odası', 'LinkedIn ve PhD ilanlarını toplar, uygunluğu değerlendirir.', s => /linkedin|phd-collector|batch-ingest|job-evaluation|job-filter|jobbot|posting-nuance/.test(s.id)],
    ['cv', 'CV atölyesi', 'Deneyimlerini hedef ilana göre CV’ye dönüştürür.', s => /cv-cl-core|cv-tailoring|application-preparer/.test(s.id)],
    ['letters', 'Ön yazı stüdyosu', 'Motivasyonu, anlatıyı ve kanıtları birlikte geliştirir.', s => /cover-letter/.test(s.id)],
    ['delivery', 'Kontrol ve teslim', 'Tekrarları önler; sayfa düzeni ve başvuru paketini kontrol eder.', s => /already-built|final-layout|build-and-bundle|application-package|jobtable/.test(s.id)],
    ['library', 'Kanıt kütüphanesi', 'Ana CV, deneyim kaynakları ve araştırma başvuruları.', () => true],
  ] : room.id === 'cv-checker' ? [
    ['review', 'CV kontrol laboratuvarı', 'CV’leri puanlar, eksikleri bulur; yeniden yazmadan rapor verir.', () => true],
  ] : music ? [
    ['listening', 'Mood ve müzik stüdyosu', 'Ruh halinden şarkıya; Spotify bağlantısı ve çalma akışı.', s => /spotify|uygulama|baslat/.test(s.id)],
    ['design', 'Kapak ve deneyim', 'Görsel ritim, arayüz ve kalite kontrolü.', () => true],
  ] : research ? [
    ['research', 'Araştırma laboratuvarı', 'Makaleleri keşfeder, inceler ve özetler.', s => !/test|build|check|deploy|format/.test(s.id)],
    ['review', 'Yayın ve inceleme', 'Deney sonuçları, doğrulama ve okunabilir çıktılar.', () => true],
  ] : [
    ['craft', 'Üretim atölyesi', 'Projenin ana iş akışı ve uzmanları.', s => !/test|check|review|deploy|build|release|doc|readme/.test(s.id)],
    ['quality', 'Kalite ve teslim', 'Test, inceleme, dokümantasyon ve teslim.', () => true],
  ];
  const buckets = definitions.map(() => [] as Station[]);
  for (const s of room.stations) buckets[Math.max(0, definitions.findIndex(d => d[3](s)))]!.push(s);
  const dressOf = (id: string) => (room.id === 'emrecan-cv' ? { opportunities: 'radar', cv: 'tailor', letters: 'letters', delivery: 'delivery', library: 'archive' }[id] : room.id === 'cv-checker' ? 'checker' : theme) ?? theme;
  const stepOf = (id: string) => ({ opportunities: '1', cv: '2', letters: '3', delivery: '4', library: 'D' } as Record<string, string>)[id] ?? '';
  const departments: Department[] = definitions.flatMap(([id, name, purpose], i) => buckets[i]!.length ? [{ id, name, purpose, dress: dressOf(id), step: room.id === 'emrecan-cv' ? stepOf(id) : '', stations: buckets[i]!, color: palette[i % palette.length]!, floor: music ? (i % 2 ? 'carpetC' : 'carpetD') : research ? (i % 2 ? 'carpetB' : 'tileTeal') : ['herringbone', 'carpetB', 'carpetC', 'tileYellow', 'carpetA'][i % 5]! }] : []);
  if (!departments.length) departments.push({ id: 'common', name: 'Ortak çalışma alanı', purpose: 'Proje istasyonları için ayrılmış alan.', dress: theme, step: '', stations: [], color: palette[0]!, floor: 'carpetA' });
  return { theme, departments, accent: palette[0]! };
}
