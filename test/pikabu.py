"""Pikabu build against a mocked PkbSDK: Russian name and language, gameStarted, cloud saves, ads; then with the SDK blocked."""
import pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
MOCK = r"""
window.__pk = { calls: [], store: {} };
const log = (n) => window.__pk.calls.push(n);
window.PkbSDK = { init: async () => (log('init'), {
  gameStarted() { log('gameStarted'); },
  player: { id: 'p1', name: 'Тест', isAuthorized: false },
  ads: {
    fullscreen: { isSupported: true, canShow: async () => (log('fs.canShow'), true), show: async () => (log('fs.show'), { rendered: true }) },
    rewarded: { isSupported: true, canShow: async () => true, show: async () => (log('rw.show'), { rendered: true, reward: true }) },
    preloader: { isSupported: false, canShow: async () => false, show: async () => ({ rendered: false, reason: 'NOT_SUPPORTED' }) },
  },
  storage: {
    get: (k) => (log('get:' + k), window.__pk.store[k] ? JSON.parse(JSON.stringify(window.__pk.store[k])) : undefined),
    set: (k, v) => { log('set:' + k); window.__pk.store[k] = JSON.parse(JSON.stringify(v)); },
    flush: async () => (log('flush'), { success: true }),
  },
  on() { return () => {}; },
}) };
"""

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    for blocked in (False, True, 'hang'):
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='en-US')   # English browser: Pikabu still starts in Russian
        pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        if blocked == 'hang': pg.route('**/sdk/sdk.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body='window.PkbSDK = { init: () => new Promise(() => {}) };'))
        elif blocked: pg.route('**/sdk/sdk.js', lambda r: r.abort())
        else: pg.route('**/sdk/sdk.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=MOCK))
        # Pikabu runs the game inside its own frame, so the test does too
        host = ROOT / 'dist/pikabu-host.html'
        host.write_text('<!doctype html><body style="margin:0"><iframe src="pikabu/index.html?debug" style="border:0;width:100vw;height:100vh"></iframe></body>')
        pg.goto(host.as_uri()); pg.wait_for_timeout(500)
        top = pg; pg = next(f for f in top.frames if f.url.endswith('index.html?debug'))
        pg.wait_for_function('window.__lumi && !document.getElementById("ov").hidden', timeout=20000)
        if pg.locator('[data-act=gift]').count(): pg.click('[data-act=gift]'); pg.wait_for_timeout(300)
        title = pg.inner_text('.title').replace('\n', ' / ')
        menu = pg.inner_text('#ov')
        top.screenshot(path=str(ROOT / f'test/pk-menu-{blocked}.png'))
        pg.click('[data-act=endless]'); pg.wait_for_timeout(500)
        for _ in range(3):
            pg.evaluate('__lumi.aim(__lumi.plan()); __lumi.shoot()'); pg.wait_for_timeout(900)
        reward = pg.evaluate('Platform.rewarded(() => {})')
        pg.wait_for_timeout(1000)
        info = {'title': title, 'russian': 'Бесконечный' in menu, 'doc.title': pg.title(), 'reward': reward, 'errors': errs or 'none'}
        if not blocked:
            calls = pg.evaluate('__pk.calls')
            info['calls'] = sorted(set(c for c in calls))
            info['saved'] = bool(pg.evaluate("!!__pk.store['lumipop_save_v1']"))
        print({False: 'SDK', True: 'BLOCKED', 'hang': 'HANGING INIT'}[blocked], info)
        ctx.close()
    host.unlink()
    b.close()
