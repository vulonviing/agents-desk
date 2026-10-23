// Decorative scenes backed by observed external CLI activity, never task execution.
(function () {
  'use strict';
  const I = window.OfficeI18n, ID = 'emrecan-cv#project';
  const PHASES = ['search', 'evaluate', 'prepare'];
  class Workflow {
    constructor(life) { this.life = life; this.view = life.view; this.activity = null; this.scene = null; this.seq = 0; this.reply = null; I.onChange(() => { this.reply = null; this.view.bubbles = this.view.bubbles.filter(b => b.act?.type !== 'workflow-bubble'); }); }
    set(activity) {
      const next = PHASES.includes(activity?.phase) && Number.isFinite(activity?.observedAt)
        ? { phase: activity.phase, observedAt: activity.observedAt, providers: (activity.providers ?? []).filter(p => ['claude', 'codex'].includes(p)) } : null;
      if (next?.phase !== this.activity?.phase) {
        this.scene = next ? { phase: next.phase, at: this.view.t } : null;
        this.reply = null; this.view.bubbles = this.view.bubbles.filter(b => b.act?.type !== 'workflow-bubble');
      }
      this.activity = next; this.view.applicationWorkflow = this.scene;
    }
    current() { return this.activity && Date.now() - this.activity.observedAt < 120000 ? this.activity : null; }
    tick() {
      const v = this.view, a = this.current();
      if (!a) { if (this.activity) { this.set(null); this.life.onWorkflowExpired?.(); } return; }
      if (document.hidden || v.pinned.has(ID) || !v.st[ID]?.workflow) { this.reply = null; return; }
      if (this.reply) {
        const r = this.reply;
        if (v.t < r.at) return;
        this.reply = null;
        if (this.life.free().some(p => p.id === r.id)) v.say(r.id, r.key ? I.t(r.key) : r.text, { duration: 5.5, act: { type: 'workflow-bubble' } });
        return;
      }
      if (v.t < this.life.nextAt || v.isAway(ID) || v.speaking(ID)) return;
      const peer = this.life.free().find(p => p.id === 'cv-checker#project');
      const index = this.seq++ % 6, key = `workflow.${a.phase}.${index}`;
      const spoken = this.life.pools.spokenAt;
      const line = this.life.pools.pick('emrecan-cv', `work-${a.phase}`, v.byId[ID]?.name);
      if (!line && Date.now() - (spoken.get(key) ?? -Infinity) < 600000) return;
      if (!line) spoken.set(key, Date.now());
      v.say(ID, line?.text ?? I.t(key), { duration: 6, act: { type: 'workflow-bubble' } });
      if (peer && index % 2 === 1 && (!line || line.reply)) this.reply = { id: peer.id, at: v.t + 6.5, key: line?.reply ? null : `${key}.reply`, text: line?.reply };
      this.life.nextAt = v.t + 25;
    }
    snapshot() { return { scene: this.scene, seq: this.seq, reply: this.reply }; }
    restore(saved) {
      if (!saved) return;
      const samePhase = saved.scene?.phase === this.current()?.phase;
      if (samePhase) this.scene = saved.scene;
      this.seq = saved.seq ?? 0; this.reply = saved.reply ?? null;
      if (!samePhase) { this.reply = null; this.view.bubbles = this.view.bubbles.filter(b => b.act?.type !== 'workflow-bubble'); }
      this.view.applicationWorkflow = this.scene;
    }
  }
  function frame(scene, t) { return { phase: scene.phase, variant: Math.floor(Math.max(0, t - scene.at) / 9) % 3, beat: Math.floor(t * 4) % 4 }; }
  function screen(P, scene, t) {
    const { phase, variant, beat } = frame(scene, t);
    P(0, 0, 20, 11, '#142c3a'); P(0, 0, 20, 1, '#78b9d0');
    if (phase === 'search') {
      P(1, 2, 18, 2, '#e2edf2'); P(2 + beat * 3, 2, 3, 1, '#69b7d8');
      for (let i = 0; i < 3; i++) { P(1, 5 + i * 2, 3, 1, ['#81cbb0', '#e3b86a', '#a9a1d7'][i]); P(5, 5 + i * 2, 12 - i * 2, 1, variant === i ? '#f3f1d6' : '#7093a8'); }
      if (variant === 1) { P(13, 4, 5, 5, '#46788d'); P(14, 5, 3, 3, '#a6d4db'); P(17, 8, 2, 2, '#e8bf75'); }
      if (variant === 2) { P(1, 5, 18, 5, '#284b59'); for (let i=0;i<3;i++) { P(4+i*5,6+(i%2),1,3,'#e0a373'); P(3+i*5,5+(i%2),3,2,'#edc98e'); } }
    } else if (phase === 'evaluate') {
      P(1, 2, 8, 8, '#dce6df'); P(11, 2, 8, 8, '#d9e3ef');
      for (let i=0;i<3;i++) { P(3,3+i*2,5,1,'#638780'); P(12,3+i*2,5,1,'#697f97'); }
      if (variant === 0) P(9, 3+beat, 2, 1, '#edc86c');
      if (variant === 1) for(let i=0;i<=beat%3;i++) { P(12,3+i*2,1,1,'#2c8c6e'); P(13,2+i*2,1,1,'#2c8c6e'); }
      if (variant === 2) { P(10, 6, 9, 3, '#467c6c'); P(12, 7, 5, 1, '#d5f1d8'); }
    } else {
      P(4, 2, 12, 8, '#edf0e5');
      if (variant === 0) for(let i=0;i<4;i++) P(6,3+i*2,Math.min(8,2+(beat+i)%7),1,'#66859b');
      if (variant === 1) { P(5,3,9,1,'#477f9e'); P(5,5,3,4,'#9cbacb'); P(9,5,5,1,'#7a929f'); P(9,7,5,1,'#7a929f'); }
      if (variant === 2) { P(3,5,14,5,'#c39350'); P(4,4,6,1,'#e0b96d'); P(8+beat,6,3,2,'#f3dfaf'); }
    }
  }
  function props(view, A, scene) {
    const { phase, variant, beat } = frame(scene, view.t), x = A.x + 42, y = A.y + 5;
    const P = (dx,dy,w,h,c) => view.P(x+dx,y+dy,w,h,c);
    const paper = (dx,dy,color='#f0eadb') => { P(dx,dy,9,7,'#34485a'); P(dx,dy,8,6,color); for(let i=0;i<3;i++) P(dx+1,dy+1+i*2,5,1,'#81949d'); };
    if (phase === 'search') {
      if (variant === 0) { paper(-3,0); const dx=beat-2; P(dx,-1,5,1,'#e8c579');P(dx-1,0,1,4,'#e8c579');P(dx+5,0,1,4,'#e8c579');P(dx,4,5,1,'#e8c579');P(dx+5,5,3,2,'#7a5445'); }
      if (variant === 1) { P(-5,-3,15,10,'#597f81'); P(-3,-1,11,1,'#a5c1b1'); P(-1,-2,1,8,'#a5c1b1'); for(let i=0;i<3;i++) P(-3+i*4,1+(i%2)*2,2,2,beat%3===i?'#fff0a4':'#dc8c70'); }
      if (variant === 2) { for(let i=2;i>=0;i--) paper(-5+i*3,-i*2); P(-3+beat,5,3,1,'#e9bf6f'); }
    } else if (phase === 'evaluate') {
      if (variant === 0) { paper(-8,0); paper(3,0,'#d7e9ed'); P(0,2+beat%2,3,1,'#d0aa67'); }
      if (variant === 1) { paper(-3,-2); for(let i=0;i<3;i++) { P(-2,i*2,1,1,'#459778'); if(i<=beat) P(-1,-1+i*2,1,1,'#459778'); } }
      if (variant === 2) { paper(-3,1); P(-1,-4+beat%2,5,3,'#9a645a'); P(0,-7+beat%2,3,4,'#59697d'); P(-1,4,5,1,'#53a486'); }
    } else {
      if (variant === 0) { paper(-4,0); P(beat-3,-1,1,5,'#d7af62'); P(beat-3,4,1,1,'#3b4b58'); }
      if (variant === 1) { paper(-5,-2); P(-4,-1,6,1,'#518dac'); P(2,2+beat%2,5,1,'#b7c4c8'); P(5,1,1,5,'#dfba77'); }
      if (variant === 2) { paper(-3,-3); P(-7,1,17,7,'#ac7c43'); P(-7,0,7,2,'#d2a65e'); P(-6,3,15,4,'#dbb874'); P(4,3,3,2,beat%2?'#87b4a0':'#6a9b86'); }
    }
  }
  window.OfficeWorkflow = { Workflow, frame, screen, props };
})();
