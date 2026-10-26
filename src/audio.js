/* Lumi Pop — synthesized sound. No audio files: everything is generated in WebAudio. */
(function () {
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31];
  let ctx = null, master = null, verb = null;
  let muted = false, suspendedBySystem = false;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.55;
    // tiny feedback delay = cheap shimmer
    verb = ctx.createDelay(0.5);
    verb.delayTime.value = 0.13;
    const fb = ctx.createGain(); fb.gain.value = 0.28;
    const wet = ctx.createGain(); wet.gain.value = 0.22;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
    verb.connect(lp); lp.connect(fb); fb.connect(verb); lp.connect(wet); wet.connect(master);
    master.connect(ctx.destination);
    return ctx;
  }

  function tone(freq, t0, dur, type, vol, slideTo) {
    const c = ensure(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master); g.connect(verb);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  function noise(t0, dur, vol, from, to) {
    const c = ensure(); if (!c) return;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = c.createBufferSource(); s.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4;
    f.frequency.setValueAtTime(from, t0); f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const g = c.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t0);
  }

  const note = (i) => 523.25 * Math.pow(2, PENTA[Math.min(i, PENTA.length - 1)] / 12);

  // ---- background music ----------------------------------------------------
  // A composed, melodic loop: soft felt piano in broken chords + a music-box melody.
  // No pads, no drones, no bass. 72 BPM, C major (pops use C pentatonic, so effects fit).
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const NOTE = (n) => { const k = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[n[0]]; return 12 * (+n[n.length - 1] + 1) + k + (n[1] === '#' ? 1 : 0); };
  const EIGHTH = 60 / 72 / 2, MUSIC_VOL = 0.45;
  const CH = { C: [48, 55, 60, 64], Am: [45, 52, 57, 60], F: [41, 48, 53, 57], G: [43, 50, 55, 59], Em: [40, 47, 52, 55] };
  const PROG = ['C', 'Am', 'F', 'G', 'C', 'Em', 'F', 'G', 'F', 'G', 'Em', 'Am', 'F', 'G', 'C', 'C'];
  // melody per bar: note:length-in-eighths, "-" = rest
  const MEL = [
    'E5:2 G5:2 A5:1 G5:1 E5:2', 'C5:2 E5:2 D5:1 C5:1 A4:2', 'A4:2 C5:2 D5:2 C5:1 A4:1', 'G4:4 D5:2 -:2',
    'E5:2 G5:2 C6:3 B5:1', 'G5:2 E5:2 D5:2 E5:2', 'A5:2 G5:1 E5:1 D5:2 C5:2', 'D5:6 -:2',
    'C5:2 A4:2 C5:2 D5:2', 'E5:3 D5:1 B4:2 G4:2', 'E5:2 G5:2 B5:2 A5:1 G5:1', 'E5:4 -:2 C5:2',
    'A4:2 C5:2 F5:2 E5:1 D5:1', 'D5:2 E5:2 G5:4', 'E5:2 D5:1 C5:1 D5:2 E5:2', 'C5:6 -:2',
  ].map((bar) => { let at = 0; return bar.split(' ').map((tok) => { const [n, l] = tok.split(':'); const ev = { at, len: +l, m: n === '-' ? null : NOTE(n) }; at += +l; return ev; }); });
  const ARP = [0, null, 2, 3, 1, null, 2, 3]; // chord-tone index per eighth
  let musicOn = true, mOut = null, mBus = null, mTone = null, mTimer = 0;
  let mNext = 0, mBar = 0, mStep = 0, mPass = 0, mRunning = false;

  function impulse(c, secs, decay) {
    const len = Math.floor(c.sampleRate * secs), buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch); let prev = 0;
      for (let i = 0; i < len; i++) { prev = prev * 0.5 + (Math.random() * 2 - 1) * 0.5; d[i] = prev * Math.pow(1 - i / len, decay); }
    }
    return buf;
  }
  function musicGraph() {
    if (mOut || !ensure()) return;
    mOut = ctx.createGain(); mOut.gain.value = 0; mOut.connect(ctx.destination);
  }
  function genGraph() {
    if (mBus || !mOut) return;
    const c = ctx;
    mBus = c.createGain();
    // gentle tone: cut rumble below 90 Hz and harshness above 6 kHz
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 90; hp.Q.value = 0.5;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6000; lp.Q.value = 0.4;
    mBus.connect(hp); hp.connect(lp); mTone = lp;
    const dry = c.createGain(); dry.gain.value = 0.8; lp.connect(dry); dry.connect(mOut);
    const conv = c.createConvolver(); conv.buffer = impulse(c, 2.4, 3);
    const wet = c.createGain(); wet.gain.value = 0.32; lp.connect(conv); conv.connect(wet); wet.connect(mOut);
  }
  function voice(freq, t0, parts, attack) {
    t0 = Math.max(t0, ctx.currentTime + 0.005);
    for (const [ratio, v, dec, type] of parts) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'sine'; o.frequency.value = freq * ratio;
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v * 1.8, t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dec);
      o.connect(g); g.connect(mBus); o.start(t0); o.stop(t0 + dec + 0.05);
    }
  }
  // soft felt piano: warm fundamental, quick-fading upper partials
  function piano(m, t0, vel, len) {
    if (m < 48) vel *= 0.7;
    const d = Math.min(2.6, 0.9 + len * EIGHTH);
    voice(mtof(m), t0, [[1, 0.06 * vel, d], [2, 0.022 * vel, d * 0.5], [3, 0.008 * vel, d * 0.3], [4.01, 0.003 * vel, 0.25]], 0.012);
  }
  // music box: bright, clear, bell-like tine
  function musicBox(m, t0, vel, len) {
    const d = Math.min(3.2, 1.4 + len * EIGHTH * 0.6);
    voice(mtof(m), t0, [[1, 0.075 * vel, d], [2, 0.012 * vel, d * 0.45], [4, 0.01 * vel, 0.35], [5.43, 0.004 * vel, 0.18]], 0.004);
  }
  function schedule() {
    if (!ctx || !musicOn || ctx.state !== 'running' || trackMode) return;
    genGraph();
    if (mNext < ctx.currentTime) { mNext = ctx.currentTime + 0.1; mStep = 0; }
    const ahead = ctx.currentTime + 0.8;
    while (mNext < ahead) {
      const chord = CH[PROG[mBar]], hum = () => (Math.random() - 0.5) * 0.012;
      // accompaniment: broken chord on eighths, lighter on off-beats
      const ai = ARP[mStep];
      if (ai !== null) piano(chord[ai], mNext + hum(), mStep % 4 === 0 ? 0.85 : 0.6, 2);
      if (mStep === 0) piano(chord[0] + 12, mNext + 0.01, 0.35, 6);
      // melody: every third pass is sparser so it never feels insistent
      for (const ev of MEL[mBar]) {
        if (ev.at !== mStep || ev.m === null) continue;
        if (mPass % 3 === 2 && Math.random() < 0.5) continue;
        musicBox(ev.m, mNext + hum(), 0.8 + Math.random() * 0.2, ev.len);
      }
      if (mStep === 6 && mBar % 4 === 3) musicBox(PROG[mBar] === 'C' ? 96 : 91, mNext + 0.2, 0.25, 4); // a far twinkle
      mNext += EIGHTH;
      if (++mStep >= 8) { mStep = 0; if (++mBar >= PROG.length) { mBar = 0; mPass++; } }
    }
  }

  // ---- recorded loop (replaces the generative music when it loads) ----------------
  let track = null, trackRaw = null, trackBuf = null, trackSrc = null, trackOff = 0, trackLoad = null, trackMode = false, ducked = false;
  const TRACK_GAIN = 0.55;
  function findOffset(buf) {
    // match the stored fingerprint of the first 0.19 s to find where the loop really starts
    const bin = atob(track.ref), ref = new Int16Array(bin.length / 2);
    for (let i = 0; i < ref.length; i++) ref[i] = (bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8)) << 16 >> 16;
    const a = buf.getChannelData(0), b = buf.numberOfChannels > 1 ? buf.getChannelData(1) : a;
    const k = buf.sampleRate / track.sr, step = track.stride * k, maxO = Math.min(Math.floor(0.12 * buf.sampleRate), a.length - ref.length * step - 2);
    let peak = 0; for (let i = 0; i < ref.length; i++) { const p = Math.abs(a[Math.floor(i * step)] + b[Math.floor(i * step)]); if (p > peak) peak = p; }
    const err = (o) => {
      let e = 0, dot = 0, nn = 0;
      for (let i = 0; i < ref.length; i++) {
        const x = o + i * step, j = Math.floor(x), f = x - j;
        const v = ((a[j] + b[j]) * (1 - f) + (a[j + 1] + b[j + 1]) * f) * 0.5;
        dot += v * ref[i]; nn += v * v;
      }
      e = nn > 0 ? -dot / Math.sqrt(nn) : 0; return e;
    };
    let best = 0, be = Infinity;
    for (let o = 0; o <= maxO; o += 4) { const e = err(o); if (e < be) { be = e; best = o; } }
    for (let o = Math.max(0, best - 4); o <= Math.min(maxO, best + 4); o++) { const e = err(o); if (e < be) { be = e; best = o; } }
    return best / buf.sampleRate;
  }
  async function decodeTrack() {
    if (trackBuf || !track) return trackBuf;
    await trackLoad; if (!trackRaw) { trackMode = false; return null; }
    try {
      trackBuf = await new Promise((res, rej) => ctx.decodeAudioData(trackRaw.slice(0), res, rej));
      trackOff = findOffset(trackBuf);
    } catch (e) { trackBuf = null; trackMode = false; }
    return trackBuf;
  }
  function startTrack() {
    if (!trackBuf || trackSrc || !musicOn) return;
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = trackBuf; src.loop = true;
    src.loopStart = trackOff; src.loopEnd = Math.min(trackBuf.duration, trackOff + track.len);
    g.gain.value = TRACK_GAIN; src.connect(g); g.connect(mOut);
    src.start(ctx.currentTime + 0.05, trackOff); trackSrc = src;
    musicFade(ducked ? MUSIC_VOL * 0.45 : MUSIC_VOL, 3);
  }
  function stopTrack() {
    const src = trackSrc; trackSrc = null; if (!src) return;
    setTimeout(() => { try { src.stop(); } catch (e) {} }, 900);
  }
  function musicFade(to, secs) {
    if (!mOut) return;
    const t = ctx.currentTime;
    mOut.gain.cancelScheduledValues(t); mOut.gain.setValueAtTime(mOut.gain.value, t);
    mOut.gain.linearRampToValueAtTime(to, t + secs);
  }

  window.Sfx = {
    unlock() {
      const c = ensure();
      if (c && c.state === 'suspended' && !suspendedBySystem) c.resume().catch(() => {});
    },
    setMuted(m) {
      muted = m;
      if (master) master.gain.setTargetAtTime(m ? 0 : 0.55, ctx.currentTime, 0.02);
    },
    get muted() { return muted; },
    /** start the endless ambient track; call from a click (browsers need a gesture) */
    /** use a recorded seamless loop; falls back to the generative music if it fails to load */
    useTrack(info) {
      if (!info || !info.url) return;
      track = info; trackMode = true;
      trackLoad = fetch(info.url).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => { trackRaw = b; }).catch(() => { trackRaw = null; });
    },
    startMusic() {
      this.unlock(); musicGraph(); if (!mOut) return;
      if (!mTimer) mTimer = setInterval(schedule, 150);
      if (!musicOn || mRunning) return;
      mRunning = true;
      if (trackMode) {
        decodeTrack().then((buf) => {
          if (buf) { if (musicOn && mRunning) startTrack(); }
          else { mNext = 0; musicFade(ducked ? MUSIC_VOL * 0.45 : MUSIC_VOL, 4); schedule(); }
        });
      } else { mNext = 0; musicFade(MUSIC_VOL, 4); schedule(); }
    },
    setMusic(on) {
      musicOn = on;
      if (!mOut) return;
      if (on) { mRunning = false; this.startMusic(); }
      else { mRunning = false; musicFade(0, 0.8); stopTrack(); }
    },
    get musicOn() { return musicOn; },
    /** softer music behind menus */
    musicDuck(d) { ducked = d; if (mOut && musicOn && mRunning) musicFade(d ? MUSIC_VOL * 0.45 : MUSIC_VOL, 1.2); },
    /** focus lost / ad playing: stop all sound */
    systemPause(p) {
      suspendedBySystem = p;
      if (!ctx) return;
      if (p) ctx.suspend().catch(() => {}); else ctx.resume().catch(() => {});
    },
    shoot() { const c = ensure(); if (!c || muted) return; const t = c.currentTime; noise(t, 0.16, 0.25, 900, 3800); tone(330, t, 0.12, 'triangle', 0.08, 660); },
    bounce() { const c = ensure(); if (!c || muted) return; tone(1200, c.currentTime, 0.05, 'sine', 0.05); },
    stick() { const c = ensure(); if (!c || muted) return; const t = c.currentTime; tone(220, t, 0.09, 'sine', 0.12, 160); },
    pop(i, combo) {
      const c = ensure(); if (!c || muted) return;
      const t = c.currentTime + i * 0.035;
      tone(note(i + combo * 2), t, 0.22, 'sine', 0.13);
      tone(note(i + combo * 2) * 2, t, 0.12, 'triangle', 0.035);
    },
    drop(n) { const c = ensure(); if (!c || muted) return; const t = c.currentTime + 0.12; for (let i = 0; i < Math.min(n, 6); i++) tone(note(8 - i), t + i * 0.05, 0.18, 'sine', 0.06); },
    nova() { const c = ensure(); if (!c || muted) return; const t = c.currentTime; noise(t, 0.6, 0.45, 3000, 120); tone(110, t, 0.6, 'sine', 0.3, 40); for (let i = 0; i < 5; i++) tone(note(5 + i * 2), t + 0.05 + i * 0.04, 0.4, 'sine', 0.06); },
    push() { const c = ensure(); if (!c || muted) return; const t = c.currentTime; tone(90, t, 0.35, 'sine', 0.22, 55); noise(t, 0.25, 0.12, 300, 120); },
    charge() { const c = ensure(); if (!c || muted) return; const t = c.currentTime; [0, 4, 7, 12].forEach((s, i) => tone(523.25 * Math.pow(2, s / 12), t + i * 0.07, 0.3, 'triangle', 0.07)); },
    clear() { const c = ensure(); if (!c || muted) return; const t = c.currentTime; [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => tone(392 * Math.pow(2, s / 12), t + i * 0.06, 0.5, 'sine', 0.09)); },
    over() { const c = ensure(); if (!c || muted) return; const t = c.currentTime; [12, 7, 4, 0].forEach((s, i) => tone(392 * Math.pow(2, s / 12), t + i * 0.16, 0.5, 'triangle', 0.09)); },
    click() { const c = ensure(); if (!c || muted) return; tone(880, c.currentTime, 0.05, 'sine', 0.06); },
    ice() { const c = ensure(); if (!c || muted) return; const t = c.currentTime; noise(t, 0.12, 0.22, 6000, 2500); [28, 31, 33].forEach((s, i) => tone(523.25 * Math.pow(2, s / 12) / 2, t + i * 0.03, 0.25, 'sine', 0.05)); },
    boom() { const c = ensure(); if (!c || muted) return; const t = c.currentTime; noise(t, 0.45, 0.4, 1800, 90); tone(120, t, 0.45, 'sine', 0.28, 45); },
    zap() { const c = ensure(); if (!c || muted) return; const t = c.currentTime; tone(1800, t, 0.25, 'sawtooth', 0.05, 220); noise(t, 0.3, 0.25, 5000, 800); },
    fire() { const c = ensure(); if (!c || muted) return; const t = c.currentTime; noise(t, 0.5, 0.3, 400, 2600); tone(180, t, 0.4, 'triangle', 0.08, 420); },
    burn() { const c = ensure(); if (!c || muted) return; noise(c.currentTime, 0.08, 0.18, 2200, 900); },
    star() { const c = ensure(); if (!c || muted) return; const t = c.currentTime; [12, 16, 19, 24].forEach((s, i) => tone(523.25 * Math.pow(2, s / 12), t + i * 0.05, 0.35, 'sine', 0.07)); },
    coin() { const c = ensure(); if (!c || muted) return; const t = c.currentTime; tone(1318.5, t, 0.12, 'sine', 0.07); tone(1975.5, t + 0.07, 0.25, 'sine', 0.07); },
    win() { const c = ensure(); if (!c || muted) return; const t = c.currentTime; [0, 4, 7, 12, 7, 12, 16, 19, 24].forEach((s, i) => tone(392 * Math.pow(2, s / 12), t + i * 0.09, 0.6, i % 2 ? 'triangle' : 'sine', 0.08)); },
  };
})();
