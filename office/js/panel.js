import { DUST_TEXT, LAMP_TEXT, daysSince, fullDate, liveSentence, timeAgo } from './format.js';

// All text goes through textContent: README and skill text come from other repos.
function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

const section = (parent, title) => parent.append(el('h3', '', title));
const chip = (text, cls = '') => el('span', `chip ${cls}`.trim(), text);

function list(parent, items, render) {
  const ul = el('ul');
  for (const item of items) {
    const li = el('li');
    render(li, item);
    ul.append(li);
  }
  parent.append(ul);
}

// Single-quote a path for pasting into a shell: folder names are untrusted input.
export const shellQuote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

function copyButton(label, text) {
  const b = el('button', '', label);
  b.type = 'button';
  b.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      b.textContent = 'Kopyalandı';
    } catch {
      b.textContent = 'Kopyalanamadı';
    }
    setTimeout(() => (b.textContent = label), 1500);
  });
  return b;
}

const LEVEL_TEXT = { plan: 'seviye: plan', 'read-only': 'seviye: salt-okunur', approve: 'seviye: onaylı' };
const RISK_TEXT = { readonly: 'salt-okunur', effect: 'yan etkili', unknown: 'risk belirsiz' };
const SOURCE_TEXT = { skill: 'SKILL.md', manifest: 'manifest', 'skill+manifest': 'SKILL.md + manifest', derived: 'otomatik türetildi' };
const BARS = '▁▂▃▄▅▆▇█';

// 14 daily counts as a tiny bar chart, oldest on the left.
export function spark(byDay) {
  if (!byDay) return '';
  const days = [...byDay].reverse();
  const max = Math.max(1, ...days);
  return days.map((n) => (n ? BARS[Math.min(BARS.length - 1, Math.ceil((n / max) * (BARS.length - 1)))] : '·')).join('');
}

function stationRow(station, st, selected, onSelect) {
  const row = el('button', `station${selected ? ' selected' : ''}${st.live ? ' live' : ''}`);
  row.type = 'button';
  const dot = el('span', `dot ${st.lamp}`);
  const name = el('strong', '', station.name);
  const sub = el('span', 'sub', st.live ? 'çalışıyor' : st.count7d ? `${st.label} · ${st.count7d}× bu hafta` : st.label);
  row.append(dot, name, sub);
  row.addEventListener('click', () => onSelect(station.id));
  return row;
}

function stationDetail(root, station, st) {
  const box = el('div', 'detail');
  box.append(el('h3', '', station.name));
  const chips = el('div', 'chips');
  chips.append(chip(station.kind === 'skill' ? 'skill' : 'görev'), chip(RISK_TEXT[station.risk] ?? station.risk, station.risk === 'effect' ? 'warn' : station.risk === 'readonly' ? 'ok' : ''));
  if (station.runsOn && station.runsOn !== 'local') chips.append(chip(`çalıştığı yer: ${station.runsOn}`));
  chips.append(chip(SOURCE_TEXT[station.source] ?? station.source));
  box.append(chips);
  if (station.description) box.append(el('p', '', station.description));
  box.append(el('p', st.live ? 'live-working' : '', st.live ? 'Şu an bu masada çalışılıyor.' : st.days === null ? 'Son 14 günde kullanılmadı.' : `Son kullanım: ${st.label}${st.lastTool ? ` (${st.lastTool})` : ''}`));
  if (st.byDay) box.append(el('p', 'spark', `14 gün  ${spark(st.byDay)}  bugün`));
  if (station.scripts.length) {
    box.append(el('h3', '', "Script'ler"));
    list(box, station.scripts, (li, s) => li.append(el('code', '', s)));
  }
  if (station.paths.length) {
    box.append(el('h3', '', 'Yollar'));
    list(box, station.paths, (li, s) => li.append(el('code', '', s)));
  }
  root.append(box);
}

function activityTab(root, ctx) {
  const { room, statuses, selectedId, onSelect } = ctx;
  const selected = room.stations.find((s) => s.id === selectedId);
  if (selected && statuses.get(selected.id)) stationDetail(root, selected, statuses.get(selected.id));
  section(root, `İstasyonlar · ${room.stations.length}`);
  const ordered = [...room.stations].sort((a, b) => {
    const sa = statuses.get(a.id);
    const sb = statuses.get(b.id);
    if (sa.live !== sb.live) return sa.live ? -1 : 1;
    return (sa.days ?? 999) - (sb.days ?? 999) || a.name.localeCompare(b.name);
  });
  const wrap = el('div', 'stations');
  for (const s of ordered) wrap.append(stationRow(s, statuses.get(s.id), s.id === selectedId, onSelect));
  root.append(wrap);
}

function infoTab(root, room) {
  section(root, 'Son güncelleme');
  if (room.lastCommit) {
    root.append(el('p', '', `${fullDate(room.lastCommit.date)} · ${timeAgo(daysSince(room.lastCommit.date))}`));
    root.append(el('p', '', room.lastCommit.subject));
  } else {
    root.append(el('p', '', 'Henüz commit yok.'));
  }
  if (room.dust > 0) root.append(el('p', 'dust-note', DUST_TEXT[room.dust]));
  if (room.readmeSummary) {
    section(root, 'Özet');
    root.append(el('p', '', room.readmeSummary));
  }
  if (room.notes) {
    section(root, 'Notlar');
    root.append(el('p', '', room.notes));
  }
  if (room.triggers.length) {
    section(root, 'Tetikleyici komutlar');
    list(root, room.triggers, (li, t) => (li.textContent = t));
  }
  if (room.embedded.length) {
    section(root, 'Bu odaya bağlı repolar');
    list(root, room.embedded, (li, e) => {
      li.append(el('strong', '', e.name), el('span', '', ` — ${e.skills.length} skill · ${timeAgo(daysSince(e.lastCommit?.date))}`));
    });
  }
  section(root, 'Konum');
  const path = el('p');
  path.append(el('code', '', room.path));
  root.append(path);
  const actions = el('div', 'chips');
  actions.append(copyButton('Yolu kopyala', room.path), copyButton('Terminal komutunu kopyala', `cd ${shellQuote(room.path)} && claude`));
  root.append(actions);
}

// ---------- Görev tab: type a task, get a plan card, run it, answer approval cards ----------

const RUN_STATE = { starting: 'başlıyor', running: 'çalışıyor', cancelling: 'durduruluyor', done: 'bitti', failed: 'hata', cancelled: 'durduruldu' };
const LOG_ICON = { say: '💬', tool: '🔧', denied: '⛔', approval: '✋' };
const LEVEL_HINT = {
  plan: 'Seviye "plan": plan çıkarabilirsin, ama ofisten hiçbir şey çalıştırılmaz.',
  'read-only': 'Seviye "salt-okunur": yalnızca okuma ve analiz çalışır; script ve değişiklik yok.',
  approve: 'Seviye "onaylı": dosya yazma, komut ve ağ erişimi her seferinde senin onayınla çalışır.',
};

function createTaskPane(room, tasks) {
  const el_ = el('div', 'task');
  const hint = el('p', 'muted', LEVEL_HINT[room.level] ?? '');
  const box = el('textarea');
  box.rows = 4;
  box.maxLength = 4000;
  box.placeholder = 'Bir görev ya da URL yaz… (örn. bir iş ilanı linki)';
  const go = el('button', 'primary', 'Plan çıkar');
  go.type = 'button';
  const error = el('p', 'error');
  const approvalsBox = el('div');
  const planBox = el('div');
  const runBox = el('div');
  el_.append(hint, box, go, error, approvalsBox, runBox, planBox);

  go.addEventListener('click', () => {
    const text = box.value.trim();
    if (text.length >= 3) tasks.route(room.id, text);
  });
  box.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) go.click();
  });

  function planCard(plan) {
    const card = el('div', 'plan');
    card.append(el('h3', '', 'Plan'), el('p', '', plan.plan.summary || '(özet yok)'));
    const ol = el('ol');
    for (const st of plan.plan.steps) {
      const li = el('li', st.executable ? '' : 'blocked');
      li.append(el('strong', '', st.stationName), el('span', '', ` — ${st.action}`));
      const chips = el('div', 'chips');
      chips.append(chip(st.risk === 'readonly' ? 'salt-okunur' : 'yan etkili', st.risk === 'readonly' ? 'ok' : 'warn'));
      if (st.needsApproval) chips.append(chip('onay gerekir'));
      if (st.blockedReason) chips.append(chip(st.blockedReason, 'warn'));
      li.append(chips);
      ol.append(li);
    }
    card.append(ol);
    for (const w of plan.plan.warnings) card.append(el('p', 'dust-note', `⚠ ${w}`));
    if (plan.status === 'ready') {
      const run = el('button', 'primary', plan.plan.executable ? 'Çalıştır' : 'Çalıştırılamaz');
      run.type = 'button';
      run.disabled = !plan.plan.executable || !!tasks.activeRun(room.id);
      run.addEventListener('click', () => tasks.run(plan.id, room.id));
      card.append(run);
    } else {
      card.append(el('p', 'muted', `Durum: ${plan.status === 'running' ? 'çalışıyor' : plan.status === 'done' ? 'bitti' : plan.status === 'cancelled' ? 'durduruldu' : plan.status === 'failed' ? 'hata' : plan.status}`));
    }
    return card;
  }

  function runCard(run) {
    const card = el('div', 'run');
    const active = ['starting', 'running', 'cancelling'].includes(run.state);
    card.append(el('h3', '', `Oturum · ${RUN_STATE[run.state] ?? run.state}`));
    const log = el('ul', 'runlog');
    for (const l of tasks.logOf(run.id).slice(-12)) {
      const li = el('li', l.kind);
      li.textContent = `${LOG_ICON[l.kind] ?? '•'} ${l.kind === 'tool' ? `${l.tool}${l.file ? `: ${l.file}` : ''}` : l.text ?? ''}`;
      log.append(li);
    }
    card.append(log);
    if (run.result) card.append(el('p', run.result.ok ? 'live-working' : 'dust-note', run.result.text));
    if (run.error) card.append(el('p', 'dust-note', run.error));
    if (active) {
      const stop = el('button', '', 'Durdur');
      stop.type = 'button';
      stop.disabled = run.state === 'cancelling';
      stop.addEventListener('click', () => tasks.cancel(run.id, room.id));
      card.append(stop);
    }
    return card;
  }

  function approvalCard(a) {
    const card = el('div', 'approval');
    card.append(el('h3', '', '✋ Onay bekliyor'), el('p', '', a.summary), el('p', 'muted', a.reason ?? ''));
    const row = el('div', 'chips');
    const yes = el('button', 'primary', 'İzin ver');
    const no = el('button', '', 'Reddet');
    yes.type = no.type = 'button';
    yes.addEventListener('click', () => tasks.decide(a.id, true, room.id));
    no.addEventListener('click', () => tasks.decide(a.id, false, room.id));
    row.append(yes, no);
    card.append(row);
    return card;
  }

  return {
    el: el_,
    refresh() {
      go.disabled = tasks.isRouting(room.id);
      go.textContent = tasks.isRouting(room.id) ? 'Plan hazırlanıyor…' : 'Plan çıkar';
      error.textContent = tasks.errorOf(room.id);
      approvalsBox.replaceChildren(...tasks.approvalsOf(room.id).map(approvalCard));
      const run = tasks.activeRun(room.id) ?? tasks.lastRun(room.id);
      runBox.replaceChildren(...(run ? [runCard(run)] : []));
      const plan = tasks.latestPlan(room.id);
      planBox.replaceChildren(...(plan ? [planCard(plan)] : []));
    },
  };
}

// ---------- Oturumlar tab: read the conversations of this room's sessions ----------

function createSessionsPane(room, tasks) {
  const root = el('div', 'sessions');
  const note = el('p', 'muted', 'Konuşma metinleri yalnızca bu bilgisayarda, sen açınca okunur; hiçbir yere kaydedilmez.');
  const body = el('div');
  root.append(note, body);
  let view = 'list';

  async function showList() {
    view = 'list';
    body.replaceChildren(el('p', 'muted', 'Yükleniyor…'));
    try {
      const list = await tasks.sessions(room.id);
      if (view !== 'list') return;
      if (!list.length) return body.replaceChildren(el('p', 'muted', 'Bu oda için kayıtlı oturum yok.'));
      const wrap = el('div', 'stations');
      for (const s of list) {
        const b = el('button', 'station');
        b.type = 'button';
        b.append(el('span', 'dot'), el('strong', '', new Date(s.lastAt).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })), el('span', 'sub', s.preview || '(metin yok)'));
        b.addEventListener('click', () => showConversation(s.id));
        wrap.append(b);
      }
      body.replaceChildren(wrap);
    } catch (err) {
      body.replaceChildren(el('p', 'error', err.message));
    }
  }

  async function showConversation(id) {
    view = 'conversation';
    body.replaceChildren(el('p', 'muted', 'Yükleniyor…'));
    try {
      const conv = await tasks.conversation(room.id, id);
      const back = el('button', '', '← Oturumlar');
      back.type = 'button';
      back.addEventListener('click', showList);
      const list = el('div', 'conv');
      if (conv.truncated) list.append(el('p', 'muted', `Son ${conv.messages.length} mesaj gösteriliyor (toplam ${conv.total}).`));
      for (const m of conv.messages) {
        const msg = el('div', `msg ${m.role}`);
        msg.append(el('div', 'who', `${m.role === 'user' ? 'Sen' : 'Asistan'}${m.ts ? ` · ${new Date(m.ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}` : ''}`));
        if (m.text) msg.append(el('div', 'text', m.text));
        if (m.tools.length) msg.append(el('div', 'tools', m.tools.map((t) => `🔧 ${t.name}${t.file ? `: ${t.file}` : ''}`).join('  ')));
        list.append(msg);
      }
      body.replaceChildren(back, list);
    } catch (err) {
      body.replaceChildren(el('p', 'error', err.message));
    }
  }

  return { el: root, show: showList };
}

// ---------- the room panel ----------

// handlers: { onBack, onTab, onSelect, tasks }
export function createRoomPanel(root, handlers) {
  const { tasks } = handlers;
  let panes = { roomId: null, task: null, sessions: null, lastTab: null };

  function paneFor(room) {
    if (panes.roomId !== room.id) panes = { roomId: room.id, task: createTaskPane(room, tasks), sessions: createSessionsPane(room, tasks), lastTab: null };
    return panes;
  }

  return {
    // ctx: { room, live, statuses (Map stationId → status), selectedId, tab }
    render(ctx) {
      const { room, live, tab } = ctx;
      const keepScroll = root.scrollTop;
      const p = paneFor(room);
      // Typing a task: never rebuild the panel under the cursor, only refresh the cards.
      if (tab === 'task' && p.task.el.isConnected && p.task.el.contains(document.activeElement)) {
        p.task.refresh();
        return;
      }
      const head = el('div', 'row');
      const titles = el('div');
      titles.append(el('h2', '', room.name), el('div', 'kind', `Oda · ${room.stations.length} istasyon`));
      const back = el('button', 'close', '← Kata dön');
      back.type = 'button';
      back.addEventListener('click', handlers.onBack);
      head.append(titles, back);

      const chips = el('div', 'chips');
      chips.append(chip(LEVEL_TEXT[room.level] ?? room.level, room.level === 'approve' ? 'warn' : ''), chip(LAMP_TEXT[room.lamp], room.lamp === 'unpushed' ? 'warn' : room.lamp === 'active' ? 'ok' : ''));
      if (room.branch) chips.append(chip(`dal: ${room.branch}`));
      if (room.dirty) chips.append(chip(`${room.dirty} değişiklik`, 'warn'));
      if (room.ahead) chips.append(chip(`${room.ahead} commit gönderilmedi`, 'warn'));

      const tabs = el('div', 'tabs');
      const pending = tasks.approvalsOf(room.id).length;
      for (const [id, label] of [['activity', 'Aktivite'], ['task', pending ? `Görev ✋${pending}` : 'Görev'], ['sessions', 'Oturumlar'], ['info', 'Bilgi']]) {
        const b = el('button', id === tab ? 'active' : '', label);
        b.type = 'button';
        b.addEventListener('click', () => handlers.onTab(id));
        tabs.append(b);
      }

      const body = el('div', 'body');
      if (tab === 'task') {
        p.task.refresh();
        body.append(p.task.el);
      } else if (tab === 'sessions') {
        if (p.lastTab !== 'sessions') p.sessions.show();
        body.append(p.sessions.el);
      } else if (tab === 'info') {
        infoTab(body, room);
      } else {
        activityTab(body, { ...ctx, onSelect: handlers.onSelect });
      }
      p.lastTab = tab;

      const parts = [head, chips];
      if (live) parts.push(el('p', live.state === 'working' ? 'live-working' : 'live-waiting', liveSentence(live)));
      parts.push(tabs, body);
      root.replaceChildren(...parts);
      root.scrollTop = keepScroll;
    },
  };
}
