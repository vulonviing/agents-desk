import { VARIANTS } from './agents.js';
const names = { 'emrecan-cv': 'Başvuru Koordinatörü', mahur: 'Müzik Direktörü', paperhub: 'Araştırma Koordinatörü', portfolio: 'Portfolyo Koordinatörü', 'cv-checker': 'CV İnceleme Koordinatörü' };

// One permanent coordinator per office. Observed sessions bind one-to-one without duplicating the first.
export function createCoordinators() {
  const primary = new Map();
  return { build(data, residents, sessions = [], chatState = () => null) {
    const result = [];
    for (const floor of data.floors) for (const room of floor.rooms) {
      const present = sessions.filter(s => s.roomId === room.id).sort((a,b) => (a.openedAt ?? a.at) - (b.openedAt ?? b.at));
      let first = primary.get(room.id);
      if (!present.some(s => s.id === first)) { first = present[0]?.id ?? null; primary.set(room.id, first); }
      const ordered = first ? [present.find(s => s.id === first), ...present.filter(s => s.id !== first)] : [null];
      ordered.forEach((session, index) => {
        const id = index === 0 ? `${room.id}#project` : `${room.id}#cli:${session.id.slice(8)}`;
        const chat = chatState(id);
        const active = !!chat?.busy || !!(session && session.state === 'working' && session.ageSec < 120);
        const waiting = !!session && !active && session.state === 'waiting' && !['turn', 'opened'].includes(session.reason) && session.ageSec < 120;
        const at = session ? new Date(session.at).toISOString() : chat?.at ?? null;
        const original = residents.find(a => a.id === `${room.id}#project`);
        const name = names[room.id] ?? `${room.name} Koordinatörü`;
        result.push({ id, roomId: room.id, floorId: floor.id, kind: 'project', coordinator: true,
          name: index ? `${name} ${index + 1}` : name, role: 'Ofis koordinatörü', skill: null,
          variant: original?.variant ?? VARIANTS[([...id].reduce((n,c) => n + c.charCodeAt(0), 0) + index) % VARIANTS.length],
          status: active ? 'working' : waiting ? 'thinking' : 'idle', waiting, cliActive: active,
          sessionId: session?.id ?? null, sessionProvider: session?.provider ?? chat?.provider ?? null,
          sessionMode: session ? 'observed' : chat?.sessionId ? 'desk' : 'ready',
          targetStationId: chat?.stationId ?? (session && (!chat?.busy || session.at >= Date.parse(chat.at)) ? session.stationId : null) ?? null,
          currentTask: chat?.task ?? session?.tool ?? null, model: session?.model ?? null,
          deskId: null, deskName: 'Koordinasyon alanı', level: room.level, recent: original?.recent ?? [], lastActivity: at,
          observation: session ? { provider: session.provider, tool: session.tool, file: session.file, ageSec: session.ageSec, state: session.state } : null,
        });
      });
      result.push(...residents.filter(a => a.roomId === room.id && a.kind === 'skill'));
      for (const station of (room.stations ?? []).filter(s => s.kind === 'skill')) {
        const id = `${room.id}#${station.id}`;
        if (result.some(a => a.id === id)) continue;
        result.push({ id, roomId: room.id, floorId: floor.id, kind: 'skill', name: station.skill ?? station.name, role: `${room.name} · skill`, skill: station.skill ?? station.name, variant: VARIANTS[3], status:'idle',waiting:false,cliActive:false,currentTask:null,model:null,deskId:station.id,deskName:station.name,lastActivity:null,recent:[],level:room.level });
      }
      for (const station of (room.stations ?? []).filter(s => s.kind !== 'skill')) {
        const session = present.find(s => s.stationId === station.id && s.ageSec < 120);
        const original = residents.find(a => a.roomId === room.id && a.kind === 'project' && a.deskId === station.id);
        result.push({ id: `${room.id}#task:${station.id}`, roomId: room.id, floorId: floor.id, kind: 'project', stationWorker: true,
          name: station.name, role: `${room.name} · iş istasyonu`, skill: null,
          variant: VARIANTS[[...`${room.id}:${station.id}`].reduce((n,c)=>n+c.charCodeAt(0),0)%VARIANTS.length],
          status: session?.state === 'working' ? 'working' : 'idle', waiting: session?.state === 'waiting' && !['turn', 'opened'].includes(session?.reason), cliActive: session?.state === 'working',
          currentTask: session?.tool ?? null, model: session?.model ?? null, deskId: station.id, deskName: station.name,
          lastActivity: original?.lastActivity ?? null, recent: original?.recent.filter(r=>r.stationId===station.id) ?? [], level: room.level,
        });
      }
    }
    for (const coordinator of result.filter(a => a.coordinator && a.cliActive && a.targetStationId)) {
      const worker = result.find(a => !a.coordinator && a.roomId === coordinator.roomId && a.deskId === coordinator.targetStationId);
      if (worker) { worker.cliActive = true; worker.status = 'working'; worker.currentTask = `${coordinator.name} üzerinden gelen iş`; worker.observation = coordinator.observation; }
    }
    return result;
  } };
}
