// Leya's quiet daily life. Every pose, route, toy and timer is plain snapshot data.
(function () {
  'use strict';
  const I = window.OfficeI18n;
  const durations = { sleep: 80, wake: 1.2, yawn: 1.6, stretch: 2.8, sit: 7, groom: 8, roll: 4.5, look: 7, crouch: 1.3, play: 5, knead: 6, pet: 2.8, rub: 4, 'window-watch': 12, 'window-listen': 8, 'counter-look': 4, 'counter-rest': 10, 'floor-look': 5, 'floor-settle': 2.8, 'floor-knead': 4 };
  const choose = list => list[Math.floor(Math.random() * list.length)];
  function pose(v, mode, duration = durations[mode]) {
    Object.assign(v.cat, { mode, t0: v.t, duration, route: null });
  }
  function move(v, mode, foot, after) {
    const c = v.cat, from = { x: c.x + 9, y: c.y + 10 };
    const [gx, gy] = v.nav.snap(foot);
    const dest = { x: gx * 4 + 2, y: gy * 4 + 2 };
    c.route = v.nav.path(from, dest);
    c.len = c.route.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - c.route[i].x, p.y - c.route[i].y), 0);
    c.mode = mode; c.after = after; c.t0 = v.t;
  }
  function jump(v, foot, after, height, surface = 'floor') {
    const c = v.cat;
    c.mode = 'jump'; c.t0 = v.t; c.duration = 0.9; c.route = null;
    c.jump = { from: { x: c.x + 9, y: c.y + 10 }, to: foot, after, height, surface };
    c.lift = 0;
  }
  function meow(v, varied=false) {
    const c = v.cat;
    if (window.OfficeSfx?.meow) window.OfficeSfx.meow(varied ? (c.controlMeows??0)%6 : 0);
    v.say('leya', I.t(varied?'cat.controlMeow'+((c.controlMeows=(c.controlMeows??0)+1)%6):'cat.meow'), { duration: 1.8, at: { wx: c.x + 9, wy: c.y - 17 }, fill: '#e0e7ee', shade: '#b9c8d5' });
  }
  function control(v, action) {
    const c=v.cat,L=window.OfficeLayout;
    if(c.control||c.mode==='jump'||c.surface==='counter'||v.pinned.size||Object.values(v.st).some(s=>s.chatting))return false;
    let target,ground;
    if(action.kind==='power'){const p=L.FLOOR_POWER_PADS[action.on?'on':'off'];target={x:p.x+p.w/2,y:p.y+p.h};ground={x:target.x-13,y:target.y+2};}
    else{const p=action.kind==='cli'?L.NOTES[action.to]:action.kind==='lang'?L.NOTES.langTr:action.kind==='refresh'?L.NOTES.refresh:action.kind==='usage'?L.NOTES.usage:L.NOTES.loc;const dx=action.kind==='usage'?Math.max(0,['claude','codex','antigravity'].indexOf(action.to))*25+12:p.w/2;target={x:p.x+dx,y:L.WALL_H+5};ground={x:target.x,y:L.WALK_Y+4};}
    c.control={...action,target,ground,done:false};c.target=null;c.toy=null;meow(v,true);move(v,'wander',ground,'control-ready');return true;
  }
  function special(v, kind) {
    const c = v.cat, L = window.OfficeLayout;
    if (c.surface === 'counter' || c.mode === 'jump') return false;
    c.activity = kind; c.target = null; c.toy = null; c.lastSpecial = kind; c.specialAt = v.t + 150;
    if (kind === 'window') {
      const i = Math.floor(Math.random() * L.SPOTS.windows.length);
      c.windowIndex = i;
      move(v, 'wander', L.SPOTS.windows[i], 'window-watch');
    } else if (kind === 'counter') {
      c.counterGround = { x: L.LRUN.x + 45, y: L.LRUN.y - 16 };
      move(v, 'wander', c.counterGround, 'counter-ready');
    } else if (kind === 'floor') {
      move(v, 'wander', { x: L.FLOOR_LED.x - 16, y: L.FLOOR_LED.y + 45 }, 'floor-look');
    } else return false;
    return true;
  }
  function home(v) { v.cat.surface = 'floor'; v.cat.target = null; move(v, 'return', { x: v.cat.home.x + 9, y: v.cat.home.y + 10 }, 'knead'); }
  function visit(v) {
    const c = v.cat;
    const a = choose(v.agents.filter(a => !v.isAway(a.id) && !v.pinned.has(a.id) && v.st[a.id]?.status === 'idle'));
    if (!a) return false;
    c.target = a.id;
    const point = v.visitSpot(a);
    move(v, 'walk', { x: point.x - 10, y: point.y + 3 }, 'rub');
    return true;
  }
  function arrived(v) {
    const c = v.cat, after = c.after ?? (c.mode === 'walk' ? 'rub' : 'knead');
    pose(v, after);
    if (after === 'rub') {
      const a = v.byId[c.target];
      if (!a || v.isAway(a.id) || v.pinned.has(a.id) || v.st[a.id]?.status !== 'idle') { c.target = null; pose(v, 'look'); return; }
      if (window.OfficeSfx?.purr) window.OfficeSfx.purr();
      v.hearts(c.x + 9, c.y - 8, 2);
      if (!v.speaking(a.id) && v.t - (c.lastComment ?? -1000) >= 600) {
        v.say(a.id, I.t(`cat.visit${(c.visits ?? 0) % 3}`), { duration: 3, fill: '#dce5eb', shade: '#b6c5d2' });
        c.lastComment = v.t; c.visits = (c.visits ?? 0) + 1;
      }
    }
  }
  function update(v) {
    const c = v.cat;
    c.specialAt ??= v.t + 45;
    // The former sleeping spot is occupied by the new stove; migrate old snapshots by walking out.
    if(c.home.x===300 && c.home.y===316){
      c.home={...window.OfficeLayout.CAT_HOME};
      if(!c.hearth&&!c.control&&c.surface!=='counter'&&c.mode!=='jump'&&c.x>275&&c.x<325&&c.y>295&&c.y<340)home(v);
    }
    c.name = 'Leya'; c.sex = 'female';
    if (c.calmVersion !== 2) {
      c.calmVersion = 2;
      if (c.mode === 'sleep') c.duration = Math.max(c.duration ?? 0, 60);
      else c.awakeUntil = Math.min(c.awakeUntil ?? v.t + 18, v.t + 18);
    }
    const age = Math.max(0, v.t - c.t0);
    if (c.mode === 'jump') {
      const j = c.jump, k = Math.min(1, age / c.duration), ease = k * k * (3 - 2 * k);
      c.x = j.from.x + (j.to.x - j.from.x) * ease - 9;
      c.y = j.from.y + (j.to.y - j.from.y) * ease - 10;
      c.lift = Math.sin(k * Math.PI) * j.height;
      if (j.to.x !== j.from.x) c.face = j.to.x > j.from.x ? 1 : -1;
      if (v.follower) return;
      if(c.control&&!c.control.done&&c.control.kind!=='power'&&k>=.5){c.control.done=true;v.handlers.onCatControl?.(c.control);meow(v,true);}
      if (k >= 1) {
        c.lift = 0; c.surface = j.surface; pose(v, j.after);
        if(c.control&&!c.control.done&&c.control.kind==='power'){c.control.done=true;v.handlers.onCatControl?.(c.control);meow(v,true);}
        if (c.petPending) { c.petPending = false; poke(v); }
      }
      return;
    }
    if (['walk', 'return', 'wander', 'chase', 'counter-walk'].includes(c.mode)) {
      // Migrate an old cat mid-walk without closures or a reset to its sleeping spot.
      if (!c.route) {
        const oldFrom = c.from ?? c;
        c.route = v.nav.path({ x: oldFrom.x + 9, y: oldFrom.y + 10 }, { x: (c.to ?? c.home).x + 9, y: (c.to ?? c.home).y + 10 });
        c.len = c.route.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - c.route[i].x, p.y - c.route[i].y), 0);
      }
      let distance = age * (c.mode === 'chase' ? 36 : c.mode === 'counter-walk' ? 10 : 22);
      if (distance >= c.len) {
        const p = c.route[c.route.length - 1]; c.x = p.x - 9; c.y = p.y - 10; if (!v.follower) arrived(v); return;
      }
      for (let i = 1; i < c.route.length; i++) {
        const a = c.route[i - 1], b = c.route[i], len = Math.hypot(b.x - a.x, b.y - a.y);
        if (distance <= len) { const k = len ? distance / len : 1; c.x = a.x + (b.x - a.x) * k - 9; c.y = a.y + (b.y - a.y) * k - 10; if (b.x !== a.x) c.face = b.x > a.x ? 1 : -1; break; }
        distance -= len;
      }
      return;
    }
    if (v.follower) return; // followers mirror the leader's decisions; movement above is only interpolated
    if(c.hearth && ['sleep','knead','groom','pet','look'].includes(c.mode)){
      if(age >= (c.duration??8)) pose(v,choose(['sleep','sleep','knead','groom']),12+Math.random()*18);
      return;
    }
    if (age < (c.duration ?? durations[c.mode] ?? 4)) return;
    switch (c.mode) {
      case 'control-ready': if(c.control){meow(v,true);jump(v,c.control.target,'control-land',c.control.kind==='power'?15:24);}else home(v);break;
      case 'control-land':c.control=null;home(v);break;
      case 'floor-nap': c.surface = 'floor'; c.activity = null;
      case 'sleep': c.awakeUntil = v.t + 18 + Math.random() * 10; pose(v, 'wake'); break;
      case 'wake': pose(v, 'yawn'); break;
      case 'yawn': pose(v, 'stretch'); break;
      case 'stretch': pose(v, 'sit'); break;
      case 'pet': if (c.afterPet) { const after = c.afterPet; c.afterPet = null; pose(v, after); } else pose(v, 'sit'); break;
      case 'rub': home(v); break;
      case 'knead': c.target = null; pose(v, 'sleep', 60 + Math.random() * 50); break;
      case 'crouch': {
        const point = { x: c.x + 9 + (c.face ?? 1) * 23, y: c.y + 15 };
        const [gx, gy] = v.nav.snap(point);
        c.toy = { x: gx * 4 + 2 + (c.face ?? 1) * 8, y: gy * 4 + 2, at: v.t };
        move(v, 'chase', point, 'play'); break;
      }
      case 'play': c.toy = null; pose(v, 'look'); break;
      case 'window-watch':
        meow(v); v.fx[`window${c.windowIndex ?? 0}`] = { t0: v.t, night: v.darkness() >= 0.3 };
        pose(v, 'window-listen'); break;
      case 'window-listen': c.activity = null; home(v); break;
      case 'counter-ready': {
        const L = window.OfficeLayout;
        jump(v, { x: L.LRUN.x + 43, y: L.LRUN.y + 5 }, 'counter-look', 22, 'counter'); break;
      }
      case 'counter-look': {
        const L = window.OfficeLayout;
        c.route = [{ x: c.x + 9, y: c.y + 10 }, { x: L.LRUN.x + 70, y: L.LRUN.y + 5 }];
        c.len = 27; c.after = 'counter-rest'; c.mode = 'counter-walk'; c.t0 = v.t; break;
      }
      case 'counter-rest': jump(v, c.counterGround, 'counter-down', 18); break;
      case 'counter-down': c.activity = null; c.awakeUntil = v.t + 7; pose(v, 'sit', 7); break;
      case 'floor-look': {
        const f = window.OfficeLayout.FLOOR_LED;
        jump(v, { x: f.x + 24, y: f.y + 54 }, 'floor-cross', 6, 'floor-led'); break;
      }
      case 'floor-cross': {
        const f = window.OfficeLayout.FLOOR_LED;
        move(v, 'wander', { x: f.x + f.w - 25, y: f.y + f.h - 24 }, 'floor-settle'); break;
      }
      case 'floor-settle': pose(v, 'floor-knead'); break;
      case 'floor-knead': pose(v, 'floor-nap', 70 + Math.random() * 40); break;
      case 'sit':
        if (v.t > (c.awakeUntil ?? 0)) { home(v); break; }
        if (v.t >= c.specialAt && Math.random() < 0.4 && special(v, choose(['window', 'counter', 'floor'].filter(kind => kind !== c.lastSpecial)))) break;
        if (Math.random() < 0.12 && visit(v)) break;
        if (Math.random() < 0.07) {
          const spot = choose([{ x: 258, y: 312 }, { x: 428, y: 310 }, { x: 540, y: 173 }]);
          c.target = null; move(v, 'wander', spot, 'look'); break;
        }
        pose(v, choose(['groom', 'look', 'look', 'look', 'stretch', 'groom', 'roll', 'knead', 'crouch'])); break;
      default:
        if (v.t > (c.awakeUntil ?? 0)) home(v);
        else pose(v, 'sit', 3 + Math.random() * 3);
    }
  }
  function poke(v) {
    if(v.cat.control){meow(v,true);return;}
    const c = v.cat;
    if (c.mode === 'jump') { c.petPending = true; return; }
    if (c.mode === 'pet' && v.t - c.t0 < 1) return;
    c.awakeUntil = Math.max(c.awakeUntil ?? 0, v.t + 12); c.target = null; c.toy = null;
    // Petting on the counter remains on the counter, then she climbs down normally.
    if (c.surface === 'counter') c.afterPet = 'counter-rest';
    pose(v, 'pet');
    if (window.OfficeSfx?.purr) window.OfficeSfx.purr();
    v.hearts(c.x + 9, c.y - 10, 3);
    v.say('leya', I.t('cat.purr'), { duration: 2, at: { wx: c.x + 9, wy: c.y - 17 }, fill: '#e0e7ee', shade: '#b9c8d5' });
  }
  window.OfficeCat = {
    create(home) { return { name: 'Leya', sex: 'female', calmVersion: 2, mode: 'sleep', home: { ...home }, x: home.x, y: home.y, t0: 0, duration: 65, face: 1, target: null, visits: 0 }; },
    update, poke, special, control,
    tryControl(v,action){return Math.random()<.75 && control(v,action);},
    hearth(v,on){
      const c=v.cat;
      if(!on){if(c.hearth){c.hearth=false;if(!c.control)home(v);}return true;}
      if(c.hearth)return true;
      if(c.control||c.mode==='jump'||c.surface==='counter')return false;
      c.hearth=true;c.target=null;c.toy=null;c.surface='floor';
      move(v,'walk',window.OfficeLayout.HEARTH.cat,'knead');return true;
    },
  };
})();
