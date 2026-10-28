"""Language toggle: CrazyGames starts in English, the menu button switches to Russian and the choice survives a reload."""
import asyncio, pathlib
from playwright.async_api import async_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(locale='ru-RU', viewport={'width': 390, 'height': 844}, device_scale_factor=2)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.route('**/*crazygames-sdk*', lambda r: r.abort())
        url = (ROOT / 'dist/crazygames/index.html').as_uri()
        await pg.goto(url); await pg.wait_for_timeout(2000)
        if await pg.locator('[data-act=gift]').count(): await pg.click('[data-act=gift]'); await pg.wait_for_timeout(400)
        before = await pg.inner_text('#ov'); await pg.screenshot(path=str(ROOT / 'test/lang-en.png'))
        await pg.click('[data-act=lang]'); await pg.wait_for_timeout(500)
        after = await pg.inner_text('#ov'); await pg.screenshot(path=str(ROOT / 'test/lang-ru.png'))
        await pg.wait_for_timeout(1500); await pg.reload(); await pg.wait_for_timeout(2000)
        reload = await pg.inner_text('#ov')
        await pg.click('[data-act=endless]'); await pg.wait_for_timeout(800)
        hud = await pg.inner_text('#hudLbl'); tip = await pg.inner_text('#tip')
        print('EN menu:', 'Endless' in before, '| RU after click:', 'Бесконечный' in after, '| RU after reload:', 'Бесконечный' in reload, '| HUD:', hud, '| tip:', tip[:30], '| errors', errs or 'none')
        await b.close()
asyncio.run(main())
