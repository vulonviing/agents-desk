// Ofis ses efektleri: hepsi WebAudio ile anında sentezlenir (ses dosyası yok).
// Tarayıcı kuralı gereği ilk ses bir tıklamadan sonra çalar; tıklamalar zaten bunu sağlar.
(function () {
  'use strict';
  let ctx = null;
  let master = null;
  function ac() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain();
        master.gain.value = 0.55;
        master.connect(ctx.destination);
      } catch { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // Zarflı osilatör: frekans eğrisi [[zaman, Hz], ...]
  function tone({ type = 'sine', freqs, dur, vol = 0.2, at = 0, attack = 0.01, filter = null, vibrato = 0 }) {
    const c = ac();
    if (!c) return;
    const t0 = c.currentTime + at;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freqs[0][1], t0);
    for (const [t, f] of freqs.slice(1)) o.frequency.exponentialRampToValueAtTime(f, t0 + t);
    if (vibrato) {
      const lfo = c.createOscillator();
      const lg = c.createGain();
      lfo.frequency.value = 7;
      lg.gain.value = vibrato;
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t0);
      lfo.stop(t0 + dur);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = o.connect(g);
    if (filter) {
      const f = c.createBiquadFilter();
      f.type = filter.type || 'lowpass';
      f.frequency.value = filter.freq;
      f.Q.value = filter.q || 1;
      g.connect(f);
      node = f;
    }
    node.connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  // Filtrelenmiş beyaz gürültü
  function noise({ dur, vol = 0.15, at = 0, type = 'bandpass', freq = 1200, q = 1, sweepTo = null }) {
    const c = ac();
    if (!c) return;
    const t0 = c.currentTime + at;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.03, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  const SFX = {
    meow(variant=0) {
      const pitch=1+((variant%5)-2)*.08;
      tone({ type: 'sawtooth', freqs: [[0, 520*pitch], [0.12, 880*pitch], [0.42, 600*pitch], [0.62, 470*pitch]], dur: 0.66, vol: 0.12, attack: 0.05, filter: { freq: 1500, q: 4 }, vibrato: 12 });
      tone({ type: 'sine', freqs: [[0, 1040], [0.12, 1760], [0.42, 1200], [0.62, 940]], dur: 0.6, vol: 0.03, attack: 0.05 });
    },
    purr() {
      for (let i = 0; i < 6; i++) noise({ dur: 0.18, vol: 0.06, at: i * 0.2, type: 'lowpass', freq: 180, q: 2 });
    },
    rustle() {
      for (let i = 0; i < 4; i++) noise({ dur: 0.12, vol: 0.09, at: i * 0.09, type: 'highpass', freq: 2500 + Math.random() * 2500 });
    },
    brew() {
      noise({ dur: 1.4, vol: 0.08, type: 'bandpass', freq: 400, q: 3, sweepTo: 900 });
      for (let i = 0; i < 6; i++) tone({ freqs: [[0, 300 + Math.random() * 200], [0.08, 160]], dur: 0.1, vol: 0.06, at: 0.3 + i * 0.17 });
      tone({ type: 'triangle', freqs: [[0, 1320], [0.2, 1320]], dur: 0.25, vol: 0.05, at: 1.55 });
    },
    glug() {
      for (let i = 0; i < 4; i++) tone({ freqs: [[0, 240 + i * 30], [0.12, 520 + i * 40]], dur: 0.16, vol: 0.12, at: i * 0.22 });
    },
    cuckoo() {
      tone({ type: 'triangle', freqs: [[0, 740], [0.2, 740]], dur: 0.26, vol: 0.14 });
      tone({ type: 'triangle', freqs: [[0, 587], [0.3, 587]], dur: 0.36, vol: 0.14, at: 0.3 });
      tone({ type: 'triangle', freqs: [[0, 740], [0.2, 740]], dur: 0.26, vol: 0.12, at: 0.9 });
      tone({ type: 'triangle', freqs: [[0, 587], [0.3, 587]], dur: 0.36, vol: 0.12, at: 1.2 });
    },
    flip() {
      noise({ dur: 0.09, vol: 0.12, type: 'highpass', freq: 3000 });
      noise({ dur: 0.08, vol: 0.08, at: 0.07, type: 'highpass', freq: 4000 });
      tone({ freqs: [[0, 160], [0.06, 90]], dur: 0.08, vol: 0.08, at: 0.35 });
    },
    creak() {
      tone({ type: 'sawtooth', freqs: [[0, 90], [0.5, 140], [0.9, 110]], dur: 0.95, vol: 0.05, filter: { freq: 700, q: 6 }, vibrato: 18 });
      tone({ freqs: [[0, 120], [0.1, 60]], dur: 0.14, vol: 0.12, at: 2.3 });
    },
    beeps() {
      const notes = [523, 659, 784, 1047, 784, 1319];
      notes.forEach((f, i) => tone({ type: 'square', freqs: [[0, f], [0.06, f]], dur: 0.08, vol: 0.04, at: i * 0.09 }));
    },
    chalk() {
      tone({ type: 'sine', freqs: [[0, 2600], [0.25, 3100], [0.5, 2800]], dur: 0.55, vol: 0.025, vibrato: 140 });
      noise({ dur: 0.6, vol: 0.05, type: 'highpass', freq: 5000 });
      tone({ type: 'sine', freqs: [[0, 2900], [0.3, 3300]], dur: 0.4, vol: 0.02, at: 0.75, vibrato: 160 });
    },
    tweet() {
      for (let i = 0; i < 3; i++) tone({ freqs: [[0, 2400], [0.05, 3600], [0.1, 2800]], dur: 0.12, vol: 0.05, at: i * 0.16 });
    },
    // fotokopi: motor uğultusu + tarama + kâğıt çıkışı
    print() {
      tone({ type: 'sawtooth', freqs: [[0, 70], [1.4, 72]], dur: 1.5, vol: 0.035, filter: { freq: 300, q: 2 } });
      noise({ dur: 1.1, vol: 0.05, at: 0.1, type: 'bandpass', freq: 1800, q: 4, sweepTo: 900 });
      for (let i = 0; i < 5; i++) noise({ dur: 0.05, vol: 0.06, at: 0.2 + i * 0.22, type: 'highpass', freq: 3000 });
      noise({ dur: 0.25, vol: 0.08, at: 1.45, type: 'highpass', freq: 2500, sweepTo: 6000 });
    },
    twinkle() {
      [1568, 2093, 2637].forEach((f, i) => tone({ type: 'triangle', freqs: [[0, f], [0.3, f]], dur: 0.45, vol: 0.05, at: i * 0.11 }));
    },
  };

  window.OfficeSfx = SFX;
})();
