// Client side of Phase 2: plans, runs and approval cards, kept in sync with the server through
// server-sent events. Pure state plus fetch; the panel renders it, the room view follows it.

const MAX_LOG = 80;
const ACTIVE = new Set(['starting', 'running', 'cancelling']);

async function post(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `${path}: ${res.status}`);
  return data;
}

export function createTasks(onChange) {
  const s = { plans: new Map(), runs: new Map(), approvals: new Map(), logs: new Map(), stations: new Map(), routing: new Set(), errors: new Map() };
  const notify = () => onChange();

  const putPlan = (p) => s.plans.set(p.id, p);
  const putRun = (r) => {
    s.runs.set(r.id, r);
    if (!ACTIVE.has(r.state)) for (const [id, a] of s.approvals) if (a.runId === r.id) s.approvals.delete(id);
  };

  async function load() {
    try {
      const res = await fetch('/api/state');
      if (!res.ok) return;
      const st = await res.json();
      s.plans = new Map(st.plans.map((p) => [p.id, p]));
      s.runs = new Map(st.runs.map((r) => [r.id, r]));
      s.approvals = new Map(st.approvals.map((a) => [a.id, a]));
      notify();
    } catch {
      // server restarting: the next event stream reconnect reloads
    }
  }

  function connect() {
    const es = new EventSource('/api/events');
    es.addEventListener('open', load);
    es.addEventListener('plan', (e) => (putPlan(JSON.parse(e.data)), notify()));
    es.addEventListener('run', (e) => (putRun(JSON.parse(e.data)), notify()));
    es.addEventListener('run-log', (e) => {
      const d = JSON.parse(e.data);
      const list = s.logs.get(d.runId) ?? [];
      list.push(d);
      if (list.length > MAX_LOG) list.shift();
      s.logs.set(d.runId, list);
      notify();
    });
    es.addEventListener('run-station', (e) => {
      const d = JSON.parse(e.data);
      if (d.stationId) s.stations.set(d.roomId, { stationId: d.stationId, at: Date.now() });
      notify();
    });
    es.addEventListener('approval', (e) => {
      const a = JSON.parse(e.data);
      s.approvals.set(a.id, a);
      notify();
    });
    es.addEventListener('approval-resolved', (e) => (s.approvals.delete(JSON.parse(e.data).id), notify()));
  }

  const forRoom = (map, roomId) => [...map.values()].filter((x) => x.roomId === roomId);
  const api = {
    state: s,
    start: () => (connect(), load()),
    plansOf: (roomId) => forRoom(s.plans, roomId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    latestPlan: (roomId) => api.plansOf(roomId)[0] ?? null,
    activeRun: (roomId) => forRoom(s.runs, roomId).find((r) => ACTIVE.has(r.state)) ?? null,
    lastRun: (roomId) => forRoom(s.runs, roomId).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null,
    logOf: (runId) => s.logs.get(runId) ?? [],
    approvalsOf: (roomId) => forRoom(s.approvals, roomId),
    isRouting: (roomId) => s.routing.has(roomId),
    errorOf: (roomId) => s.errors.get(roomId) ?? '',
    // The station the room's run is working at, and whether it is waiting for an approval.
    runOf: (roomId) => {
      const run = api.activeRun(roomId);
      if (!run) return null;
      return { active: true, stationId: s.stations.get(roomId)?.stationId ?? run.stationId ?? null, waiting: api.approvalsOf(roomId).length > 0 };
    },
    async route(roomId, text) {
      s.routing.add(roomId);
      s.errors.delete(roomId);
      notify();
      try {
        putPlan(await post(`/api/rooms/${roomId}/route`, { text }));
      } catch (err) {
        s.errors.set(roomId, err.message);
      } finally {
        s.routing.delete(roomId);
        notify();
      }
    },
    async run(planId, roomId) {
      s.errors.delete(roomId);
      try {
        putRun(await post(`/api/plans/${planId}/run`));
      } catch (err) {
        s.errors.set(roomId, err.message);
      }
      notify();
    },
    async cancel(runId, roomId) {
      try {
        await post(`/api/runs/${runId}/cancel`);
      } catch (err) {
        s.errors.set(roomId, err.message);
        notify();
      }
    },
    async decide(id, allow, roomId) {
      try {
        await post(`/api/approvals/${id}`, { decision: allow ? 'allow' : 'deny' });
      } catch (err) {
        s.errors.set(roomId, err.message);
        notify();
      }
    },
    async sessions(roomId) {
      const res = await fetch(`/api/rooms/${roomId}/sessions`);
      if (!res.ok) throw new Error('Oturumlar okunamadı.');
      return res.json();
    },
    async conversation(roomId, id) {
      const res = await fetch(`/api/rooms/${roomId}/sessions/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error('Konuşma okunamadı.');
      return res.json();
    },
  };
  return api;
}
