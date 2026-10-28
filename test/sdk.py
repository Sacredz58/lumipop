import math, json
from playwright.sync_api import sync_playwright
LOG = "window.__calls=window.__calls||[];const L=(n)=>window.__calls.push(n);"
MOCK = {
 'yandex': LOG + """window.YaGames={init:async()=>({environment:{i18n:{lang:'ru'}},features:{LoadingAPI:{ready:()=>L('ready')},GameplayAPI:{start:()=>L('gpStart'),stop:()=>L('gpStop')}},
   adv:{showFullscreenAdv:({callbacks:c})=>{L('fullscreen');c.onOpen();setTimeout(()=>c.onClose(true),300)},showRewardedVideo:({callbacks:c})=>{L('rewarded');c.onOpen();c.onRewarded();setTimeout(()=>c.onClose(),300)}},
   getPlayer:async()=>({getData:async()=>{L('getData');return {}},setData:async(d)=>{L('setData')}}),on:(e)=>L('on:'+e)})};""",
 'poki': LOG + """window.PokiSDK={init:async()=>L('init'),gameLoadingFinished:()=>L('ready'),gameplayStart:()=>L('gpStart'),gameplayStop:()=>L('gpStop'),
   commercialBreak:async(f)=>{L('commercial');f&&f()},rewardedBreak:async(f)=>{L('rewarded');f&&f();return true}};""",
 'crazygames': LOG + """window.CrazyGames={SDK:{init:async()=>L('init'),game:{loadingStart:()=>L('loadStart'),loadingStop:()=>L('ready'),gameplayStart:()=>L('gpStart'),gameplayStop:()=>L('gpStop')},
   ad:{requestAd:(t,c)=>{L('ad:'+t);c.adStarted();setTimeout(()=>c.adFinished(),200)}},data:{getItem:()=>{L('getItem');return null},setItem:()=>L('setItem')}}};""",
 'vk': LOG + """window.vkBridge={send:async(m,p)=>{L(m+(p&&p.ad_format?':'+p.ad_format:''));if(m==='VKWebAppStorageGet')return {keys:[{key:'x',value:''}]};return {result:true}},subscribe:()=>L('subscribe')};""",
}
URL = {'yandex': '**/sdk.js', 'poki': '**/poki-sdk.js', 'crazygames': '**/crazygames-sdk-v3.js', 'vk': '**/browser.min.js'}


def play_until_over(pg, angle):
    while pg.evaluate('__lumi.st.mode') in ('play', 'intro'):
        if pg.evaluate('__lumi.st.mode') == 'intro':
            pg.click('[data-act=introOk]'); continue
        while pg.evaluate('!!__lumi.st.shot'):
            pg.wait_for_timeout(40)
        pg.evaluate(f'__lumi.aim({angle})'); pg.evaluate('__lumi.shoot()'); pg.wait_for_timeout(150)
    pg.wait_for_selector('[data-act=again]')


with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    for t in MOCK:
        pg = b.new_page(viewport={'width': 390, 'height': 844}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.route(URL[t], lambda r, req=None, body=MOCK[t]: r.fulfill(status=200, content_type='application/javascript', body=body))
        top = pg
        if t == 'vk':   # VK runs the game inside its frame (outside it the platform code skips the bridge)
            open('dist/vk-host.html', 'w').write('<!doctype html><body style="margin:0"><iframe src="vk/index.html?debug&vk_language=0" style="border:0;width:100vw;height:100vh"></iframe></body>')
            pg.goto('http://127.0.0.1:8766/vk-host.html'); pg.wait_for_timeout(500)
            pg = next(f for f in top.frames if 'vk/index.html' in f.url)
        else:
            pg.goto(f'http://127.0.0.1:8766/{t}/index.html?debug')
        pg.wait_for_function('window.__lumi && !document.getElementById("ov").hidden')
        if pg.locator('[data-act=gift]').count(): pg.click('[data-act=gift]')
        pg.click('[data-act=endless]'); top.mouse.click(195, 300); pg.wait_for_timeout(1500)
        pg.evaluate("Platform._lastInterstitial=0")
        pg.evaluate('__lumi.fill(6)')
        play_until_over(pg, -1.2)
        pg.click('[data-act=cont]'); pg.wait_for_timeout(800)
        pg.evaluate('__lumi.fill(8)')
        play_until_over(pg, -1.9)
        pg.click('[data-act=again]'); pg.wait_for_timeout(1200)
        calls = pg.evaluate('window.__calls')
        dedup = []
        for c in calls:
            if not dedup or dedup[-1] != c:
                dedup.append(c)
        print(t, '| lang', pg.evaluate('document.documentElement.lang'), '| mode', pg.evaluate('__lumi.st.mode'))
        print('   ', ' > '.join(dedup)); print('    errors:', errs or 'none')
        top.close()
    # VK build opened directly with a bridge that never answers: the menu still comes up
    pg = b.new_page(viewport={'width': 390, 'height': 844}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route('**/browser.min.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body='window.vkBridge={send:()=>new Promise(()=>{}),subscribe:()=>{}};'))
    pg.goto('http://127.0.0.1:8766/vk/index.html?debug')
    pg.wait_for_function('window.__lumi && !document.getElementById("ov").hidden', timeout=15000)
    print('vk direct | menu up, lang', pg.evaluate('document.documentElement.lang'), '| errors:', errs or 'none')
    b.close()
