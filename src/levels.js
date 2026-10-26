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
