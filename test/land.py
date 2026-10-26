import math
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width':1280,'height':720}, locale='ru-RU'); errs=[]
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://127.0.0.1:8766/web/index.html?debug')
    pg.wait_for_function('window.__lumi && !document.getElementById("ov").hidden')
    if pg.locator('[data-act=gift]').count(): pg.click('[data-act=gift]')
    pg.wait_for_timeout(500); pg.screenshot(path='test/L-menu.png')
    pg.click('[data-act=adventure]'); pg.click('[data-act=level][data-n="1"]'); pg.click('[data-act=startLevel]'); pg.wait_for_timeout(500)
    pg.mouse.move(640, 300); pg.wait_for_timeout(300); pg.screenshot(path='test/L-level.png')
    print('errors', errs or 'none'); b.close()
