"""Needs `python3 -m http.server 8766 --directory dist`. VK on a phone: the game runs in the VK app's WebView (no iframe) and talks through AndroidBridge / webkit.messageHandlers.
VKWebAppInit must go out before the heavy resources load, and the game must boot with saves and ads working."""
import pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
RESULT = "{VKWebAppInit:{result:true},VKWebAppStorageGet:{keys:[]},VKWebAppStorageSet:{result:true},VKWebAppCheckNativeAds:{result:true},VKWebAppShowNativeAds:{result:true}}"
ANDROID = """
let __px; Object.defineProperty(window, 'PIXI', { configurable: true, get: () => __px, set: (v) => { __px = v; window.__pixiAt = window.__pixiAt || performance.now(); } });
window.__vk = []; window.__t0 = performance.now();
const R = %s;
window.AndroidBridge = new Proxy({}, { get: (_, m) => (json) => {
  const p = JSON.parse(json || '{}'); window.__vk.push([m, performance.now(), p.ad_format || '']);
  setTimeout(() => window.dispatchEvent(new CustomEvent('VKWebAppEvent', { detail: { type: m + 'Result', data: Object.assign({}, R[m] || { result: true }, { request_id: p.request_id }) } })), 30);
} });
""" % RESULT
IOS = """
let __px; Object.defineProperty(window, 'PIXI', { configurable: true, get: () => __px, set: (v) => { __px = v; window.__pixiAt = window.__pixiAt || performance.now(); } });
window.__vk = []; const R = %s;
window.webkit = { messageHandlers: new Proxy({}, { get: (_, m) => ({ postMessage: (p) => {
  window.__vk.push([m, performance.now(), (p && p.ad_format) || '']);
  setTimeout(() => window.dispatchEvent(new CustomEvent('VKWebAppEvent', { detail: { type: m + 'Result', data: Object.assign({}, R[m] || { result: true }, { request_id: p && p.request_id }) } })), 30);
} }) }) };
""" % RESULT

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    for name, mock in (('android', ANDROID), ('ios', IOS)):
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        ctx.add_init_script(mock)
        pg = ctx.new_page(); errs = []; loads = {}
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('request', lambda r: loads.setdefault(r.url.rsplit('/', 1)[-1].split('?')[0], True))
        pg.goto('http://127.0.0.1:8766/vk/index.html?vk_app_id=54863074&vk_language=0&vk_platform=mobile_android&debug')
        pg.wait_for_function('window.__lumi && !document.getElementById("ov").hidden', timeout=20000)
        order = pg.evaluate('''() => ({ init: (window.__vk.find(c => c[0] === 'VKWebAppInit') || [])[1], pixi: window.__pixiAt })''')
        if pg.locator('[data-act=gift]').count(): pg.click('[data-act=gift]')
        pg.click('[data-act=endless]'); pg.wait_for_timeout(500)
        pg.evaluate('__lumi.aim(__lumi.plan()); __lumi.shoot()'); pg.wait_for_timeout(1200)
        reward = pg.evaluate('Platform.rewarded(() => {})')
        calls = [c[0] + (':' + c[2] if c[2] else '') for c in pg.evaluate('__vk')]
        print(name, {'VKWebAppInit before Pixi runs': order['init'] is not None and order['pixi'] is not None and order['init'] < order['pixi'],
                     'lang': pg.evaluate('document.documentElement.lang'), 'reward': reward, 'errors': errs or 'none'})
        print('   ', ' > '.join(dict.fromkeys(calls)))
        ctx.close()
    b.close()
