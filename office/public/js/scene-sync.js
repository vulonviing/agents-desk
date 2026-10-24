// One shared office across screens. The page that is visible first leads: it runs the simulation and publishes
// its snapshot every 300 ms. Other pages follow: they restore that snapshot and never decide anything themselves.
// Camera, zoom, display profile, chat panel and application filters stay per screen. Follower clicks that start
// scene animations (props, Leya, the floor display pads) are sent to the leader as plain-data commands.
(function () {
  'use strict';
  const PERIOD_MS = 300;
  const clientId = (() => { const a = new Uint8Array(12); crypto.getRandomValues(a); return [...a].map(b => b.toString(16).padStart(2, '0')).join(''); })();

  function mount({ view, life, applyFloorPower, floorPowerOn }) {
    let leader = false, since = 0, busy = false, queued = [];
    const post = (path, body) => fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => (r.ok ? r.json() : null));

    // Per-screen state never travels: strip it from what we publish and keep ours when we restore.
    const shared = () => { const { cam, displayMode, ...scene } = view.snapshot(); const { spokenAt, ...ambient } = life.snapshot(); return { view: scene, life: ambient, floorOn: floorPowerOn() }; };
    function adopt(scene) {
      if (!view.restore(scene.view)) return;
      life.restore(scene.life);
      if (typeof scene.floorOn === 'boolean' && scene.floorOn !== floorPowerOn()) applyFloorPower(scene.floorOn);
    }
    function become(role) {
      const lead = role === 'leader';
      if (lead === leader && view.follower === !lead) return;
      leader = lead; view.follower = !lead;
    }
    function run(command) {
      if (command.type === 'interact') view.interact(command.id);
      else if (command.type === 'poke') window.OfficeCat.poke(view);
      else if (command.type === 'power') life.requestScreenPower(command.on);
      else if (command.type === 'cancelPower') life.cancelScreenPower();
    }

    // Followers hand scene-starting clicks to the leader instead of acting on their own copy.
    function forward(object, name, toCommand) {
      const original = object[name].bind(object);
      object[name] = (...args) => {
        if (!view.follower) return original(...args);
        const command = toCommand(...args);
        if (!queued.some(c => JSON.stringify(c) === JSON.stringify(command))) queued.push(command);
      };
    }
    // A follower applies board effects (language, CLI, refresh) on its own screen at once; the pin animation belongs to the leader.
    const movePin = view.movePin.bind(view);
    view.movePin = (kind, to) => (view.follower ? view.applyBoardAction(kind, to) : movePin(kind, to));
    forward(view, 'interact', id => ({ type: 'interact', id }));
    forward(view, 'poke', () => ({ type: 'poke' }));
    forward(life, 'requestScreenPower', on => ({ type: 'power', on: !!on }));
    forward(life, 'cancelScreenPower', () => ({ type: 'cancelPower' }));

    async function step() {
      if (busy) return;
      busy = true;
      try {
        const body = { clientId, visible: !document.hidden, since, pinned: [...view.pinned], commands: queued.splice(0, 20) };
        if (leader && !document.hidden) body.snapshot = shared();
        const r = await post('/api/scene/sync', body);
        if (!r) return;
        view.pinned.remote = new Set((r.pinned ?? []).filter(id => view.byId[id]).slice(0, 12)); // advisory: known colleagues only
        become(r.role);
        if (r.role === 'leader') for (const id of view.pinned.remote) view.release(id); // an open chat elsewhere calls that colleague back
        if (r.role === 'leader') for (const c of r.commands ?? []) run(c);
        else if (r.scene) { since = r.seq; adopt(r.scene); }
      } catch { /* offline: keep whatever role we have */ } finally { busy = false; }
    }

    setInterval(step, PERIOD_MS);
    const release = () => { try { navigator.sendBeacon('/api/scene/release', new Blob([JSON.stringify({ clientId })], { type: 'application/json' })); } catch { /* best effort */ } };
    window.addEventListener('pagehide', release);
    document.addEventListener('visibilitychange', () => { if (document.hidden && leader) release(); });
    return { step, role: () => (leader ? 'leader' : 'follower'), clientId };
  }

  window.OfficeSceneSync = { mount };
})();
