"""Pikabu ads at natural breaks: fullscreen after a won level, and the 120 s cap holds."""
import pathlib, sys, re

from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
MOCK = re.search(r'MOCK = r"""(.*?)"""', open(ROOT / 'test/pikabu.py').read(), re.S).group(1)
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 390, 'height': 844})
    pg.route('**/sdk/sdk.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=MOCK))
    host = ROOT / 'dist/pikabu-host.html'
    host.write_text('<!doctype html><body style="margin:0"><iframe src="pikabu/index.html?debug" style="border:0;width:100vw;height:100vh"></iframe></body>')
    pg.goto(host.as_uri()); pg.wait_for_timeout(500)
    f = next(x for x in pg.frames if 'index.html' in x.url)
    f.wait_for_function('window.__lumi && !document.getElementById("ov").hidden', timeout=20000)
    if f.locator('[data-act=gift]').count(): f.click('[data-act=gift]')
    res = {}
    # win level 1, then "next" -> fullscreen
    f.click('[data-act=adventure]'); f.click('[data-act=level][data-n="1"]'); f.click('[data-act=startLevel]'); f.wait_for_timeout(400)
    f.evaluate("__lumi.setRows(['00']); __lumi.st.current=0; __lumi.st.next=0")
    f.evaluate('__lumi.aim(-Math.PI/2-0.5); __lumi.shoot()'); f.wait_for_selector('[data-act=next]', timeout=15000)
    f.evaluate('Platform._lastInterstitial = 0'); n0 = f.evaluate("__pk.calls.filter(c => c === 'fs.show').length")
    f.click('[data-act=next]'); f.wait_for_timeout(600)
    res['next -> fullscreen'] = f.evaluate("__pk.calls.filter(c => c === 'fs.show').length") - n0
    # second break within 120 s: capped, no ad
    f.click('[data-act=startLevel]'); f.wait_for_timeout(300)
    f.evaluate("__lumi.setRows(['00']); __lumi.st.current=0; __lumi.st.next=0")
    f.evaluate('__lumi.aim(-Math.PI/2-0.5); __lumi.shoot()'); f.wait_for_selector('[data-act=next]', timeout=15000)
    n1 = f.evaluate("__pk.calls.filter(c => c === 'fs.show').length")
    f.click('[data-act=main]') if f.locator('[data-act=main]').count() else f.click('[data-act=adventure]'); f.wait_for_timeout(600)
    res['second break within 120 s'] = f.evaluate("__pk.calls.filter(c => c === 'fs.show').length") - n1
    res['menu shown'] = not f.evaluate('document.getElementById("ov").hidden')
    print(res); host.unlink(); b.close()
