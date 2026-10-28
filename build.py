#!/usr/bin/env python3
"""Lumi Pop build: one source, one archive per storefront.

  python3 build.py            -> dist/<target>/ + dist/lumipop-<target>.zip for every target
                                  dist/lumipop-artifact.html (single file for the web demo)
"""
import base64, os, re, shutil, zipfile

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC, VENDOR, DIST = (os.path.join(ROOT, d) for d in ('src', 'vendor', 'dist'))

SDK = {
    'web': '',
    'yandex': '<script src="/sdk.js"></script>',
    'crazygames': '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>',
    'poki': '<script src="https://game-cdn.poki.com/scripts/v2/poki-sdk.js"></script>',
    'vk': '<script src="https://unpkg.com/@vkontakte/vk-bridge@2.15.2/dist/browser.min.js"></script>',
    'pikabu': '<script src="https://games.pikabu.ru/sdk/sdk.js"></script>',
}
PIXI_CDN = 'https://cdn.jsdelivr.net/npm/pixi.js@8.6.6/dist/pixi.min.js'


def read(*p):
    with open(os.path.join(*p), encoding='utf-8') as f:
        return f.read()


def webp_data_uri(name):
    """vendor/<name>.png as an inlined WebP data URI (5x lighter than PNG; works from file:// too)."""
    path = os.path.join(VENDOR, name + '.png')
    if not os.path.exists(path):
        return ''
    from PIL import Image
    import io
    buf = io.BytesIO()
    Image.open(path).convert('RGBA').save(buf, 'WEBP', quality=92, method=6, alpha_quality=100)
    return 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode()


_URI = {}
def game_js(orbs=None):
    if 'orbs' not in _URI:
        _URI['orbs'], _URI['skins'] = webp_data_uri('orbs'), webp_data_uri('skins')
    orbs = orbs if orbs is not None else _URI['orbs']
    music = os.path.join(VENDOR, 'music.json')
    head = f'window.__MUSIC__ = {read(music).strip()};\n' if os.path.exists(music) else ''
    if orbs:
        head += f'window.__ORBS__ = "{orbs}";\n'
    if _URI['skins']:
        head += f'window.__SKINS__ = "{_URI["skins"]}";\n'
    return head + '\n'.join(read(SRC, n) for n in ('platform.js', 'audio.js', 'i18n.js', 'levels.js', 'meta.js', 'game.js', 'menus.js'))


def build_target(name):
    out = os.path.join(DIST, name)
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(out)
    html = read(SRC, 'index.html')
    html = html.replace('<!--SDK-->', (SDK[name] + '\n' if SDK[name] else '') + f'<script>window.__TARGET__="{name}"</script>')
    html = html.replace('__FONT__', 'lumi.woff')
    html = html.replace('<!--PIXI-->', '<script src="pixi.min.js"></script>')
    html = html.replace('<!--GAME-->', '<script src="game.js"></script>')
    with open(os.path.join(out, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(html)
    with open(os.path.join(out, 'game.js'), 'w', encoding='utf-8') as f:
        f.write(game_js())
    shutil.copy(os.path.join(VENDOR, 'pixi.min.js'), out)
    shutil.copy(os.path.join(VENDOR, 'lumi.woff'), out)
    if os.path.exists(os.path.join(VENDOR, 'music.mp3')):
        shutil.copy(os.path.join(VENDOR, 'music.mp3'), out)
    z = os.path.join(DIST, f'lumipop-{name}.zip')
    with zipfile.ZipFile(z, 'w', zipfile.ZIP_DEFLATED) as zf:
        for fn in sorted(os.listdir(out)):          # index.html at the archive root
            info = zipfile.ZipInfo(fn, date_time=(2026, 1, 1, 0, 0, 0))  # fixed date: same code -> same zip
            info.compress_type = zipfile.ZIP_DEFLATED
            with open(os.path.join(out, fn), 'rb') as f:
                zf.writestr(info, f.read())
    size = sum(os.path.getsize(os.path.join(out, f)) for f in os.listdir(out))
    print(f'{name:11s} {size / 1024:7.0f} KB unpacked  {os.path.getsize(z) / 1024:6.0f} KB zip')


def build_artifact():
    """Single page for claude.ai: no doctype/head/body (the host adds them), font inlined, Pixi from jsDelivr."""
    html = read(SRC, 'index.html')
    font = base64.b64encode(open(os.path.join(VENDOR, 'lumi.woff'), 'rb').read()).decode()
    html = html.replace('__FONT__', 'data:font/woff;base64,' + font)
    head = re.search(r'<head>(.*)</head>', html, re.S).group(1)
    body = re.search(r'<body>(.*)</body>', html, re.S).group(1)
    head = re.sub(r'<meta[^>]*>\s*', '', head).replace('<!--SDK-->', '<script>window.__TARGET__="web"</script>')
    body = body.replace('<!--PIXI-->', f'<script src="{PIXI_CDN}"></script>')
    body = body.replace('<!--GAME-->', '<script>\n' + game_js() + '\n</script>')
    with open(os.path.join(DIST, 'lumipop-artifact.html'), 'w', encoding='utf-8') as f:
        f.write(head.strip() + '\n' + body.strip() + '\n')
    if os.path.exists(os.path.join(VENDOR, 'music.mp3')):
        shutil.copy(os.path.join(VENDOR, 'music.mp3'), os.path.join(DIST, 'music.mp3'))
    print('artifact page written')


def publish_builds():
    """Copy the storefront archives into build/, which is kept in git, and the Pikabu build into
    docs/pikabu/ and docs/vk/ — those storefronts take a link, so GitHub Pages (main, /docs) hosts them."""
    out = os.path.join(ROOT, 'build')
    os.makedirs(out, exist_ok=True)
    for t in ('yandex', 'vk', 'crazygames', 'poki', 'pikabu'):
        shutil.copy(os.path.join(DIST, f'lumipop-{t}.zip'), out)
    for t in ('pikabu', 'vk'):   # storefronts that take a link: GitHub Pages serves docs/<target>/
        pages = os.path.join(ROOT, 'docs', t)
        shutil.rmtree(pages, ignore_errors=True)
        shutil.copytree(os.path.join(DIST, t), pages)
    open(os.path.join(ROOT, 'docs', '.nojekyll'), 'w').close()
    print('build/ and docs/ updated')


if __name__ == '__main__':
    os.makedirs(DIST, exist_ok=True)
    for t in SDK:
        build_target(t)
    build_artifact()
    publish_builds()
