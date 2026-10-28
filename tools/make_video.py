#!/usr/bin/env python3
"""Gameplay preview clips, frame by frame on a manually stepped game clock (smooth 30 fps whatever the machine).

  python3 tools/make_video.py <landscape|portrait> <frames dir>

Serves nothing itself: expects `python3 -m http.server 8766 --directory dist` running.
A bot aims at the group that pops and drops the most (window.__lumi.plan, ?debug builds only).
"""
import base64, json, os, sys
from playwright.sync_api import sync_playwright

MODE, OUT = sys.argv[1], sys.argv[2]
FPS = 30
VIEW = {'landscape': ((1280, 720), 1.5), 'portrait': ((540, 810), 2)}[MODE]
# (orb skin, sky, seconds, extra action)
CLIPS = [('lumi', 'night', 6.0, None), ('candy', 'dawn', 4.5, 'fire'), ('planets', 'aurora', 4.5, 'nova'), ('gems', 'ocean', 3.5, None)]
os.makedirs(OUT, exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    n = 0
    only = [int(x) for x in os.environ.get('ONLY', '').split(',') if x]
    for ci, (skin, sky, secs, extra) in enumerate(CLIPS):
        if only and ci not in only: continue
        ctx = b.new_context(viewport={'width': VIEW[0][0], 'height': VIEW[0][1]}, device_scale_factor=VIEW[1], locale='en-US')
        pg = ctx.new_page()
        pg.goto('http://127.0.0.1:8766/web/index.html?debug')
        pg.wait_for_function('!!window.__lumi', timeout=30000)
        if pg.locator('[data-act=gift]').count(): pg.click('[data-act=gift]')
        pg.evaluate(f'''() => {{ const M = __lumi.M; M.seen = () => true; for (const k of ['star','ice','bomb','stone','cham']) M.d.seen['sp_' + k] = 1;
            M.d.owned = ['lumi','candy','gems','planets','night','dawn','ocean','aurora']; M.d.inv = {{ fire: 9, bolt: 9, rainbow: 9 }};
            M.setSkin('orbs', '{skin}'); M.setSkin('bgs', '{sky}'); Game.applySkins(); __lumi.st.tutorial = true; }}''')
        pg.click('[data-act=endless]')
        pg.wait_for_timeout(600)
        if ci: pg.evaluate('__lumi.setScore(%d)' % (2600 * ci))
        # warm-up shots off camera so the board has some history
        for _ in range(2 + ci):
            pg.evaluate('__lumi.aim(__lumi.plan()); __lumi.shoot()')
            for _ in range(100):
                pg.evaluate("document.querySelector('[data-act=introOk]') && document.querySelector('[data-act=introOk]').click()")
                if pg.evaluate('!__lumi.st.shot && __lumi.st.mode === "play"'): break
                pg.wait_for_timeout(100)
            pg.wait_for_timeout(500)
        if extra == 'fire': pg.click('#bst-fire')
        if extra == 'nova': pg.evaluate('__lumi.give(__lumi.codes.NOVA)')
        pg.evaluate('__lumi.manual()')
        state = {'phase': 'wait', 't': 0, 'from': 0, 'to': 0}
        frames = int(secs * FPS)
        for f in range(frames):
            st = pg.evaluate('({shot: !!__lumi.st.shot, mode: __lumi.st.mode, a: __lumi.st.aimA})')
            if st['mode'] == 'intro': pg.evaluate("document.querySelector('[data-act=introOk]') && document.querySelector('[data-act=introOk]').click()")
            if st['mode'] == 'play' and not st['shot']:
                if state['phase'] == 'wait':
                    state['t'] += 1
                    if state['t'] > 10:
                        state = {'phase': 'aim', 't': 0, 'from': st['a'], 'to': pg.evaluate('__lumi.plan()')}
                elif state['phase'] == 'aim':
                    state['t'] += 1; k = min(1, state['t'] / 9); e = k * k * (3 - 2 * k)
                    pg.evaluate(f"__lumi.aim({state['from'] + (state['to'] - state['from']) * e})")
                    if k >= 1:
                        pg.evaluate('__lumi.shoot()'); state = {'phase': 'wait', 't': 0, 'from': 0, 'to': 0}
            pg.evaluate(f'__lumi.step({1000 / FPS})')
            pg.screenshot(path=os.path.join(OUT, f'c{ci}_{f:04d}.jpg'), type='jpeg', quality=93)
            n += 1
        print(f'clip {ci} {skin}/{sky}: {frames} frames, score', pg.evaluate('__lumi.st.score'), 'mode', pg.evaluate('__lumi.st.mode'))
        ctx.close()
    b.close()
    json.dump({'clips': [[c[0], int(c[2] * FPS)] for c in CLIPS], 'fps': FPS}, open(os.path.join(OUT, 'clips.json'), 'w'))
