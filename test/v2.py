import math, json, sys
from playwright.sync_api import sync_playwright
OUT = 'test/'
W, H = (int(sys.argv[1]), int(sys.argv[2])) if len(sys.argv) > 2 else (390, 844)
tag = sys.argv[3] if len(sys.argv) > 3 else 'p'


def wait_menu(pg):
    pg.wait_for_function('window.__lumi && !document.getElementById("ov").hidden', timeout=20000)


def dismiss(pg):
    for _ in range(6):
        if pg.evaluate('__lumi.st.mode') == 'intro':
            pg.click('[data-act=introOk]'); pg.wait_for_timeout(150)
        else:
            return


def shots(pg, n, angle=None):
    for i in range(n):
        dismiss(pg)
        if pg.evaluate('__lumi.st.mode') != 'play':
            break
        while pg.evaluate('!!__lumi.st.shot'):
            pg.wait_for_timeout(40)
        a = angle if angle is not None else -math.pi / 2 + ((i * 0.37) % 1.6 - 0.8)
        pg.evaluate(f'__lumi.aim({a})'); pg.evaluate('__lumi.shoot()'); pg.wait_for_timeout(120)
    while pg.evaluate('!!__lumi.st.shot'):
        pg.wait_for_timeout(40)
    pg.wait_for_timeout(500)


with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': W, 'height': H}, locale='ru-RU'); errs = []
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('console', lambda m: errs.append('console ' + m.text) if m.type == 'error' else None)
    pg.goto('http://127.0.0.1:8766/web/index.html?debug')
    wait_menu(pg); pg.wait_for_timeout(500)
    pg.screenshot(path=OUT + f'{tag}-1-gift.png')
    if pg.locator('[data-act=gift]').count():
        pg.click('[data-act=gift]'); pg.wait_for_timeout(300)
    pg.screenshot(path=OUT + f'{tag}-2-menu.png')
    print('sparks after gift', pg.evaluate('__lumi.M.d.sparks'))

    # endless with specials + boosters
    pg.click('[data-act=endless]'); pg.wait_for_timeout(400)
    pg.evaluate("__lumi.setRows(['0011223344b','1s2233440a','0A11223344*','11223344bb','0123401234s'])")
    pg.wait_for_timeout(300)
    if not pg.locator('#ov').is_hidden():
        pg.screenshot(path=OUT + f'{tag}-3-intro.png'); pg.click('[data-act=introOk]')
    shots(pg, 3)
    for i in range(5):
        if not pg.locator('#ov').is_hidden():
            pg.click('[data-act=introOk]'); pg.wait_for_timeout(200)
    dismiss(pg); pg.click('#bst-fire'); pg.wait_for_timeout(200)
    pg.evaluate('__lumi.aim(-1.4)'); pg.wait_for_timeout(150)
    pg.screenshot(path=OUT + f'{tag}-4-fireaim.png')
    pg.evaluate('__lumi.shoot()'); pg.wait_for_timeout(250); pg.screenshot(path=OUT + f'{tag}-5-fire.png')
    shots(pg, 0)
    dismiss(pg); pg.click('#bst-bolt'); shots(pg, 1, -1.9); dismiss(pg)
    pg.screenshot(path=OUT + f'{tag}-6-endless.png')
    print('endless', pg.evaluate('({score:__lumi.st.score, mode:__lumi.st.mode, inv:__lumi.M.d.inv, sparks:__lumi.M.d.sparks})'))

    # pause -> menu -> continue shows
    dismiss(pg); pg.click('#bPause'); pg.wait_for_timeout(200); pg.screenshot(path=OUT + f'{tag}-7-pause.png')
    pg.click('[data-act=main]'); pg.wait_for_timeout(300)
    print('continue button', pg.locator('[data-act=continue]').count())

    # adventure level 1 -> win by clearing a tiny board
    pg.click('[data-act=adventure]'); pg.wait_for_timeout(300); pg.screenshot(path=OUT + f'{tag}-8-map.png')
    pg.click('[data-act=level][data-n="1"]'); pg.wait_for_timeout(200); pg.screenshot(path=OUT + f'{tag}-9-lvintro.png')
    pg.click('[data-act=startLevel]'); pg.wait_for_timeout(400)
    pg.screenshot(path=OUT + f'{tag}-10-level.png')
    pg.evaluate("__lumi.setRows(['00'])"); pg.evaluate("__lumi.st.current=0; __lumi.st.next=0")
    shots(pg, 1, -math.pi / 2 - 0.5)
    pg.wait_for_timeout(1500); pg.screenshot(path=OUT + f'{tag}-11-win.png')
    print('win', pg.evaluate('({mode:__lumi.st.mode, lv:__lumi.M.d.levels})'))

    # level 5 stars intro + lose by shots
    pg.click('[data-act=adventure]'); pg.wait_for_timeout(200)
    pg.evaluate("__lumi.M.d.levels={1:3,2:2,3:1,4:1}"); pg.click('[data-act=main]'); pg.click('[data-act=adventure]')
    pg.click('[data-act=level][data-n="5"]'); pg.click('[data-act=startLevel]'); pg.wait_for_timeout(700)
    if not pg.locator('#ov').is_hidden():
        pg.screenshot(path=OUT + f'{tag}-12-starintro.png'); pg.click('[data-act=introOk]')
    pg.evaluate('__lumi.st.shots=2'); shots(pg, 3)
    pg.wait_for_timeout(1000); pg.screenshot(path=OUT + f'{tag}-13-lose.png')
    print('lose', pg.evaluate('__lumi.st.mode'), pg.locator('[data-act=cont]').count())
    pg.click('[data-act=cont]'); pg.wait_for_timeout(3000)
    print('after +5', pg.evaluate('({mode:__lumi.st.mode, shots:__lumi.st.shots})'))

    # daily
    dismiss(pg); pg.click('#bPause'); pg.click('[data-act=main]'); pg.wait_for_timeout(200)
    pg.click('[data-act=daily]'); pg.wait_for_timeout(500)
    for i in range(5):
        if not pg.locator('#ov').is_hidden() and pg.locator('[data-act=introOk]').count():
            pg.click('[data-act=introOk]'); pg.wait_for_timeout(200)
    pg.screenshot(path=OUT + f'{tag}-14-daily.png')
    pg.evaluate('__lumi.st.shots=1'); shots(pg, 1); pg.wait_for_timeout(1000)
    pg.screenshot(path=OUT + f'{tag}-15-dailyend.png')
    print('daily', pg.evaluate('__lumi.M.d.daily'))

    # quests, shop, records
    pg.click('[data-act=main]'); pg.wait_for_timeout(200)
    pg.click('[data-act=quests]'); pg.wait_for_timeout(200); pg.screenshot(path=OUT + f'{tag}-16-quests.png')
    pg.click('[data-act=main]'); pg.click('[data-act=shop]'); pg.wait_for_timeout(200)
    pg.evaluate('__lumi.M.d.sparks=1000')
    pg.click('[data-act=tab][data-tab=bgs]'); pg.click('[data-act=tab][data-tab=orbs]')
    pg.screenshot(path=OUT + f'{tag}-17-shop.png')
    pg.click('[data-act=buySkin][data-id=gems]'); pg.wait_for_timeout(200)
    pg.click('[data-act=tab][data-tab=bgs]'); pg.click('[data-act=buySkin][data-id=aurora]'); pg.wait_for_timeout(300)
    pg.screenshot(path=OUT + f'{tag}-18-shopbg.png')
    pg.click('[data-act=main]'); pg.click('[data-act=records]'); pg.wait_for_timeout(200); pg.screenshot(path=OUT + f'{tag}-19-records.png')
    pg.click('[data-act=main]'); pg.click('[data-act=endless]'); pg.wait_for_timeout(600)
    pg.screenshot(path=OUT + f'{tag}-20-skinned.png')
    # reload: everything persists
    pg.reload(); wait_menu(pg); pg.wait_for_timeout(300)
    print('persist', pg.evaluate('({orb:__lumi.M.d.orb, bg:__lumi.M.d.bg, owned:__lumi.M.d.owned, cont:document.querySelectorAll("[data-act=continue]").length})'))
    print('errors:', errs or 'none')
    b.close()
