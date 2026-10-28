from playwright.sync_api import sync_playwright
def play_over(pg, angle):
    while pg.evaluate('__lumi.st.mode') in ('play','intro'):
        if pg.evaluate('__lumi.st.mode')=='intro': pg.click('[data-act=introOk]'); continue
        while pg.evaluate('!!__lumi.st.shot'): pg.wait_for_timeout(40)
        pg.evaluate(f'__lumi.aim({angle})'); pg.evaluate('__lumi.shoot()'); pg.wait_for_timeout(120)
    pg.wait_for_selector('[data-act=again]')
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width':390,'height':844}, locale='ru-RU'); errs=[]
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://127.0.0.1:8766/web/index.html?debug')
    pg.wait_for_function('window.__lumi && !document.getElementById("ov").hidden')
    if pg.locator('[data-act=gift]').count(): pg.click('[data-act=gift]')
    pg.click('[data-act=records]'); pg.wait_for_timeout(300); pg.screenshot(path='test/rec-empty.png')
    pg.click('[data-act=main]'); pg.click('[data-act=endless]'); pg.wait_for_timeout(300)
    pg.evaluate('__lumi.setScore(3200)'); pg.evaluate('__lumi.fill(7)'); play_over(pg, -1.3)
    print('at game over card:', pg.evaluate('__lumi.M.d.records.map(r=>r.s)'))
    pg.click('[data-act=cont]'); pg.wait_for_timeout(3200); pg.evaluate('__lumi.setScore(4100)'); pg.evaluate('__lumi.fill(8)'); play_over(pg, -1.9)
    print('after continue+over:', pg.evaluate('__lumi.M.d.records.map(r=>r.s)'))
    pg.reload(); pg.wait_for_function('window.__lumi && !document.getElementById("ov").hidden')
    print('after closing tab on the card:', pg.evaluate('__lumi.M.d.records.map(r=>r.s)'))
    pg.click('[data-act=endless]'); pg.wait_for_timeout(300); pg.evaluate('__lumi.setScore(1500)'); pg.evaluate('__lumi.fill(8)'); play_over(pg, -1.3)
    pg.click('[data-act=main]'); pg.click('[data-act=records]'); pg.wait_for_timeout(300); pg.screenshot(path='test/rec-full.png')
    print('second run:', pg.evaluate('__lumi.M.d.records.map(r=>r.s)'))
    pg.evaluate("__lumi.M.d.sparks=900; __lumi.M.changed()"); pg.click('[data-act=main]'); pg.click('[data-act=shop]')
    pg.click('[data-act=buySkin][data-id=planets]'); pg.wait_for_timeout(300); pg.click('[data-act=main]'); pg.click('[data-act=endless]'); pg.wait_for_timeout(400)
    pg.screenshot(path='test/sk-planets.png', clip={'x':0,'y':180,'width':390,'height':230})
    print('errors', errs or 'none'); b.close()
