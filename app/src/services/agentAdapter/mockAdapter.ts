import type { AgentDTO, OfficeSnapshot, Projects, Room, Station } from '../../types';
import type { AdapterHandlers, AgentAdapter } from './types';

// A separate demo provider (open the app with ?demo=1). Everything it shows is invented and the UI says so;
// it is never mixed with real agent data.

const VARIANTS = ['adam0', 'alex1', 'amelia2', 'bob3', 'adam2', 'alex3', 'amelia0', 'bob1'];
const TASKS = ['Pazar araştırması', 'Kod incelemesi', 'Rapor taslağı', 'Veri temizleme', 'Arayüz taslağı', 'Test koşusu'];
const STATUSES: AgentDTO['status'][] = ['working', 'thinking', 'idle', 'working', 'completed', 'idle', 'error', 'working'];

const station = (id: string, name: string): Station => ({ id, skill: null, name, description: 'Demo istasyonu', kind: 'task', risk: 'readonly', runsOn: 'local', scripts: [], paths: [], repo: null, source: 'manifest' });
const room = (id: string, name: string, n: number): Room => ({
  id, name, path: `/demo/${id}`, level: 'plan', lastCommit: null, branch: 'main', dirty: 0, ahead: 0, remote: null, ageDays: 1, dust: 0, lamp: 'active',
  readmeSummary: 'Demo ofisi; gerçek bir proje değildir.', notes: '', skills: [], triggers: [], embedded: [],
  stations: Array.from({ length: n }, (_, i) => station(`${id}-s${i}`, ['Araştırma', 'Yazım', 'Analiz', 'Gözden geçirme', 'Yayın', 'Arşiv'][i % 6]!)),
});

export function createMockAdapter(): AgentAdapter {
  let timer: ReturnType<typeof setInterval> | null = null;
  const projects: Projects = {
    generatedAt: 'demo',
    warnings: [],
    floors: [
      { id: 'demo-a', name: 'Demo · Geliştirme', rooms: ['Ürün A', 'Ürün B', 'Ürün C', 'Ürün D', 'Ürün E'].map((n, i) => room(`demo-a${i}`, n, 3 + (i % 4))) },
      { id: 'demo-b', name: 'Demo · Araştırma', rooms: ['Tez', 'Anket', 'Model'].map((n, i) => room(`demo-b${i}`, n, 4)) },
    ],
  };
  const rooms = projects.floors.flatMap((f) => f.rooms.map((r) => ({ f, r })));
  let step = 0;

  const snapshot = (): OfficeSnapshot => {
    const agents: AgentDTO[] = rooms.map(({ f, r }, i) => {
      const status = STATUSES[(i + Math.floor(step / 3)) % STATUSES.length]!;
      return {
        id: `${r.id}#project`, roomId: r.id, floorId: f.id, kind: 'project', skill: null, name: r.name, role: `${r.name} · proje ajanı (demo)`, variant: VARIANTS[i % VARIANTS.length]!, status, waiting: false,
        currentTask: status === 'working' || status === 'thinking' ? TASKS[(i + step) % TASKS.length]! : null, model: 'demo-model', deskId: r.stations[(i + step) % r.stations.length]!.id,
        deskName: null, lastActivity: new Date().toISOString(), recent: [], level: 'plan',
      };
    });
    const by = (s: string) => agents.filter((a) => a.status === s).length;
    return { at: new Date().toISOString(), summary: { total: agents.length, working: by('working'), thinking: by('thinking'), idle: by('idle'), offline: 0, completed: by('completed'), error: by('error') }, agents, live: {}, activity: { generatedAt: new Date().toISOString(), windowDays: 14, rooms: {} } };
  };

  return {
    isDemo: true,
    start(h: AdapterHandlers) {
      h.onProjects(projects);
      h.onTaskState({ plans: [], runs: [], approvals: [] });
      h.onConnection('live');
      h.onSnapshot(snapshot());
      timer = setInterval(() => {
        step++;
        h.onSnapshot(snapshot());
      }, 4000);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    async refreshProjects() {},
  };
}
