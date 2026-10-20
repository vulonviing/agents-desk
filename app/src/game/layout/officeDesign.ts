import type { Room, Station } from '../../types';

// Curated from project README and skill contracts. These are visual departments, never routing rules.
export interface Department { id: string; name: string; purpose: string; stations: Station[]; color: string; floor: string }
export function officeDesign(room: Pick<Room, 'id' | 'stations'>) {
  const music = room.id === 'mahur';
  const research = /paperhub|normalcy|thesis|paper|research/.test(room.id);
  const theme = music ? 'music' : research ? 'research' : room.id === 'emrecan-cv' ? 'career' : 'studio';
  const palette = music ? ['#b39ae8', '#d1a2cb', '#a5b0ed'] : research ? ['#8ccac4', '#a2bddd', '#b7cba0'] : ['#8bbdb0', '#c6a1cb', '#d5b582', '#97b9d6', '#b7bf91'];
  const definitions: [string, string, string, (s: Station) => boolean][] = room.id === 'emrecan-cv' ? [
    ['opportunities', 'İlan radar odası', 'LinkedIn ve PhD ilanlarını toplar, uygunluğu değerlendirir.', s => /linkedin|phd-collector|batch-ingest|job-evaluation|job-filter|jobbot|posting-nuance/.test(s.id)],
    ['cv', 'CV atölyesi', 'Deneyimlerini hedef ilana göre CV’ye dönüştürür.', s => /cv-cl-core|cv-tailoring|application-preparer/.test(s.id)],
    ['letters', 'Ön yazı stüdyosu', 'Motivasyonu, anlatıyı ve kanıtları birlikte geliştirir.', s => /cover-letter/.test(s.id)],
    ['delivery', 'Kontrol ve teslim', 'Tekrarları önler; sayfa düzeni ve başvuru paketini kontrol eder.', s => /already-built|final-layout|build-and-bundle|application-package|jobtable/.test(s.id)],
    ['library', 'Kanıt kütüphanesi', 'Ana CV, deneyim kaynakları ve araştırma başvuruları.', () => true],
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
  const departments: Department[] = definitions.flatMap(([id, name, purpose], i) => buckets[i]!.length ? [{ id, name, purpose, stations: buckets[i]!, color: palette[i % palette.length]!, floor: music ? (i % 2 ? 'carpetC' : 'carpetD') : research ? (i % 2 ? 'carpetB' : 'tileTeal') : ['herringbone', 'carpetB', 'carpetC', 'tileYellow', 'carpetA'][i % 5]! }] : []);
  if (!departments.length) departments.push({ id: 'common', name: 'Ortak çalışma alanı', purpose: 'Proje istasyonları için ayrılmış alan.', stations: [], color: palette[0]!, floor: 'carpetA' });
  return { theme, departments, accent: palette[0]! };
}
