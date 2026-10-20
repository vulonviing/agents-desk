import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, loadConfig, loadDesks } from './config.js';
import { buildCoordinators, FLOOR_ID, VARIANTS } from './desks.js';
import { createChats } from './chat.js';
import { createNewsFeedback } from './news-feedback.js';
import { createNewsBoard } from './news-board.js';
import { createDialogueCreator } from './dialogue-creator.js';
import { createDialogues } from './dialogues.js';
import { resumeCommand } from './resume.js';
import { getBriefing } from './briefing-client.js';
import { createAntigravityRunner } from './antigravity.js';
import { providerOf } from './llm.js';
import { createUsage } from './usage.js';

const OFFICE_DIR = join(ROOT, 'office', 'public');
const TYPES = {
  '.png': 'image/png',
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

// deps are injectable so tests can run against fixtures: { dataDir, loadConfig, briefing, warmDialogues }
export function createDeskServer(deps = {}) {
  const dataDir = deps.dataDir ?? join(ROOT, 'data');
  const config = deps.loadConfig ?? loadConfig;
  const desks = () => loadDesks(config());
  const getDesk = (id) => desks().find((d) => d.id === id) ?? null;

  const usage = deps.usage ?? createUsage();

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

  // The terminal is a bounded, in-memory view of coordinator CLI calls (status, output, errors; never prompts).
  const cliLog = [];
  const cliEvents = (provider, agentId, label) => (event) => {
    const entry = { id: randomUUID(), at: new Date().toISOString(), provider, managerId: agentId, label,
      kind: event.kind, text: String(event.text ?? '').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').slice(0, 6000) };
    cliLog.push(entry);
    if (cliLog.length > 200) cliLog.shift();
    emit('manager-cli', entry);
  };

  // ---------- the office snapshot: one coordinator per desk ----------
  const chats = createChats({ onChange: () => pushOffice(), sessionsFile: deps.sessionsFile ?? join(dataDir, 'chat-sessions.json') });
  const snapshot = () => ({
    at: new Date().toISOString(),
    desks: desks().map(({ id, name, description, descriptionEn, coordinator, coordinatorEn }) => ({ id, name, description, descriptionEn, coordinator, coordinatorEn })),
    agents: buildCoordinators(desks(), (id) => chats.state(id)),
  });
  let lastOffice = '';
  const pushOffice = () => {
    if (!clients.size) return;
    const { at, ...rest } = snapshot();
    const sig = JSON.stringify(rest);
    if (sig === lastOffice) return;
    lastOffice = sig;
    emit('office', { at, ...rest });
  };

  // ---------- ambient dialogue pools (Antigravity Flash refills them rarely; see server/dialogues.js) ----------
  const newsFeedback = createNewsFeedback({ dataDir });
  const newsCreator = createDialogueCreator({ dataDir, feedback: newsFeedback.editorial });
  const readLocation = () => { try { return JSON.parse(readFileSync(join(dataDir, 'weather-location.json'), 'utf8')); } catch { return {}; } };
  const briefingOf = deps.briefing ?? getBriefing;
  const dialogues = createDialogues({ dataDir, config, preferences: newsFeedback, creator: newsCreator, run: createAntigravityRunner({ dataDir }), onChange: (scope) => emit('dialogues', { scope }),
    briefing: async (office) => briefingOf(dataDir, { topics: office.topics ?? [office.topic].filter(Boolean), queries: office.searchQueries ?? [], standing: true, ...readLocation() }) });
  const officeContext = (id) => {
    const desk = getDesk(id);
    if (!desk) return null;
    const coordinator = desk.coordinator ?? `${desk.name} Koordinatörü`;
    return { name: desk.name, floor: 'Ofis', agents: [{ name: coordinator, mission: desk.description ?? '' }], recent: [], topic: desk.topic ?? 'technology', curator: coordinator, concept: desk.concept ?? 'masa başı sohbeti, kısa molalar, gündem' };
  };
  const floorContext = () => ({
    name: 'Ofis', floor: 'Ofis',
    agents: desks().map((d) => ({ name: d.coordinator ?? d.name, mission: `${d.name}: ${d.description ?? ''}`.slice(0, 150) })).slice(0, 24),
    recent: [], topic: 'business', curator: 'Masaların gündem küratörleri',
    concept: 'Ortak açık ofis: farklı masalardan meslektaşların karşılaşması, disiplinler arası merak, gündem tartışması, pencere önü yorumları. Masa farklarını konuştur. En az %70 genel satır olsun.',
  });
  const newsBoard = createNewsBoard({ dataDir, preferences: newsFeedback, editorial: (job) => dialogues.editorial(job), onChange: () => emit('news', {}), collect: async (call) => {
    const plan = await newsCreator.plan(`floor:${FLOOR_ID}`, floorContext(), call);
    return briefingOf(dataDir, { topics: ['ai', ...(plan.topics ?? [])].filter((v, i, all) => all.indexOf(v) === i).slice(0, 5), queries: plan.queries ?? [], standing: true });
  } });
  // The dialogue libraries of ALL scopes are kept fresh in the background, one scope at a time.
  const warmDialogues = () => {
    if (config()?.dialogues?.enabled !== false) void newsBoard.refresh();
    return dialogues.warm([...desks().map((d) => ({ id: d.id, ctx: officeContext(d.id) })), { id: `floor:${FLOOR_ID}`, ctx: floorContext() }]);
  };
  let warmTimer = null;
  if (deps.warmDialogues) { setTimeout(warmDialogues, 20_000).unref(); warmTimer = setInterval(warmDialogues, 10 * 60_000); warmTimer.unref(); }

  // A chat target: a desk's coordinator, in the project's own folder, read-only.
  const chatTarget = (id, lang = 'tr') => {
    const desk = id.endsWith('#project') ? getDesk(id.slice(0, -'#project'.length)) : null;
    if (!desk) return null;
    return { room: desk, def: { kind: 'project', key: 'project', name: desk.coordinator ?? desk.name, coordinator: true, lang } };
  };

  async function handleApi(req, res, url) {
    const path = url.pathname;
    const method = req.method;
    let m;

    if (method === 'GET') {
      if (path === '/api/news/feedback') return send(res, 200, newsFeedback.get(url.searchParams.get('sourceId')));
      if (path === '/api/news/board') return send(res, 200, newsBoard.read());
      if ((m = path.match(/^\/api\/agents\/([^/]+)\/terminal$/))) {
        const id = decodeURIComponent(m[1]);
        const provider = providerOf(url.searchParams.get('provider') ?? undefined);
        return send(res, 200, { entries: cliLog.filter((e) => e.provider === provider && e.managerId === id) });
      }
      if (path === '/api/office') return send(res, 200, snapshot());
      if (path === '/api/usage') return send(res, 200, await usage.read());
      if (path === '/api/weather') {
        // current weather for the window glass; needs the user's location permission, shares nothing else
        const location = readLocation();
        if (!Number.isFinite(location?.latitude)) return send(res, 200, { configured: false, weather: null });
        const result = await briefingOf(dataDir, { ...location }).catch(() => ({ sources: [] }));
        const weather = result.sources?.find((s) => s.kind === 'weather' && s.weather)?.weather ?? null;
        return send(res, 200, { configured: true, weather });
      }
      if (path === '/api/dialogues/location') return send(res, 200, { configured: Number.isFinite(readLocation().latitude) });
      if (path === '/api/dialogues/status') return send(res, 200, dialogues.status());
      // The command that resumes this coordinator's Desk chat session in a terminal (the user pastes it; Desk never types for them).
      if ((m = path.match(/^\/api\/agents\/([^/]+)\/resume$/))) {
        const id = decodeURIComponent(m[1]);
        const target = chatTarget(id);
        if (!target) return fail(res, 404, 'Koordinatör bulunamadı.');
        const chat = chats.state(id);
        const provider = chat?.provider ?? providerOf(url.searchParams.get('provider') ?? undefined);
        const sessionId = chat?.sessionId ?? null;
        if (!sessionId || !/^[A-Za-z0-9_-]{8,80}$/.test(sessionId)) return fail(res, 404, 'Bu koordinatörün devam edilebilir bir oturumu yok.');
        return send(res, 200, { provider, cwd: target.room.path, command: resumeCommand(provider, sessionId, target.room.path) });
      }
      if (path === '/api/dialogues') {
        const floorId = url.searchParams.get('floor');
        const scopeId = floorId ?? url.searchParams.get('office') ?? '';
        if (!/^[\w.-]{1,80}$/.test(scopeId)) return fail(res, 400, 'Yer kimliği geçersiz.');
        const ctx = floorId ? floorContext() : officeContext(scopeId);
        if (!ctx) return fail(res, 404, 'Masa bulunamadı.');
        return send(res, 200, dialogues.get(floorId ? `floor:${floorId}` : scopeId, ctx));
      }
      if (path === '/api/events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-content-type-options': 'nosniff' });
        res.write(': connected\n\n');
        clients.add(res);
        req.on('close', () => clients.delete(res));
        res.write(`event: office\ndata: ${JSON.stringify(snapshot())}\n\n`);
        return;
      }
      if ((m = path.match(/^\/api\/agents\/([^/]+)\/chat$/))) {
        const id = decodeURIComponent(m[1]);
        return send(res, 200, chats.history(`${providerOf(url.searchParams.get('provider') ?? undefined)}:${id}`));
      }
      return false;
    }

    if (method !== 'POST') return false;
    if (!originOk(req)) return fail(res, 403, 'forbidden origin');

    if (path === '/api/news/feedback') {
      const body = await readJson(req);
      const result = newsFeedback.set({ sourceId: body.sourceId, value: body.value, reason: body.reason });
      for (const pool of dialogues.status().pools) emit('dialogues', { scope: pool.id });
      emit('news', {});
      return send(res, 200, result);
    }

    if (path === '/api/dialogues/location') {
      const body = await readJson(req);
      const file = join(dataDir, 'weather-location.json');
      if (body.clear === true) {
        try { unlinkSync(file); } catch { /* already unset */ }
        dialogues.invalidate();
        return send(res, 200, { configured: false });
      }
      if (!Number.isFinite(body.latitude) || !Number.isFinite(body.longitude) || Math.abs(body.latitude) > 90 || Math.abs(body.longitude) > 180) return fail(res, 400, 'Konum geçersiz.');
      mkdirSync(dataDir, { recursive: true });
      writeFileSync(file, JSON.stringify({ latitude: Math.round(body.latitude * 10) / 10, longitude: Math.round(body.longitude * 10) / 10 }), { mode: 0o600 });
      dialogues.invalidate();
      return send(res, 200, { configured: true });
    }

    if ((m = path.match(/^\/api\/agents\/([^/]+)\/chat(\/reset)?$/))) {
      const id = decodeURIComponent(m[1]);
      const { message, provider: rawProvider, lang: rawLang } = await readJson(req);
      const target = chatTarget(id, rawLang === 'en' ? 'en' : 'tr');
      if (!target) return fail(res, 404, 'Ajan bulunamadı.');
      const provider = providerOf(rawProvider);
      const chatId = `${provider}:${id}`;
      if (m[2]) {
        chats.reset(chatId);
        pushOffice();
        return send(res, 200, { messages: [] });
      }
      return send(res, 200, { messages: await chats.send(target.room, target.def, chatId, message, provider, { onEvent: cliEvents(provider, id, target.def.name) }) });
    }
    return false;
  }

  const server = createServer(async (req, res) => {
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
      const file = resolve(OFFICE_DIR, normalize(rel));
      if (!file.startsWith(OFFICE_DIR + sep) || !existsSync(file) || !statSync(file).isFile()) return fail(res, 404, 'not found');
      return send(res, 200, readFileSync(file), TYPES[extname(file)] ?? 'application/octet-stream');
    } catch (err) {
      if (!res.headersSent) return fail(res, err.status ?? 500, String(err.message ?? err));
      res.end();
    }
  });
  server.on('close', () => {
    clearInterval(heartbeat);
    clearInterval(warmTimer);
  });
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
  const port = await listen(createDeskServer({ warmDialogues: true }), loadConfig().port ?? 4317);
  console.log(`Agents Desk → http://127.0.0.1:${port}/`);
}
