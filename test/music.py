import base64, re
from playwright.sync_api import sync_playwright
src = open('src/audio.js').read().replace('const ahead = ctx.currentTime + 0.8;', 'const ahead = ctx.currentTime + (window.__AHEAD || 0.8);')
harness = """
<script>
window.__AHEAD = 62;
const OFF = new OfflineAudioContext(2, 44100 * 66, 44100);
Object.defineProperty(OFF, 'state', { get: () => 'running' });
window.AudioContext = function () { return OFF; };
</script>
<script>""" + src + """</script>
<script>
window.render = async () => {
  Sfx.startMusic();
  // a few game pops mixed in, to hear that they sit in the same key
  const buf = await OFF.startRendering();
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  let peak = 0; const rms = [];
  for (let s = 0; s < 66; s++) { let acc = 0; for (let i = s * 44100; i < (s + 1) * 44100; i++) { const v = Math.max(Math.abs(L[i]), Math.abs(R[i])); peak = Math.max(peak, v); acc += L[i] * L[i]; } rms.push(Math.sqrt(acc / 44100)); }
  const n = buf.length, pcm = new Int16Array(n * 2);
  for (let i = 0; i < n; i++) { pcm[i * 2] = Math.max(-1, Math.min(1, L[i])) * 32767; pcm[i * 2 + 1] = Math.max(-1, Math.min(1, R[i])) * 32767; }
  const bytes = new Uint8Array(pcm.buffer); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return { peak, rms: rms.map((x) => +x.toFixed(4)), pcm: btoa(bin) };
};
</script>"""
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.set_content('<html><body>' + harness + '</body></html>')
    r = pg.evaluate('render()')
    print('errors', errs or 'none'); print('peak', round(r['peak'], 3)); print('rms/s', r['rms'][:66])
    open('test/music.raw', 'wb').write(base64.b64decode(r['pcm'])); b.close()
