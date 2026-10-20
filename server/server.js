import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, levelFor, loadConfig, scan, writeProjects } from '../scanner/scan.js';
import { loadManifest } from '../scanner/manifest.js';
import { scanSessions } from '../scanner/sessions.js';
import { scanActivity } from '../scanner/activity.js';
import { createObserver } from '../scanner/observer.js';
import { createActivityWatch } from '../scanner/watch.js';
import { validatePlan } from './plans.js';
import { runRouter } from './claude.js';
import { createRunner } from './runner.js';
import { listSessions, readConversation } from './transcripts.js';
import { buildAgents, summarize } from './agents.js';
import { createChats, findAgent } from './chat.js';
import { CHOICE_SCHEMA, choicePrompt, findManager, managerChatPrompt, managerDefs, optionsFor, pickTarget } from './managers.js';
import { runDecision, providerOf } from './llm.js';
import { routerPrompt, PLAN_SCHEMA } from './plans.js';
import { createCoordinators } from './coordinators.js';
import { VARIANTS } from './agents.js';

const LEGACY_OFFICE = join(ROOT, 'office');
const APP_DIST = join(ROOT, 'app', 'dist');
// The built app (Phaser + React) is served when it exists; the previous canvas UI stays as a fallback.
const staticRoot = () => (existsSync(join(APP_DIST, 'index.html')) ? APP_DIST : LEGACY_OFFICE);
const TYPES = {
  '.png': 'image/png',
  '.map': 'application/json',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const fail = (res, status, message) => send(res, status, { error: message });

// Only loopback hosts and origins: blocks DNS-rebinding and cross-site requests.
const hostOk = (req) => /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host ?? '');
const originOk = (req) => !req.headers.origin || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.origin);

function readJson(req, limit = 64 * 1024) {
  return new Promise((resolveBody, reject) => {
    if (!/^application\/json\b/.test(req.headers['content-type'] ?? '')) return reject(Object.assign(new Error('İçerik türü application/json olmalı.'), { status: 415 }));
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('İstek çok büyük.'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolveBody(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(Object.assign(new Error('Geçersiz JSON.'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

// deps are injectable so tests can run against fixtures: { dataDir, manifestDir, loadConfig, projects }
export function createDeskServer(deps = {}) {
  const dataDir = deps.dataDir ?? join(ROOT, 'data');
  const manifestDir = deps.manifestDir ?? join(ROOT, 'projects');
  const config = deps.loadConfig ?? loadConfig;
  const projectsFile = join(dataDir, 'projects.json');

  const rescan = () => {
    const data = scan(config(), Date.now(), manifestDir);
    writeProjects(data, projectsFile);
    return data;
  };
  const readProjects = deps.projects ?? (() => (existsSync(projectsFile) ? JSON.parse(readFileSync(projectsFile, 'utf8')) : rescan()));

  // Transcript scans are incremental thanks to the cache; the result is reused for a few seconds.
  const activityCache = new Map();
  let activityMemo = { at: 0, value: null };
  const readActivity = () => {
    if (Date.now() - activityMemo.at > 4000 || !activityMemo.value) {
      activityMemo = { at: Date.now(), value: scanActivity(readProjects(), config(), Date.now(), activityCache) };
    }
    return activityMemo.value;
  };

  // A room with its level re-resolved from the current config, so a changed level applies immediately.
  const getRoom = (id) => {
    const room = readProjects().floors.flatMap((f) => f.rooms).find((r) => r.id === id);
    if (!room) return null;
    return { ...room, level: levelFor(config(), room.name, room.id, loadManifest(room.id, manifestDir).manifest) };
  };

  // ---------- the office snapshot: agents + live sessions + station activity ----------
  const observer = createObserver();
  const coordinators = createCoordinators();
  const localObservations = [];
  const runStations = {};
  let dispatching = false;
  const snapshot = () => {
    const data = readProjects();
    const observed = observer.poll(data, config());
    const live = scanSessions(data, config()).live;
    for (const [id, session] of Object.entries(observed.live)) if (!live[id] || session.ageSec <= live[id].ageSec + 2) live[id] = session;
    const activity = readActivity();
    const runSnap = runner.snapshot();
    const residents = buildAgents({ data, live, activity, observedSessions: observed.sessions ?? [], runs: runSnap.runs, runStations, plans: Object.fromEntries(plans), now: Date.now() });
    const agents = coordinators.build(data, residents, observed.sessions ?? [], id => chats.state(id));
    const managers = managerDefs(data).map((m, i) => ({ ...m, variant: VARIANTS[(i * 5 + 3) % VARIANTS.length], status: dispatching ? 'thinking' : 'idle', offices: data.floors.reduce((n, f) => n + f.rooms.length, 0) }));
    armExpiry(observed, live, activity, runSnap);
    return { at: new Date().toISOString(), sessions: observed.sessions ?? [], summary: summarize(agents), agents, managers, live, activity, observations: [...observed.events, ...localObservations.filter(e => Date.now() - Date.parse(e.at) < 120_000)] };
  };
  let lastOffice = '';
  let refreshTimer = null, expiryTimer = null;
  const pushOffice = () => {
    if (!clients.size) return;
    const snap = snapshot();
    const { at, ...rest } = snap;
    const sig = JSON.stringify(rest);
    if (sig === lastOffice) return;
    lastOffice = sig;
    emit('office', snap);
  };
  const soon = () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(pushOffice, 120);
  };
  // Only age transitions schedule a one-shot wakeup; filesystem changes drive normal refreshes.
  const armExpiry = (observed, live, activity, runSnap) => {
    clearTimeout(expiryTimer);
    const now = Date.now(), deadlines = [];
    const add = t => { if (Number.isFinite(t) && t > now + 10) deadlines.push(t); };
    for (const s of observed.sessions ?? []) for (const age of [30_000, 120_000, (config().sessions?.liveMinutes ?? 10) * 60_000]) add(s.at + age);
    for (const s of Object.values(live)) for (const age of [15_000, 120_000, 600_000]) add(now - s.ageSec * 1000 + age);
    for (const event of observed.events) add(Date.parse(event.at) + 120_000);
    for (const room of Object.values(activity.rooms)) for (const station of Object.values(room)) add(Date.parse(station.lastAt) + 120_000);
    for (const run of runSnap.runs) add(Date.parse(run.endedAt) + (run.state === 'done' ? 8000 : 60_000));
    if (deadlines.length) {
      expiryTimer = setTimeout(() => { observer.invalidate(); pushOffice(); }, Math.max(20, Math.min(...deadlines) - now + 20));
      expiryTimer.unref();
    }
  };
  const activityWatch = createActivityWatch(({ skillsChanged }) => {
    observer.invalidate();
    activityMemo.at = 0;
    if (skillsChanged) {
      const data = rescan();
      activityWatch.configure(data, config());
      emit('projects', data);
    }
    pushOffice();
  });

  // ---------- live events (SSE) ----------
  const clients = new Set();
  const emit = (type, payload) => {
    const frame = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const res of clients) res.write(frame);
  };
  const heartbeat = setInterval(() => {
    for (const res of clients) res.write(': ping\n\n');
  }, 20_000);
  heartbeat.unref();

  // The terminal is a bounded, in-memory view of manager CLI calls, separate from project transcripts.
  const managerCli = [];
  const cliEvents = (provider, managerId, label) => (event) => {
    const entry = { id: randomUUID(), at: new Date().toISOString(), provider, managerId, label,
      kind: event.kind, text: String(event.text ?? '').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').slice(0, 6000) };
    managerCli.push(entry);
    if (managerCli.length > 200) managerCli.shift();
    emit('manager-cli', entry);
  };

  // ---------- plans and runs ----------
  const plans = new Map();
  const routing = new Set();
  let server;
  const runner = createRunner({
    getRoom,
    emit: (type, payload) => {
      if (type === 'run' && ['done', 'failed', 'cancelled'].includes(payload.state)) {
        const p = plans.get(payload.planId);
        if (p) p.status = payload.state;
        delete runStations[payload.roomId];
      }
      if (type === 'run-station' && payload.stationId) runStations[payload.roomId] = payload.stationId;
      emit(type, payload);
      if (type === 'run' || type === 'run-station' || type === 'approval' || type === 'approval-resolved') soon();
    },
    approveUrl: () => `http://127.0.0.1:${server.address().port}/api/permission/request`,
    dataDir,
  });

  const chats = createChats({ onChange: event => {
    if (event.phase === 'delegation') {
      localObservations.push({ id: randomUUID(), kind: 'activation', at: new Date().toISOString(), roomId: event.roomId, provider: event.provider, from: null, to: event.stationId, tool: 'Skill görevi', file: null, coordinatorId: event.id.slice(event.provider.length + 1) });
      if (localObservations.length > 80) localObservations.shift();
    }
    observer.invalidate(); soon();
  } });
  const clarifications = new Map();

  const planSummary = (p) => ({ id: p.id, roomId: p.roomId, createdAt: p.createdAt, status: p.status, runId: p.runId, plan: p.plan, text: p.text });

  function savePlan(p) {
    try {
      mkdirSync(join(dataDir, 'plans'), { recursive: true });
      writeFileSync(join(dataDir, 'plans', `${p.id}.json`), JSON.stringify(planSummary(p), null, 2), { mode: 0o600 });
    } catch {
      // history is best-effort
    }
  }

  async function handleApi(req, res, url) {
    const path = url.pathname;
    const method = req.method;
    let m;

    if (method === 'GET') {
      if ((m = path.match(/^\/api\/managers\/([^/]+)\/terminal$/))) {
        const id = decodeURIComponent(m[1]);
        if (!findManager(readProjects(), id)) return fail(res, 404, 'Yönetici bulunamadı.');
        const provider = providerOf(url.searchParams.get('provider') ?? undefined);
        return send(res, 200, { entries: managerCli.filter((e) => e.provider === provider && e.managerId === id) });
      }
      if (path === '/api/projects') return send(res, 200, readProjects());
      if (path === '/api/activity') return send(res, 200, readActivity());
      if (path === '/api/sessions') return send(res, 200, scanSessions(readProjects(), config()));
      if (path === '/api/office') return send(res, 200, snapshot());
      if (path === '/api/state') return send(res, 200, { ...runner.snapshot(), plans: [...plans.values()].slice(-20).map(planSummary) });
      if (path === '/api/events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-content-type-options': 'nosniff' });
        res.write(': connected\n\n');
        clients.add(res);
        req.on('close', () => { clients.delete(res); if (!clients.size) clearTimeout(expiryTimer); });
        res.write(`event: office\ndata: ${JSON.stringify(snapshot())}\n\n`);
        return;
      }
      if ((m = path.match(/^\/api\/plans\/([\w-]+)$/))) {
        const p = plans.get(m[1]);
        return p ? send(res, 200, planSummary(p)) : fail(res, 404, 'Plan bulunamadı.');
      }
      if ((m = path.match(/^\/api\/agents\/([^/]+)\/chat$/))) {
        const id = decodeURIComponent(m[1]);
        return send(res, 200, chats.history(`${providerOf(url.searchParams.get('provider') ?? undefined)}:${id}`));
      }
      if ((m = path.match(/^\/api\/runs\/([\w-]+)\/log$/))) return runner.get(m[1]) ? send(res, 200, runner.log(m[1])) : fail(res, 404, 'Oturum bulunamadı.');
      if ((m = path.match(/^\/api\/rooms\/([\w-]+)\/sessions$/))) {
        const room = getRoom(m[1]);
        return room ? send(res, 200, await listSessions(room, config())) : fail(res, 404, 'Oda bulunamadı.');
      }
      if ((m = path.match(/^\/api\/rooms\/([\w-]+)\/sessions\/([\w.-]+)$/))) {
        const room = getRoom(m[1]);
        if (!room) return fail(res, 404, 'Oda bulunamadı.');
        const conv = await readConversation(room, m[2], config());
        return conv ? send(res, 200, conv) : fail(res, 404, 'Oturum bulunamadı.');
      }
      return false;
    }

    if (method !== 'POST') return false;

    // The bridge of a running session: no browser, so no Origin; the per-run token is the credential.
    if (path === '/api/permission/request') {
      const body = await readJson(req);
      return send(res, 200, await runner.requestPermission(body));
    }
    if (!originOk(req)) return fail(res, 403, 'forbidden origin');

    if (path === '/api/rescan') { const data = rescan(); activityWatch.configure(data, config()); observer.invalidate(); emit('projects', data); soon(); return send(res, 200, data); }

    if ((m = path.match(/^\/api\/agents\/([^/]+)\/chat(\/reset)?$/))) {
      const id = decodeURIComponent(m[1]);
      const data = readProjects();
      const manager = id.startsWith('manager:') ? findManager(data, id) : null;
      // a manager chats from this repo's folder; everyone else from their project
      const room = manager ? { id: manager.id, name: manager.name, path: ROOT } : getRoom(id.split('#')[0]);
      const coordinator = !manager && room ? snapshot().agents.find(a => a.id === id && a.coordinator) : null;
      const def = manager ? { kind: 'manager', key: manager.id, name: manager.name, prompt: managerChatPrompt(data, manager) } : coordinator ? { kind: 'project', key: id.split('#')[1], name: coordinator.name, coordinator: true } : room ? findAgent(room, id) : null;
      if (!room || !def) return fail(res, 404, 'Ajan bulunamadı.');
      const { message, provider: rawProvider } = await readJson(req);
      const provider = providerOf(rawProvider);
      const attached = coordinator?.sessionId ? observer.resolve(coordinator.sessionId) : null;
      if (attached && attached.provider !== provider) return fail(res, 409, 'Bu koordinatörün oturumu farklı bir CLI kullanıyor. Üst bardan o CLI’ı seç.');
      if (attached?.state === 'working') return fail(res, 409, 'Bu oturum dışarıdaki CLI’da çalışıyor. Yanıtı tamamlandığında aynı oturumdan devam edebilirsin.');
      const chatId = `${provider}:${id}`;
      if (m[2]) {
        chats.reset(chatId);
        return send(res, 200, { messages: [] });
      }
      try { return send(res, 200, { messages: await chats.send(attached?.cwd ? { ...room, path: attached.cwd } : room, def, chatId, message, provider, { resumeSessionId: attached?.sessionId }) }); } finally { observer.invalidate(); soon(); }
    }
    if (path === '/api/dispatch') {
      const body = await readJson(req);
      const provider = providerOf(body.provider);
      const entryManagerId = body.managerId ?? 'manager:master';
      const entryManager = findManager(readProjects(), entryManagerId);
      if (!entryManager) return fail(res, 404, 'Yönetici bulunamadı.');
      const text = typeof body.text === 'string' ? body.text.trim() : '';
      if (text.length < 2 || text.length > 4000) return fail(res, 400, 'Mesaj 2 ile 4000 karakter arasında olmalı.');
      if (dispatching) return fail(res, 409, 'Bir görev zaten dağıtılıyor.');
      const previous = body.clarificationId ? clarifications.get(body.clarificationId) : null;
      if (body.clarificationId && (!previous || previous.provider !== provider || previous.entryManagerId !== entryManagerId)) return fail(res, 400, 'Bu konuşma bulunamadı veya CLI değişti. Master’a yeniden yaz.');
      if (body.targetId && (!previous || body.reconsider || !previous.options.some((o) => o.id === body.targetId))) return fail(res, 400, 'Yalnızca sunulan seçeneklerden birini seçebilirsin.');
      const task = previous ? previous.task : text;
      const context = previous ? `${previous.context}\nYöneticinin sorusu: ${previous.question}\nKullanıcının yanıtı: ${text}` : task;
      if (context.length > 16000) return fail(res, 400, 'Konuşma çok uzadı. Master’a yeni bir istek yaz.');
      dispatching = true;
      soon();
      try {
        const data = readProjects();
        const master = findManager(data, 'manager:master');
        const reconsider = body.reconsider === true;
        const route = previous && !reconsider ? [...previous.route] : [];
        const decide = async (manager) => pickTarget(
          await runDecision(choicePrompt(data, manager), context, CHOICE_SCHEMA, { provider, onEvent: cliEvents(provider, entryManagerId, manager.name) }), optionsFor(data, manager));
        const ask = (manager, pick) => {
          const id = randomUUID();
          // Bound in-memory continuations; no conversation text is persisted.
          if (clarifications.size >= 100) clarifications.delete(clarifications.keys().next().value);
          clarifications.set(id, { provider, task, context, question: pick.clarification.question, entryManagerId, managerId: manager.id, options: pick.clarification.options, route });
          if (body.clarificationId) clarifications.delete(body.clarificationId);
          return send(res, 200, { provider, route, plan: null, go: null, clarification: { id, by: manager.name, ...pick.clarification } });
        };
        // Offered office choices navigate immediately without another model turn.
        let officePick;
        if (body.targetId) {
          const target = optionsFor(data, master).find(o => o.id === body.targetId);
          if (!target) return fail(res, 400, 'Bu seçenek artık mevcut değil.');
          officePick = { target, reason: 'Senin seçimin.' };
        } else {
          officePick = await decide(master);
          if (officePick.clarification) return ask(master, officePick);
        }
        route.push({ by: master.name, floorId: officePick.target.floorId, roomId: officePick.target.id, target: officePick.target.name, reason: officePick.reason });
        if (body.clarificationId) clarifications.delete(body.clarificationId);
        // The sole master navigates directly; planning remains in the destination office's Task tab.
        return send(res, 200, { provider, route, plan: null, go: { floorId: officePick.target.floorId, roomId: officePick.target.id } });
      } catch (err) {
        cliEvents(provider, entryManagerId, entryManager.name)({ kind: 'error', text: err.message });
        return fail(res, 502, err.message);
      } finally {
        dispatching = false;
        soon();
      }
    }
    if ((m = path.match(/^\/api\/rooms\/([\w-]+)\/route$/))) {
      const room = getRoom(m[1]);
      if (!room) return fail(res, 404, 'Oda bulunamadı.');
      const { text, provider: rawProvider } = await readJson(req);
      const provider = providerOf(rawProvider);
      const task = typeof text === 'string' ? text.trim() : '';
      if (task.length < 3 || task.length > 4000) return fail(res, 400, 'Görev 3 ile 4000 karakter arasında olmalı.');
      if (routing.has(room.id)) return fail(res, 409, 'Bu oda için bir plan zaten hazırlanıyor.');
      routing.add(room.id);
      try {
        const plan = validatePlan(provider === 'codex' ? await runDecision(routerPrompt(room), task, PLAN_SCHEMA, { provider }) : await runRouter(room, task), room);
        const entry = { id: randomUUID(), roomId: room.id, text: task, createdAt: new Date().toISOString(), status: 'ready', runId: null, plan };
        plans.set(entry.id, entry);
        savePlan(entry);
        emit('plan', planSummary(entry));
        return send(res, 200, planSummary(entry));
      } catch (err) {
        return fail(res, 502, err.message);
      } finally {
        routing.delete(room.id);
      }
    }
    if ((m = path.match(/^\/api\/plans\/([\w-]+)\/run$/))) {
      const entry = plans.get(m[1]);
      if (!entry) return fail(res, 404, 'Plan bulunamadı.');
      if (entry.status !== 'ready') return fail(res, 409, 'Bu plan zaten çalıştırıldı.');
      // The plan was validated for the level at planning time; start() checks the current level again.
      const room = getRoom(entry.roomId);
      const current = room ? validatePlan({ summary: entry.plan.summary, steps: entry.plan.steps.map((s) => ({ stationId: s.stationId, action: s.action })) }, room) : entry.plan;
      const run = runner.start(entry.roomId, entry.id, current, entry.text);
      entry.status = 'running';
      entry.runId = run.id;
      entry.plan = current;
      emit('plan', planSummary(entry));
      return send(res, 202, run);
    }
    if ((m = path.match(/^\/api\/runs\/([\w-]+)\/cancel$/))) return runner.cancel(m[1]) ? send(res, 200, { ok: true }) : fail(res, 409, 'Çalışan bir oturum yok.');
    if ((m = path.match(/^\/api\/approvals\/([\w-]+)$/))) {
      const { decision } = await readJson(req);
      if (decision !== 'allow' && decision !== 'deny') return fail(res, 400, 'decision allow ya da deny olmalı.');
      return runner.decide(m[1], decision === 'allow') ? send(res, 200, { ok: true }) : fail(res, 404, 'Onay isteği bulunamadı.');
    }
    return false;
  }

  server = createServer(async (req, res) => {
    if (!hostOk(req)) return fail(res, 403, 'forbidden host');
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) {
        const handled = await handleApi(req, res, url);
        if (handled === false) return fail(res, req.method === 'GET' || req.method === 'POST' ? 404 : 405, 'not found');
        return;
      }
      if (req.method !== 'GET') return fail(res, 405, 'method not allowed');
      const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const root = staticRoot();
      const file = resolve(root, normalize(rel));
      if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) return fail(res, 404, 'not found');
      return send(res, 200, readFileSync(file), TYPES[extname(file)] ?? 'application/octet-stream');
    } catch (err) {
      if (!res.headersSent) return fail(res, err.status ?? 500, String(err.message ?? err));
      res.end();
    }
  });
  server.on('listening', () => activityWatch.configure(readProjects(), config()));
  server.on('close', () => {
    clearInterval(heartbeat);
    activityWatch.close();
    clearTimeout(expiryTimer);
    clearTimeout(refreshTimer);
  });
  server.runner = runner;
  return server;
}

async function listen(server, port) {
  for (let p = port; p < port + 20; p++) {
    const ok = await new Promise((done) => {
      server.once('error', () => done(false));
      server.listen(p, '127.0.0.1', () => done(true));
    });
    if (ok) return p;
  }
  throw new Error(`no free port from ${port}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = await listen(createDeskServer(), loadConfig().port ?? 4317);
  console.log(`Agents Desk → http://127.0.0.1:${port}/`);
}
