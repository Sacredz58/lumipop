"""CrazyGames build: records screen has no world tab and names no other storefront; game text has no other portal names."""
import asyncio, pathlib, re
from playwright.async_api import async_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await (await b.new_context(viewport={'width': 390, 'height': 844})).new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.route('**/*crazygames-sdk*', lambda r: r.abort())
        await pg.goto((ROOT / 'dist/crazygames/index.html').as_uri()); await pg.wait_for_timeout(2000)
        if await pg.locator('[data-act=gift]').count(): await pg.click('[data-act=gift]'); await pg.wait_for_timeout(300)
        await pg.click('[data-act=records]'); await pg.wait_for_timeout(400)
        txt = await pg.inner_text('#ov')
        print('world tab:', await pg.locator('[data-act=recTab]').count(), '| mentions:', re.findall(r'(?i)yandex|яндекс|poki|vk', txt), '| errors', errs or 'none')
        await pg.screenshot(path=str(ROOT / 'test/cg-records.png'))
        await b.close()
asyncio.run(main())
