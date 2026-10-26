import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
from playwright.sync_api import sync_playwright
shots = [("portrait",390,844),("landscape",1280,720),("over",390,844),("palette",1120,300),("nova",500,400)]
with sync_playwright() as p:
    b = p.chromium.launch()
    for mode,w,h in shots:
        pg = b.new_page(viewport={"width":w,"height":h}, device_scale_factor=1)
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(f"file://{HERE}/mock.html?mode={mode}&w={w}&h={h}")
        pg.wait_for_function("document.title==='done'", timeout=10000)
        pg.locator("canvas").screenshot(path=os.path.join(HERE, f"{mode}.png"))
        print(mode, errs)
    b.close()
