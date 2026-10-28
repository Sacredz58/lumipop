from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width':390,'height':844}, locale='ru-RU'); errs=[]
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://127.0.0.1:8766/web/index.html?debug')
    pg.wait_for_function('window.__lumi && !document.getElementById("ov").hidden')
    if pg.locator('[data-act=gift]').count(): pg.click('[data-act=gift]')
    pg.click('[data-act=endless]'); pg.wait_for_timeout(300)
    S = "({mode:__lumi.st.mode, fire:__lumi.M.d.inv.fire, sparks:__lumi.M.d.sparks, cur:__lumi.st.current, card:!document.getElementById('ov').hidden})"
    pg.evaluate("__lumi.M.d.inv.fire=0; __lumi.M.d.sparks=100; __lumi.M.changed()")
    pg.keyboard.press('Digit1'); pg.wait_for_timeout(300); print('key 1, none left :', pg.evaluate(S))
    pg.screenshot(path='test/boost-card.png')
    pg.click('[data-act=cancelB]'); pg.wait_for_timeout(200); print('after cancel     :', pg.evaluate(S))
    pg.click('#bst-fire'); pg.wait_for_timeout(200); pg.click('[data-act=buyUseB]'); pg.wait_for_timeout(300)
    print('after buy (FIRE=11):', pg.evaluate(S))
    pg.evaluate("__lumi.st.current=0; __lumi.M.d.inv.bolt=0; __lumi.M.d.sparks=10; __lumi.M.changed()")
    pg.keyboard.press('Digit2'); pg.wait_for_timeout(300)
    print('no sparks: buy disabled =', pg.locator('[data-act=buyUseB]').is_disabled(), '|', pg.evaluate(S))
    pg.screenshot(path='test/boost-nosparks.png'); pg.click('[data-act=cancelB]')
    pg.evaluate("__lumi.M.d.inv.rainbow=2; __lumi.M.changed()"); pg.keyboard.press('Digit3'); pg.wait_for_timeout(200)
    print('has stock (RAINBOW=6):', pg.evaluate("({cur:__lumi.st.current, rainbow:__lumi.M.d.inv.rainbow, card:!document.getElementById('ov').hidden})"))
    print('errors', errs or 'none'); b.close()
