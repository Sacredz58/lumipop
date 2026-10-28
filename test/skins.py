from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width':390,'height':844}, device_scale_factor=2, locale='ru-RU'); errs=[]
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://127.0.0.1:8766/web/index.html?debug')
    pg.wait_for_function('window.__lumi && !document.getElementById("ov").hidden')
    if pg.locator('[data-act=gift]').count(): pg.click('[data-act=gift]')
    pg.evaluate("__lumi.M.d.sparks=2000; __lumi.M.changed()")
    pg.click('[data-act=shop]'); pg.wait_for_timeout(600); pg.screenshot(path='test/sk-shop.png')
    for sk in ('candy','gems','planets'):
        pg.click(f'[data-act=buySkin][data-id={sk}]') if pg.locator(f'[data-act=buySkin][data-id={sk}]').count() else pg.click(f'[data-act=useSkin][data-id={sk}]')
        pg.wait_for_timeout(400)
        pg.screenshot(path=f'test/sk-shop-{sk}.png')
        pg.click('[data-act=main]'); pg.click('[data-act=endless]'); pg.wait_for_timeout(400)
        pg.screenshot(path=f'test/sk-{sk}.png', clip={'x':0,'y':180,'width':390,'height':230})
        if pg.evaluate('__lumi.st.mode') == 'intro': pg.click('[data-act=introOk]')
        pg.click('#bPause'); pg.click('[data-act=main]'); pg.click('[data-act=shop]'); pg.wait_for_timeout(200)
    print('errors', errs or 'none'); b.close()
