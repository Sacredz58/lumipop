/* Lumi Pop — platform adapter.
 * One game build, several storefronts. The build script sets window.__TARGET__
 * to one of: "web" | "yandex" | "crazygames" | "poki" | "vk" | "pikabu".
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
  /** an SDK call that may never settle outside its storefront (opened directly, no host frame) */
  const within = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);
  function urlParam(name) {
    try { return new URLSearchParams(location.search).get(name); } catch (e) { return null; }
  }

  const listeners = { pause: [], resume: [] };
  const emit = (type) => listeners[type].forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });

  const P = {
    target: TARGET,
    // CrazyGames and Poki require English by default, Pikabu requires Russian; Yandex and VK pick the language from their SDK
    lang: TARGET === 'crazygames' || TARGET === 'poki' ? 'en' : TARGET === 'pikabu' ? 'ru' : pickLang(navigator.language),
    // Pikabu forbids foreign words in the title, so the game carries a Russian name there
    title: TARGET === 'pikabu' ? { main: 'Люми', sub: 'звёздные шарики', hud: 'ЛЮМИ' } : { main: 'Lumi Pop', sub: '', hud: 'LUMI POP' },
    hasRewarded: true,
    _ysdk: null, _player: null, _cg: null, _vk: null, _pk: null, _flushAt: 0,
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
        } else if (TARGET === 'pikabu' && window.PkbSDK && window.parent !== window) {   // opened directly (not in Pikabu's frame): the SDK would echo to itself forever
          // outside Pikabu (a plain link, no test environment) init never settles: don't let it hold the game
          this._pk = await within(window.PkbSDK.init(), 5000);
          try { this.hasRewarded = !!this._pk.ads.rewarded.isSupported; } catch (e) {}
        } else if (TARGET === 'vk' && window.vkBridge && window.parent !== window) {   // outside VK's frame there is nobody to answer
          await within(window.vkBridge.send('VKWebAppInit'), 5000);
          this._vk = window.vkBridge;
          this.lang = urlParam('vk_language') === '3' ? 'en' : 'ru';   // VK: Russian unless the VK interface is English
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
        if (this._pk) this._pk.gameStarted();
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
      if (now - this._lastInterstitial < (this._pk ? 120000 : 60000)) return;   // Pikabu allows one per 120 s
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
        } else if (this._pk) {
          if (!this._pk.ads.fullscreen.isSupported || !(await this._pk.ads.fullscreen.canShow())) return;
          mute(true);
          const r = await this._pk.ads.fullscreen.show();
          mute(false);
          if (!r || !r.rendered) console.warn('[platform] fullscreen ad not shown', r && r.reason);
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
        } else if (this._pk) {
          mute(true);
          const r = await this._pk.ads.rewarded.show();
          mute(false);
          return !!(r && r.reward);           // false when closed early or blocked by an ad blocker
        }
        // web demo: no ad network — the game shows a labelled stand-in; elsewhere (SDK blocked) no reward
        return TARGET === 'web' ? 'demo' : false;
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
        else if (this._pk) data = this._pk.storage.get(SAVE_KEY) || null;
        else if (this._vk) {
          // VK keeps at most 4096 bytes per key, so the save is split into chunks
          const head = await within(this._vk.send('VKWebAppStorageGet', { keys: [SAVE_KEY + '_n'] }), 5000);
          const n = parseInt(head && head.keys && head.keys[0] && head.keys[0].value, 10) || 0;
          if (n > 0) {
            const keys = []; for (let i = 0; i < n; i++) keys.push(SAVE_KEY + '_' + i);
            const r = await within(this._vk.send('VKWebAppStorageGet', { keys }), 5000);
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
          else if (this._pk) {
            // set() is local and synced by the SDK; an explicit flush at most every 20 s (limit: 100 per 5 min)
            this._pk.storage.set(SAVE_KEY, obj);
            if (Date.now() - this._flushAt > 20000) { this._flushAt = Date.now(); this._pk.storage.flush().catch(() => {}); }
          } else if (this._vk) {
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
