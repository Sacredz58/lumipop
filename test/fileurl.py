import os
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath('dist')
MOCK = "window.CrazyGames={SDK:{init:async()=>{},game:{loadingStart(){},loadingStop(){},gameplayStart(){},gameplayStop(){}},ad:{requestAd:(t,c)=>c.adError&&c.adError()},data:{getItem:()=>null,setItem(){}}}};"
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    for t in ('crazygames', 'web'):
        pg = b.new_page(viewport={'width':1280,'height':720}); errs=[]
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append('console: '+m.text) if m.type=='error' else None)
        pg.route('**/crazygames-sdk-v3.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=MOCK))
        pg.goto(f'file://{ROOT}/{t}/index.html?debug')
        pg.wait_for_function('window.__lumi && !document.getElementById("ov").hidden', timeout=20000)
        if pg.locator('[data-act=gift]').count(): pg.click('[data-act=gift]')
        pg.click('[data-act=endless]'); pg.wait_for_timeout(600)
        pg.screenshot(path=f'test/file-{t}.png')
        print(t, 'menu+game ok, errors:', errs or 'none'); pg.close()
    b.close()
