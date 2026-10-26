from playwright.sync_api import sync_playwright
MOCK = """window.__calls=[];const L=(n)=>window.__calls.push(n);
window.YaGames={init:async()=>({environment:{i18n:{lang:'ru'}},features:{LoadingAPI:{ready:()=>L('ready')},GameplayAPI:{start:()=>{},stop:()=>{}}},
 adv:{showFullscreenAdv:({callbacks:c})=>{c.onClose(true)},showRewardedVideo:({callbacks:c})=>{c.onOpen();c.onRewarded();c.onClose()}},
 shortcut:{canShowPrompt:async()=>({canShow:true}),showPrompt:async()=>{L('shortcutPrompt');return {outcome:'accepted'}}},
 feedback:{canReview:async()=>({value:true}),requestReview:async()=>{L('reviewPrompt');return {feedbackSent:true}}},
 leaderboards:{setScore:async(n,s)=>L('setScore:'+n+':'+s),getEntries:async()=>({userRank:2,entries:[{rank:1,score:9000,player:{publicName:'Аня'}},{rank:2,score:4700,player:{publicName:'me'}}]})},
 getPlayer:async()=>({getMode:()=>'',getData:async()=>({}),setData:async()=>{}}),on:()=>{}})};"""
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width':390,'height':844}); errs=[]
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route('**/sdk.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=MOCK))
    pg.goto('http://127.0.0.1:8766/yandex/index.html?debug')
    pg.wait_for_function('window.__lumi && !document.getElementById("ov").hidden')
    if pg.locator('[data-act=gift]').count(): pg.click('[data-act=gift]')
    pg.evaluate('__lumi.M.d.games = 3'); pg.click('[data-act=records]'); pg.click('[data-act=main]'); pg.wait_for_timeout(400)
    print('shortcut tile:', pg.locator('[data-act=shortcut]').count())
    pg.click('[data-act=shortcut]'); pg.wait_for_timeout(400)
    print('after shortcut', pg.evaluate('({done:__lumi.M.d.shortcut, sparks:__lumi.M.d.sparks})'), 'tile now:', pg.locator('[data-act=shortcut]').count())
    pg.click('[data-act=endless]'); pg.wait_for_timeout(300); pg.evaluate('__lumi.setScore(4700)'); pg.evaluate('__lumi.fill(7)')
    while pg.evaluate('__lumi.st.mode') in ('play','intro'):
        if pg.evaluate('__lumi.st.mode')=='intro': pg.click('[data-act=introOk]'); continue
        while pg.evaluate('!!__lumi.st.shot'): pg.wait_for_timeout(40)
        pg.evaluate('__lumi.aim(-1.3)'); pg.evaluate('__lumi.shoot()'); pg.wait_for_timeout(150)
    pg.wait_for_selector('[data-act=again]'); pg.wait_for_timeout(2500)
    pg.click('[data-act=main]'); pg.wait_for_timeout(300); pg.click('[data-act=records]'); pg.click('[data-act=recTab][data-tab=world]'); pg.wait_for_timeout(500)
    pg.screenshot(path='test/ya-world.png')
    print('calls', pg.evaluate('window.__calls'), 'reviewed', pg.evaluate('__lumi.M.d.reviewed'), 'errors', errs or 'none'); b.close()
