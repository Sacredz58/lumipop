from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    for (w,h,tag,dpr) in [(390,844,'phone',2),(1280,720,'desk',1)]:
        pg = b.new_page(viewport={'width':w,'height':h}, device_scale_factor=dpr, locale='ru-RU'); errs=[]
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://127.0.0.1:8766/web/index.html?debug')
        pg.wait_for_function('window.__lumi && !document.getElementById("ov").hidden')
        if pg.locator('[data-act=gift]').count(): pg.click('[data-act=gift]')
        pg.wait_for_timeout(300); pg.screenshot(path=f'test/o-{tag}-menu.png')
        pg.click('[data-act=endless]'); pg.wait_for_timeout(300)
        pg.evaluate("__lumi.M.d.seen={sp_ice:1,sp_cham:1,sp_stone:1,sp_bomb:1,sp_star:1}")
        pg.evaluate("__lumi.setRows(['00112233445','1122334450','a0s11b2233*','A1122334450','22334455001','3344550011'])")
        pg.evaluate('__lumi.aim(-1.25)'); pg.wait_for_timeout(500)
        pg.screenshot(path=f'test/o-{tag}-play.png')
        print(tag, 'errors', errs or 'none'); pg.close()
    b.close()
