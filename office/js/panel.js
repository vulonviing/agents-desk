import { DUST_TEXT, LAMP_TEXT, daysSince, fullDate, timeAgo } from './format.js';

// All text goes through textContent: README and skill text come from other repos.
function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function section(parent, title) {
  parent.append(el('h3', '', title));
}

function list(parent, items, render) {
  const ul = el('ul');
  for (const item of items) {
    const li = el('li');
    render(li, item);
    ul.append(li);
  }
  parent.append(ul);
}

function chip(text, cls = '') {
  return el('span', `chip ${cls}`.trim(), text);
}

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

// desk: the selected desk or room; room: parent room when the desk is a subsystem.
export function renderPanel(root, { desk, room }, onClose) {
  root.replaceChildren();
  const age = daysSince(desk.lastCommit?.date);

  const head = el('div', 'row');
  const titles = el('div');
  titles.append(el('h2', '', desk.name));
  const kind = desk.desks ? 'Oda' : desk.kind === 'subsystem' ? `Alt sistem · ${room.name} odası` : 'Proje';
  titles.append(el('div', 'kind', kind));
  const close = el('button', 'close', '✕');
  close.type = 'button';
  close.setAttribute('aria-label', 'Paneli kapat');
  close.addEventListener('click', onClose);
  head.append(titles, close);
  root.append(head);

  const chips = el('div', 'chips');
  chips.append(chip(LAMP_TEXT[desk.lamp], desk.lamp === 'unpushed' ? 'warn' : desk.lamp === 'active' ? 'ok' : ''));
  if (desk.branch) chips.append(chip(`dal: ${desk.branch}`));
  if (desk.dirty) chips.append(chip(`${desk.dirty} değişiklik`, 'warn'));
  if (desk.ahead) chips.append(chip(`${desk.ahead} commit gönderilmedi`, 'warn'));
  root.append(chips);

  section(root, 'Son güncelleme');
  if (desk.lastCommit) {
    root.append(el('p', '', `${fullDate(desk.lastCommit.date)} · ${timeAgo(age)}`));
    root.append(el('p', '', desk.lastCommit.subject));
  } else {
    root.append(el('p', '', 'Henüz commit yok.'));
  }
  if (desk.dust > 0) root.append(el('p', 'dust-note', DUST_TEXT[desk.dust]));

  if (desk.readmeSummary) {
    section(root, 'Özet');
    root.append(el('p', '', desk.readmeSummary));
  }

  const owner = desk.desks ? desk : room;
  const skills = owner?.skills ?? [];
  const triggers = owner?.triggers ?? [];
  if (skills.length) {
    section(root, `Kitaplık · ${skills.length} skill${room && !desk.desks ? ' (oda)' : ''}`);
    list(root, skills, (li, s) => {
      li.append(el('strong', '', s.name));
      if (s.description) li.append(el('span', '', ` — ${s.description.length > 140 ? s.description.slice(0, 137) + '...' : s.description}`));
    });
  }
  if (triggers.length) {
    section(root, 'Tetikleyici komutlar');
    list(root, triggers, (li, t) => (li.textContent = t));
  }
  if (desk.desks) {
    section(root, `Masalar · ${desk.desks.length}`);
    list(root, desk.desks, (li, d) => {
      li.append(el('strong', '', d.name), el('span', '', ` — ${timeAgo(daysSince(d.lastCommit?.date))}`));
    });
  }

  section(root, 'Konum');
  const path = el('p');
  path.append(el('code', '', desk.path));
  root.append(path);
  const actions = el('div', 'chips');
  actions.append(copyButton('Yolu kopyala', desk.path), copyButton('Terminal komutunu kopyala', `cd "${desk.path}" && claude`));
  root.append(actions);
}
