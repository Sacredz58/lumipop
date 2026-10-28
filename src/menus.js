/* Lumi Pop — menus and result cards (DOM). Talks to window.Game, window.Meta, window.Platform. */
(function () {
  'use strict';
  const G = window.Game, M = window.Meta, I = window.I18n, P = window.Platform, S = window.Sfx, LV = window.Levels;
  const t = (k, v) => I.t(k, v), fmt = I.fmt, $ = (id) => document.getElementById(id);
  const ov = $('ov');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const ICON = {
    globe: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.5 5.7 3.5 9s-1 6.3-3.5 9c-2.5-2.7-3.5-5.7-3.5-9s1-6.3 3.5-9z"/></svg>',
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
  const isRu = () => I.L === I.ru;
  const langBtn = () => `<button class="langb" data-act="lang" aria-label="${isRu() ? 'Switch to English' : 'Переключить на русский'}">${ICON.globe}<b>${isRu() ? 'RU' : 'EN'}</b></button>`;
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
      <div class="title">${esc(P.title.main)}${P.title.sub ? `<small>${esc(P.title.sub)}</small>` : ''}</div>
      <div class="top2">${wallet()}${levelPill()}${langBtn()}</div>
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
  function buyBoosterCard(d) {
    const can = M.d.sparks >= d.price;
    show('buyB', `
      <div class="eyebrow">${t('noBoosters')}</div>
      ${img(d.img, 'sp')}
      <div class="h2">${t('b_' + d.id)}</div>
      <div class="sub">${t('b_' + d.id + 'D')}</div>
      ${btn('buyUseB', `${t('buyUse', { n: '' })}${ICON.spark} ${d.price}`, 'primary', `data-id="${d.id}" ${can ? 'data-focus' : 'disabled'}`)}
      <div class="sub">${can ? t('haveSparks', { n: ICON.spark + ' ' + fmt(M.d.sparks) }) : t('noSparks')}</div>
      ${btn('cancelB', t('cancel'), 'ghost', can ? '' : 'data-focus')}`);
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
    // no world board outside Yandex: show only the player's own records, never name another storefront
    if (!P.hasLeaderboard()) tab = 'mine';
    const tabs = !P.hasLeaderboard() ? '' : `<div class="tabs">${['world', 'mine'].map((k) => `<button class="${tab === k ? 'on' : ''}" data-act="recTab" data-tab="${k}">${t(k)}</button>`).join('')}</div>`;
    const frame = (body) => show('records', `<div class="eyebrow">${t('records').toUpperCase()}</div>${tabs}<div class="list">${body}</div>${btn('main', t('back'))}`, 'wide');
    if (tab === 'mine') {
      const r = M.d.records, best = Math.max(G.st.best || 0, r.length ? r[0].s : 0);
      const lvl = Math.min(M.nextLevel(), LV.TOTAL);
      const sum = `
        <div class="rec"><span class="nm">${t('recBest')}</span><b>${best ? fmt(best) : t('recNone')}</b></div>
        <div class="rec"><span class="nm">${t('recDaily')}</span><b>${M.d.daily.best ? fmt(M.d.daily.best) : t('recNone')}</b></div>
        <div class="rec"><span class="nm">${t('recAdv')}</span><b>${t('recAdvV', { n: lvl, s: ICON.star + ' ' + M.totalStars() })}</b></div>`;
      const runs = r.length ? `<div class="eyebrow" style="margin-top:6px">${t('recRuns')}</div>` + r.map((x, i) => `<div class="rec"><span>${i + 1}</span><span class="nm">${esc(x.d)}</span><b>${fmt(x.s)}</b></div>`).join('')
        : `<div class="sub" style="margin:4px auto 0">${t('noRecords')}</div>`;
      frame(sum + runs);
      return;
    }
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
      case 'buyUseB': if (M.buyBooster(d.id)) { S.coin(); hide(); G.introDone(); G.useBooster(d.id); } break;
      case 'cancelB': hide(); G.introDone(); break;
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
      case 'lang': M.d.lang = isRu() ? 'en' : 'ru'; I.set(M.d.lang); applyLang(); G.updateBoosters(); M.changed(); mainMenu(); break;
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
    document.querySelectorAll('.brand').forEach((el) => { el.textContent = P.title.hud; }); document.title = P.title.sub ? `${P.title.main}: ${P.title.sub}` : P.title.main;
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
  G.on('buyBooster', buyBoosterCard);
  G.on('quest', (list) => { S.coin(); G.toast(list.map((q) => '✓ ' + t('q_' + q.id, { n: q.id === 'score' ? fmt(q.n) : q.n })).join('\n')); });
  M.on(() => { if (screen === 'main' || screen === 'shop' || screen === 'quests') { const w = ov.querySelector('.wallet b'); if (w) w.textContent = fmt(M.d.sparks); } G.updateBoosters(); });
})();
