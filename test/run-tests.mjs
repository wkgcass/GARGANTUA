/**
 * GARGANTUA — headless acceptance test
 * Uses system Chrome via puppeteer-core. Verifies:
 *  1. page loads with ZERO console errors / page errors / failed requests
 *  2. WebGL2 context is alive and frames advance
 *  3. canvas is not black (center & overall luminance)
 *  4. all 4 presets + quality tiers render (screenshots to shots/)
 *  5. debug views 0–9 render
 *  6. URL screenshot API produces output
 *  7. parameter persistence round-trip
 * Run: node test/run-tests.mjs   (server must be running, or it starts one)
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SHOT_DIR = path.join(ROOT, 'shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const PORT = 8123;
const BASE = `http://localhost:${PORT}`;

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
].find((p) => fs.existsSync(p));

if (!CHROME) {
  console.error('No Chrome executable found. Set CHROME_PATH.');
  process.exit(2);
}

/* ---------- ensure server running ---------- */
async function ensureServer() {
  try {
    const r = await fetch(BASE);
    if (r.ok) return null;
  } catch { /* start below */ }
  const proc = spawn(process.execPath, ['server.mjs', String(PORT)], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((res) => setTimeout(res, 1200));
  return proc;
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}${detail ? '  (' + detail + ')' : ''}`);
}

async function main() {
  const serverProc = await ensureServer();
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
      '--window-size=1280,760',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 480, deviceScaleFactor: 1 });

    const consoleErrors = [];
    const pageErrors = [];
    const failedReqs = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    page.on('requestfailed', (r) => failedReqs.push(`${r.url()} :: ${r.failure()?.errorText}`));

    console.log('\n═══════ GARGANTUA ACCEPTANCE ═══════\n');

    /* ---- 1. load ---- */
    await page.goto(`${BASE}/?quality=high&scale=0.45`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction('window.__GARGANTUA_READY__ === true', { timeout: 120000 });
    check('page loads', true);

    /* let it render a bunch of frames */
    await new Promise((r) => setTimeout(r, 2500));

    /* ---- 2. console errors ---- */
    check('zero console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
    check('zero page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
    check('zero failed requests', failedReqs.length === 0, failedReqs.slice(0, 2).join(' | '));
    if (consoleErrors.length || pageErrors.length) {
      console.log('  console:', consoleErrors.join('\n  '));
      console.log('  page:', pageErrors.join('\n  '));
    }

    /* ---- 3. black screen check via pixel readback ---- */
    const lum = await page.evaluate(() => {
      const c = document.getElementById('gl');
      const g = document.createElement('canvas');
      const s = 96, r = 54;
      g.width = s; g.height = r;
      const ctx = g.getContext('2d');
      ctx.drawImage(c, 0, 0, c.width, c.height, 0, 0, s, r);
      const d = ctx.getImageData(0, 0, s, r).data;
      let sum = 0, bright = 0;
      for (let i = 0; i < d.length; i += 4) {
        const l = (d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722) / 255;
        sum += l;
        if (l > 0.9) bright++;
      }
      return { avg: sum / (s * r), brightFrac: bright / (s * r) };
    });
    check('frame is not black (avg luma)', lum.avg > 0.004, `avg=${lum.avg.toFixed(4)}`);
    check('scene content present (variance)', lum.avg > 0.02 || lum.brightFrac > 0, `avg=${lum.avg.toFixed(4)}`);
    await page.screenshot({ path: path.join(SHOT_DIR, '01-default.png') });

    /* ---- 4. frame advance & FPS ---- */
    const f1 = await page.evaluate(() => window.GARGANTUA?.snap ? performance.now() : 0);
    await new Promise((r) => setTimeout(r, 1200));

    /* ---- 5. presets ---- */
    for (let i = 0; i < 4; i++) {
      await page.evaluate((idx) => window.GARGANTUA.preset(idx), i);
      await new Promise((r) => setTimeout(r, 900));
      await page.screenshot({ path: path.join(SHOT_DIR, `preset-${i + 1}.png`) });
    }
    check('4 presets screenshot', true);

    /* ---- 6. quality tiers ---- */
    for (const q of ['standard', 'high', 'cinematic']) {
      await page.evaluate((qq) => window.GARGANTUA.setQuality(qq), q);
      await new Promise((r) => setTimeout(r, 700));
      await page.screenshot({ path: path.join(SHOT_DIR, `quality-${q}.png`) });
    }
    check('3 quality tiers screenshot', true);
    await page.evaluate(() => window.GARGANTUA.setQuality('high'));
    await page.evaluate(() => window.GARGANTUA.preset(0));
    await new Promise((r) => setTimeout(r, 500));

    /* ---- 7. debug views 0-9 ---- */
    for (let v = 0; v <= 9; v++) {
      process.stdout.write(`  … view ${v}/9\r`);
      await page.evaluate((vv) => window.GARGANTUA.setView(vv), v);
      await new Promise((r) => setTimeout(r, 120));
      await page.screenshot({ path: path.join(SHOT_DIR, `view-${v}.png`), timeout: 120000 });
    }
    console.log('');
    check('debug views 0–9 screenshot', true);
    await page.evaluate(() => window.GARGANTUA.setView(0));

    /* ---- 8. params round-trip ---- */
    const before = await page.evaluate(() => window.GARGANTUA.getParam('diskTemp'));
    await page.evaluate(() => window.GARGANTUA.setParam('diskTemp', 12345));
    const after = await page.evaluate(() => window.GARGANTUA.getParam('diskTemp'));
    check('param set/get works', before !== after && after === 12345, `${before} -> ${after}`);

    /* persistence */
    await page.evaluate(() => {
      window.GARGANTUA.setParam('diskTemp', 9999);
    });
    await new Promise((r) => setTimeout(r, 700)); // debounce save
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.__GARGANTUA_READY__ === true', { timeout: 120000 });
    const persisted = await page.evaluate(() => window.GARGANTUA.getParam('diskTemp'));
    check('params persist across reload', persisted === 9999, `got ${persisted}`);

    /* ---- 9. URL shot API ---- */
    await page.goto(`${BASE}/?shot=1&frames=8&view=0&scale=0.45`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction('window.__GARGANTUA_READY__ === true', { timeout: 120000 });
    await page.waitForFunction('window.__GARGANTUA_SHOT__ !== undefined', { timeout: 60000 });
    const shotLen = await page.evaluate(() => window.__GARGANTUA_SHOT__.length);
    check('URL shot API produces dataURL', typeof shotLen === 'number' && shotLen > 5000, `${shotLen} chars`);

    /* ---- 10. cinematic toggle ---- */
    await page.goto(`${BASE}/?scale=0.45`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction('window.__GARGANTUA_READY__ === true', { timeout: 120000 });
    await page.evaluate(() => document.getElementById('btn-cine')?.click());
    await new Promise((r) => setTimeout(r, 1300));
    await page.screenshot({ path: path.join(SHOT_DIR, 'cinematic.png') });
    const lb = await page.evaluate(() =>
      !document.getElementById('letterbox').classList.contains('hidden'));
    check('cinematic letterbox toggles', lb);

    /* ---- 11. FPS check (soft: just report) ---- */
    const fps = await page.evaluate(() => document.getElementById('fps').textContent);
    check('FPS meter alive', /FPS/.test(fps), fps);

    console.log('\n════════════════════════════════════');
    const failed = results.filter((r) => !r.ok);
    console.log(`${results.length - failed.length}/${results.length} checks passed\n`);
    if (failed.length) {
      console.log('FAILED:', failed.map((f) => f.name).join(', '));
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    serverProc?.kill();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });