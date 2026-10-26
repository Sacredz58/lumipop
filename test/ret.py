import math
from playwright.sync_api import sync_playwright
OUT = 'test/'


def dismiss(pg):
    for _ in range(6):
        if pg.evaluate('__lumi.st.mode') == 'intro':
            pg.click('[data-act=introOk]'); pg.wait_for_timeout(150)


with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 390, 'height': 844}, locale='ru-RU'); errs = []
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.goto('http://127.0.0.1:8766/web/index.html?debug')
    pg.wait_for_function('window.__lumi && !document.getElementById("ov").hidden')
    if pg.locator('[data-act=gift]').count(): pg.click('[data-act=gift]')
    pg.wait_for_timeout(400); pg.screenshot(path=OUT + 'r1-menu.png')
    # chest
    pg.click('[data-act=chest]'); pg.wait_for_timeout(300); pg.screenshot(path=OUT + 'r2-chest.png')
    pg.click('[data-act=chestOpen]'); pg.wait_for_timeout(300); pg.screenshot(path=OUT + 'r3-chestgot.png')
    pg.click('[data-act=main]'); pg.click('[data-act=chest]'); pg.wait_for_timeout(300); pg.screenshot(path=OUT + 'r4-chestwait.png')
    pg.click('[data-act=chestAd]'); pg.wait_for_timeout(3200); print('chest via ad shown:', pg.locator('text=В сундуке').count())
    pg.click('[data-act=main]')
    # constellations with 22 stars
    pg.evaluate("for(let i=1;i<=8;i++) __lumi.M.d.levels[i]=3; __lumi.M.d.levels[9]=2; __lumi.M.changed()")
    pg.click('[data-act=adventure]'); pg.wait_for_timeout(200); pg.click('[data-act=cons]'); pg.wait_for_timeout(300)
    pg.screenshot(path=OUT + 'r5-cons.png')
    # win level 10 -> claims Lyra (26 stars >= 15), xp bar
    pg.click('[data-act=adventure]'); pg.click('[data-act=level][data-n="10"]'); pg.click('[data-act=startLevel]'); pg.wait_for_timeout(500); dismiss(pg)
    pg.evaluate("__lumi.M.d.xp = 95"); pg.evaluate("__lumi.setRows(['00'])"); pg.evaluate("__lumi.st.current=0; __lumi.st.next=0")
    pg.evaluate('__lumi.aim(-2.1)'); pg.evaluate('__lumi.shoot()'); pg.wait_for_timeout(3000)
    pg.screenshot(path=OUT + 'r6-win.png')
    print('after win', pg.evaluate('({plevel:__lumi.M.d.plevel, xp:__lumi.M.d.xp, cons:__lumi.M.d.cons, sparks:__lumi.M.d.sparks})'))
    # endless near miss
    pg.click('[data-act=adventure]'); pg.click('[data-act=main]')
    pg.evaluate('__lumi.st.best = 5000'); pg.click('[data-act=endless]'); pg.wait_for_timeout(400); dismiss(pg)
    pg.evaluate('__lumi.setScore(4600)'); pg.evaluate('__lumi.fill(7)')
    while pg.evaluate('__lumi.st.mode') in ('play', 'intro'):
        dismiss(pg)
        while pg.evaluate('!!__lumi.st.shot'): pg.wait_for_timeout(40)
        pg.evaluate('__lumi.aim(-1.3)'); pg.evaluate('__lumi.shoot()'); pg.wait_for_timeout(150)
    pg.wait_for_selector('[data-act=again]'); pg.wait_for_timeout(1500); pg.screenshot(path=OUT + 'r7-over.png')
    pg.click('[data-act=main]'); pg.wait_for_timeout(300); pg.screenshot(path=OUT + 'r8-menu2.png')
    print('errors:', errs or 'none'); b.close()
