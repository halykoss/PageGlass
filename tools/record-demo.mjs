// Records the PageGlass demo from a throw-away Vivaldi profile via the DevTools protocol.
//
//   1. python3 -m http.server 8765            (from the repo root, serves demo/)
//   2. Vivaldi --user-data-dir=/tmp/pg-demo --remote-debugging-port=9333 \
//              --lang=en-US --no-first-run --window-size=1440,900 http://localhost:8765/demo/
//   3. node tools/record-demo.mjs out-dir [dark|light]
//   4. tools/make-video.sh out-dir docs/demo
//
// Only Vivaldi's own window is captured (Page.startScreencast), never the screen.
import { targets, connect, sleep } from './cdp.mjs';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = process.argv[2] || 'frames';
const scheme = process.argv[3] || 'dark';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(out, { recursive: true });

const list = await targets();
const ui = await connect(list.find((t) => t.url.endsWith('/window.html')).webSocketDebuggerUrl);
const page = await connect(list.find((t) => t.type === 'page' && t.url.includes('/demo/')).webSocketDebuggerUrl);

// Load the current build of PageGlass into the running window (replaces any installed copy).
await ui.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
await page.evaluate('scrollTo(0,0)');
await ui.evaluate(`window.__pageGlass?.stop?.(); chrome.storage.local.remove('pageglass.enabled')`);
await ui.evaluate(readFileSync(join(root, 'src/pageglass.js'), 'utf8') + ';0');
await sleep(2500);

// Screencast: frames only arrive when something changes, so keep their timestamps.
const frames = [];
ui.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
  const file = join(out, `f${String(frames.length).padStart(5, '0')}.jpg`);
  writeFileSync(file, Buffer.from(data, 'base64'));
  frames.push({ file, t: metadata.timestamp });
  ui.send('Page.screencastFrameAck', { sessionId });
});
await ui.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1440, maxHeight: 900 });

const wheel = async (total, ms) => {             // smooth, trackpad-like scrolling
  const steps = Math.round(ms / 16);
  for (let i = 0; i < steps; i++) {
    const ease = Math.sin(Math.PI * (i + 0.5) / steps); // slow-fast-slow
    await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 720, y: 500, deltaX: 0,
      deltaY: (total / steps) * ease * (Math.PI / 2) });
    await sleep(16);
  }
};
const rect = (sel) => ui.evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(sel)})?.getBoundingClientRect();return r&&{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
const hover = async (sel, ms = 450) => {
  const p = await rect(sel);
  if (p) await ui.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
  await sleep(ms);
};
const click = async (sel) => {
  const p = await rect(sel);
  if (!p) return;
  for (const type of ['mousePressed', 'mouseReleased'])
    await ui.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
};

await sleep(1200);
await wheel(1500, 3800);                          // scroll down through the colours
await sleep(700);
await hover('.toolbar-mainbar .pg-run-start button');  // hover the frosted capsules
await hover('.toolbar-mainbar .pg-run-start + .pg-run button');
await hover('.UrlBar-AddressField', 600);
await ui.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 720, y: 600 });
await sleep(500);
await click('#pageglass-toggle > button');         // off: stock Vivaldi …
await sleep(1600);
await click('#pageglass-toggle > button');         // … and back on
await sleep(1900);
await ui.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 720, y: 600 });
await wheel(900, 2600);
await sleep(600);
await wheel(-2400, 3600);                         // and back to the top
await sleep(1400);

await ui.send('Page.stopScreencast');
await sleep(300);
writeFileSync(join(out, 'frames.json'), JSON.stringify(frames, null, 1));
console.log(`${frames.length} frames → ${out}`);
ui.close(); page.close();
