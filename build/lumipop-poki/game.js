/* Lumi Pop — platform adapter.
 * One game build, several storefronts. The build script sets window.__TARGET__
 * to one of: "web" | "yandex" | "crazygames" | "poki" | "vk".
 * The game only talks to this object, never to an SDK directly.
 */
(function () {
  const TARGET = window.__TARGET__ || 'web';
  const SAVE_KEY = 'lumipop_save_v1';

  function lsGet() {
    try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }
  function lsSet(obj) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(obj)); } catch (e) { /* incognito / blocked */ }
  }
  function pickLang(code) {
    code = (code || '').toLowerCase().slice(0, 2);
    return ['ru', 'be', 'kk', 'uk', 'uz'].includes(code) ? 'ru' : 'en';
  }
  function urlParam(name) {
    try { return new URLSearchParams(location.search).get(name); } catch (e) { return null; }
  }

  const listeners = { pause: [], resume: [] };
  const emit = (type) => listeners[type].forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });

  const P = {
    target: TARGET,
    lang: pickLang(navigator.language),
    hasRewarded: true,
    _ysdk: null, _player: null, _cg: null, _vk: null,
    _inGameplay: false,
    _lastInterstitial: Date.now(),
    _saveTimer: 0,

    on(type, fn) { listeners[type] && listeners[type].push(fn); },

    async init() {
      try {
        if (TARGET === 'yandex' && window.YaGames) {
          const ysdk = await window.YaGames.init();
          this._ysdk = ysdk;
          this.lang = pickLang(ysdk.environment && ysdk.environment.i18n && ysdk.environment.i18n.lang);
          try { this._player = await ysdk.getPlayer({ scopes: false }); } catch (e) { this._player = null; }
          ysdk.on && ysdk.on('game_api_pause', () => emit('pause'));
          ysdk.on && ysdk.on('game_api_resume', () => emit('resume'));
        } else if (TARGET === 'crazygames' && window.CrazyGames) {
          this._cg = window.CrazyGames.SDK;
          await this._cg.init();
          try { this._cg.game.loadingStart(); } catch (e) {}
        } else if (TARGET === 'poki' && window.PokiSDK) {
          await window.PokiSDK.init().catch(() => {});
        } else if (TARGET === 'vk' && window.vkBridge) {
          this._vk = window.vkBridge;
          await this._vk.send('VKWebAppInit').catch(() => {});
          this.lang = pickLang(urlParam('vk_language') === '0' ? 'ru' : urlParam('vk_language') === '3' ? 'en' : navigator.language);
          this._vk.subscribe((e) => {
            const t = e && e.detail && e.detail.type;
            if (t === 'VKWebAppViewHide') emit('pause');
            if (t === 'VKWebAppViewRestore') emit('resume');
          });
        }
      } catch (e) {
        console.warn('[platform] init failed, running offline', e);
      }
    },

    /** Game is loaded and the player can play. */
    ready() {
      try {
        if (this._ysdk) this._ysdk.features.LoadingAPI && this._ysdk.features.LoadingAPI.ready();
        if (this._cg) this._cg.game.loadingStop();
        if (TARGET === 'poki' && window.PokiSDK) window.PokiSDK.gameLoadingFinished();
      } catch (e) {}
    },

    gameplayStart() {
      if (this._inGameplay) return;
      this._inGameplay = true;
      try {
        if (this._ysdk && this._ysdk.features.GameplayAPI) this._ysdk.features.GameplayAPI.start();
        if (this._cg) this._cg.game.gameplayStart();
        if (TARGET === 'poki' && window.PokiSDK) window.PokiSDK.gameplayStart();
      } catch (e) {}
    },

    gameplayStop() {
      if (!this._inGameplay) return;
      this._inGameplay = false;
      try {
        if (this._ysdk && this._ysdk.features.GameplayAPI) this._ysdk.features.GameplayAPI.stop();
        if (this._cg) this._cg.game.gameplayStop();
        if (TARGET === 'poki' && window.PokiSDK) window.PokiSDK.gameplayStop();
      } catch (e) {}
    },

    /** Full-screen ad in a logical pause. Resolves when the game may continue. */
    async interstitial(mute) {
      const now = Date.now();
      if (now - this._lastInterstitial < 60000) return;
      this._lastInterstitial = now;
      try {
        if (this._ysdk) {
          await new Promise((res) => this._ysdk.adv.showFullscreenAdv({ callbacks: {
            onOpen: () => mute(true), onClose: () => { mute(false); res(); },
            onError: () => { mute(false); res(); }, onOffline: () => res() } }));
        } else if (this._cg) {
          await new Promise((res) => this._cg.ad.requestAd('midgame', {
            adStarted: () => mute(true), adFinished: () => { mute(false); res(); },
            adError: () => { mute(false); res(); } }));
        } else if (TARGET === 'poki' && window.PokiSDK) {
          await window.PokiSDK.commercialBreak(() => mute(true));
          mute(false);
        } else if (this._vk) {
          mute(true);
          await this._vk.send('VKWebAppShowNativeAds', { ad_format: 'interstitial' }).catch(() => {});
          mute(false);
        }
      } catch (e) { mute(false); }
    },

    /** Rewarded video. Resolves true only if the reward was earned. */
    async rewarded(mute) {
      try {
        if (this._ysdk) {
          return await new Promise((res) => {
            let got = false;
            this._ysdk.adv.showRewardedVideo({ callbacks: {
              onOpen: () => mute(true), onRewarded: () => { got = true; },
              onClose: () => { mute(false); res(got); }, onError: () => { mute(false); res(false); } } });
          });
        } else if (this._cg) {
          return await new Promise((res) => this._cg.ad.requestAd('rewarded', {
            adStarted: () => mute(true), adFinished: () => { mute(false); res(true); },
            adError: () => { mute(false); res(false); } }));
        } else if (TARGET === 'poki' && window.PokiSDK) {
          const ok = await window.PokiSDK.rewardedBreak(() => mute(true));
          mute(false);
          return !!ok;
        } else if (this._vk) {
          mute(true);
          const r = await this._vk.send('VKWebAppShowNativeAds', { ad_format: 'reward' }).catch(() => null);
          mute(false);
          return !!(r && r.result);
        }
        // web demo: no ad network — the game shows a labelled stand-in
        return 'demo';
      } catch (e) { mute(false); return false; }
    },

    // ---- shortcut / favourites and rating prompts ----
    async canShortcut() {
      try {
        if (this._ysdk && this._ysdk.shortcut) { const r = await this._ysdk.shortcut.canShowPrompt(); return !!(r && r.canShow); }
        if (this._vk) return true;
      } catch (e) {}
      return false;
    },
    async shortcut() {
      try {
        if (this._ysdk && this._ysdk.shortcut) { const r = await this._ysdk.shortcut.showPrompt(); return !!(r && r.outcome === 'accepted'); }
        if (this._vk) { const r = await this._vk.send('VKWebAppAddToFavorites'); return !!(r && r.result); }
      } catch (e) {}
      return false;
    },
    async requestReview() {
      try {
        if (this._ysdk && this._ysdk.feedback) {
          const c = await this._ysdk.feedback.canReview();
          if (c && c.value) { const r = await this._ysdk.feedback.requestReview(); return !!(r && r.feedbackSent); }
        }
      } catch (e) {}
      return false;
    },
    // ---- leaderboard (Yandex only; board "lumipopEndless" must exist in the console) ----
    LB: 'lumipopEndless',
    hasLeaderboard() { return !!this._ysdk; },
    canLogin() { try { return !!(this._ysdk && this._player && this._player.getMode && this._player.getMode() === 'lite'); } catch (e) { return false; } },
    async login() {
      try { await this._ysdk.auth.openAuthDialog(); this._player = await this._ysdk.getPlayer({ scopes: false }); } catch (e) {}
    },
    async _lb() {
      if (!this._ysdk) return null;
      if (this._ysdk.leaderboards && this._ysdk.leaderboards.getEntries) return { kind: 'v2', api: this._ysdk.leaderboards };
      if (this._ysdk.getLeaderboards) { try { return { kind: 'v1', api: await this._ysdk.getLeaderboards() }; } catch (e) { return null; } }
      return null;
    },
    async submitScore(score) {
      try {
        if (this.canLogin()) return;
        const lb = await this._lb(); if (!lb) return;
        if (lb.kind === 'v2') await lb.api.setScore(this.LB, score); else await lb.api.setLeaderboardScore(this.LB, score);
      } catch (e) {}
    },
    async getTop() {
      try {
        const lb = await this._lb(); if (!lb) return null;
        const opts = { quantityTop: 10, includeUser: !this.canLogin(), quantityAround: 1 };
        const r = lb.kind === 'v2' ? await lb.api.getEntries(this.LB, opts) : await lb.api.getLeaderboardEntries(this.LB, opts);
        const me = r.userRank;
        return { entries: (r.entries || []).map((e) => ({ rank: e.rank, score: e.score, name: e.player && e.player.publicName, me: me && e.rank === me })) };
      } catch (e) { return null; }
    },

    async load() {
      let data = null;
      try {
        if (this._player) data = await this._player.getData(['save']).then((d) => d && d.save);
        else if (this._cg) { const s = this._cg.data.getItem(SAVE_KEY); data = s ? JSON.parse(s) : null; }
        else if (this._vk) {
          // VK keeps at most 4096 bytes per key, so the save is split into chunks
          const head = await this._vk.send('VKWebAppStorageGet', { keys: [SAVE_KEY + '_n'] });
          const n = parseInt(head && head.keys && head.keys[0] && head.keys[0].value, 10) || 0;
          if (n > 0) {
            const keys = []; for (let i = 0; i < n; i++) keys.push(SAVE_KEY + '_' + i);
            const r = await this._vk.send('VKWebAppStorageGet', { keys });
            const map = {}; (r.keys || []).forEach((k) => { map[k.key] = k.value; });
            data = JSON.parse(keys.map((k) => map[k] || '').join(''));
          }
        }
      } catch (e) { data = null; }
      return data || lsGet();
    },

    /** Saves right away to local storage, and to the cloud with a short debounce. */
    save(obj) {
      lsSet(obj);
      clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(() => {
        try {
          if (this._player) this._player.setData({ save: obj }, false).catch(() => {});
          else if (this._cg) this._cg.data.setItem(SAVE_KEY, JSON.stringify(obj));
          else if (this._vk) {
            const s = JSON.stringify(obj), parts = [];
            for (let i = 0; i < s.length; i += 1000) parts.push(s.slice(i, i + 1000));
            parts.forEach((v, i) => this._vk.send('VKWebAppStorageSet', { key: SAVE_KEY + '_' + i, value: v }).catch(() => {}));
            this._vk.send('VKWebAppStorageSet', { key: SAVE_KEY + '_n', value: String(parts.length) }).catch(() => {});
          }
        } catch (e) {}
      }, 600);
    },
  };

  window.Platform = P;
})();

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

/* Lumi Pop — all player-facing text. */
(function () {
  const ru = {
    score: 'СЧЁТ', best: 'Рекорд', bestIs: 'Лучший', play: 'Играть', cont: 'Продолжить',
    tagline: 'Собирай по три шара одного цвета',
    paused: 'ПАУЗА', resume: 'Продолжить', restart: 'Начать заново', toMenu: 'В меню', menu: 'Меню',
    over: 'КОНЕЦ ИГРЫ', record: 'НОВЫЙ РЕКОРД', again: 'Ещё раз',
    contAd: 'Продолжить', contAdSub: 'за просмотр рекламы', shotsAd: '+5 выстрелов', shotsAdSub: 'за просмотр рекламы',
    tip: 'Тяни, чтобы прицелиться. Отпусти — выстрел', nova: 'СВЕРХНОВАЯ', combo: 'КОМБО', clear: 'ЧИСТОЕ НЕБО',
    adFail: 'Реклама сейчас недоступна. Попробуй чуть позже', adDemo: 'Здесь будет реклама площадки',
    adCount: 'Демо-версия: награда через {n} с', rbCool: 'Радужный шар будет доступен через {n} с',
    novaReady: 'СВЕРХНОВАЯ ГОТОВА', sound: 'Звук', music: 'Музыка', pause: 'Пауза',
    keys: 'Мышь: целься и кликай<br>← → прицел · Пробел выстрел<br>X — сменить шар · Esc — пауза',
    // modes
    endless: 'Бесконечный', endlessSub: 'Играй, пока небо не опустится',
    adventure: 'Приключение', adventureSub: 'Уровень {n} из {total}', adventureDone: 'Все уровни пройдены',
    daily: 'Челлендж дня', dailySub: 'Одно поле для всех, {n} выстрелов', dailyDone: 'Сегодня: {s}',
    dailyLbl: 'ЧЕЛЛЕНДЖ ДНЯ', dailyEnd: 'ИТОГ ДНЯ', dailyBest: 'Лучший сегодня', dailyNew: 'Новое поле завтра',
    levelLbl: 'УРОВЕНЬ {n}', shots: 'Выстрелы', shotsLeft: 'выстрелов',
    goalClear: 'Очисти небо', goalStars: 'Собери звёзды', goalScore: 'Набери очки',
    goalClearP: 'Осталось шаров: {n}', goalStarsP: 'Звёзды: {a} из {b}', goalScoreP: '{a} из {b}',
    goalClearD: 'Лопни или сбрось все шары', goalStarsD: 'Сбрось {n} звёздных шаров', goalScoreD: 'Набери {n} очков',
    start: 'Начать', next: 'Дальше', retry: 'Ещё раз', levels: 'Уровни', back: 'Назад',
    won: 'УРОВЕНЬ ПРОЙДЕН', lostShots: 'ВЫСТРЕЛЫ КОНЧИЛИСЬ', lostLine: 'ШАРЫ ДОШЛИ ДО ЛИНИИ',
    reward: '+{n}', sparks: 'Искры', locked: 'Закрыто',
    // specials
    newSpecial: 'НОВЫЙ ШАР', sp_ice: 'Ледяной шар', sp_iceD: 'Лопается со второго раза: сначала тает',
    sp_stone: 'Камень', sp_stoneD: 'Не лопается. Падает, если под ним нет опоры',
    sp_cham: 'Хамелеон', sp_chamD: 'Меняет цвет после каждого выстрела',
    sp_bomb: 'Бомба', sp_bombD: 'Взрывается, если рядом лопнули шары',
    sp_star: 'Звёздный шар', sp_starD: 'Сбрось его, чтобы собрать звезду',
    gotIt: 'Понятно',
    // boosters
    b_fire: 'Огненный шар', b_fireD: 'Пролетает насквозь до потолка',
    b_bolt: 'Молния', b_boltD: 'Сжигает весь ряд, в который попадёт',
    b_rainbow: 'Радуга', b_rainbowD: 'Становится цветом шара, в который попала',
    buyUse: 'Купить за {n}', noSparks: 'Не хватает искр. Их дают за партии, уровни и задания',
    boosterBusy: 'Дождись, пока шар долетит',
    // meta
    quests: 'Задания', questsSub: 'Новые задания каждый день', claim: 'Забрать', claimed: 'Готово',
    q_pop: 'Лопни {n} шаров', q_drop: 'Сбрось {n} шаров', q_combo: 'Сделай комбо ×{n}', q_nova: 'Взорви Сверхновую {n} раза',
    q_score: 'Набери {n} очков за одну партию', q_level: 'Пройди {n} уровня', q_daily: 'Сыграй челлендж дня',
    q_booster: 'Используй {n} бустера', q_ice: 'Растопи {n} ледяных шаров', q_star: 'Собери {n} звёзд',
    gift: 'Подарок дня', giftSub: 'Заходи каждый день — подарки растут', giftDay: 'День {n}', take: 'Забрать',
    streak: 'Серия: {n} дн.',
    shop: 'Магазин', tabOrbs: 'Шары', tabBg: 'Фон', tabBoost: 'Бустеры', buy: 'Купить', use: 'Выбрать', inUse: 'Выбрано',
    owned: 'У тебя: {n}',
    sk_lumi: 'Светлячки', sk_candy: 'Леденцы', sk_gems: 'Самоцветы', sk_planets: 'Планеты',
    bg_night: 'Ночное небо', bg_dawn: 'Рассвет', bg_ocean: 'Глубина', bg_aurora: 'Северное сияние',
    records: 'Рекорды', world: 'Мир', mine: 'Мои', noRecords: 'Пока пусто. Сыграй бесконечный режим',
    worldNone: 'Мировой рейтинг есть только на Яндекс Играх', login: 'Войти, чтобы попасть в рейтинг',
    you: 'Ты', close: 'Закрыть',
    plevel: 'Ур. {n}', xpGain: '+{n} опыта', levelUp: 'Новый уровень игрока: {n}', chest: 'Сундук', chestIn: 'Откроется через {t}',
    chestOpen: 'Открыть', chestAd: 'Открыть сейчас', chestGot: 'В сундуке', chestSub: 'Новый сундук каждые 4 часа',
    cons: 'Созвездия', consSub: 'Звёзды из приключения зажигают созвездия. Зажёг целиком — забирай награду',
    cons_lyra: 'Лира', cons_cas: 'Кассиопея', cons_cyg: 'Лебедь', cons_ori: 'Орион', cons_uma: 'Большая Медведица', cons_dra: 'Дракон',
    consDone: 'Созвездие «{n}» зажглось', toRecord: 'До рекорда не хватило {n}',
    shortcutY: 'Ярлык на рабочем столе', shortcutV: 'Игра в избранном', shortcutSub: 'Добавь и получи', ready: 'Готово',
  };
  const en = {
    score: 'SCORE', best: 'Best', bestIs: 'Best', play: 'Play', cont: 'Continue',
    tagline: 'Match three orbs of the same colour',
    paused: 'PAUSED', resume: 'Resume', restart: 'Start over', toMenu: 'Main menu', menu: 'Menu',
    over: 'GAME OVER', record: 'NEW BEST', again: 'Play again',
    contAd: 'Continue', contAdSub: 'watch an ad', shotsAd: '+5 shots', shotsAdSub: 'watch an ad',
    tip: 'Drag to aim. Release to shoot', nova: 'SUPERNOVA', combo: 'COMBO', clear: 'CLEAR SKY',
    adFail: 'No ad available right now. Try again soon', adDemo: 'The platform ad plays here',
    adCount: 'Demo build: reward in {n} s', rbCool: 'Rainbow orb is back in {n} s',
    novaReady: 'SUPERNOVA READY', sound: 'Sound', music: 'Music', pause: 'Pause',
    keys: 'Mouse: aim and click<br>← → aim · Space shoot<br>X — swap orb · Esc — pause',
    endless: 'Endless', endlessSub: 'Play until the sky comes down',
    adventure: 'Adventure', adventureSub: 'Level {n} of {total}', adventureDone: 'All levels complete',
    daily: 'Daily challenge', dailySub: 'Same board for everyone, {n} shots', dailyDone: 'Today: {s}',
    dailyLbl: 'DAILY CHALLENGE', dailyEnd: 'DAILY RESULT', dailyBest: 'Best today', dailyNew: 'New board tomorrow',
    levelLbl: 'LEVEL {n}', shots: 'Shots', shotsLeft: 'shots',
    goalClear: 'Clear the sky', goalStars: 'Collect stars', goalScore: 'Reach the score',
    goalClearP: 'Orbs left: {n}', goalStarsP: 'Stars: {a} of {b}', goalScoreP: '{a} of {b}',
    goalClearD: 'Pop or drop every orb', goalStarsD: 'Drop {n} star orbs', goalScoreD: 'Score {n} points',
    start: 'Start', next: 'Next', retry: 'Retry', levels: 'Levels', back: 'Back',
    won: 'LEVEL COMPLETE', lostShots: 'OUT OF SHOTS', lostLine: 'THE ORBS REACHED THE LINE',
    reward: '+{n}', sparks: 'Sparks', locked: 'Locked',
    newSpecial: 'NEW ORB', sp_ice: 'Ice orb', sp_iceD: 'Takes two pops: first it thaws',
    sp_stone: 'Stone', sp_stoneD: 'Never pops. Falls when nothing holds it',
    sp_cham: 'Chameleon', sp_chamD: 'Changes colour after every shot',
    sp_bomb: 'Bomb', sp_bombD: 'Explodes when orbs pop next to it',
    sp_star: 'Star orb', sp_starD: 'Drop it to collect a star',
    gotIt: 'Got it',
    b_fire: 'Fireball', b_fireD: 'Burns straight through to the top',
    b_bolt: 'Lightning', b_boltD: 'Burns the whole row it hits',
    b_rainbow: 'Rainbow', b_rainbowD: 'Takes the colour of the orb it hits',
    buyUse: 'Buy for {n}', noSparks: 'Not enough sparks. Earn them in games, levels and quests',
    boosterBusy: 'Wait for the orb to land',
    quests: 'Quests', questsSub: 'New quests every day', claim: 'Claim', claimed: 'Done',
    q_pop: 'Pop {n} orbs', q_drop: 'Drop {n} orbs', q_combo: 'Make a ×{n} combo', q_nova: 'Fire {n} Supernovas',
    q_score: 'Score {n} in one game', q_level: 'Complete {n} levels', q_daily: 'Play the daily challenge',
    q_booster: 'Use {n} boosters', q_ice: 'Thaw {n} ice orbs', q_star: 'Collect {n} stars',
    gift: 'Daily gift', giftSub: 'Come back every day — gifts grow', giftDay: 'Day {n}', take: 'Take it',
    streak: 'Streak: {n} d',
    shop: 'Shop', tabOrbs: 'Orbs', tabBg: 'Sky', tabBoost: 'Boosters', buy: 'Buy', use: 'Use', inUse: 'In use',
    owned: 'You have: {n}',
    sk_lumi: 'Fireflies', sk_candy: 'Candy', sk_gems: 'Gems', sk_planets: 'Planets',
    bg_night: 'Night sky', bg_dawn: 'Dawn', bg_ocean: 'Deep sea', bg_aurora: 'Aurora',
    records: 'Records', world: 'World', mine: 'Mine', noRecords: 'Nothing yet. Play Endless',
    worldNone: 'The world ranking is available on Yandex Games', login: 'Sign in to join the ranking',
    you: 'You', close: 'Close',
    plevel: 'Lv {n}', xpGain: '+{n} XP', levelUp: 'Player level {n}', chest: 'Chest', chestIn: 'Opens in {t}',
    chestOpen: 'Open', chestAd: 'Open now', chestGot: 'In the chest', chestSub: 'A new chest every 4 hours',
    cons: 'Constellations', consSub: 'Adventure stars light up constellations. Light one fully to claim its reward',
    cons_lyra: 'Lyra', cons_cas: 'Cassiopeia', cons_cyg: 'Cygnus', cons_ori: 'Orion', cons_uma: 'Great Bear', cons_dra: 'Draco',
    consDone: '{n} is lit', toRecord: 'Only {n} short of your best',
    shortcutY: 'Desktop shortcut', shortcutV: 'Add to favourites', shortcutSub: 'Add it and get', ready: 'Ready',
  };
  const I = { ru, en, L: ru };
  I.set = (lang) => { I.L = lang === 'ru' ? ru : en; document.documentElement.lang = lang === 'ru' ? 'ru' : 'en'; };
  I.t = (key, vars) => {
    let s = I.L[key]; if (s == null) s = key;
    if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
    return s;
  };
  I.fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  window.I18n = I;
})();

/* Lumi Pop — boards: seeded generator for adventure levels, daily challenge and new rows.
 * A cell is one character: '0'-'5' colour, 'a'-'f' ice colour, 'A'-'F' chameleon colour,
 * 's' stone, 'b' bomb, '*' star orb, '.' empty.
 */
(function () {
  const COLS = 11, TOTAL = 60;

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const colorOf = (ch) => {
    if (ch >= '0' && ch <= '5') return ch.charCodeAt(0) - 48;
    if (ch >= 'a' && ch <= 'f') return ch.charCodeAt(0) - 97;
    if (ch >= 'A' && ch <= 'F') return ch.charCodeAt(0) - 65;
    return -1;
  };
  const withKind = (color, kind) => (kind === 'ice' ? String.fromCharCode(97 + color) : kind === 'cham' ? String.fromCharCode(65 + color) : String(color));

  /** One row of codes. ref = the neighbouring row (codes) used for colour clusters. */
  function genRow(R, shifted, ref, n, sp) {
    const len = shifted ? COLS - 1 : COLS, row = new Array(COLS).fill('.');
    for (let c = 0; c < len; c++) {
      let col; const roll = R(), left = c > 0 ? colorOf(row[c - 1]) : -1;
      if (left >= 0 && left < n && roll < 0.34) col = left;
      else if (ref && roll < 0.52) {
        const a = shifted ? c : c - 1, pick = colorOf(ref[Math.max(0, Math.min(COLS - 1, a + (R() < 0.5 ? 0 : 1)))] || '.');
        col = pick >= 0 && pick < n ? pick : Math.floor(R() * n);
      } else col = Math.floor(R() * n);
      let code = String(col);
      if (sp) {
        const s = R();
        if (s < sp.stone) code = 's';
        else if (s < sp.stone + sp.bomb) code = 'b';
        else if (s < sp.stone + sp.bomb + sp.ice) code = withKind(col, 'ice');
        else if (s < sp.stone + sp.bomb + sp.ice + sp.cham) code = withKind(col, 'cham');
      }
      row[c] = code;
    }
    return row;
  }

  /** Specials that appear in Endless as the score grows. */
  function endlessSpecials(score) {
    return {
      ice: score >= 2500 ? 0.05 : 0, bomb: score >= 3000 ? 0.02 : 0,
      stone: score >= 4000 ? 0.03 : 0, cham: score >= 6000 ? 0.03 : 0,
    };
  }

  const SHAPES = {
    full: () => true,
    funnel: (r, x) => Math.abs(x - 11) <= 10.5 - r * 1.15,
    pillars: (r, x) => r < 2 || Math.floor((x - 1) / 4) % 2 === 0,
    diamond: (r, x, R) => r === 0 || Math.abs(x - 11) / 10.5 + Math.abs(r - R / 2) / (R / 2 + 0.5) <= 1.1,
    waves: (r, x, R) => r < R - 1 - Math.round(1.6 + 1.6 * Math.sin(x / 2.6)),
    holes: (r, x) => r === 0 || (x + r * 3) % 7 >= 2,
    arch: (r, x) => r < 2 || Math.abs(x - 11) > 3 + r * 0.6,
    zigzag: (r, x) => r < 2 || (Math.floor(x / 4) + r) % 2 === 0,
  };
  const SHAPE_KEYS = Object.keys(SHAPES);

  // keep only cells connected to the ceiling
  function prune(rows) {
    const H = rows.length, shifted = (r) => r % 2 === 1;
    const nb = (r, c) => {
      const a = shifted(r) ? c : c - 1;
      return [[r, c - 1], [r, c + 1], [r - 1, a], [r - 1, a + 1], [r + 1, a], [r + 1, a + 1]]
        .filter(([rr, cc]) => rr >= 0 && rr < H && cc >= 0 && cc < (shifted(rr) ? COLS - 1 : COLS));
    };
    const seen = new Set(), q = [];
    for (let c = 0; c < COLS; c++) if (rows[0][c] !== '.') { seen.add('0,' + c); q.push([0, c]); }
    while (q.length) {
      const [r, c] = q.pop();
      for (const [rr, cc] of nb(r, c)) { const k = rr + ',' + cc; if (!seen.has(k) && rows[rr][cc] !== '.') { seen.add(k); q.push([rr, cc]); } }
    }
    for (let r = 0; r < H; r++) for (let c = 0; c < COLS; c++) if (!seen.has(r + ',' + c)) rows[r][c] = '.';
    while (rows.length && rows[rows.length - 1].every((v) => v === '.')) rows.pop();
    return rows;
  }
  const count = (rows) => rows.reduce((s, r) => s + r.filter((v) => v !== '.').length, 0);

  function levelSpecials(n) {
    return {
      ice: n >= 8 ? 0.05 + Math.min(n, 60) * 0.0015 : 0,
      bomb: n >= 11 ? 0.025 : 0,
      stone: n >= 14 ? 0.035 + Math.min(n, 60) * 0.0005 : 0,
      cham: n >= 20 ? 0.035 : 0,
    };
  }

  /** Adventure level n (1..TOTAL). Deterministic. */
  function level(n) {
    n = Math.max(1, Math.min(TOTAL, n | 0));
    const R = rng(n * 7919 + 13);
    const colors = n <= 4 ? 3 : n <= 18 ? 4 : n <= 38 ? 5 : 6;
    const goal = n <= 2 ? 'clear' : ['score', 'clear', 'stars'][n % 3];
    const H = goal === 'clear' ? Math.min(3 + Math.floor(n / 5), 7) : Math.min(5 + Math.floor(n / 6), 10);
    const shape = n <= 3 ? 'full' : SHAPE_KEYS[Math.floor(R() * SHAPE_KEYS.length)];
    const sp = levelSpecials(n);
    let rows = [];
    for (let r = 0; r < H; r++) {
      const row = genRow(R, r % 2 === 1, r ? rows[r - 1] : null, colors, r === 0 ? { ...sp, stone: 0, bomb: 0 } : sp);
      for (let c = 0; c < COLS; c++) {
        const x = 1 + (r % 2) + 2 * c;
        if (!SHAPES[shape](r, x, H)) row[c] = '.';
      }
      rows.push(row);
    }
    rows = prune(rows);
    if (count(rows) < 18) { rows = []; for (let r = 0; r < Math.max(4, H); r++) rows.push(genRow(R, r % 2 === 1, r ? rows[r - 1] : null, colors, null)); }
    let target = 0;
    if (goal === 'stars') {
      target = Math.min(3 + Math.floor(n / 10), 8);
      const spots = [];
      rows.forEach((row, r) => row.forEach((v, c) => { if (r >= 2 && v !== '.' && v !== 's') spots.push([r, c]); }));
      for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
      target = Math.min(target, spots.length);
      for (let i = 0; i < target; i++) rows[spots[i][0]][spots[i][1]] = '*';
    }
    const F = count(rows);
    if (goal === 'score') target = Math.round((F * 15) / 50) * 50;
    const shots = goal === 'clear' ? Math.ceil(F / 2.6) + 6 : goal === 'stars' ? Math.ceil(F / 3.0) + 6 : Math.ceil(F / 2.7) + 5;
    return {
      gm: 'level', n, seed: n * 104729 + 7, colors, goal, target, shots, shape, specials: sp,
      push: n >= 25 ? 9 : 0, rows: rows.map((r) => r.join('')),
    };
  }

  /** The daily challenge for a local date key like 2026-10-26. Same for every player. */
  function daily(key) {
    const seed = parseInt(key.replace(/-/g, ''), 10) || 1;
    const R = rng(seed * 31 + 5);
    const sp = { ice: 0.06, bomb: 0.025, stone: 0.03, cham: 0.03 };
    const rows = [];
    for (let r = 0; r < 8; r++) rows.push(genRow(R, r % 2 === 1, r ? rows[r - 1] : null, 5, r === 0 ? null : sp));
    return { gm: 'daily', key, seed: seed * 17 + 3, colors: 5, goal: 'score', target: 0, shots: 45, specials: sp, push: 7, rows: rows.map((r) => r.join('')) };
  }

  /** Which special orb a level introduces, for the "new orb" card. */
  function introduces(n) {
    return { 5: 'star', 8: 'ice', 11: 'bomb', 14: 'stone', 20: 'cham' }[n] || null;
  }

  window.Levels = { COLS, TOTAL, rng, genRow, endlessSpecials, level, daily, colorOf, introduces };
})();

/* Lumi Pop — progression between games: sparks, boosters, quests, daily gift, skins, level stars, records. */
(function () {
  const pad = (n) => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const dayDiff = (a, b) => Math.round((Date.parse(b + 'T12:00:00') - Date.parse(a + 'T12:00:00')) / 864e5);

  const CATALOG = {
    orbs: [{ id: 'lumi', price: 0 }, { id: 'candy', price: 150 }, { id: 'gems', price: 250 }, { id: 'planets', price: 400 }],
    bgs: [{ id: 'night', price: 0 }, { id: 'dawn', price: 120 }, { id: 'ocean', price: 200 }, { id: 'aurora', price: 300 }],
    boosters: [{ id: 'fire', price: 60 }, { id: 'bolt', price: 50 }, { id: 'rainbow', price: 40 }],
  };
  const STREAK = [
    { sparks: 20 }, { fire: 1 }, { sparks: 30 }, { bolt: 1 }, { sparks: 40 }, { rainbow: 1 },
    { sparks: 80, fire: 1, bolt: 1, rainbow: 1 },
  ];
  const QUESTS = [
    { id: 'pop', n: 120, max: false }, { id: 'drop', n: 40, max: false }, { id: 'combo', n: 4, max: true },
    { id: 'nova', n: 2, max: false }, { id: 'score', n: 4000, max: true }, { id: 'level', n: 2, max: false },
    { id: 'daily', n: 1, max: false }, { id: 'booster', n: 2, max: false }, { id: 'ice', n: 10, max: false },
    { id: 'star', n: 5, max: false },
  ];
  const QUEST_REWARD = [15, 20, 30];

  const fresh = () => ({
    sparks: 50, inv: { fire: 1, bolt: 1, rainbow: 1 }, owned: ['lumi', 'night'], orb: 'lumi', bg: 'night',
    levels: {}, daily: { key: '', best: 0, rewarded: false },
    quests: { key: '', list: [] }, streak: { last: '', day: 0, claimed: '' }, records: [], seen: {},
    plevel: 1, xp: 0, chestAt: 0, cons: 0, games: 0, shortcut: false, reviewed: false,
  });
  const CHEST_MS = 4 * 3600 * 1000;
  // constellations light up with adventure stars (60 levels x 3 = 180)
  const CONS = [
    { id: 'lyra', need: 15, reward: { sparks: 60 }, pts: [[50, 8], [44, 24], [56, 24], [42, 44], [58, 44]], lines: [[0, 1], [0, 2], [1, 2], [1, 3], [2, 4], [3, 4]] },
    { id: 'cas', need: 25, reward: { sparks: 80, fire: 1 }, pts: [[8, 20], [28, 44], [48, 26], [68, 46], [90, 18]], lines: [[0, 1], [1, 2], [2, 3], [3, 4]] },
    { id: 'cyg', need: 30, reward: { sparks: 100, bolt: 1 }, pts: [[50, 6], [50, 24], [50, 42], [50, 56], [20, 28], [80, 22]], lines: [[0, 1], [1, 2], [2, 3], [4, 1], [1, 5]] },
    { id: 'ori', need: 35, reward: { sparks: 120, rainbow: 1 }, pts: [[30, 6], [70, 8], [42, 30], [50, 31], [58, 32], [32, 54], [72, 52]], lines: [[0, 2], [1, 4], [2, 3], [3, 4], [2, 5], [4, 6]] },
    { id: 'uma', need: 35, reward: { sparks: 150, fire: 1, bolt: 1 }, pts: [[6, 16], [22, 20], [36, 26], [52, 28], [56, 48], [82, 50], [86, 30]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]] },
    { id: 'dra', need: 40, reward: { sparks: 250, fire: 2, bolt: 2, rainbow: 2 }, pts: [[8, 12], [20, 6], [26, 20], [40, 26], [54, 20], [66, 32], [74, 46], [92, 52]], lines: [[0, 1], [1, 2], [2, 0], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7]] },
  ];
  const xpNeed = (l) => 100 + 40 * (l - 1);
  function levelReward(l) {
    if (l % 5 === 0) return { sparks: 100, fire: 1, bolt: 1, rainbow: 1 };
    return [{ sparks: 30 }, { fire: 1 }, { sparks: 40 }, { bolt: 1 }][(l - 2) % 4] || { sparks: 30 };
  }

  const listeners = [];
  const M = {
    CATALOG, STREAK, today, d: fresh(), save: () => {},
    on(fn) { listeners.push(fn); },
    changed() { listeners.forEach((f) => { try { f(); } catch (e) { console.error(e); } }); M.save(); },

    load(saved) {
      const f = fresh();
      if (saved && typeof saved === 'object') {
        for (const k in f) if (saved[k] !== undefined) f[k] = saved[k];
        f.inv = Object.assign(fresh().inv, saved.inv || {});
        if (!Array.isArray(f.owned)) f.owned = ['lumi', 'night'];
        if (!Array.isArray(f.records)) f.records = [];
      }
      M.d = f; M.refreshDay();
    },

    /** Roll the day over: new quests, streak bookkeeping. */
    refreshDay() {
      const key = today(), d = M.d;
      if (d.quests.key !== key) {
        const R = window.Levels.rng(parseInt(key.replace(/-/g, ''), 10) * 13 + 1);
        const pool = QUESTS.slice();
        for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
        d.quests = { key, list: pool.slice(0, 3).map((q, i) => ({ id: q.id, n: q.n, max: q.max, prog: 0, done: false, claimed: false, reward: QUEST_REWARD[i] })) };
      }
      if (d.daily.key !== key) d.daily = { key, best: 0, rewarded: false };
    },

    giftPending() {
      const key = today(), s = M.d.streak;
      if (s.claimed === key) return null;
      const gap = s.last ? dayDiff(s.last, key) : 99;
      const day = gap === 1 ? (s.day % 7) + 1 : 1;
      return { day, reward: STREAK[day - 1] };
    },
    claimGift() {
      const g = M.giftPending(); if (!g) return null;
      const key = today();
      M.d.streak = { last: key, day: g.day, claimed: key };
      M.grant(g.reward); M.changed(); return g;
    },
    grant(r) {
      if (r.sparks) M.d.sparks += r.sparks;
      for (const b of ['fire', 'bolt', 'rainbow']) if (r[b]) M.d.inv[b] = (M.d.inv[b] || 0) + r[b];
    },

    /** Quest events. Returns the quests this event completed. */
    track(ev, v) {
      M.refreshDay();
      const done = [];
      for (const q of M.d.quests.list) {
        if (q.id !== ev || q.done) continue;
        q.prog = q.max ? Math.max(q.prog, v) : q.prog + v;
        if (q.prog >= q.n) { q.prog = q.n; q.done = true; done.push(q); }
      }
      if (done.length) M.changed();
      return done;
    },
    questsReady() { return M.d.quests.list.filter((q) => q.done && !q.claimed).length; },
    claimQuest(i) {
      const q = M.d.quests.list[i]; if (!q || !q.done || q.claimed) return 0;
      q.claimed = true; M.d.sparks += q.reward; M.changed(); return q.reward;
    },

    spend(n) { if (M.d.sparks < n) return false; M.d.sparks -= n; M.changed(); return true; },
    price(type, id) { const it = CATALOG[type].find((x) => x.id === id); return it ? it.price : 0; },
    buyBooster(id) {
      const p = M.price('boosters', id);
      if (!M.spend(p)) return false;
      M.d.inv[id] = (M.d.inv[id] || 0) + 1; M.changed(); return true;
    },
    useBooster(id) { if (!(M.d.inv[id] > 0)) return false; M.d.inv[id]--; M.changed(); return true; },
    buySkin(type, id) {
      if (M.d.owned.includes(id)) return true;
      if (!M.spend(M.price(type, id))) return false;
      M.d.owned.push(id); M.changed(); return true;
    },
    setSkin(type, id) { if (!M.d.owned.includes(id)) return; if (type === 'orbs') M.d.orb = id; else M.d.bg = id; M.changed(); },

    stars(n) { return M.d.levels[n] || 0; },
    nextLevel() { let n = 1; while (M.d.levels[n]) n++; return n; },
    totalStars() { return Object.values(M.d.levels).reduce((a, b) => a + b, 0); },
    levelResult(n, stars) {
      const prev = M.d.levels[n] || 0; let r = 0;
      if (!prev) r = 20 + 5 * stars; else if (stars > prev) r = 5 * (stars - prev);
      M.d.levels[n] = Math.max(prev, stars); M.d.sparks += r; M.changed(); return r;
    },
    dailyResult(score) {
      M.refreshDay(); const d = M.d.daily; let r = 0;
      if (!d.rewarded) { r = Math.min(60, 25 + Math.floor(score / 400)); d.rewarded = true; M.d.sparks += r; }
      d.best = Math.max(d.best, score); M.changed(); return r;
    },
    endlessResult(score) {
      const r = Math.min(80, Math.floor(score / 250));
      M.d.sparks += r;
      if (score > 0) { M.d.records.push({ s: score, d: today() }); M.d.records.sort((a, b) => b.s - a.s); M.d.records = M.d.records.slice(0, 10); }
      M.changed(); return r;
    },
    // ---- player level ----
    xpNeed, levelReward,
    addXp(n) {
      n = Math.max(0, Math.round(n));
      const d = M.d, fromPct = d.xp / xpNeed(d.plevel), fromLevel = d.plevel, ups = [];
      d.xp += n;
      while (d.xp >= xpNeed(d.plevel)) { d.xp -= xpNeed(d.plevel); d.plevel++; const r = levelReward(d.plevel); M.grant(r); ups.push({ level: d.plevel, reward: r }); }
      d.games++; M.changed();
      return { gained: n, level: d.plevel, xp: d.xp, need: xpNeed(d.plevel), fromPct: ups.length ? 0 : fromPct, toPct: d.xp / xpNeed(d.plevel), fromLevel, ups };
    },
    // ---- timed chest ----
    chestLeft() { return Math.max(0, (M.d.chestAt || 0) - Date.now()); },
    openChest() {
      const r = { sparks: 15 + Math.floor(Math.random() * 26) };
      if (Math.random() < 0.35) r[['fire', 'bolt', 'rainbow'][Math.floor(Math.random() * 3)]] = 1;
      M.d.chestAt = Date.now() + CHEST_MS; M.grant(r); M.changed(); return r;
    },
    // ---- constellations ----
    CONS,
    consState() {
      let left = M.totalStars();
      return CONS.map((c, i) => { const prog = Math.max(0, Math.min(c.need, left)); left -= c.need; return { ...c, i, prog, done: prog >= c.need, claimed: i < M.d.cons }; });
    },
    claimConstellations() {
      const out = [];
      for (const c of M.consState()) if (c.done && !c.claimed) { M.grant(c.reward); M.d.cons = c.i + 1; out.push(c); }
      if (out.length) M.changed();
      return out;
    },
    seen(key) { if (M.d.seen[key]) return true; M.d.seen[key] = 1; M.save(); return false; },
  };
  window.Meta = M;
})();

/* Lumi Pop — game core. PixiJS 8 renders the sky and the orbs; menus (menus.js) are DOM on top.
 * Modes: endless, daily (shared seeded board, 45 shots), level (adventure, goals and stars).
 */
(function () {
  'use strict';
  const PX = window.PIXI, P = window.Platform, S = window.Sfx, I = window.I18n, M = window.Meta, LV = window.Levels;
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => I.t(k, v), fmt = I.fmt;

  // ---- field geometry, in "units" (1 unit = orb radius) --------------------
  const COLS = 11, ROWH = Math.sqrt(3), DEAD = 12;
  const SHX = 11, SHY = 25.2, NEXT_X = 6.6, NEXT_Y = SHY + 0.8, RB_X = 15.4, RB_Y = SHY + 0.8;
  const FIELD_W = 23, FIELD_H = 28.4;
  const DEAD_Y = 1 + (DEAD - 1) * ROWH + 1;
  // orb codes: 0-5 colours, then specials
  const RAINBOW = 6, NOVA = 7, STONE = 8, BOMB = 9, STAR = 10, FIRE = 11, BOLT = 12, NCODES = 13;
  const CHARGE_MAX = 36, SPEED = 44, STEP = 1 / 240;
  const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const GLYPH = ['dot', 'star', 'tri', 'diamond', 'ring', 'plus'];

  const SKINS = {
    lumi: { style: 'glow', pal: [['#ff5d73', '#ffd0d7', '#a3123a'], ['#ffb43d', '#fff0c4', '#a85a00'], ['#5fe39a', '#d8ffe8', '#0f7a4a'], ['#44d2ff', '#d6f6ff', '#0a6c9c'], ['#a77bff', '#e9dcff', '#4b23b0'], ['#ff79d0', '#ffe0f4', '#a01a78']] },
    candy: { style: 'candy', pal: [['#ff6fa3', '#ffe1ec', '#b8195a'], ['#ffd84d', '#fff7cc', '#b38600'], ['#4fe8b0', '#dcfff1', '#0b8a5c'], ['#6fb8ff', '#e0f0ff', '#1b5fb3'], ['#c49bff', '#f1e6ff', '#6a32c9'], ['#ff9a5c', '#ffe6d6', '#b34b0b']] },
    gems: { style: 'gem', pal: [['#e8174f', '#ff9fb6', '#6b0420'], ['#ffb300', '#ffe39a', '#7a4a00'], ['#00b36b', '#8affc8', '#00452a'], ['#2a6cf0', '#a9c4ff', '#0a2266'], ['#9a4dff', '#dcc0ff', '#3d0f80'], ['#ff6a1f', '#ffc6a1', '#7a2700']] },
    planets: { style: 'planet', pal: [['#e8605a', '#ffd1c4', '#7a1f22'], ['#e8b45a', '#fff0c8', '#7a5214'], ['#5ac48a', '#d4ffe4', '#1d5c3c'], ['#5aa6e8', '#d4ecff', '#1d4a7a'], ['#9a7ae8', '#e6dcff', '#3d2a7a'], ['#e87ab8', '#ffdcf0', '#7a2a5a']] },
  };
  const BGS = {
    night: { stops: ['#0a0b24', '#1a1145', '#2b0f45'], blobs: [[0.15, 0.2, 0.55, '59,43,189'], [0.85, 0.45, 0.6, '122,31,143'], [0.4, 0.9, 0.7, '27,90,168']], flies: [0xb9a8ff, 0xffd36b, 0x7fe0ff, 0xff9ad8] },
    dawn: { stops: ['#1b1040', '#5a2a63', '#d9725a'], blobs: [[0.8, 0.9, 0.6, '255,170,100'], [0.2, 0.3, 0.5, '130,60,170'], [0.6, 0.1, 0.5, '60,40,140']], flies: [0xffd9a0, 0xffb38a, 0xffe9c4, 0xff9ad8] },
    ocean: { stops: ['#021526', '#04395e', '#0a6c8c'], blobs: [[0.3, 0.2, 0.6, '20,140,200'], [0.8, 0.7, 0.6, '0,90,140'], [0.5, 1, 0.7, '0,200,200']], flies: [0x9ff3ff, 0x7fe0ff, 0xc8fff4, 0x6fc8ff] },
    aurora: { stops: ['#040c1a', '#0c1f33', '#1a1036'], blobs: [[0.3, 0.15, 0.6, '40,220,160'], [0.75, 0.25, 0.55, '80,140,255'], [0.5, 0.85, 0.7, '150,60,200']], flies: [0x9effc8, 0x7fe0ff, 0xd0b8ff, 0xffffff], bands: true },
  };
  let PAL = SKINS.lumi.pal, STYLE = 'glow', BG = BGS.night;
  let TINT = [];
  function computeTint() {
    TINT = PAL.map((p) => parseInt(p[0].slice(1), 16)).concat([0xfff4fb, 0xffc54a, 0x8a90b0, 0xff4d6d, 0xffd36b, 0xff7a2e, 0x7fe0ff]);
  }
  computeTint();

  // ---- state ---------------------------------------------------------------
  const st = {
    mode: 'boot', gm: 'endless', lvl: null, grid: [], topShift: false, score: 0, shown: 0, best: 0,
    misses: 0, combo: 0, charge: 0, current: 0, next: 1, used: false, shot: null, push: 0, pushFrom: 0, pushT: 1,
    shots: null, starsGot: 0, rng: Math.random,
    aimA: -Math.PI / 2, aiming: false, aimVisible: false, pointerId: null, keyRot: 0, pathDirty: true, path: null,
    rbReadyAt: 0, tutorial: false, shake: 0, adActive: false, time: 0, land: false, danger: 0, started: false, fire: null,
  };
  let app, field, haloL, ballL, aimL, fxL, panelG, deadG, uiG, topG, textL, bgSprite, flyL, flies = [];
  const tex = {}; let u = 20, fx0 = 0, fy0 = 0, VW = 0, VH = 0;
  const fx = [], sparks = [], rings = [], pops = [], texts = [], bolts = [];
  const handlers = {};
  const emit = (ev, data) => (handlers[ev] || []).forEach((f) => { try { f(data); } catch (e) { console.error(e); } });

  // ---- textures --------------------------------------------------------------
  function canvas(n) { const c = document.createElement('canvas'); c.width = c.height = n; return [c, c.getContext('2d')]; }
  function disc(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, 7); }
  function shade(g, x, y, r, strong) {
    g.strokeStyle = 'rgba(255,255,255,.2)'; g.lineWidth = r * 0.06; disc(g, x, y, r * 0.96); g.stroke();
    const sp = g.createRadialGradient(x - r * 0.38, y - r * 0.42, 0, x - r * 0.38, y - r * 0.42, r * 0.44);
    sp.addColorStop(0, `rgba(255,255,255,${strong ? 0.95 : 0.85})`); sp.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sp; disc(g, x - r * 0.38, y - r * 0.42, r * 0.44); g.fill();
  }
  function glyph(g, type, x, y, r, alpha) {
    g.save(); g.translate(x, y); const a = alpha || 0.66;
    g.fillStyle = `rgba(255,255,255,${a})`; g.strokeStyle = `rgba(255,255,255,${a})`; g.lineWidth = r * 0.16;
    const s = r * 0.42; g.beginPath();
    if (type === 'dot') { g.arc(0, 0, s * 0.55, 0, 7); g.fill(); }
    else if (type === 'ring') { g.arc(0, 0, s * 0.7, 0, 7); g.stroke(); }
    else if (type === 'tri') { g.moveTo(0, -s); g.lineTo(s * 0.9, s * 0.62); g.lineTo(-s * 0.9, s * 0.62); g.closePath(); g.fill(); }
    else if (type === 'diamond') { g.moveTo(0, -s); g.lineTo(s * 0.75, 0); g.lineTo(0, s); g.lineTo(-s * 0.75, 0); g.closePath(); g.fill(); }
    else if (type === 'plus') { const w = s * 0.34; g.rect(-w, -s * 0.85, w * 2, s * 1.7); g.rect(-s * 0.85, -w, s * 1.7, w * 2); g.fill(); }
    else if (type === 'star') { for (let i = 0; i < 10; i++) { const an = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? s * 0.45 : s; g.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); } g.closePath(); g.fill(); }
    g.restore();
  }
  function starPath(g, x, y, R, r0) { g.beginPath(); for (let i = 0; i < 10; i++) { const an = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r0 : R; g.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); } g.closePath(); }

  function drawColorOrb(g, ci, x, y, r, pal, style) {
    const [base, hi, lo] = pal[ci];
    const sg = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    sg.addColorStop(0, hi); sg.addColorStop(0.42, base); sg.addColorStop(1, lo);
    g.fillStyle = sg; disc(g, x, y, r); g.fill();
    g.save(); disc(g, x, y, r); g.clip();
    if (style === 'candy') {
      g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = r * 0.2;
      for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(x - r + k * r * 0.62, y + r); g.lineTo(x + r * 0.2 + k * r * 0.62, y - r); g.stroke(); }
    } else if (style === 'gem') {
      const n = 8;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * 6.2832 - 0.2, a1 = ((i + 1) / n) * 6.2832 - 0.2;
        g.fillStyle = i % 2 ? 'rgba(255,255,255,.16)' : 'rgba(0,0,0,.16)';
        g.beginPath(); g.moveTo(x + Math.cos(a0) * r * 0.42, y + Math.sin(a0) * r * 0.42);
        g.lineTo(x + Math.cos(a0) * r * 1.05, y + Math.sin(a0) * r * 1.05); g.lineTo(x + Math.cos(a1) * r * 1.05, y + Math.sin(a1) * r * 1.05);
        g.lineTo(x + Math.cos(a1) * r * 0.42, y + Math.sin(a1) * r * 0.42); g.closePath(); g.fill();
      }
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = r * 0.04; g.beginPath();
      for (let i = 0; i <= n; i++) { const a = (i / n) * 6.2832 - 0.2; g.lineTo(x + Math.cos(a) * r * 0.42, y + Math.sin(a) * r * 0.42); }
      g.stroke();
    } else if (style === 'planet') {
      for (let k = 0; k < 5; k++) { g.fillStyle = k % 2 ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.14)'; g.fillRect(x - r, y - r + k * r * 0.42 + Math.sin(k * 1.7) * r * 0.06, r * 2, r * 0.22); }
      const sh = g.createRadialGradient(x - r * 0.5, y - r * 0.5, r * 0.6, x - r * 0.2, y - r * 0.2, r * 1.6);
      sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,20,.45)'); g.fillStyle = sh; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.restore();
    shade(g, x, y, r, style === 'candy');
    glyph(g, GLYPH[ci], x, y, r, style === 'gem' ? 0.75 : 0.66);
  }
  function drawSpecial(g, code, x, y, r) {
    if (code === RAINBOW) {
      for (let i = 0; i < 72; i++) { g.fillStyle = `hsl(${i * 5},92%,63%)`; g.beginPath(); g.moveTo(x, y); g.arc(x, y, r, (i / 72) * 6.2832 - 0.01, ((i + 1) / 72) * 6.2832 + 0.01); g.closePath(); g.fill(); }
      const w = g.createRadialGradient(x, y, 0, x, y, r);
      w.addColorStop(0, 'rgba(255,255,255,.75)'); w.addColorStop(0.35, 'rgba(255,255,255,.1)'); w.addColorStop(1, 'rgba(40,0,80,.35)');
      g.fillStyle = w; disc(g, x, y, r); g.fill(); shade(g, x, y, r);
    } else if (code === NOVA) {
      const ng = g.createRadialGradient(x, y, 0, x, y, r);
      ng.addColorStop(0, '#ffffff'); ng.addColorStop(0.45, '#fff2b0'); ng.addColorStop(1, '#ff9a2e');
      g.fillStyle = ng; disc(g, x, y, r); g.fill(); shade(g, x, y, r);
      g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath();
      for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, rr = i % 2 ? r * 0.16 : (i % 4 ? r * 0.42 : r * 0.66); g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      g.closePath(); g.fill();
    } else if (code === STONE) {
      const sg = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
      sg.addColorStop(0, '#c9cbd6'); sg.addColorStop(0.5, '#7d8196'); sg.addColorStop(1, '#3a3d4d');
      g.fillStyle = sg; disc(g, x, y, r); g.fill();
      g.save(); disc(g, x, y, r); g.clip();
      let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '20,22,34' : '230,232,240'},${0.12 + rnd() * 0.15})`; disc(g, x + (rnd() - 0.5) * r * 1.7, y + (rnd() - 0.5) * r * 1.7, r * (0.05 + rnd() * 0.12)); g.fill(); }
      g.strokeStyle = 'rgba(20,22,34,.55)'; g.lineWidth = r * 0.06; g.beginPath();
      g.moveTo(x - r * 0.5, y - r * 0.2); g.lineTo(x - r * 0.1, y + r * 0.05); g.lineTo(x + r * 0.05, y + r * 0.5); g.moveTo(x - r * 0.1, y + r * 0.05); g.lineTo(x + r * 0.45, y - r * 0.1); g.stroke();
      g.restore(); g.strokeStyle = 'rgba(255,255,255,.15)'; g.lineWidth = r * 0.05; disc(g, x, y, r * 0.96); g.stroke();
    } else if (code === BOMB) {
      const bg = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
      bg.addColorStop(0, '#6b5a8a'); bg.addColorStop(0.5, '#2a2240'); bg.addColorStop(1, '#120d1f');
      g.fillStyle = bg; disc(g, x, y, r); g.fill();
      const core = g.createRadialGradient(x, y + r * 0.1, 0, x, y + r * 0.1, r * 0.55);
      core.addColorStop(0, 'rgba(255,90,110,.95)'); core.addColorStop(1, 'rgba(255,60,90,0)');
      g.fillStyle = core; disc(g, x, y + r * 0.1, r * 0.55); g.fill();
      g.strokeStyle = 'rgba(255,120,140,.9)'; g.lineWidth = r * 0.1; g.setLineDash([r * 0.22, r * 0.16]); disc(g, x, y + r * 0.1, r * 0.62); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#ffd36b'; starPath(g, x + r * 0.55, y - r * 0.62, r * 0.26, r * 0.1); g.fill();
      shade(g, x, y, r);
    } else if (code === STAR) {
      const bg = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
      bg.addColorStop(0, '#6c6ad8'); bg.addColorStop(0.5, '#2d2b7a'); bg.addColorStop(1, '#141046');
      g.fillStyle = bg; disc(g, x, y, r); g.fill();
      g.shadowColor = '#ffd36b'; g.shadowBlur = r * 0.35; g.fillStyle = '#ffd36b'; starPath(g, x, y + r * 0.04, r * 0.7, r * 0.3); g.fill(); g.shadowBlur = 0;
      g.fillStyle = '#fff3c4'; starPath(g, x - r * 0.08, y - r * 0.04, r * 0.32, r * 0.14); g.fill();
      shade(g, x, y, r);
    } else if (code === FIRE) {
      const fg = g.createRadialGradient(x, y + r * 0.2, 0, x, y, r);
      fg.addColorStop(0, '#fff6c2'); fg.addColorStop(0.4, '#ffb02e'); fg.addColorStop(0.8, '#ff4d1f'); fg.addColorStop(1, '#a3120a');
      g.fillStyle = fg; disc(g, x, y, r); g.fill();
      g.fillStyle = 'rgba(255,250,220,.9)'; g.beginPath();
      g.moveTo(x, y - r * 0.7); g.bezierCurveTo(x + r * 0.55, y - r * 0.1, x + r * 0.45, y + r * 0.55, x, y + r * 0.6);
      g.bezierCurveTo(x - r * 0.45, y + r * 0.55, x - r * 0.5, y, x - r * 0.12, y - r * 0.2); g.bezierCurveTo(x - r * 0.05, y - r * 0.4, x, y - r * 0.5, x, y - r * 0.7); g.fill();
      shade(g, x, y, r);
    } else if (code === BOLT) {
      const bg = g.createRadialGradient(x, y, 0, x, y, r);
      bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.4, '#9ff0ff'); bg.addColorStop(1, '#1a6fd1');
      g.fillStyle = bg; disc(g, x, y, r); g.fill();
      g.fillStyle = '#ffffff'; g.strokeStyle = '#1a4fa0'; g.lineWidth = r * 0.06; g.beginPath();
      g.moveTo(x + r * 0.1, y - r * 0.72); g.lineTo(x - r * 0.4, y + r * 0.08); g.lineTo(x - r * 0.02, y + r * 0.08); g.lineTo(x - r * 0.14, y + r * 0.72);
      g.lineTo(x + r * 0.42, y - r * 0.12); g.lineTo(x + r * 0.04, y - r * 0.12); g.closePath(); g.fill(); g.stroke();
      shade(g, x, y, r);
    }
  }
  function orbCanvas(code, pal, style, N) {
    N = N || 128; const [c, g] = canvas(N), x = N / 2, y = N / 2, r = N / 2 - 2;
    if (code < 6) drawColorOrb(g, code, x, y, r, pal || PAL, style || STYLE); else drawSpecial(g, code, x, y, r);
    return c;
  }
  function iceOverlay() {
    const N = 128, [c, g] = canvas(N), x = N / 2, y = N / 2, r = N / 2 - 2;
    const ig = g.createRadialGradient(x - r * 0.2, y - r * 0.3, r * 0.2, x, y, r);
    ig.addColorStop(0, 'rgba(240,252,255,.55)'); ig.addColorStop(0.7, 'rgba(190,235,255,.45)'); ig.addColorStop(1, 'rgba(150,215,255,.8)');
    g.fillStyle = ig; disc(g, x, y, r); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 3; g.lineCap = 'round';
    [[-0.55, -0.1, -0.15, -0.5], [0.1, 0.55, 0.5, 0.15], [-0.3, 0.45, 0.05, 0.2], [0.25, -0.6, 0.55, -0.25]].forEach(([a, b, c2, d]) => { g.beginPath(); g.moveTo(x + a * r, y + b * r); g.lineTo(x + c2 * r, y + d * r); g.stroke(); });
    g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 4; disc(g, x, y, r * 0.94); g.stroke();
    return c;
  }
  function chamOverlay() {
    const N = 128, [c, g] = canvas(N), x = N / 2, y = N / 2, r = N / 2 - 4;
    g.lineWidth = 7; g.lineCap = 'round';
    for (let i = 0; i < 6; i++) { g.strokeStyle = `hsl(${i * 60},95%,70%)`; g.beginPath(); g.arc(x, y, r, (i / 6) * 6.2832 + 0.12, ((i + 1) / 6) * 6.2832 - 0.12); g.stroke(); }
    return c;
  }
  function softTex(n, inner) {
    const [c, g] = canvas(n), h = n / 2, gr = g.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(inner, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, n, n); return PX.Texture.from(c);
  }
  function ringTex(dash) {
    const n = 128, [c, g] = canvas(n); g.strokeStyle = '#fff';
    if (dash) { g.lineWidth = 4; g.setLineDash([12, 10]); g.beginPath(); g.arc(n / 2, n / 2, n / 2 - 6, 0, 7); g.stroke(); }
    else { g.lineWidth = 5; g.shadowColor = '#fff'; g.shadowBlur = 8; g.beginPath(); g.arc(n / 2, n / 2, n / 2 - 10, 0, 7); g.stroke(); }
    return PX.Texture.from(c);
  }
  function buildOrbTextures() {
    const old = tex.orb || [];
    tex.orb = [];
    for (let i = 0; i < NCODES; i++) tex.orb.push(PX.Texture.from(orbCanvas(i)));
    old.forEach((x) => x.destroy(true));
  }
  function buildTextures() {
    buildOrbTextures();
    tex.halo = softTex(128, 0.25); tex.spark = softTex(32, 0.3); tex.dot = softTex(32, 0.5);
    tex.ring = ringTex(false); tex.ghost = ringTex(true);
    tex.ice = PX.Texture.from(iceOverlay()); tex.cham = PX.Texture.from(chamOverlay());
  }
  function drawBackground() {
    const w = Math.max(2, Math.ceil(VW / 2)), h = Math.max(2, Math.ceil(VH / 2));
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, BG.stops[0]); gr.addColorStop(0.55, BG.stops[1]); gr.addColorStop(1, BG.stops[2]);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'lighter';
    for (const [x, y, r, col] of BG.blobs) {
      const rr = r * Math.max(w, h) * 0.6, rg = g.createRadialGradient(x * w, y * h, 0, x * w, y * h, rr);
      rg.addColorStop(0, `rgba(${col},.33)`); rg.addColorStop(1, `rgba(${col},0)`); g.fillStyle = rg; g.fillRect(0, 0, w, h);
    }
    if (BG.bands) {
      for (let k = 0; k < 3; k++) {
        g.strokeStyle = k === 1 ? 'rgba(90,160,255,.10)' : 'rgba(60,240,170,.12)'; g.lineWidth = h * (0.06 + k * 0.03);
        g.beginPath(); for (let x = 0; x <= w; x += 8) g.lineTo(x, h * (0.18 + k * 0.08) + Math.sin(x / w * 6 + k * 2) * h * 0.05); g.stroke();
      }
    }
    let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 90; i++) { const x = rnd() * w, y = rnd() * h; g.fillStyle = `rgba(210,200,255,${0.15 + rnd() * 0.45})`; g.beginPath(); g.arc(x, y, 0.4 + rnd() * 0.8, 0, 7); g.fill(); }
    if (bgSprite.texture && bgSprite.texture !== PX.Texture.EMPTY) bgSprite.texture.destroy(true);
    bgSprite.texture = PX.Texture.from(c); bgSprite.width = VW; bgSprite.height = VH;
  }

  // ---- grid helpers --------------------------------------------------------
  const shifted = (r) => !!(st.topShift ^ (r & 1));
  const colsIn = (r) => (shifted(r) ? COLS - 1 : COLS);
  const cellX = (r, c) => 1 + (shifted(r) ? 1 : 0) + 2 * c;
  const cellY = (r) => 1 + r * ROWH;
  const get = (r, c) => (r >= 0 && st.grid[r] ? st.grid[r][c] || null : null);
  function put(b, r, c) { while (st.grid.length <= r) st.grid.push(new Array(COLS).fill(null)); st.grid[r][c] = b; b.r = r; b.c = c; }
  function each(fn) { for (let r = 0; r < st.grid.length; r++) for (let c = 0; c < COLS; c++) { const b = st.grid[r][c]; if (b) fn(b, r, c); } }
  function nbrs(r, c) {
    const s = shifted(r), a = s ? c : c - 1, out = [[r, c - 1], [r, c + 1], [r - 1, a], [r - 1, a + 1], [r + 1, a], [r + 1, a + 1]];
    return out.filter(([rr, cc]) => rr >= 0 && cc >= 0 && cc < colsIn(rr));
  }
  const colored = (b) => b.color < 6;
  const colorsFor = (s) => (s < 1500 ? 4 : s < 5000 ? 5 : 6);
  const ncolors = () => (st.lvl ? st.lvl.colors : colorsFor(st.score));
  function missLimit() {
    if (st.gm === 'endless') return st.score < 4000 ? 6 : st.score < 12000 ? 5 : 4;
    return st.lvl && st.lvl.push ? st.lvl.push : 0;
  }
  const specialsNow = () => (st.gm === 'endless' ? LV.endlessSpecials(st.score) : st.lvl.specials);
  function present() { const set = new Set(); each((b) => { if (colored(b)) set.add(b.color); }); return [...set].sort(); }
  function pickPresent() { const p = present(); return p.length ? p[Math.floor(st.rng() * p.length)] : Math.floor(st.rng() * ncolors()); }
  function lowestRow() { for (let r = st.grid.length - 1; r >= 0; r--) if (st.grid[r].some(Boolean)) return r; return -1; }
  function trimRows() { while (st.grid.length && !st.grid[st.grid.length - 1].some(Boolean)) st.grid.pop(); }
  function countBalls() { let n = 0; each(() => n++); return n; }
  function codeOf(b) {
    if (b.color === STONE) return 's'; if (b.color === BOMB) return 'b'; if (b.color === STAR) return '*';
    return b.ice ? String.fromCharCode(97 + b.color) : b.cham ? String.fromCharCode(65 + b.color) : String(b.color);
  }

  // ---- sprites ---------------------------------------------------------------
  function orbSprites(code, haloAlpha) {
    const body = new PX.Sprite(tex.orb[code]); body.anchor.set(0.5); body.scale.set(1.96 / 128);
    const halo = new PX.Sprite(tex.halo); halo.anchor.set(0.5); halo.scale.set(4.4 / 128); halo.tint = TINT[code];
    halo.blendMode = 'add'; halo.alpha = haloAlpha;
    return { body, halo, ov: null };
  }
  function addOverlay(b, kind) {
    if (b.ov) { b.ov.destroy(); b.ov = null; }
    if (!kind) return;
    const s = new PX.Sprite(kind === 'ice' ? tex.ice : tex.cham); s.anchor.set(0.5); s.scale.set((kind === 'ice' ? 2.02 : 2.3) / 128);
    ballL.addChild(s); b.ov = s;
  }
  function newBall(code) {
    let color, ice = false, cham = false;
    if (typeof code === 'number') color = code;
    else if (code === 's') color = STONE; else if (code === 'b') color = BOMB; else if (code === '*') color = STAR;
    else { color = LV.colorOf(code); ice = code >= 'a' && code <= 'f'; cham = code >= 'A' && code <= 'F'; }
    const s = orbSprites(color, color === STONE ? 0.12 : 0.3);
    const b = { color, ice, cham, r: 0, c: 0, body: s.body, halo: s.halo, ov: null, jx: 0, jy: 0, vx: 0, vy: 0, sq: 0 };
    ballL.addChild(b.body); haloL.addChild(b.halo);
    if (ice) addOverlay(b, 'ice'); else if (cham) addOverlay(b, 'cham');
    return b;
  }
  function killSprites(o) { o.body.destroy(); o.halo.destroy(); if (o.ov) o.ov.destroy(); }
  function setOrb(o, code) { o.body.texture = tex.orb[code]; o.halo.tint = TINT[code]; }
  function place(o, x, y) { o.body.position.set(x, y); o.halo.position.set(x, y); if (o.ov) o.ov.position.set(x, y); }

  // ---- boards ------------------------------------------------------------------
  function clearBoard() {
    each((b) => killSprites(b)); st.grid = [];
    for (const f of fx) killSprites(f); fx.length = 0;
    for (const p of pops) killSprites(p.o); pops.length = 0;
    if (st.shot) { killSprites(st.shot); st.shot = null; }
  }
  function loadRows(rows, topShift) {
    clearBoard(); st.topShift = !!topShift;
    rows.forEach((s, r) => {
      st.grid.push(new Array(COLS).fill(null));
      for (let c = 0; c < colsIn(r); c++) { const ch = s[c]; if (ch && ch !== '.') put(newBall(ch), r, c); }
    });
    trimRows();
  }
  function rowCodes(r) { const row = st.grid[r]; return row ? row.map((b) => (b ? codeOf(b) : '.')) : null; }
  function pushRows(n) {
    for (let i = 0; i < n; i++) {
      st.topShift = !st.topShift;
      const codes = LV.genRow(st.rng, shifted(0), rowCodes(0), ncolors(), specialsNow());
      each((b) => { b.r += 1; });
      st.grid.unshift(new Array(COLS).fill(null));
      codes.forEach((ch, c) => { if (ch !== '.' && c < colsIn(0)) put(newBall(ch), 0, c); });
    }
    st.pushFrom = st.push - n * ROWH; st.push = st.pushFrom; st.pushT = 0;
    S.push(); st.pathDirty = true;
  }
  function resetRun() {
    Object.assign(st, { score: 0, shown: 0, misses: 0, combo: 0, charge: 0, used: false, push: 0, pushT: 1, danger: 0, starsGot: 0, started: false, fire: null, xpScore: 0, xpLose: false });
  }
  function setupRun(gm, cfg) {
    st.gm = gm; st.lvl = cfg || null;
    st.rng = cfg ? LV.rng(cfg.seed) : Math.random;
    resetRun();
    st.shots = cfg ? cfg.shots : null;
    if (cfg) loadRows(cfg.rows, false);
    else {
      const R = Math.random, rows = [];
      for (let r = 0; r < 6; r++) rows.push(LV.genRow(R, r % 2 === 1, r ? rows[r - 1] : null, 4, null).join(''));
      loadRows(rows, false);
    }
    st.current = pickPresent(); st.next = pickPresent();
    refreshShooter(true); st.pathDirty = true; updateHud(true);
  }

  // ---- shooter ---------------------------------------------------------------
  let cur, nxt, rb, aimDots = [], ghost;
  function refreshShooter(instant) { setOrb(cur, st.current); setOrb(nxt, st.next); if (instant) { cur.k = 1; nxt.k = 1; } }
  function loadAfterShot() { st.current = st.next; st.next = pickPresent(); cur.k = 0; nxt.k = 0; refreshShooter(false); }
  function fixColors() {
    const p = present(); if (p.length) {
      if (st.current < 6 && !p.includes(st.current)) st.current = p[Math.floor(st.rng() * p.length)];
      if (st.next < 6 && !p.includes(st.next)) st.next = p[Math.floor(st.rng() * p.length)];
    }
    if (st.charge >= CHARGE_MAX && st.current < 6) {
      st.next = st.current; st.current = NOVA; st.charge = 0;
      cur.k = 0; popText(t('novaReady'), SHX, SHY - 4.2, 0.95, '#ffd36b'); S.charge();
    }
    refreshShooter(false);
  }
  function swap() {
    if (st.mode !== 'play' || st.shot) return;
    const x = st.current; st.current = st.next; st.next = x; cur.k = 0.35; nxt.k = 0.35; refreshShooter(false); S.click();
    st.pathDirty = true; save();
  }
  function giveSpecial(code) {
    if (st.current < 6) st.next = st.current;
    st.current = code; cur.k = 0; refreshShooter(false); st.pathDirty = true; S.charge();
  }

  // ---- physics ---------------------------------------------------------------
  function hitTest(x, y) {
    if (y <= 1) return 'top';
    const r0 = Math.floor((y - 1) / ROWH);
    for (let r = Math.max(0, r0 - 1); r <= r0 + 1 && r < st.grid.length; r++) {
      const row = st.grid[r], yy = cellY(r) - y;
      for (let c = 0; c < COLS; c++) { if (!row[c]) continue; const dx = cellX(r, c) - x; if (dx * dx + yy * yy < 2.96) return row[c]; }
    }
    return null;
  }
  function advance(s, h) {
    s.x += s.dx * h; s.y += s.dy * h;
    if (s.x < 1) { s.x = 2 - s.x; s.dx = -s.dx; return true; }
    if (s.x > 21) { s.x = 42 - s.x; s.dx = -s.dx; return true; }
    return false;
  }
  function snapCell(x, y) {
    let best = null, bd = 1e9;
    const scan = (r0, r1) => {
      for (let r = Math.max(0, r0); r <= r1; r++) for (let c = 0; c < colsIn(r); c++) {
        if (get(r, c)) continue;
        if (r > 0 && !nbrs(r, c).some(([a, b]) => get(a, b))) continue;
        const d = (cellX(r, c) - x) ** 2 + (cellY(r) - y) ** 2; if (d < bd) { bd = d; best = [r, c]; }
      }
    };
    const r0 = Math.round((y - 1) / ROWH); scan(r0 - 1, r0 + 1);
    if (!best) scan(0, Math.max(st.grid.length, r0 + 1));
    return best || [0, 5];
  }
  function predict() {
    const s = { x: SHX, y: SHY, dx: Math.cos(st.aimA), dy: Math.sin(st.aimA) }, pts = [];
    let hit = null;
    for (let i = 0; i < 1400; i++) { advance(s, 0.05); pts.push(s.x, s.y); hit = hitTest(s.x, s.y); if (hit && (st.current !== FIRE || hit === 'top')) break; }
    return { pts, cell: st.current === FIRE ? null : snapCell(s.x, s.y) };
  }
  function shoot() {
    if (st.mode !== 'play' || st.shot || st.pushT < 1) return;
    if (st.shots !== null && st.shots <= 0) return;
    const color = st.current, o = orbSprites(color, 0.55);
    ballL.addChild(o.body); haloL.addChild(o.halo);
    st.shot = { ...o, color, x: SHX, y: SHY, dx: Math.cos(st.aimA), dy: Math.sin(st.aimA), acc: 0, trail: 0 };
    if (color === FIRE) { st.fire = { popped: [], drops: [] }; S.fire(); } else S.shoot();
    if (st.shots !== null) st.shots--;
    loadAfterShot(); updateHud();
    if (!st.tutorial) { st.tutorial = true; $('tip').hidden = true; }
  }
  function stepShot(dt) {
    const s = st.shot; s.acc += dt;
    while (s.acc >= STEP) {
      s.acc -= STEP;
      if (advance(s, SPEED * STEP)) S.bounce();
      const hit = hitTest(s.x, s.y);
      if (!hit) continue;
      if (s.color === FIRE) {
        if (hit === 'top') { finishFire(s); return; }
        burnOrb(hit);
        continue;
      }
      settle(s, hit); return;
    }
    s.trail += dt;
    if (s.trail > (s.color === FIRE ? 0.006 : 0.012)) {
      s.trail = 0;
      spark(s.x - s.dx * 0.6, s.y - s.dy * 0.6, s.color === FIRE ? (Math.random() < 0.5 ? 0xffb02e : 0xff4d1f) : TINT[s.color], s.color === FIRE ? 0.8 : 0.5, s.color === FIRE ? 2 : 0.18, 0.35);
    }
  }

  // ---- turn resolution -------------------------------------------------------
  function flood(b) {
    const seen = new Set([b]), q = [b];
    while (q.length) { const x = q.pop(); for (const [r, c] of nbrs(x.r, x.c)) { const n = get(r, c); if (n && colored(n) && n.color === b.color && !seen.has(n)) { seen.add(n); q.push(n); } } }
    return [...seen];
  }
  function floaters() {
    const seen = new Set(), q = [];
    for (let c = 0; c < COLS; c++) { const b = get(0, c); if (b) { seen.add(b); q.push(b); } }
    while (q.length) { const x = q.pop(); for (const [r, c] of nbrs(x.r, x.c)) { const n = get(r, c); if (n && !seen.has(n)) { seen.add(n); q.push(n); } } }
    const out = []; each((b) => { if (!seen.has(b)) out.push(b); }); return out;
  }
  function detach(b) { if (st.grid[b.r] && st.grid[b.r][b.c] === b) st.grid[b.r][b.c] = null; }
  function vis(b) { return [cellX(b.r, b.c) + b.jx, cellY(b.r) + st.push + b.jy]; }
  /** bombs next to (or inside) the popped set explode, chaining */
  function chainBombs(popped) {
    const set = new Set(popped), queue = [];
    for (const b of popped) {
      if (b.color === BOMB) queue.push(b);
      for (const [r, c] of nbrs(b.r, b.c)) { const n = get(r, c); if (n && n.color === BOMB && !set.has(n)) { set.add(n); popped.push(n); queue.push(n); } }
    }
    const done = new Set();
    while (queue.length) {
      const bomb = queue.shift(); if (done.has(bomb)) continue; done.add(bomb);
      const [x, y] = vis(bomb); blast(x, y);
      for (const [r, c] of nbrs(bomb.r, bomb.c)) {
        const n = get(r, c); if (!n || set.has(n)) continue;
        set.add(n); popped.push(n); if (n.color === BOMB) queue.push(n);
      }
    }
    return popped;
  }
  function thaw(b) {
    b.ice = false; addOverlay(b, null);
    const [x, y] = vis(b); ring(x, y, 0xcff4ff, 0.6, 2.2, 0.3, 0.8);
    for (let i = 0; i < 10; i++) spark(x, y, 0xe6fbff, 0.35, 7, 0.4);
  }
  function burnOrb(b) {
    const [x, y] = vis(b);
    const list = chainBombs([b]);
    list.forEach(detach);
    list.forEach((o, i) => { const [ox, oy] = vis(o); pops.push({ o, x: ox, y: oy, t: -i * 0.02, i, combo: 2, color: o.color, started: false, silent: o !== b }); });
    st.fire.popped.push(...list); S.burn();
    for (let i = 0; i < 6; i++) spark(x, y, i % 2 ? 0xffb02e : 0xff4d1f, 0.5, 8, 0.4);
  }
  function finishFire(s) {
    killSprites(s); st.shot = null;
    ring(s.x, 1, 0xff7a2e, 1, 4, 0.4, 0.8);
    const drops = floaters(); drops.forEach(detach);
    const popped = st.fire.popped; st.fire = null;
    afterTurn({ X: s.x, Y: 3, popped, drops, thawed: [], kind: FIRE, animated: true });
  }
  function settle(s, hit) {
    const [r, c] = snapCell(s.x, s.y), X = cellX(r, c), Y = cellY(r);
    const kind = s.color; let popped = [];
    const thawed = [];
    st.shot = null; killSprites(s);
    if (kind === NOVA) {
      each((b, br, bc) => { const dx = cellX(br, bc) - X, dy = cellY(br) - Y; if (dx * dx + dy * dy <= 16.4) popped.push(b); });
      novaBurst(X, Y + st.push); M.track('nova', 1);
    } else if (kind === BOLT) {
      const rr = hit && hit !== 'top' ? hit.r : r;
      each((b) => { if (b.r === rr) popped.push(b); });
      boltFx(cellY(rr) + st.push); S.zap();
    } else {
      let color = kind;
      if (kind === RAINBOW) {
        if (hit && hit !== 'top' && colored(hit)) color = hit.color;
        else { const n = nbrs(r, c).map(([a, b2]) => get(a, b2)).find((x) => x && colored(x)); color = n ? n.color : pickPresent(); }
      }
      const b = newBall(color); put(b, r, c); b.sq = 1; nudge(X, Y); S.stick();
      const grp = flood(b);
      if (grp.length >= 3) for (const g of grp) (g.ice ? thawed : popped).push(g);
    }
    chainBombs(popped);
    popped.forEach(detach);
    if (thawed.length) { thawed.forEach(thaw); S.ice(); }
    const drops = floaters(); drops.forEach(detach);
    afterTurn({ X, Y, popped, drops, thawed, kind });
  }
  function afterTurn(o) {
    const { X, Y, popped, drops, thawed, kind } = o;
    const success = popped.length > 0 || thawed.length > 0;
    if (success) st.combo++; else { st.combo = 0; st.misses++; }
    const mult = Math.max(1, Math.min(st.combo, 10));
    const gained = (popped.length * 10 + drops.length * 20 + thawed.length * 10) * mult;
    st.score += gained;
    if (kind < 6 || kind === RAINBOW) st.charge = Math.min(CHARGE_MAX, st.charge + popped.length + drops.length);
    const stars = popped.concat(drops).filter((b) => b.color === STAR).length;
    if (stars) { st.starsGot += stars; S.star(); }

    if (!o.animated) {
      popped.sort((a, b) => ((cellX(a.r, a.c) - X) ** 2 + (cellY(a.r) - Y) ** 2) - ((cellX(b.r, b.c) - X) ** 2 + (cellY(b.r) - Y) ** 2));
      popped.forEach((b, i) => { const [x, y] = vis(b); pops.push({ o: b, x, y, t: -Math.min(i * 0.035, 0.7), i, combo: st.combo, color: b.color, started: false }); });
    }
    drops.forEach((b) => { const [x, y] = vis(b); fx.push({ body: b.body, halo: b.halo, ov: b.ov, x, y, vx: (Math.random() - 0.5) * 7, vy: -2 - Math.random() * 5, rot: (Math.random() - 0.5) * 6, flashed: false, color: b.color }); });
    if (drops.length) S.drop(drops.length);
    if (gained) popText('+' + fmt(gained), X, Y + st.push - 1.6, 0.9 + Math.min(drops.length, 10) * 0.04, '#f6f1ff');
    if (stars) popText(st.lvl && st.lvl.goal === 'stars' ? t('goalStarsP', { a: Math.min(st.starsGot, st.lvl.target), b: st.lvl.target }) : '★ +' + stars, 11, 14, 1.0, '#ffd36b');
    if (st.combo >= 2) comboText();

    const doneQ = [].concat(M.track('pop', popped.length), M.track('drop', drops.length), M.track('combo', st.combo), M.track('ice', thawed.length), M.track('star', stars));
    if (doneQ.length) emit('quest', doneQ);

    trimRows();
    cycleChameleons();
    if (!st.grid.length && st.gm !== 'level') {
      st.score += 1500; popText(t('clear') + '  +1500', 11, 12, 1.4, '#ffd36b'); S.clear(); burstAll();
      pushRows(4);
    } else if (missLimit() && st.misses >= missLimit()) {
      st.misses = 0; pushRows(1);
    }
    fixColors(); st.pathDirty = true; updateHud();
    if (lowestRow() >= DEAD) return endRun('line');
    if (st.gm === 'level' && goalMet()) return win();
    if (st.shots !== null && st.shots <= 0) return endRun('shots');
    checkIntro();
    save();
  }
  function cycleChameleons() {
    const p = present(); if (p.length < 2) return;
    each((b) => {
      if (!b.cham) return;
      b.color = p[(p.indexOf(b.color) + 1) % p.length]; if (b.color === undefined) b.color = p[0];
      setOrb(b, b.color); b.sq = 0.6;
    });
  }
  function goalMet() {
    const L = st.lvl; if (!L) return false;
    if (L.goal === 'clear') return countBalls() === 0;
    if (L.goal === 'stars') return st.starsGot >= L.target;
    return st.score >= L.target;
  }
  function nudge(X, Y) {
    each((b, r, c) => {
      const dx = cellX(r, c) - X, dy = cellY(r) - Y, d = Math.hypot(dx, dy);
      if (d > 0.1 && d < 4.5) { const f = 3.2 / (d * d); b.vx += (dx / d) * f; b.vy += (dy / d) * f; }
    });
  }

  // ---- run end -----------------------------------------------------------------
  function stopPlay(mode) { if (mode === 'over' || mode === 'won') st.runLive = false; st.mode = mode; st.aiming = false; st.keyRot = 0; P.gameplayStop(); st.started = false; }
  function endRun(reason) {
    if (st.gm === 'daily') {
      stopPlay('over'); S.over(); const sparksGot = M.dailyResult(st.score); M.track('daily', 1);
      const xp = M.addXp(30 + st.score / 100); save();
      later(() => emit('end', { type: 'daily', score: st.score, best: M.d.daily.best, sparks: sparksGot, xp })); return;
    }
    stopPlay('over'); S.over();
    if (st.gm === 'endless') {
      const rec = st.score > st.best && st.score > 0; if (rec) st.best = st.score;
      M.track('score', st.score);
      const xp = M.addXp((st.score - st.xpScore) / 40); st.xpScore = st.score; save();
      later(() => emit('end', { type: 'over', score: st.score, best: st.best, record: rec, canContinue: !st.used, sparks: Math.min(80, Math.floor(st.score / 250)), xp }));
    } else {
      const xp = M.addXp(st.xpLose ? 0 : 10); st.xpLose = true; save();
      later(() => emit('end', { type: 'lose', n: st.lvl.n, reason, score: st.score, canContinue: !st.used, progress: goalText(), xp }));
    }
  }
  function win() {
    stopPlay('won');
    const left = st.shots || 0, bonus = left * 60; st.score += bonus;
    const ratio = left / st.lvl.shots, stars = ratio >= 0.3 ? 3 : ratio >= 0.12 ? 2 : 1;
    S.win(); burstAll();
    const sparksGot = M.levelResult(st.lvl.n, stars); M.track('level', 1);
    const doneQ = M.track('score', st.score); if (doneQ.length) emit('quest', doneQ);
    const cons = M.claimConstellations(), xp = M.addXp(40 + 15 * stars);
    updateHud(); save();
    later(() => emit('end', { type: 'win', n: st.lvl.n, stars, score: st.score, bonus, sparks: sparksGot, last: st.lvl.n >= LV.TOTAL, xp, cons }), 900);
  }
  function later(fn, ms) { setTimeout(fn, ms || 650); }
  /** endless: called when the player leaves the game-over card without continuing */
  function finalizeEndless() {
    if (st.gm !== 'endless' || st.mode !== 'over' || st.finalized) return 0;
    st.finalized = true;
    P.submitScore && P.submitScore(st.score);
    return M.endlessResult(st.score);
  }
  async function continueRun() {
    const ok = await reward(); if (!ok) return false;
    st.used = true;
    if (st.gm === 'level' && st.shots !== null && st.shots <= 0 && lowestRow() < DEAD) {
      st.shots += 5;
    } else {
      const cut = DEAD - 6, gone = [];
      each((b) => { if (b.r >= cut) gone.push(b); });
      gone.forEach(detach); floaters().forEach((b) => { gone.push(b); detach(b); });
      gone.forEach((b) => { const [x, y] = vis(b); fx.push({ body: b.body, halo: b.halo, ov: b.ov, x, y, vx: (Math.random() - 0.5) * 6, vy: -3 - Math.random() * 4, rot: (Math.random() - 0.5) * 6, flashed: false, color: b.color }); });
      ring(11, cut * ROWH, 0xffcc4d, 2, 14, 0.6, 0.6); S.nova();
      trimRows(); if (st.gm === 'level' && st.shots !== null && st.shots <= 0) st.shots += 5;
    }
    st.misses = 0; fixColors(); st.pathDirty = true; st.mode = 'play'; st.runLive = true; st.finalized = false; updateHud(); save();
    return true;
  }

  // ---- effects ---------------------------------------------------------------
  function spark(x, y, tint, size, speed, life) {
    if (sparks.length > (REDUCED ? 150 : 520)) return;
    const s = new PX.Sprite(tex.spark); s.anchor.set(0.5); s.blendMode = 'add'; s.tint = tint;
    const a = Math.random() * 6.2832, v = speed * (0.4 + Math.random());
    const sz = size * (0.5 + Math.random() * 0.8); s.scale.set(sz / 16);
    sparks.push({ s, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, t: 0, sz }); fxL.addChild(s);
  }
  function ring(x, y, tint, r0, r1, life, alpha) {
    const s = new PX.Sprite(tex.ring); s.anchor.set(0.5); s.blendMode = 'add'; s.tint = tint; fxL.addChild(s);
    rings.push({ s, x, y, r0, r1, life, t: 0, a: alpha });
  }
  function burst(x, y, color, n) {
    const tn = TINT[color] || 0xffffff;
    for (let i = 0; i < n; i++) spark(x, y, i % 4 ? tn : 0xffffff, 0.42, 9, 0.45 + Math.random() * 0.35);
    ring(x, y, tn, 0.8, 2.6, 0.32, 0.7);
  }
  function blast(x, y) {
    S.boom(); st.shake = Math.max(st.shake, REDUCED ? 0 : 0.25);
    ring(x, y, 0xff4d6d, 0.8, 4.4, 0.4, 0.9);
    for (let i = 0; i < 28; i++) spark(x, y, i % 3 ? 0xff6a5a : 0xffd36b, 0.55, 13, 0.5);
  }
  function novaBurst(x, y) {
    S.nova(); st.shake = REDUCED ? 0 : 0.45;
    ring(x, y, 0xffcc4d, 1, 7, 0.5, 0.9); ring(x, y, 0xffffff, 0.6, 4.6, 0.38, 0.8);
    for (let i = 0; i < 70; i++) spark(x, y, i % 3 ? 0xffc54a : 0xffffff, 0.6, 18, 0.5 + Math.random() * 0.5);
  }
  function boltFx(y) {
    const g = new PX.Graphics(); fxL.addChild(g);
    let px = 0.5, py = y; g.moveTo(px, py);
    for (let x = 1.5; x <= 22; x += 1) { py = y + (Math.random() - 0.5) * 0.9; g.lineTo(x, py); }
    g.stroke({ width: 0.25, color: 0xffffff }); g.blendMode = 'add';
    bolts.push({ g, t: 0 });
    for (let i = 0; i < 30; i++) spark(Math.random() * 22, y, i % 2 ? 0x7fe0ff : 0xffffff, 0.45, 6, 0.4);
    st.shake = Math.max(st.shake, REDUCED ? 0 : 0.2);
  }
  function burstAll() { for (let i = 0; i < 6; i++) setTimeout(() => burst(3 + Math.random() * 16, 3 + Math.random() * 10, Math.floor(Math.random() * 6), 24), i * 110); }
  function popText(text, x, y, scale, color) {
    const tx = new PX.Text({ text, style: { fontFamily: 'Lumi, sans-serif', fontWeight: '800', fontSize: Math.round(u * 1.15 * scale), fill: color,
      dropShadow: { color: '#7d5cff', blur: Math.round(u * 0.5), distance: 0, alpha: 0.9, angle: 0 } } });
    tx.anchor.set(0.5); textL.addChild(tx);
    texts.push({ t: tx, x, y, life: 1.1, age: 0, kind: 'float' });
  }
  function comboText() {
    const tx = new PX.Text({ text: `${t('combo')} ×${st.combo}`, style: { fontFamily: 'Lumi, sans-serif', fontWeight: '800', fontSize: Math.round(u * 1.5), fill: '#ffd36b', letterSpacing: 1,
      dropShadow: { color: '#ff9a2e', blur: Math.round(u * 0.8), distance: 0, alpha: 0.9, angle: 0 } } });
    tx.anchor.set(0.5); textL.addChild(tx);
    texts.push({ t: tx, x: 11, y: 16.8, life: 1.0, age: 0, kind: 'combo' });
  }

  // ---- intro cards for new special orbs ----------------------------------------
  function checkIntro() {
    if (st.mode !== 'play') return;
    const kinds = new Set();
    each((b) => { if (b.ice) kinds.add('ice'); if (b.cham) kinds.add('cham'); if (b.color === STONE) kinds.add('stone'); if (b.color === BOMB) kinds.add('bomb'); if (b.color === STAR) kinds.add('star'); });
    for (const k of ['star', 'ice', 'bomb', 'stone', 'cham']) {
      if (kinds.has(k) && !M.d.seen['sp_' + k]) {
        M.d.seen['sp_' + k] = 1; st.mode = 'intro'; st.aiming = false; P.gameplayStop(); st.started = false;
        emit('intro', { kind: k, img: previewSpecial(k) });
        return;
      }
    }
  }
  function previewSpecial(k) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const code = { star: STAR, bomb: BOMB, stone: STONE }[k];
    if (code !== undefined) g.drawImage(orbCanvas(code), 0, 0);
    else { g.drawImage(orbCanvas(3), 0, 0); g.drawImage(k === 'ice' ? iceOverlay() : chamOverlay(), 0, 0); }
    return c.toDataURL();
  }

  // ---- per-frame update ------------------------------------------------------
  function update(dt) {
    st.time += dt;
    const live = (st.mode === 'play' || st.mode === 'over' || st.mode === 'won' || st.mode === 'menu') && !st.adActive;
    const gdt = live ? dt : 0;
    if (st.mode === 'play' && !st.adActive) {
      if (st.keyRot) { st.aimA = clampAim(st.aimA + st.keyRot * 1.5 * dt); st.pathDirty = true; }
      if (st.shot) stepShot(dt);
    }
    if (st.pushT < 1) { st.pushT = Math.min(1, st.pushT + gdt / 0.38); const k = 1 - Math.pow(1 - st.pushT, 3); st.push = st.pushFrom * (1 - k); }

    each((b, r, c) => {
      if (gdt) { const ax = -170 * b.jx - 13 * b.vx, ay = -170 * b.jy - 13 * b.vy; b.vx += ax * gdt; b.vy += ay * gdt; b.jx += b.vx * gdt; b.jy += b.vy * gdt; }
      const x = cellX(r, c) + b.jx, y = cellY(r) + st.push + b.jy;
      place(b, x, y);
      if (b.sq > 0) { b.sq = Math.max(0, b.sq - gdt * 5); const s = 1 + Math.sin(b.sq * Math.PI) * 0.16; b.body.scale.set(1.96 / 128 * s); }
      if (b.cham && b.ov) b.ov.rotation += gdt * 1.2;
      b.halo.alpha = (b.color === STONE ? 0.12 : 0.3) + (st.danger > 0.5 && r >= DEAD - 3 ? 0.25 * (0.5 + 0.5 * Math.sin(st.time * 8)) : 0) + (b.color === STAR ? 0.2 * Math.sin(st.time * 3) + 0.15 : 0);
    });
    if (st.shot) { const s = st.shot; place(s, s.x, s.y); if (s.color === FIRE) s.body.rotation += dt * 9; }

    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i]; p.t += gdt;
      if (p.t >= 0 && !p.started) { p.started = true; burst(p.x, p.y, p.color, REDUCED ? 6 : 14); if (!p.silent) S.pop(p.i % 12, Math.min(p.combo, 4)); }
      if (p.t >= 0) { const k = Math.min(1, p.t / 0.16); p.o.body.scale.set(1.96 / 128 * (1 + k * 0.4)); p.o.body.alpha = 1 - k; p.o.halo.alpha = 0.6 * (1 - k); if (p.o.ov) p.o.ov.alpha = 1 - k; }
      place(p.o, p.x, p.y);
      if (p.t >= 0.16) { killSprites(p.o); pops.splice(i, 1); }
    }
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]; f.vy += 70 * gdt; f.x += f.vx * gdt; f.y += f.vy * gdt; f.body.rotation += f.rot * gdt;
      if (f.x < 1 || f.x > 21) f.vx = -f.vx * 0.6;
      place(f, f.x, f.y);
      if (!f.flashed && f.y > DEAD_Y + 1) { f.flashed = true; burst(f.x, f.y, f.color, REDUCED ? 4 : 8); }
      if (f.y > DEAD_Y + 1) { const a = Math.max(0, 1 - (f.y - DEAD_Y - 1) / 5); f.body.alpha = a; f.halo.alpha = 0.4 * a; if (f.ov) f.ov.alpha = a; }
      if (f.y > 29) { killSprites(f); fx.splice(i, 1); }
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i]; p.t += gdt; const k = p.t / p.life;
      if (k >= 1) { p.s.destroy(); sparks.splice(i, 1); continue; }
      p.vx *= 1 - 3.2 * gdt; p.vy = p.vy * (1 - 3.2 * gdt) + 6 * gdt; p.x += p.vx * gdt; p.y += p.vy * gdt;
      p.s.position.set(p.x, p.y); p.s.alpha = 1 - k * k; p.s.scale.set(p.sz / 16 * (1 - k * 0.6));
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const p = rings[i]; p.t += gdt; const k = Math.min(1, p.t / p.life);
      if (k >= 1) { p.s.destroy(); rings.splice(i, 1); continue; }
      const e = 1 - Math.pow(1 - k, 2), rr = p.r0 + (p.r1 - p.r0) * e;
      p.s.position.set(p.x, p.y); p.s.scale.set((rr * 2) / 108); p.s.alpha = p.a * (1 - k);
    }
    for (let i = bolts.length - 1; i >= 0; i--) { const b = bolts[i]; b.t += gdt; b.g.alpha = Math.max(0, 1 - b.t / 0.35); if (b.t > 0.35) { b.g.destroy(); bolts.splice(i, 1); } }
    for (let i = texts.length - 1; i >= 0; i--) {
      const p = texts[i]; p.age += gdt; const k = p.age / p.life;
      if (k >= 1) { p.t.destroy(); texts.splice(i, 1); continue; }
      if (p.kind === 'float') { p.t.position.set(fx0 + p.x * u, fy0 + (p.y - k * 1.6) * u); p.t.alpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3; p.t.scale.set(k < 0.12 ? 0.6 + k / 0.12 * 0.4 : 1); }
      else { p.t.position.set(fx0 + p.x * u, fy0 + p.y * u); p.t.rotation = -0.06; const s = k < 0.15 ? 1.5 - k / 0.15 * 0.5 : 1; p.t.scale.set(s); p.t.alpha = k < 0.65 ? 1 : 1 - (k - 0.65) / 0.35; }
    }

    cur.k = Math.min(1, cur.k + dt / 0.14); nxt.k = Math.min(1, nxt.k + dt / 0.18);
    const ek = 1 - Math.pow(1 - cur.k, 3);
    const cx = NEXT_X + (SHX - NEXT_X) * ek, cy = NEXT_Y + (SHY - NEXT_Y) * ek;
    const cs = 0.72 + (1.05 - 0.72) * ek, pulse = 1 + Math.sin(st.time * 3) * 0.04;
    place(cur, cx, cy); cur.body.scale.set(1.96 / 128 * cs); cur.halo.scale.set(5.6 / 128 * cs * pulse);
    cur.halo.alpha = st.current >= 6 ? 0.9 : 0.6; if (st.current === FIRE) cur.body.rotation += dt * 3; else cur.body.rotation = 0;
    place(nxt, NEXT_X, NEXT_Y);
    const ns = 0.72 * (1 - Math.pow(1 - nxt.k, 3)); nxt.body.scale.set(1.96 / 128 * ns); nxt.halo.scale.set(4.4 / 128 * ns);
    const rbOn = rbAvailable();
    rb.body.alpha = rbOn ? 1 : 0.3; rb.halo.alpha = rbOn ? 0.35 + Math.sin(st.time * 2.4) * 0.1 : 0.08; rb.body.rotation += dt * 0.6;

    const target = lowestRow() >= DEAD - 2 ? 1 : 0;
    st.danger += (target - st.danger) * Math.min(1, dt * 4);
    updateAim(); drawUI();

    if (st.shown !== st.score && !st.lvl) { st.shown += (st.score - st.shown) * Math.min(1, dt * 9); if (Math.abs(st.score - st.shown) < 1) st.shown = st.score; $('score').textContent = fmt(st.shown); }
    if (st.shake > 0) { st.shake = Math.max(0, st.shake - dt); const m = st.shake * u * 0.7; field.position.set(fx0 + (Math.random() - 0.5) * m, fy0 + (Math.random() - 0.5) * m); }
    else field.position.set(fx0, fy0);
    for (const f of flies) {
      f.y -= f.v * dt; f.x += Math.sin(st.time * f.w + f.p) * 8 * dt;
      if (f.y < -20) { f.y = VH + 20; f.x = Math.random() * VW; }
      f.s.position.set(f.x, f.y); f.s.alpha = f.a * (0.55 + 0.45 * Math.sin(st.time * f.tw + f.p));
    }
  }
  const rbAvailable = () => Date.now() >= st.rbReadyAt && st.current !== RAINBOW;

  function updateAim() {
    const show = st.mode === 'play' && !st.shot && st.aimVisible && st.pushT >= 1;
    aimL.visible = show; if (!show) return;
    if (st.pathDirty) { st.path = predict(); st.pathDirty = false; }
    const { pts, cell } = st.path, n = pts.length / 2;
    const tint = st.current === FIRE ? 0xff8a3a : st.current === BOLT ? 0x7fe0ff : TINT[st.current];
    const phase = (st.time * 2.2) % 0.95;
    for (let k = 0; k < aimDots.length; k++) {
      const d = 2.1 + k * 0.95 + phase, idx = Math.floor(d / 0.05), dot = aimDots[k];
      if (idx >= n - 8) { dot.visible = false; continue; }
      dot.visible = true; dot.tint = tint; dot.position.set(pts[idx * 2], pts[idx * 2 + 1]);
      dot.alpha = Math.max(0.18, 0.95 - k * 0.028); dot.scale.set((0.42 - k * 0.004) / 16);
    }
    ghost.visible = !!cell; if (cell) { ghost.position.set(cellX(cell[0], cell[1]), cellY(cell[0]) + st.push); ghost.tint = tint; ghost.alpha = 0.55 + 0.25 * Math.sin(st.time * 5); }
  }

  // ---- screen-space UI -------------------------------------------------------
  function drawPanel() {
    panelG.clear();
    panelG.roundRect(fx0 - 0.5 * u, fy0 - 0.5 * u, FIELD_W * u, (FIELD_H - 0.1) * u, u * 1.2).fill({ color: 0xffffff, alpha: 0.035 }).stroke({ width: 1.2, color: 0xbeafff, alpha: 0.16 });
    deadG.clear();
    const y = fy0 + DEAD_Y * u, dash = u * 0.7, gap = u * 0.55;
    for (let x = fx0 + 0.2 * u; x < fx0 + 21.8 * u; x += dash + gap) deadG.moveTo(x, y).lineTo(Math.min(x + dash, fx0 + 21.8 * u), y);
    deadG.stroke({ width: Math.max(1.5, u * 0.09), color: 0xff6e96, alpha: 1 });
  }
  function drawUI() {
    deadG.alpha = 0.45 + st.danger * (0.35 + 0.2 * Math.sin(st.time * 7));
    deadG.tint = st.danger > 0.5 ? 0xff4d6d : 0xffffff;
    uiG.clear();
    const X = fx0 + SHX * u, Y = fy0 + SHY * u, R = 1.75 * u;
    uiG.circle(X, Y, R).stroke({ width: u * 0.28, color: 0xffffff, alpha: 0.12 });
    const k = st.current === NOVA ? 1 : st.charge / CHARGE_MAX;
    if (k > 0.001) uiG.moveTo(X, Y - R).arc(X, Y, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k).stroke({ width: u * 0.28, color: 0xffcc4d, alpha: st.current === NOVA ? 0.6 + 0.4 * Math.sin(st.time * 8) : 1, cap: 'round' });
    const lim = missLimit();
    if (lim) {
      const left = lim - st.misses, dx = u * 0.8, x0 = X - ((lim - 1) * dx) / 2;
      for (let i = 0; i < lim; i++) uiG.circle(x0 + i * dx, Y + u * 2.55, u * 0.17).fill({ color: 0xe9e4ff, alpha: i < left ? (left === 1 ? 0.6 + 0.4 * Math.sin(st.time * 9) : 0.85) : 0.16 });
    }
    const sx = fx0 + (SHX - 2.25) * u, sy = fy0 + (SHY + 0.5) * u;
    uiG.moveTo(sx + Math.cos(3.6) * u * 0.9, sy + Math.sin(3.6) * u * 0.9).arc(sx, sy, u * 0.9, 3.6, 5.6).stroke({ width: 1.6, color: 0xe9e4ff, alpha: 0.5 });
    topG.clear();
    if (rbAvailable()) {
      const bx = fx0 + (RB_X + 0.2) * u, by = fy0 + (RB_Y - 1.55) * u, bw = u * 1.5, bh = u * 0.95;
      topG.roundRect(bx, by, bw, bh, bh / 2).fill({ color: 0xffcc4d });
      topG.poly([bx + bw * 0.38, by + bh * 0.25, bx + bw * 0.68, by + bh * 0.5, bx + bw * 0.38, by + bh * 0.75]).fill({ color: 0x2a1a00 });
    }
  }

  // ---- layout ----------------------------------------------------------------
  function layout() {
    VW = window.innerWidth; VH = window.innerHeight;
    const R = $('safe').getBoundingClientRect(), W = R.width || VW, H = R.height || VH, ox = R.left, oy = R.top;
    let uu = Math.min((H - 24) / FIELD_H, (W - 24) / FIELD_W);
    const side = (W - FIELD_W * uu) / 2;
    st.land = side >= 230;
    const TOP = 84, BOTTOM = 70;
    if (!st.land) uu = Math.min((W - 16) / FIELD_W, (H - TOP - BOTTOM) / FIELD_H);
    u = Math.max(6, uu);
    const fw = FIELD_W * u, fh = FIELD_H * u, left = ox + (W - fw) / 2;
    const top = st.land ? oy + (H - fh) / 2 : oy + TOP + Math.max(0, (H - TOP - BOTTOM - fh) / 2);
    fx0 = left + 0.5 * u; fy0 = top + 0.5 * u;
    field.scale.set(u); field.position.set(fx0, fy0);
    document.body.classList.toggle('land', st.land);
    const hud = $('hud'), btns = $('btns'), keys = $('keys'), boost = $('boost');
    if (st.land) {
      const pad = Math.max(24, side * 0.16);
      Object.assign(hud.style, { left: ox + pad + 'px', top: oy + 40 + 'px', width: side - pad * 1.5 + 'px' });
      Object.assign(btns.style, { left: ox + W - 24 - 148 + 'px', top: oy + 24 + 'px' });
      Object.assign(keys.style, { left: ox + pad + 'px', bottom: (VH - (oy + H)) + 36 + 'px', top: 'auto' });
      const bx = left + fw + Math.max(24, (side - 92) / 2);
      Object.assign(boost.style, { left: bx + 'px', top: oy + H / 2 + 'px', transform: 'translateY(-50%)', flexDirection: 'column' });
    } else {
      Object.assign(hud.style, { left: left + 6 + 'px', top: oy + 14 + 'px', width: fw - 170 + 'px' });
      Object.assign(btns.style, { left: left + fw - 154 + 'px', top: oy + 18 + 'px' });
      const by = Math.min(oy + H - 62, top + fh + 6);
      Object.assign(boost.style, { left: ox + W / 2 + 'px', top: by + 'px', transform: 'translateX(-50%)', flexDirection: 'row' });
    }
    const tip = $('tip'); tip.style.left = fx0 + SHX * u + 'px'; tip.style.top = fy0 + (SHY - 2.5) * u + 'px';
    drawBackground(); drawPanel();
    const m = field.mask; m.clear(); m.rect(-0.5, -0.5, FIELD_W, FIELD_H - 0.1).fill(0xffffff);
  }

  // ---- input -----------------------------------------------------------------
  function toUnit(e) { return [(e.clientX - fx0) / u, (e.clientY - fy0) / u]; }
  function clampAim(a) { return Math.max(-Math.PI + 0.2, Math.min(-0.2, a)); }
  function aimAt(ux, uy) {
    let dy = uy - SHY; const dx = ux - SHX; if (dy > -0.6) dy = -0.6;
    const a = clampAim(Math.atan2(dy, dx));
    if (Math.abs(a - st.aimA) > 1e-4) { st.aimA = a; st.pathDirty = true; }
  }
  const near = (ux, uy, x, y, r) => (ux - x) ** 2 + (uy - y) ** 2 < r * r;
  function firstInput() { if (!st.started) { st.started = true; P.gameplayStart(); } }
  function bindInput() {
    const c = app.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      S.unlock();
      if (st.mode !== 'play' || st.adActive) return;
      const [ux, uy] = toUnit(e);
      if (near(ux, uy, NEXT_X, NEXT_Y, 1.7)) { swap(); return; }
      if (near(ux, uy, RB_X, RB_Y, 1.8)) { rainbowAd(); return; }
      if (e.button === 2) { swap(); return; }
      st.aiming = true; st.pointerId = e.pointerId; st.aimVisible = true; aimAt(ux, uy); firstInput();
      try { c.setPointerCapture(e.pointerId); } catch (err) {}
    });
    c.addEventListener('pointermove', (e) => {
      const [ux, uy] = toUnit(e);
      if (st.aiming && e.pointerId === st.pointerId) aimAt(ux, uy);
      else if (e.pointerType === 'mouse' && st.mode === 'play') {
        const inside = ux > -0.5 && ux < 22.5 && uy > -0.5 && uy < SHY - 0.5;
        st.aimVisible = inside; if (inside) aimAt(ux, uy);
      }
    });
    const end = (e, fire) => {
      if (!st.aiming || e.pointerId !== st.pointerId) return;
      st.aiming = false; if (e.pointerType !== 'mouse') st.aimVisible = false;
      if (fire) shoot();
    };
    c.addEventListener('pointerup', (e) => end(e, true));
    c.addEventListener('pointercancel', (e) => end(e, false));
    window.addEventListener('keydown', (e) => {
      const k = e.code;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space'].includes(k) && st.mode === 'play') e.preventDefault();
      if (st.mode === 'play' && !st.adActive) {
        if (k === 'ArrowLeft' || k === 'KeyA') { st.keyRot = -1; st.aimVisible = true; }
        else if (k === 'ArrowRight' || k === 'KeyD') { st.keyRot = 1; st.aimVisible = true; }
        else if ((k === 'Space' || k === 'ArrowUp' || k === 'KeyW') && !e.repeat) { S.unlock(); firstInput(); st.aimVisible = true; shoot(); }
        else if (k === 'KeyX' && !e.repeat) swap();
        else if (k === 'Digit1' && !e.repeat) useBooster('fire');
        else if (k === 'Digit2' && !e.repeat) useBooster('bolt');
        else if (k === 'Digit3' && !e.repeat) useBooster('rainbow');
        else if ((k === 'Escape' || k === 'KeyP') && !e.repeat) pause();
      } else if (st.mode === 'pause' && (k === 'Escape' || k === 'KeyP') && !e.repeat) resume();
    });
    window.addEventListener('keyup', (e) => {
      if ((e.code === 'ArrowLeft' || e.code === 'KeyA') && st.keyRot < 0) st.keyRot = 0;
      if ((e.code === 'ArrowRight' || e.code === 'KeyD') && st.keyRot > 0) st.keyRot = 0;
    });
  }

  // ---- boosters & ads ----------------------------------------------------------
  const BOOST_CODE = { fire: FIRE, bolt: BOLT, rainbow: RAINBOW };
  function useBooster(id) {
    if (st.mode !== 'play') return;
    if (st.shot) { toast(t('boosterBusy')); return; }
    if (st.current === BOOST_CODE[id]) return;
    if (!M.useBooster(id)) {
      const price = M.price('boosters', id);
      if (M.d.sparks >= price) { M.buyBooster(id); M.useBooster(id); }
      else { toast(t('noSparks')); return; }
    }
    giveSpecial(BOOST_CODE[id]); firstInput();
    const doneQ = M.track('booster', 1); if (doneQ.length) emit('quest', doneQ);
    updateBoosters(); save();
  }
  function updateBoosters() {
    for (const id of ['fire', 'bolt', 'rainbow']) {
      const n = M.d.inv[id] || 0, el = $('bst-' + id);
      if (!el) continue;
      el.querySelector('.cnt').textContent = n > 0 ? String(n) : '+';
      el.classList.toggle('empty', n <= 0);
      el.setAttribute('aria-label', `${t('b_' + id)}: ${n}`);
    }
  }
  async function rainbowAd() {
    if (st.shot || st.current === RAINBOW) return;
    const wait = Math.ceil((st.rbReadyAt - Date.now()) / 1000);
    if (wait > 0) { toast(t('rbCool', { n: wait })); return; }
    const ok = await reward(); if (!ok) return;
    st.rbReadyAt = Date.now() + 60000; giveSpecial(RAINBOW); save();
  }
  function mute(on) { st.adActive = on; S.systemPause(on); }
  async function reward() {
    st.aiming = false;
    let r = await P.rewarded(mute);
    if (r === 'demo') r = await demoAd();
    if (!r) toast(t('adFail'));
    return !!r;
  }
  function demoAd() {
    return new Promise((res) => {
      mute(true); $('ovAd').hidden = false; let n = 2;
      const tick = () => {
        $('adCount').textContent = t('adCount', { n });
        if (n-- <= 0) { $('ovAd').hidden = true; mute(false); res(true); return; }
        setTimeout(tick, 1000);
      };
      tick();
    });
  }
  let toastTimer = 0;
  function toast(msg) { const el = $('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2400); }

  // ---- HUD -----------------------------------------------------------------------
  function goalText() {
    const L = st.lvl; if (!L) return '';
    if (L.goal === 'clear') return t('goalClearP', { n: countBalls() });
    if (L.goal === 'stars') return t('goalStarsP', { a: Math.min(st.starsGot, L.target), b: L.target });
    return t('goalScoreP', { a: fmt(Math.min(st.score, L.target)), b: fmt(L.target) });
  }
  function updateHud(now) {
    const lbl = $('hudLbl'), big = $('score'), sub = $('hudSub');
    if (st.gm === 'level' && st.lvl) {
      lbl.textContent = t('levelLbl', { n: st.lvl.n }) + ' · ' + t('shots').toUpperCase();
      big.textContent = String(Math.max(0, st.shots)); sub.textContent = goalText();
    } else if (st.gm === 'daily') {
      lbl.textContent = t('dailyLbl'); sub.textContent = `${t('shots')}: ${Math.max(0, st.shots)}`;
      if (now) { st.shown = st.score; big.textContent = fmt(st.score); }
    } else {
      lbl.textContent = t('score'); sub.textContent = `${t('best')}  ${fmt(Math.max(st.best, st.score))}`;
      if (now) { st.shown = st.score; big.textContent = fmt(st.score); }
    }
    $('chargeBar').style.width = (st.current === NOVA ? 100 : (st.charge / CHARGE_MAX) * 100) + '%';
    updateBoosters();
  }

  // ---- control -----------------------------------------------------------------
  function play() {
    S.unlock(); S.startMusic(); S.musicDuck(false);
    st.mode = 'play'; $('hud').hidden = false; $('boost').hidden = false; $('keys').hidden = false;
    if (!st.tutorial) $('tip').hidden = false;
    setTimeout(checkIntro, 400);
  }
  function pause() {
    if (st.mode !== 'play') return;
    stopPlay('pause'); S.musicDuck(true);
    emit('pause', { score: st.score, best: Math.max(st.best, st.score), gm: st.gm });
  }
  function resume() { st.mode = 'play'; S.systemPause(false); S.musicDuck(false); }
  function start(gm, n) {
    let cfg = null;
    if (gm === 'level') cfg = LV.level(n);
    else if (gm === 'daily') cfg = LV.daily(M.today());
    setupRun(gm, cfg); st.finalized = false; st.runLive = true; st.hasSaved = false; play(); save();
  }
  function toMenu() {
    if (st.gm === 'endless' && st.mode === 'over') finalizeEndless();
    if (st.runLive) st.hasSaved = true;
    st.mode = 'menu'; st.aiming = false; P.gameplayStop(); st.started = false;
    $('hud').hidden = true; $('keys').hidden = true; $('tip').hidden = true; $('boost').hidden = true; S.musicDuck(true); save();
  }

  // ---- save / load -------------------------------------------------------------
  function save() {
    const game = st.runLive && st.grid.length ? {
      gm: st.gm, n: st.lvl ? st.lvl.n : 0, key: st.lvl && st.lvl.key ? st.lvl.key : '',
      rows: st.grid.map((row) => row.map((b) => (b ? codeOf(b) : '.')).join('')),
      ts: st.topShift ? 1 : 0, score: st.score, misses: st.misses, combo: st.combo, charge: st.charge,
      cur: st.current, nxt: st.next, used: st.used ? 1 : 0, shots: st.shots, stars: st.starsGot,
    } : null;
    P.save({ v: 2, best: st.best, muted: S.muted ? 1 : 0, mus: S.musicOn ? 1 : 0, tut: st.tutorial ? 1 : 0, meta: M.d, game });
  }
  function restoreGame(g) {
    if (!g || !Array.isArray(g.rows) || !g.rows.length || g.rows.length > DEAD) return false;
    let cfg = null;
    if (g.gm === 'level') cfg = LV.level(g.n);
    else if (g.gm === 'daily') { if (g.key !== M.today()) return false; cfg = LV.daily(g.key); }
    else if (g.gm !== 'endless') return false;
    st.gm = g.gm; st.lvl = cfg; resetRun();
    st.rng = cfg ? LV.rng(cfg.seed + ((cfg.shots - (g.shots | 0)) * 977)) : Math.random;
    loadRows(g.rows, g.ts);
    if (!st.grid.length) return false;
    Object.assign(st, { score: +g.score || 0, misses: +g.misses || 0, combo: +g.combo || 0, charge: Math.min(CHARGE_MAX, +g.charge || 0), used: !!g.used, starsGot: +g.stars || 0 });
    st.shots = cfg ? Math.max(0, g.shots | 0) : null;
    st.current = g.cur >= 0 && g.cur < NCODES && g.cur !== STONE && g.cur !== BOMB && g.cur !== STAR ? +g.cur : pickPresent();
    st.next = g.nxt >= 0 && g.nxt <= 5 ? +g.nxt : pickPresent();
    refreshShooter(true); st.pathDirty = true; updateHud(true); st.runLive = true;
    return true;
  }
  function savedInfo() {
    if (!st.hasSaved) return null;
    return { gm: st.gm, n: st.lvl ? st.lvl.n : 0, score: st.score, shots: st.shots };
  }

  // ---- skins -------------------------------------------------------------------
  function applySkins() {
    const sk = SKINS[M.d.orb] || SKINS.lumi; PAL = sk.pal; STYLE = sk.style; BG = BGS[M.d.bg] || BGS.night;
    computeTint();
    if (!app) return;
    buildOrbTextures();
    each((b) => setOrb(b, b.color));
    setOrb(rb, RAINBOW); refreshShooter(false);
    flies.forEach((f, i) => { f.s.tint = BG.flies[i % 4]; });
    drawBackground();
  }
  function previewOrb(skinId, ci) {
    const sk = SKINS[skinId] || SKINS.lumi;
    return orbCanvas(ci, sk.pal, sk.style, 96).toDataURL();
  }
  function previewCode(code) { return orbCanvas(code, PAL, STYLE, 96).toDataURL(); }
  const bgSwatch = (id) => { const b = BGS[id] || BGS.night; return `linear-gradient(180deg, ${b.stops[0]}, ${b.stops[1]} 55%, ${b.stops[2]})`; };

  // ---- boot --------------------------------------------------------------------
  async function boot() {
    if (window.__MUSIC__) S.useTrack(window.__MUSIC__);
    await P.init();
    I.set(P.lang);
    try { await document.fonts.load('800 20px Lumi'); } catch (e) {}
    app = new PX.Application();
    try {
      await app.init({ resizeTo: window, background: '#0a0b24', antialias: true, autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2), preference: 'webgl', powerPreference: 'high-performance' });
    } catch (e) {
      document.body.insertAdjacentHTML('beforeend', '<div id="err">WebGL is not available in this browser.</div>'); return;
    }
    $('stage').appendChild(app.canvas);

    const saved = await P.load();
    const sv = saved && (saved.v === 2 || saved.v === 1) ? saved : null;
    M.load(sv && sv.meta); M.save = save;
    const sk = SKINS[M.d.orb] || SKINS.lumi; PAL = sk.pal; STYLE = sk.style; BG = BGS[M.d.bg] || BGS.night; computeTint();
    buildTextures();

    bgSprite = new PX.Sprite(PX.Texture.EMPTY); app.stage.addChild(bgSprite);
    flyL = new PX.Container(); app.stage.addChild(flyL);
    for (let i = 0; i < (REDUCED ? 14 : 34); i++) {
      const s = new PX.Sprite(tex.halo); s.anchor.set(0.5); s.blendMode = 'add';
      s.tint = BG.flies[i % 4]; const sz = 8 + Math.random() * 22; s.width = s.height = sz;
      flyL.addChild(s); flies.push({ s, x: Math.random() * innerWidth, y: Math.random() * innerHeight, v: 4 + Math.random() * 10, w: 0.3 + Math.random() * 0.6, p: Math.random() * 6, tw: 0.6 + Math.random() * 1.4, a: 0.12 + Math.random() * 0.3 });
    }
    panelG = new PX.Graphics(); deadG = new PX.Graphics(); uiG = new PX.Graphics();
    app.stage.addChild(panelG, deadG, uiG);
    field = new PX.Container();
    haloL = new PX.Container(); ballL = new PX.Container(); aimL = new PX.Container(); fxL = new PX.Container();
    field.addChild(haloL, aimL, ballL, fxL);
    const mask = new PX.Graphics(); field.addChild(mask); field.mask = mask;
    app.stage.addChild(field);
    topG = new PX.Graphics(); textL = new PX.Container(); app.stage.addChild(topG, textL);
    for (let i = 0; i < 46; i++) { const d = new PX.Sprite(tex.dot); d.anchor.set(0.5); d.blendMode = 'add'; aimL.addChild(d); aimDots.push(d); }
    ghost = new PX.Sprite(tex.ghost); ghost.anchor.set(0.5); ghost.scale.set(2.0 / 128); aimL.addChild(ghost);
    cur = orbSprites(0, 0.6); nxt = orbSprites(1, 0.3); rb = orbSprites(RAINBOW, 0.35);
    for (const o of [cur, nxt, rb]) { ballL.addChild(o.body); haloL.addChild(o.halo); }
    cur.k = nxt.k = 1; place(rb, RB_X, RB_Y); rb.body.scale.set(1.96 / 128 * 0.72); rb.halo.scale.set(4.4 / 128 * 0.72);

    layout();
    let rt = 0; const relayout = () => { cancelAnimationFrame(rt); rt = requestAnimationFrame(() => requestAnimationFrame(layout)); };
    window.addEventListener('resize', relayout); window.addEventListener('orientationchange', relayout);

    if (sv) {
      st.best = +sv.best || 0; st.tutorial = !!sv.tut;
      if (sv.muted) S.setMuted(true);
      if (sv.mus === 0) S.setMusic(false);
    }
    st.hasSaved = !!(sv && restoreGame(sv.game));
    if (!st.hasSaved) setupRun('endless', null);
    bindInput();

    const lose = () => { S.systemPause(true); pause(); };
    const back = () => { if (!st.adActive) S.systemPause(false); };
    document.addEventListener('visibilitychange', () => (document.hidden ? lose() : back()));
    window.addEventListener('blur', lose); window.addEventListener('focus', back);
    window.addEventListener('pagehide', save);
    P.on('pause', lose); P.on('resume', back);

    app.ticker.add((tk) => update(Math.min(tk.deltaMS / 1000, 0.05)));
    st.mode = 'menu'; $('hud').hidden = true; $('boost').hidden = true;
    emit('ready', {});
    P.ready();

    if (/[?&]debug\b/.test(location.search)) {
      window.__lumi = { st, M, aim: (a) => { st.aimA = clampAim(a); st.pathDirty = true; st.aimVisible = true; }, shoot, swap, layout, lowestRow, countBalls,
        music: () => ({ on: S.musicOn }), give: (c) => giveSpecial(c), codes: { RAINBOW, NOVA, STONE, BOMB, STAR, FIRE, BOLT },
        setRows: (rows) => { loadRows(rows, false); st.pathDirty = true; fixColors(); },
        setScore: (s) => { st.score = s; updateHud(true); }, fill: (rows) => { for (let i = 0; i < rows; i++) pushRows(1); st.pushT = 1; st.push = 0; } };
    }
  }

  window.Game = {
    st, on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); },
    start, play, pause, resume, toMenu, continueRun, finalizeEndless, useBooster, toast, reward,
    saved: savedInfo, clearSaved() { st.hasSaved = false; }, resumeSaved() { st.hasSaved = false; play(); },
    setMuted: (m) => { S.setMuted(m); save(); }, setMusic: (m) => { S.setMusic(m); save(); },
    applySkins, previewOrb, previewCode, previewSpecial, bgSwatch, save, updateHud, updateBoosters,
    introDone() { st.mode = 'play'; S.musicDuck(false); },
    codes: { STAR, FIRE, BOLT, RAINBOW },
  };
  boot();
})();

/* Lumi Pop — menus and result cards (DOM). Talks to window.Game, window.Meta, window.Platform. */
(function () {
  'use strict';
  const G = window.Game, M = window.Meta, I = window.I18n, P = window.Platform, S = window.Sfx, LV = window.Levels;
  const t = (k, v) => I.t(k, v), fmt = I.fmt, $ = (id) => document.getElementById(id);
  const ov = $('ov');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const ICON = {
    spark: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 1.5l2.6 7.9 7.9 2.6-7.9 2.6L12 22.5l-2.6-7.9L1.5 12l7.9-2.6z"/></svg>',
    star: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.5l2.9 6.2 6.8.8-5 4.6 1.3 6.7L12 17.4l-6 3.4 1.3-6.7-5-4.6 6.8-.8z"/></svg>',
    lock: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    play: '<svg class="i" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4 2.5l9 5.5-9 5.5z"/></svg>',
    quests: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18H6z"/><path d="M9 8l1.5 1.5L13 7M9 14h6M9 17h4"/></svg>',
    shop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h16l-1.5 12h-13z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
    chest: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10h18v10H3z"/><path d="M3 10a9 5 0 0 1 18 0"/><path d="M10.5 12h3v3h-3z"/></svg>',
    cons: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18l5-7 5 3 6-9"/><circle cx="4" cy="18" r="1.6" fill="currentColor"/><circle cx="9" cy="11" r="1.6" fill="currentColor"/><circle cx="14" cy="14" r="1.6" fill="currentColor"/><circle cx="20" cy="5" r="1.6" fill="currentColor"/></svg>',
    trophy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8"/></svg>',
  };
  const starsRow = (n, size) => `<span class="st" aria-label="${n}/3">${[1, 2, 3].map((i) => (i <= n ? ICON.star : `<span style="opacity:.25">${ICON.star}</span>`)).join('')}</span>`;
  let screen = '', ctx = {};

  function show(name, html, cls) {
    const same = name === screen && !ov.hidden;
    screen = name;
    ov.innerHTML = `<div class="card ${cls || ''}${same ? ' still' : ''}" role="dialog" aria-modal="true">${html}</div>`;
    ov.hidden = false;
    const f = ov.querySelector('[data-focus]') || ov.querySelector('button:not([disabled])');
    if (f) setTimeout(() => f.focus({ preventScroll: true }), 40);
  }
  function hide() { screen = ''; ov.hidden = true; ov.innerHTML = ''; }
  const btn = (act, label, cls, extra) => `<button class="btn ${cls || 'ghost'}" data-act="${act}" ${extra || ''}>${label}</button>`;
  const img = (src, cls) => `<img src="${src}" alt="" class="${cls || ''}">`;
  const boosterImg = (id) => G.previewCode({ fire: G.codes.FIRE, bolt: G.codes.BOLT, rainbow: G.codes.RAINBOW }[id]);
  function rewardHtml(r) {
    const parts = [];
    if (r.sparks) parts.push(`${ICON.spark} ${r.sparks}`);
    for (const b of ['fire', 'bolt', 'rainbow']) if (r[b]) parts.push(`${img(boosterImg(b), 'ri')} ×${r[b]}`);
    return parts.join(' ');
  }
  const hm = (ms) => { const m = Math.ceil(ms / 60000), h = Math.floor(m / 60); return h ? `${h}:${String(m % 60).padStart(2, '0')}` : `${m} ${I.L === I.ru ? 'мин' : 'min'}`; };
  const levelPill = () => `<div class="lvpill">${t('plevel', { n: M.d.plevel })}<span class="mb"><i style="width:${Math.round((M.d.xp / M.xpNeed(M.d.plevel)) * 100)}%"></i></span></div>`;
  function xpBlock(x) {
    if (!x) return '';
    const ups = x.ups.map((u) => `<div class="up">${ICON.star} ${t('levelUp', { n: u.level })} · ${rewardHtml(u.reward)}</div>`).join('');
    return `<div class="xp"><div class="xt"><b>${t('plevel', { n: x.level })}</b><span>${t('xpGain', { n: x.gained })}</span></div><div class="pbar"><i style="width:${Math.round(x.fromPct * 100)}%" data-to="${Math.round(x.toPct * 100)}"></i></div>${ups}</div>`;
  }
  function animateXp() { requestAnimationFrame(() => requestAnimationFrame(() => ov.querySelectorAll('[data-to]').forEach((el) => { el.style.width = el.dataset.to + '%'; }))); }
  function consSvg(c) {
    const lit = c.done ? c.pts.length : Math.floor((c.prog / c.need) * c.pts.length), on = (i) => i < lit;
    const lines = c.lines.map(([a, b]) => `<line x1="${c.pts[a][0]}" y1="${c.pts[a][1]}" x2="${c.pts[b][0]}" y2="${c.pts[b][1]}" stroke="${on(a) && on(b) ? '#ffcc4d' : 'rgba(190,175,255,.22)'}" stroke-width="${on(a) && on(b) ? 1.4 : 0.8}"/>`).join('');
    const dots = c.pts.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${on(i) ? 2.6 : 1.6}" fill="${on(i) ? '#fff3c4' : 'rgba(210,200,255,.35)'}"${on(i) ? ' style="filter:drop-shadow(0 0 2px #ffcc4d)"' : ''}/>`).join('');
    return `<svg viewBox="-4 -2 108 64" role="img" aria-label="${esc(t('cons_' + c.id))}: ${c.prog}/${c.need}">${lines}${dots}</svg>`;
  }
  function claimCons() {
    const got = M.claimConstellations();
    if (got.length) { S.coin(); G.toast(got.map((c) => `★ ${t('consDone', { n: t('cons_' + c.id) })}`).join('\n')); }
  }
  function currentCons() { return M.consState().find((c) => !c.done) || null; }
  const wallet = () => `<div class="wallet">${ICON.spark}<b>${fmt(M.d.sparks)}</b></div>`;
  const interstitial = () => P.interstitial((m) => { G.st.adActive = m; S.systemPause(m); });

  // ---- main menu ---------------------------------------------------------------
  function mainMenu() {
    G.toMenu();
    M.refreshDay();
    claimCons();
    const sv = G.saved();
    const next = Math.min(M.nextLevel(), LV.TOTAL), allDone = M.nextLevel() > LV.TOTAL;
    const dd = M.d.daily, qn = M.questsReady();
    let cont = '';
    if (sv) {
      const what = sv.gm === 'level' ? t('levelLbl', { n: sv.n }).toLowerCase() : sv.gm === 'daily' ? t('daily') : t('endless');
      cont = btn('continue', `${ICON.play}<span class="stack"><span>${t('cont')}</span><small>${esc(what)}${sv.gm !== 'level' ? ' · ' + fmt(sv.score) : ''}</small></span>`, 'primary', 'data-focus');
    }
    show('main', `
      <div class="orbs">${img(G.previewCode(1))}${img(G.previewCode(4), 'l')}${img(G.previewCode(3))}</div>
      <div class="title">Lumi Pop</div>
      <div class="top2">${wallet()}${levelPill()}</div>
      ${cont}
      <div id="scSlot"></div>
      <button class="tile" data-act="endless" ${sv ? '' : 'data-focus'}>${img(G.previewCode(4))}<span><b>${t('endless')}</b><small>${G.st.best ? `${t('best')}: ${fmt(G.st.best)}` : t('endlessSub')}</small></span><span class="chev">›</span></button>
      <button class="tile" data-act="adventure">${img(G.previewCode(G.codes.STAR))}<span><b>${t('adventure')}</b><small>${allDone ? t('adventureDone') : t('adventureSub', { n: next, total: LV.TOTAL })}${(() => { const c = currentCons(); return c ? ` · ${t('cons_' + c.id)} ${c.prog}/${c.need}` : ` · ${ICON.star} ${M.totalStars()}`; })()}</small></span><span class="chev">›</span></button>
      <button class="tile" data-act="daily">${img(G.previewCode(G.codes.RAINBOW))}<span><b>${t('daily')}</b><small>${dd.best ? t('dailyDone', { s: fmt(dd.best) }) : t('dailySub', { n: 45 })}</small></span><span class="chev">›</span></button>
      <div class="row4">
        <button class="sq" data-act="quests">${ICON.quests}${t('quests')}${qn ? `<i class="badge">${qn}</i>` : ''}</button>
        <button class="sq ${M.chestLeft() ? '' : 'hot'}" data-act="chest">${ICON.chest}${t('chest')}<small id="chestT">${M.chestLeft() ? hm(M.chestLeft()) : t('ready')}</small>${M.chestLeft() ? '' : '<i class="badge">!</i>'}</button>
        <button class="sq" data-act="shop">${ICON.shop}${t('shop')}</button>
        <button class="sq" data-act="records">${ICON.trophy}${t('records')}</button>
      </div>`);
    if (!M.d.shortcut && (M.d.streak.day >= 2 || M.d.games >= 3)) {
      P.canShortcut().then((ok) => {
        const slot = $('scSlot'); if (!ok || !slot || screen !== 'main') return;
        slot.outerHTML = `<button class="tile" data-act="shortcut" style="border-color:rgba(255,204,77,.5)"><span style="font-size:30px;color:var(--gold);width:42px;text-align:center">${ICON.spark}</span><span><b>${P._vk ? t('shortcutV') : t('shortcutY')}</b><small>${t('shortcutSub')} ${ICON.spark} 50</small></span><span class="chev">›</span></button>`;
      });
    }
  }
  setInterval(() => {
    if (screen !== 'main') return;
    const el = $('chestT'); if (!el) return;
    const left = M.chestLeft(); if (!left && el.textContent !== t('ready')) mainMenu(); else if (left) el.textContent = hm(left);
  }, 20000);

  // ---- chest & constellations -------------------------------------------------------
  function chestCard(got) {
    const left = M.chestLeft();
    show('chest', `
      <div class="eyebrow">${t('chest').toUpperCase()}</div>
      <svg class="chestico" viewBox="0 0 96 96" aria-hidden="true"><defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8f6bff"/><stop offset="1" stop-color="#4b23b0"/></linearGradient></defs>
        <ellipse cx="48" cy="84" rx="34" ry="6" fill="rgba(0,0,0,.3)"/><rect x="14" y="40" width="68" height="40" rx="8" fill="url(#cg)"/>
        <path d="M14 46a34 24 0 0 1 68 0z" fill="#a98bff"/><rect x="14" y="44" width="68" height="6" fill="#ffcc4d"/><rect x="42" y="40" width="12" height="16" rx="3" fill="#ffcc4d"/>
        ${got || !left ? '<circle cx="48" cy="32" r="16" fill="rgba(255,211,107,.35)"/><path d="M48 18l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="#fff3c4"/>' : ''}</svg>
      ${got ? `<div class="sub">${t('chestGot')}</div><div class="h2" style="color:var(--gold)">${rewardHtml(got)}</div>${btn('main', t('take'), 'primary', 'data-focus')}`
        : left ? `<div class="sub">${t('chestIn', { t: hm(left) })}</div>${btn('chestAd', `${ICON.play}<span class="stack"><span>${t('chestAd')}</span><small>${t('contAdSub')}</small></span>`, 'primary', 'data-focus')}${btn('main', t('back'))}`
        : `<div class="sub">${t('chestSub')}</div>${btn('chestOpen', t('chestOpen'), 'primary', 'data-focus')}${btn('main', t('back'))}`}`);
  }
  function consScreen(back) {
    claimCons();
    const list = M.consState().map((c) => `<div class="cc ${c.done ? 'done' : ''}">${consSvg(c)}<b>${t('cons_' + c.id)}</b><small>${c.done ? t('ready') : `${ICON.star} ${c.prog} / ${c.need}`} · ${rewardHtml(c.reward)}</small></div>`).join('');
    show('cons', `
      <div class="eyebrow">${t('cons').toUpperCase()}</div>
      <div class="sub">${t('consSub')}</div>
      <div class="consg">${list}</div>
      ${btn(back || 'adventure', t('back'))}`, 'wide');
  }

  // ---- daily gift ----------------------------------------------------------------
  function giftCard() {
    const g = M.giftPending(); if (!g) return mainMenu();
    const days = M.STREAK.map((r, i) => {
      const d = i + 1, cls = d === g.day ? 'now' : d < g.day ? 'past' : '';
      const icon = r.sparks && !r.fire ? `<span style="font-size:18px;color:${d === g.day ? 'inherit' : 'var(--gold)'}">${ICON.spark}</span>` : img(boosterImg(r.fire ? 'fire' : r.bolt ? 'bolt' : 'rainbow'));
      return `<div class="gd ${cls}">${t('giftDay', { n: d })}${icon}<span class="v">${r.sparks ? r.sparks : '×1'}</span></div>`;
    }).join('');
    show('gift', `
      <div class="eyebrow">${t('gift').toUpperCase()}</div>
      <div class="h2">${t('giftDay', { n: g.day })}</div>
      <div class="sub">${t('giftSub')}</div>
      <div class="gift">${days}</div>
      <div class="h2" style="color:var(--gold)">${rewardHtml(g.reward)}</div>
      ${btn('gift', t('take'), 'primary', 'data-focus')}`, 'wide');
  }

  // ---- adventure -------------------------------------------------------------------
  function levelMap() {
    const next = M.nextLevel(); let cells = '';
    for (let n = 1; n <= LV.TOTAL; n++) {
      const s = M.stars(n), open = n <= next;
      cells += `<button class="lv ${n === next ? 'cur' : ''}" data-act="level" data-n="${n}" ${open ? '' : 'disabled'} aria-label="${t('levelLbl', { n })}${open ? '' : ', ' + t('locked')}">${open ? n : ICON.lock}${open && s ? starsRow(s) : ''}</button>`;
    }
    show('map', `
      <div class="eyebrow">${t('adventure').toUpperCase()}</div>
      <div class="sub">${ICON.star} ${M.totalStars()} / ${LV.TOTAL * 3}</div>
      <div class="grid" id="lvGrid">${cells}</div>
      ${btn('cons', `${ICON.star} ${t('cons')}${(() => { const c = currentCons(); return c ? ` · ${t('cons_' + c.id)} ${c.prog}/${c.need}` : ''; })()}`)}
      ${btn('main', t('back'))}`, 'wide');
    const cur = ov.querySelector('.lv.cur'); if (cur) cur.scrollIntoView({ block: 'center' });
  }
  function goalLabel(L) { return L.goal === 'clear' ? t('goalClear') : L.goal === 'stars' ? t('goalStars') : t('goalScore'); }
  function goalDesc(L) { return L.goal === 'clear' ? t('goalClearD') : L.goal === 'stars' ? t('goalStarsD', { n: L.target }) : t('goalScoreD', { n: fmt(L.target) }); }
  function levelIntro(n) {
    const L = LV.level(n), s = M.stars(n);
    const pic = L.goal === 'stars' ? G.previewCode(G.codes.STAR) : L.goal === 'score' ? G.previewCode(1) : G.previewCode(3);
    show('intro', `
      <div class="eyebrow">${t('levelLbl', { n })}</div>
      ${img(pic, 'sp')}
      <div class="h2">${goalLabel(L)}</div>
      <div class="sub">${goalDesc(L)}</div>
      <div class="sub">${t('shots')}: <b style="color:var(--ink)">${L.shots}</b></div>
      ${s ? `<div class="stars" style="font-size:26px">${[1, 2, 3].map((i) => `<span class="${i <= s ? '' : 'off'}">${ICON.star}</span>`).join('')}</div>` : ''}
      ${btn('startLevel', `${ICON.play} ${t('start')}`, 'primary', `data-n="${n}" data-focus`)}
      ${btn('adventure', t('levels'))}`);
  }

  // ---- in-game cards -------------------------------------------------------------
  function pauseCard(d) {
    show('pause', `
      <div class="eyebrow">${t('paused')}</div>
      <div class="big">${fmt(d.score)}</div>
      <div class="sub">${d.gm === 'endless' ? `${t('best')}: ${fmt(d.best)}` : d.gm === 'daily' ? t('daily') : t('levelLbl', { n: G.st.lvl.n })}</div>
      ${btn('resume', t('resume'), 'primary', 'data-focus')}
      ${btn('restart', t('restart'))}
      ${btn('main', t('toMenu'))}`);
  }
  function endCard(d) {
    ctx = d;
    if (d.type === 'over') {
      show('over', `
        <div class="eyebrow">${d.record ? t('record') : t('over')}</div>
        <div class="big">${fmt(d.score)}</div>
        <div class="sub">${t('bestIs')}: ${fmt(d.best)}</div>
        ${!d.record && d.best > d.score && d.best - d.score <= Math.max(500, d.best * 0.3) ? `<div class="near">${t('toRecord', { n: fmt(d.best - d.score) })}</div>` : ''}
        ${d.sparks ? `<div class="wallet">${ICON.spark}<b>+${d.sparks}</b></div>` : ''}
        ${xpBlock(d.xp)}
        ${d.canContinue ? btn('cont', `${ICON.play}<span class="stack"><span>${t('contAd')}</span><small>${t('contAdSub')}</small></span>`, 'primary', 'data-focus') : ''}
        ${btn('again', t('again'), d.canContinue ? 'ghost' : 'primary')}
        ${btn('main', t('menu'))}`);
    } else if (d.type === 'lose') {
      const shots = d.reason === 'shots';
      show('lose', `
        <div class="eyebrow">${shots ? t('lostShots') : t('lostLine')}</div>
        <div class="h2">${t('levelLbl', { n: d.n })}</div>
        <div class="sub">${esc(d.progress)}</div>
        ${xpBlock(d.xp)}
        ${d.canContinue ? btn('cont', `${ICON.play}<span class="stack"><span>${shots ? t('shotsAd') : t('contAd')}</span><small>${t('contAdSub')}</small></span>`, 'primary', 'data-focus') : ''}
        ${btn('retry', t('retry'), d.canContinue ? 'ghost' : 'primary', `data-n="${d.n}"`)}
        ${btn('adventure', t('levels'))}`);
    } else if (d.type === 'win') {
      show('win', `
        <div class="eyebrow">${t('won')}</div>
        <div class="h2">${t('levelLbl', { n: d.n })}</div>
        <div class="stars">${[1, 2, 3].map((i) => `<span class="${i <= d.stars ? '' : 'off'}">${ICON.star}</span>`).join('')}</div>
        <div class="big" style="font-size:40px">${fmt(d.score)}</div>
        ${d.sparks ? `<div class="wallet">${ICON.spark}<b>+${d.sparks}</b></div>` : ''}
        ${(d.cons || []).map((c) => `<div class="near">${ICON.star} ${t('consDone', { n: t('cons_' + c.id) })} · ${rewardHtml(c.reward)}</div>`).join('')}
        ${xpBlock(d.xp)}
        ${d.last ? '' : btn('next', `${t('next')} ${ICON.play}`, 'primary', `data-n="${d.n + 1}" data-focus`)}
        ${btn('adventure', t('levels'))}`);
    } else if (d.type === 'daily') {
      show('daily', `
        <div class="eyebrow">${t('dailyEnd')}</div>
        <div class="big">${fmt(d.score)}</div>
        <div class="sub">${t('dailyBest')}: ${fmt(d.best)}</div>
        ${d.sparks ? `<div class="wallet">${ICON.spark}<b>+${d.sparks}</b></div>` : ''}
        ${xpBlock(d.xp)}
        <div class="sub">${t('dailyNew')}</div>
        ${btn('main', t('menu'), 'primary', 'data-focus')}
        ${btn('daily', t('again'))}`);
    }
  }
  let askedReview = false;
  function afterEnd(d) {
    animateXp();
    if (d.xp && d.xp.ups.length) S.coin();
    const good = (d.type === 'win' && d.stars >= 2 && M.nextLevel() > 4) || (d.type === 'over' && d.record && M.d.games >= 3);
    if (good && !askedReview && !M.d.reviewed) {
      askedReview = true;
      setTimeout(() => P.requestReview().then((sent) => { if (sent) { M.d.reviewed = true; M.save(); } }), 1400);
    }
  }
  function introCard(d) {
    show('special', `
      <div class="eyebrow">${t('newSpecial')}</div>
      ${img(d.img, 'sp')}
      <div class="h2">${t('sp_' + d.kind)}</div>
      <div class="sub">${t('sp_' + d.kind + 'D')}</div>
      ${btn('introOk', t('gotIt'), 'primary', 'data-focus')}`);
  }

  // ---- quests --------------------------------------------------------------------
  function questsScreen() {
    M.refreshDay();
    const list = M.d.quests.list.map((q, i) => {
      const pct = Math.round((q.prog / q.n) * 100);
      const label = t('q_' + q.id, { n: q.id === 'score' ? fmt(q.n) : q.n });
      const action = q.claimed ? `<button class="mini" disabled>${t('claimed')}</button>`
        : q.done ? `<button class="mini" data-act="claimQ" data-i="${i}">${ICON.spark} ${q.reward}</button>`
        : `<button class="mini ghost" disabled>${ICON.spark} ${q.reward}</button>`;
      return `<div class="item"><div class="tx"><b>${esc(label)}</b><small>${q.max ? (q.done ? '' : '') : ''}${fmt(Math.min(q.prog, q.n))} / ${fmt(q.n)}</small><div class="pbar"><i style="width:${pct}%"></i></div></div>${action}</div>`;
    }).join('');
    const s = M.d.streak;
    show('quests', `
      <div class="eyebrow">${t('quests').toUpperCase()}</div>
      <div class="sub">${t('questsSub')}${s.day ? ' · ' + t('streak', { n: s.day }) : ''}</div>
      ${wallet()}
      <div class="list">${list}</div>
      ${btn('main', t('back'))}`, 'wide');
  }

  // ---- shop ------------------------------------------------------------------------
  function shopScreen(tab) {
    tab = tab || ctx.shopTab || 'orbs'; ctx.shopTab = tab;
    let items = '';
    if (tab === 'orbs' || tab === 'bgs') {
      const type = tab;
      items = M.CATALOG[type].map((it) => {
        const owned = M.d.owned.includes(it.id), inUse = (type === 'orbs' ? M.d.orb : M.d.bg) === it.id;
        const pic = type === 'orbs' ? `<div class="skin">${[0, 3, 4].map((c) => img(G.previewOrb(it.id, c))).join('')}</div>` : `<div class="swatch" style="background:${G.bgSwatch(it.id)}"></div>`;
        const action = inUse ? `<button class="mini" disabled>${t('inUse')}</button>`
          : owned ? `<button class="mini ghost" data-act="useSkin" data-type="${type}" data-id="${it.id}">${t('use')}</button>`
          : `<button class="mini" data-act="buySkin" data-type="${type}" data-id="${it.id}" ${M.d.sparks < it.price ? 'disabled' : ''}>${ICON.spark} ${it.price}</button>`;
        return `<div class="item">${pic}<div class="tx"><b>${t((type === 'orbs' ? 'sk_' : 'bg_') + it.id)}</b></div>${action}</div>`;
      }).join('');
    } else {
      items = M.CATALOG.boosters.map((it) => `<div class="item">${img(boosterImg(it.id), 'skin')}<div class="tx"><b>${t('b_' + it.id)}</b><small>${t('b_' + it.id + 'D')}<br>${t('owned', { n: M.d.inv[it.id] || 0 })}</small></div><button class="mini" data-act="buyB" data-id="${it.id}" ${M.d.sparks < it.price ? 'disabled' : ''}>${ICON.spark} ${it.price}</button></div>`).join('');
    }
    show('shop', `
      <div class="eyebrow">${t('shop').toUpperCase()}</div>
      ${wallet()}
      <div class="tabs" role="tablist">
        ${['orbs', 'bgs', 'boost'].map((k) => `<button role="tab" aria-selected="${tab === k}" class="${tab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${t(k === 'orbs' ? 'tabOrbs' : k === 'bgs' ? 'tabBg' : 'tabBoost')}</button>`).join('')}
      </div>
      <div class="list">${items}</div>
      ${btn('main', t('back'))}`, 'wide');
  }

  // ---- records -------------------------------------------------------------------
  async function recordsScreen(tab) {
    tab = tab || 'mine';
    const tabs = `<div class="tabs">${['world', 'mine'].map((k) => `<button class="${tab === k ? 'on' : ''}" data-act="recTab" data-tab="${k}">${t(k)}</button>`).join('')}</div>`;
    const frame = (body) => show('records', `<div class="eyebrow">${t('records').toUpperCase()}</div>${tabs}<div class="list">${body}</div>${btn('main', t('back'))}`, 'wide');
    if (tab === 'mine') {
      const r = M.d.records;
      frame(r.length ? r.map((x, i) => `<div class="rec"><span>${i + 1}</span><span class="nm">${esc(x.d)}</span><b>${fmt(x.s)}</b></div>`).join('') : `<div class="sub" style="margin:auto">${t('noRecords')}</div>`);
      return;
    }
    if (!P.hasLeaderboard()) { frame(`<div class="sub" style="margin:auto">${t('worldNone')}</div>`); return; }
    frame('<div class="sub" style="margin:auto">…</div>');
    const top = await P.getTop();
    if (screen !== 'records') return;
    if (!top || !top.entries.length) { frame(`<div class="sub" style="margin:auto">${t('noRecords')}</div>${P.canLogin() ? btn('login', t('login')) : ''}`); return; }
    frame(top.entries.map((e) => `<div class="rec ${e.me ? 'me' : ''}"><span>${e.rank}</span><span class="nm">${esc(e.me ? t('you') : e.name || '—')}</span><b>${fmt(e.score)}</b></div>`).join('') + (P.canLogin() ? btn('login', t('login')) : ''));
  }

  // ---- actions -------------------------------------------------------------------
  async function act(a, d) {
    switch (a) {
      case 'main': hide(); mainMenu(); break;
      case 'continue': hide(); G.resumeSaved(); break;
      case 'endless': hide(); G.start('endless'); break;
      case 'daily': hide(); G.start('daily'); break;
      case 'adventure': if (G.st.mode === 'over' || G.st.mode === 'won') G.toMenu(); levelMap(); break;
      case 'level': levelIntro(+d.n); break;
      case 'startLevel': hide(); G.start('level', +d.n); break;
      case 'next': levelIntro(+d.n); break;
      case 'retry': hide(); await interstitial(); G.start('level', +d.n); break;
      case 'again': hide(); G.finalizeEndless(); await interstitial(); G.start('endless'); break;
      case 'cont': { const ok = await G.continueRun(); if (ok) hide(); break; }
      case 'resume': hide(); G.resume(); break;
      case 'restart': {
        hide(); const gm = G.st.gm, n = G.st.lvl ? G.st.lvl.n : 0;
        G.st.mode = 'over'; G.finalizeEndless(); await interstitial(); G.start(gm, n); break;
      }
      case 'introOk': hide(); G.introDone(); break;
      case 'gift': { const g = M.claimGift(); if (g) S.coin(); hide(); mainMenu(); break; }
      case 'quests': questsScreen(); break;
      case 'claimQ': { const r = M.claimQuest(+d.i); if (r) S.coin(); questsScreen(); break; }
      case 'shop': shopScreen(); break;
      case 'tab': shopScreen(d.tab); break;
      case 'buySkin': if (M.buySkin(d.type, d.id)) { S.coin(); M.setSkin(d.type, d.id); G.applySkins(); } shopScreen(); break;
      case 'useSkin': M.setSkin(d.type, d.id); G.applySkins(); shopScreen(); break;
      case 'buyB': if (M.buyBooster(d.id)) S.coin(); G.updateBoosters(); shopScreen(); break;
      case 'records': recordsScreen('mine'); break;
      case 'chest': chestCard(); break;
      case 'chestOpen': if (!M.chestLeft()) { const r = M.openChest(); S.coin(); chestCard(r); } break;
      case 'chestAd': { const ok = await G.reward(); if (ok) { const r = M.openChest(); S.coin(); chestCard(r); } break; }
      case 'cons': consScreen('adventure'); break;
      case 'shortcut': { const ok = await P.shortcut(); if (ok && !M.d.shortcut) { M.d.shortcut = true; M.grant({ sparks: 50 }); M.changed(); S.coin(); G.toast('+50'); } mainMenu(); break; }
      case 'recTab': recordsScreen(d.tab); break;
      case 'login': await P.login(); recordsScreen('world'); break;
    }
  }
  ov.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    S.unlock(); S.click(); act(b.dataset.act, b.dataset);
  });

  // ---- HUD controls ---------------------------------------------------------------
  function setMusicIcon() { const on = S.musicOn; $('mcross').style.display = on ? 'none' : ''; $('bMusic').setAttribute('aria-pressed', on ? 'true' : 'false'); }
  function setSoundIcon() { const m = S.muted; $('wave').style.display = m ? 'none' : ''; $('cross').style.display = m ? '' : 'none'; $('bSound').setAttribute('aria-pressed', m ? 'true' : 'false'); }
  function applyLang() {
    document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t(el.getAttribute('data-t')); });
    $('tip').textContent = t('tip'); $('keys').innerHTML = t('keys') + '<br>1 2 3 — ' + t('tabBoost').toLowerCase();
    $('bSound').setAttribute('aria-label', t('sound')); $('bPause').setAttribute('aria-label', t('pause')); $('bMusic').setAttribute('aria-label', t('music'));
  }

  G.on('ready', () => {
    applyLang(); setMusicIcon(); setSoundIcon();
    $('bMusic').onclick = () => { S.startMusic(); G.setMusic(!S.musicOn); setMusicIcon(); };
    $('bSound').onclick = () => { S.unlock(); G.setMuted(!S.muted); setSoundIcon(); };
    $('bPause').onclick = () => { if (G.st.mode === 'play') G.pause(); else if (G.st.mode === 'pause') { hide(); G.resume(); } };
    for (const id of ['fire', 'bolt', 'rainbow']) {
      const el = $('bst-' + id); el.querySelector('img').src = boosterImg(id);
      el.onclick = () => { S.unlock(); G.useBooster(id); };
    }
    G.updateBoosters();
    if (M.giftPending()) { G.toMenu(); giftCard(); } else mainMenu();
  });
  G.on('pause', pauseCard);
  G.on('end', (d) => { endCard(d); afterEnd(d); });
  G.on('intro', introCard);
  G.on('quest', (list) => { S.coin(); G.toast(list.map((q) => '✓ ' + t('q_' + q.id, { n: q.id === 'score' ? fmt(q.n) : q.n })).join('\n')); });
  M.on(() => { if (screen === 'main' || screen === 'shop' || screen === 'quests') { const w = ov.querySelector('.wallet b'); if (w) w.textContent = fmt(M.d.sparks); } G.updateBoosters(); });
})();
