// Turns what the desk knows (rooms, live sessions, station activity, runs started from the office) into the
// "agents" the office shows. Pure: no I/O, so it is easy to test.
//
// Who is an agent:
//   - a room with two or more skills has one agent per skill, named after the skill
//   - a "project agent", named after the project, exists when the room has fewer than two skills (so the room
//     is never empty) or has task stations (scripts, subsystems) that no skill owns
//
// status (the visual states the UI animates):
//   offline   nobody has touched the project for a long time and nothing is running
//   idle      nothing to do
//   working   a session (or a run from the office) is using this agent's station right now
//   thinking  a session is thinking, or waits for the user / an approval
//   completed a run from the office finished a moment ago
//   error     a run from the office failed a moment ago
// "moving" is not decided here: the client sets it while the character walks.

const HOT_MS = 120_000;
const COMPLETED_MS = 8_000;
const ERROR_MS = 60_000;

export const VARIANTS = ['adam0', 'adam1', 'adam2', 'adam3', 'alex0', 'alex1', 'alex2', 'alex3', 'amelia0', 'amelia1', 'amelia2', 'amelia3', 'bob0', 'bob1', 'bob2', 'bob3'];

const hash = (s) => [...String(s)].reduce((n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) | 0, 7) >>> 0;
const clip = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};

// The room's live session, or one in a repo embedded in it.
export const roomLive = (room, live) => live[room.id] ?? (room.embedded ?? []).map((e) => live[e.id]).find(Boolean) ?? null;

// Agent definitions of a room: { kind, key, name, station (home desk), owned: station ids }.
export function agentDefs(room) {
  const skills = room.stations.filter((s) => s.kind === 'skill');
  const tasks = room.stations.filter((s) => s.kind !== 'skill');
  const defs = [];
  if (skills.length >= 2) for (const s of skills) defs.push({ kind: 'skill', key: s.id, name: s.skill ?? s.name, station: s, owned: [s.id] });
  if (skills.length < 2 || tasks.length) {
    const owned = skills.length < 2 ? room.stations.map((s) => s.id) : tasks.map((s) => s.id);
    defs.push({ kind: 'project', key: 'project', name: room.name, station: tasks[0] ?? skills[0] ?? room.stations[0] ?? null, owned });
  }
  return defs;
}

export const agentId = (roomId, key) => `${roomId}#${key}`;

// runs: [{ roomId, planId, state, startedAt, endedAt, error, result }], plans: planId → { plan: { summary }, text }
export function buildAgents({ data, live = {}, activity = {}, runs = [], runStations = {}, plans = {}, observedSessions = [], now = Date.now() }) {
  const agents = [];
  for (const floor of data.floors) {
    for (const room of floor.rooms) {
      const lv = roomLive(room, live);
      const act = activity?.rooms?.[room.id] ?? {};
      const roomRuns = runs.filter((r) => r.roomId === room.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      const active = roomRuns.find((r) => ['starting', 'running', 'cancelling'].includes(r.state)) ?? null;
      const last = roomRuns[0] ?? null;
      const ended = last && !active && last.endedAt ? now - Date.parse(last.endedAt) : Infinity;
      const runStation = active ? runStations[room.id] ?? null : null;
      const planText = active ? clip(plans[active.planId]?.plan?.summary ?? plans[active.planId]?.text ?? '', 140) : '';
      const hotAt = (id) => (act[id]?.lastAt && now - Date.parse(act[id].lastAt) <= HOT_MS ? Date.parse(act[id].lastAt) : null);
      const defs = agentDefs(room);
      const ownedBy = new Map(defs.flatMap((d) => d.owned.map((id) => [id, d.key])));

      const list = defs.map((d) => {
        const session = observedSessions.filter(s => s.roomId === room.id && (d.owned.includes(s.stationId) || (d.kind === 'project' && !s.stationId))).sort((a, b) => a.ageSec - b.ageSec)[0] ?? lv;
        const hot = d.owned.filter((id) => hotAt(id) || id === session?.stationId || id === runStation);
        const demand = hot.sort((a, b) => Number(b === runStation) - Number(a === runStation) || Number(b === session?.stationId) - Number(a === session?.stationId) || (hotAt(b) ?? 0) - (hotAt(a) ?? 0))[0] ?? null;
        // a live session without a known station belongs to the project agent
        const liveHere = !!session && (d.owned.includes(session.stationId) || (d.kind === 'project' && (!session.stationId || !ownedBy.has(session.stationId))));
        const runHere = !!active && (d.owned.includes(runStation) || (d.kind === 'project' && (!runStation || !ownedBy.has(runStation))));
        const station = room.stations.find((s) => s.id === (demand ?? d.station?.id)) ?? null;
        let status = room.dust >= 2 && !demand && !liveHere && !runHere ? 'offline' : 'idle';
        let task = null;
        let waiting = false;
        if (demand) {
          status = 'working';
          task = station?.name ?? null;
        }
        if (liveHere) {
          waiting = session.state === 'waiting';
          status = waiting ? 'thinking' : session.tool || session.stationId ? 'working' : 'thinking';
          task = session.tool ? `${session.tool}${session.file ? `: ${session.file}` : ''}` : task ?? (waiting ? 'Cevap / izin bekliyor' : 'Düşünüyor');
        }
        if (runHere) {
          status = waiting ? 'thinking' : 'working';
          task = planText || task || 'Görev çalışıyor';
        } else if (d.kind === 'project' && last && last.state === 'failed' && ended <= ERROR_MS) {
          status = 'error';
          task = clip(last.error ?? last.result?.text ?? 'Çalıştırma başarısız', 140);
        } else if (d.kind === 'project' && last && last.state === 'done' && ended <= COMPLETED_MS) {
          status = 'completed';
          task = clip(last.result?.text ?? 'Görev tamamlandı', 140);
        }
        const recent = d.owned
          .map((id) => ({ id, a: act[id] }))
          .filter((x) => x.a?.lastAt)
          .sort((x, y) => y.a.lastAt.localeCompare(x.a.lastAt))
          .slice(0, 5)
          .map(({ id, a }) => ({ stationId: id, name: room.stations.find((s) => s.id === id)?.name ?? id, lastAt: a.lastAt, tool: a.lastTool ?? null, count7d: a.count7d ?? 0 }));
        const lastAt = [recent[0]?.lastAt, liveHere ? new Date(now - session.ageSec * 1000).toISOString() : null].filter(Boolean).sort().at(-1) ?? null;
        return {
          id: agentId(room.id, d.key),
          roomId: room.id,
          floorId: floor.id,
          kind: d.kind,
          skill: d.kind === 'skill' ? d.name : null,
          name: d.name,
          role: d.kind === 'skill' ? `${room.name} · skill` : `${room.name} · proje ajanı`,
          variant: VARIANTS[hash(`${room.id}#${d.key}`) % VARIANTS.length],
          status,
          waiting,
          currentTask: task,
          model: liveHere ? session.model ?? null : null,
          cliActive: !!runHere || !!(liveHere && !waiting),
          observation: liveHere ? { provider: session.provider ?? 'claude', tool: session.tool, file: session.file, ageSec: session.ageSec, state: session.state } : null,
          deskId: station?.id ?? null,
          deskName: station?.name ?? null,
          lastActivity: lastAt,
          recent,
          level: room.level,
          rank: (liveHere || runHere ? 0 : demand ? 1 : 2),
        };
      });
      // the most interesting agents first: live, then busy, then the most recently active
      list.sort((a, b) => a.rank - b.rank || (b.lastActivity ?? '').localeCompare(a.lastActivity ?? '') || a.name.localeCompare(b.name));
      agents.push(...list.map(({ rank: _rank, ...a }) => a));
    }
  }
  return agents;
}

export function summarize(agents) {
  const by = (s) => agents.filter((a) => a.status === s).length;
  return { total: agents.length, working: by('working'), thinking: by('thinking'), idle: by('idle'), offline: by('offline'), completed: by('completed'), error: by('error') };
}
