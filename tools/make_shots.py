#!/usr/bin/env python3
"""Store screenshots of real gameplay (1920x1080, or 1080x1920 with `portrait`) from a dist/<target> build.

  python3 tools/make_shots.py <target> <out dir> [portrait]

The storefront SDK is blocked, so the build runs offline; the bot from make_video.py plays.
"""
import os, sys, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
TARGET, OUT = sys.argv[1], sys.argv[2]
PORTRAIT = len(sys.argv) > 3 and sys.argv[3] == 'portrait'
VIEW, DPR = ((540, 960), 2) if PORTRAIT else ((1280, 720), 1.5)
SHOTS = [('lumi', 'night', 0, None), ('candy', 'dawn', 1, 'fire'), ('planets', 'aurora', 2, 'nova'), ('gems', 'ocean', 3, None)]
os.makedirs(OUT, exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    for i, (skin, sky, warm, extra) in enumerate(SHOTS):
        ctx = b.new_context(viewport={'width': VIEW[0], 'height': VIEW[1]}, device_scale_factor=DPR)
        pg = ctx.new_page()
        pg.route('**/*sdk*.js', lambda r: r.abort())
        pg.goto((ROOT / f'dist/{TARGET}/index.html').as_uri() + '?debug')
        pg.wait_for_function('window.__lumi && !document.getElementById("ov").hidden', timeout=30000)
        if pg.locator('[data-act=gift]').count(): pg.click('[data-act=gift]')
        pg.evaluate(f'''() => {{ const M = __lumi.M; for (const k of ['star','ice','bomb','stone','cham']) M.d.seen['sp_' + k] = 1;
            M.d.owned = ['lumi','candy','gems','planets','night','dawn','ocean','aurora']; M.d.inv = {{ fire: 3, bolt: 2, rainbow: 4 }};
            M.setSkin('orbs', '{skin}'); M.setSkin('bgs', '{sky}'); Game.applySkins(); __lumi.st.tutorial = true; }}''')
        if i == 3:   # the last one in Adventure: level goal in the HUD
            pg.click('[data-act=adventure]'); pg.click('[data-act=level][data-n="1"]'); pg.click('[data-act=startLevel]')
        else:
            pg.click('[data-act=endless]')
        pg.wait_for_timeout(600)
        if warm: pg.evaluate('__lumi.setScore(%d)' % (2600 * warm))
        for _ in range(2 + warm):
            pg.evaluate('__lumi.aim(__lumi.plan()); __lumi.shoot()')
            for _ in range(100):
                pg.evaluate("document.querySelector('[data-act=introOk]') && document.querySelector('[data-act=introOk]').click()")
                if pg.evaluate('!__lumi.st.shot && __lumi.st.mode === "play"'): break
                pg.wait_for_timeout(100)
            pg.wait_for_timeout(400)
        if extra == 'fire': pg.click('#bst-fire')
        if extra == 'nova': pg.evaluate('__lumi.give(__lumi.codes.NOVA)')
        pg.evaluate('__lumi.manual()')
        pg.evaluate('__lumi.aim(__lumi.plan())')
        for _ in range(3): pg.evaluate('__lumi.step(33.3)')
        pg.evaluate('__lumi.shoot()')
        for _ in range(16): pg.evaluate('__lumi.step(33.3)')     # mid-pop: bursts, falling orbs, combo text
        pg.evaluate('__lumi.aim(__lumi.plan())'); pg.evaluate('__lumi.step(33.3)')
        pg.screenshot(path=os.path.join(OUT, f'shot-{i + 1}-{skin}.png'))
        ctx.close(); print('shot', i + 1, skin)
    b.close()
