// One shared office scene across browsers and screens: a single leader runs the simulation and publishes its
// plain-data snapshot; every other page follows it. The snapshot holds ambient scene state only (positions, timers,
// speech from the dialogue pools); chat text and prompts never pass through here. Kept in memory, never persisted.
const LEASE_MS = 4000;
const PIN_MS = 3000;
const MAX_SNAPSHOT_BYTES = 400 * 1024;
const MAX_COMMANDS = 20;
const ID = /^[A-Za-z0-9_-]{6,64}$/;
const COMMANDS = new Set(['interact', 'poke', 'power', 'cancelPower']);

function cleanCommand(c) {
  if (!c || !COMMANDS.has(c.type)) return null;
  if (c.type === 'interact') return typeof c.id === 'string' && /^[a-z0-9-]{1,40}$/.test(c.id) ? { type: 'interact', id: c.id } : null;
  if (c.type === 'power') return { type: 'power', on: !!c.on };
  return { type: c.type };
}

export function createSceneShare({ now = () => Date.now() } = {}) {
  let leader = null;          // { id, expires }
  let scene = null;           // the leader's latest snapshot (JSON string, bounded)
  let seq = 0;
  let mailbox = [];           // commands waiting for the leader
  const pins = new Map();     // client id -> { ids, expires }

  const live = () => !!leader && leader.expires > now();
  const remotePins = (self) => {
    const out = new Set();
    for (const [id, p] of pins) {
      if (p.expires <= now()) { pins.delete(id); continue; }
      if (id !== self) for (const a of p.ids) out.add(a);
    }
    return [...out];
  };

  // One round trip. `visible` clients may take over an abandoned lead; hidden pages only follow.
  function sync({ clientId, visible = true, snapshot, since = 0, pinned = [], commands = [] } = {}) {
    if (!ID.test(clientId ?? '')) return { error: 'bad client id', status: 400 };
    const t = now();
    pins.set(clientId, { ids: pinned.filter((p) => typeof p === 'string' && p.length <= 80).slice(0, 12), expires: t + PIN_MS });
    if (!live() && visible) leader = { id: clientId, expires: t + LEASE_MS };
    if (leader?.id === clientId && live()) {
      leader.expires = t + LEASE_MS;
      if (snapshot !== undefined) {
        const text = JSON.stringify(snapshot);
        if (text.length <= MAX_SNAPSHOT_BYTES) { scene = text; seq++; }
      }
      const queued = mailbox; mailbox = [];
      return { role: 'leader', seq, pinned: remotePins(clientId), commands: queued };
    }
    for (const c of commands.slice(0, MAX_COMMANDS)) {
      const clean = cleanCommand(c);
      if (clean && mailbox.length < MAX_COMMANDS) mailbox.push(clean);
    }
    return { role: 'follower', seq, pinned: remotePins(clientId), scene: seq > since && scene ? JSON.parse(scene) : undefined };
  }

  // A leader that closes or hides its page gives the lead back at once instead of waiting for the lease.
  function release(clientId) {
    if (leader?.id === clientId) leader = null;
    pins.delete(clientId);
  }

  return { sync, release, state: () => ({ leader: live() ? leader.id : null, seq }) };
}
