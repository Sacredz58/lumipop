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
    plevel: 1, xp: 0, chestAt: 0, cons: 0, games: 0, shortcut: false, reviewed: false, lang: '',
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
      M.d.sparks += r; M.changed(); return r;
    },
    /** write an endless run into the top 10 right when it ends; a continued run updates its own entry */
    recordRun(id, score) {
      if (!(score > 0)) return;
      const e = M.d.records.find((x) => x.id === id);
      if (e) e.s = Math.max(e.s, score); else M.d.records.push({ id, s: score, d: today() });
      M.d.records.sort((a, b) => b.s - a.s); M.d.records = M.d.records.slice(0, 10); M.changed();
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
