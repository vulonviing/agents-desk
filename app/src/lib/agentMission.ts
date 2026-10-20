import type { AgentDTO, Room } from '../types';
import { officeDesign } from '../game/layout/officeDesign';
const missions: Record<string, string> = {
  'cover-letter-motivation-check': 'Ön yazının motivasyon bölümünü değerlendirir; genel, yapay veya kanıtsız ifadeleri belirler.',
  'cover-letter-style': 'Ön yazının dilini, tonunu ve anlatım bütünlüğünü iyileştirir.',
  'cover-letter-math': 'Ön yazıdaki sayısal iddiaları ve hesapları kontrol eder.',
  'cover-letter-number-check': 'Ön yazıdaki sayıların kaynaklarla tutarlı olmasını kontrol eder.',
  'cover-letter-bridge-check': 'Deneyimlerin ile işin beklentileri arasındaki bağlantıyı kontrol eder.',
  'cv-tailoring-deep': 'Deneyimlerini hedef ilanın gereksinimleriyle eşleştirerek CV’yi uyarlar.',
  'cv-cl-core-rules': 'CV ve ön yazının ortak kurallarını, kanıtlarını ve tutarlılığını korur.',
  'batch-ingest': 'İlan kuyruğunu başvuru akışına hazırlar; ön kontrolleri ve filtreleri uygular.',
  'job-evaluation-criteria': 'İlanların dil, alan ve deneyim ölçütleri bakımından uygunluğunu değerlendirir.',
  'job-filter-local': 'Toplanan ilanları yerel değerlendirme akışıyla inceler.',
  'application-final-layout-check': 'CV ve ön yazının son sayfa düzenini ve görsel bütünlüğünü kontrol eder.',
  'application-package': 'Başvuru için gereken belgeleri, dili ve eksik bilgileri belirler.',
  'build-and-bundle': 'CV, ön yazı ve başvuru belgelerinin son paketini hazırlar.',
  'already-built-guard': 'Aynı ilan için başvurunun daha önce hazırlanıp hazırlanmadığını kontrol eder.',
  'posting-nuance-warnings': 'İlanın önemli koşullarını ve başvuruyu etkileyebilecek ayrıntıları işaretler.',
  'jobtable': 'İncelenen ilanları ve başvuruların durumunu takip eder.',
  'jobbot-operations': 'İlan toplama ve yerel değerlendirme hattının durumunu takip eder.',
  'spotify-setup': 'Spotify bağlantısı ve müzik çalma kurulumuna rehberlik eder.',
};
export function agentMission(agent: AgentDTO, room?: Room) {
  if (agent.coordinator) return 'İsteğini anlar, ofisteki uygun skill’e yönlendirir ve sonucu aynı sohbet üzerinden takip etmeni sağlar.';
  if (agent.skill && missions[agent.skill]) return missions[agent.skill]!;
  const station = room?.stations.find(s => s.id === agent.deskId);
  if (station?.kind === 'task' && station.description) return station.description;
  return room ? officeDesign(room).departments.find(d => d.stations.some(s => s.id === agent.deskId))?.purpose ?? 'Ofisin ilgili uzmanlık alanındaki işleri değerlendirir.' : 'Ofisin ilgili uzmanlık alanındaki işleri değerlendirir.';
}
