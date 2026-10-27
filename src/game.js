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
  // painted orb sprites (vendor/orbs.png, 4x4 cells of 128 px, cell index = orb code; 13 = ice shell)
  let ORB_IMG = null;
  function loadOrbAtlas() {
    if (!window.__ORBS__) return Promise.resolve();
    return new Promise((res) => {
      const im = new Image();
      im.onload = () => { ORB_IMG = im; res(); };
      im.onerror = () => res();
      im.src = window.__ORBS__;
    });
  }
  function atlasCell(g, idx, N, alpha) {
    g.globalAlpha = alpha || 1;
    g.drawImage(ORB_IMG, (idx % 4) * 128, Math.floor(idx / 4) * 128, 128, 128, 0, 0, N, N);
    g.globalAlpha = 1;
  }
  function orbCanvas(code, pal, style, N) {
    N = N || 128; const [c, g] = canvas(N), x = N / 2, y = N / 2, r = N / 2 - 2;
    const st = style || STYLE;
    if (ORB_IMG && (code >= 6 || st === 'glow')) atlasCell(g, code, N);
    else if (code < 6) drawColorOrb(g, code, x, y, r, pal || PAL, st); else drawSpecial(g, code, x, y, r);
    return c;
  }
  function iceOverlay() {
    const N = 128, [c, g] = canvas(N), x = N / 2, y = N / 2, r = N / 2 - 2;
    if (ORB_IMG) { atlasCell(g, 13, N, 0.9); return c; }
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
    await loadOrbAtlas();
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
