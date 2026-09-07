/**
 * THE HEADLESS SMOKE TEST — does the thing we are about to deploy actually draw?
 *
 *   npm run smoke
 *
 * ⚠ EVERY OTHER TEST IN THIS REPO RUNS WITHOUT A BROWSER, and until now that was the whole
 * protection on the path to users. `node --test` proves the generator bills the right rows, the
 * derived assets agree and the vendored copies are unedited — and every one of those passes on a
 * build whose viewer throws at boot and shows a black canvas forever. The suite cannot load a
 * module, cannot run a shader and cannot see a pixel.
 *
 * This is the smallest thing that can: it serves `viewer/`, opens the two routes that reach users,
 * and asserts four things a broken deploy fails.
 *
 *   THE VIEWER      /index.html?build=…              the front door
 *   THE EMBED       /index.html?part=…&mode=preview  the part-preview card the site iframes
 *   NO ERRORS       nothing on the console, nothing uncaught
 *   A REAL PICTURE  the canvas is not black and not a flat fill
 *   MODULES LOADED  the vendored layer-detail module attached, and the profile table parses
 *
 * ⚠ IT IS THE ONLY THING HERE THAT NEEDS A DEPENDENCY, and it is kept out of `npm test` for exactly
 * that reason — the fast suite stays dependency-free and stays the thing you run constantly. This
 * is a deploy gate, run once, in CI, beside the one that already blocks on `npm test`.
 *
 * ⚠ AND "NOT BLACK" IS NOT ENOUGH ON ITS OWN. A canvas cleared to the stage colour is not black
 * either, and a viewer that loads the scene but fails every material would pass a mean-brightness
 * check while showing a flat rectangle. So the picture has to have STRUCTURE in it: distinct
 * colours, above a floor no clear colour can reach on its own.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const VIEWER = join(root, 'viewer');

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.stl': 'application/octet-stream',
};

/** A static server, in the standard library, because a deploy gate should not need a stack. */
function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      /* ⚠ A path is untrusted even from our own test. normalize() then verify containment. */
      const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
      const file = join(VIEWER, rel === '' ? 'index.html' : rel);
      if (!file.startsWith(VIEWER)) { res.writeHead(403).end(); return; }
      const body = await readFile(file);
      res.writeHead(200, {
        'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      }).end(body);
    } catch { res.writeHead(404).end(); }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

/**
 * ⚠ SYSTEM CHROME FIRST, BUNDLED CHROMIUM SECOND. A developer here has Chrome and no downloaded
 * browser; a CI runner has whichever `playwright install` put there. Trying both means the same
 * command works in both places instead of one of them needing a flag nobody remembers.
 */
async function launch(chromium) {
  const args = [
    /* Chrome refuses SwiftShader for WebGL without this since 2024, and a CI runner has no GPU.
       It PERMITS a software fallback; it does not force one, so a real GPU is still used here. */
    '--enable-unsafe-swiftshader',
  ];
  for (const opts of [{ channel: 'chrome', args }, { args }]) {
    try { return await chromium.launch(opts); } catch { /* try the next */ }
  }
  throw new Error('no browser: install Chrome, or run `npx playwright install chromium`');
}

/** What the page can tell us about itself, measured after a frame has actually been composited. */
const INSPECT = `() => new Promise((done) => {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const gl = document.querySelector('canvas');
    if (!gl) { done({ why: 'no canvas element' }); return; }
    const c = document.createElement('canvas');
    c.width = Math.min(400, gl.width); c.height = Math.min(400, gl.height);
    const x = c.getContext('2d');
    x.drawImage(gl, 0, 0, gl.width, gl.height, 0, 0, c.width, c.height);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4) {
      sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      /* quantised to 5 bits a channel, so gradient noise does not read as structure */
      seen.add(((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3));
    }
    done({
      canvas: [gl.width, gl.height],
      meanLuma: sum / (d.length / 4),
      distinctColours: seen.size,
      pixels: d.length / 4,
    });
  }));
})`;

async function open(browser, base, query) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const noise = [];
  page.on('console', (m) => { if (m.type() === 'error') noise.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => noise.push(`uncaught: ${e.message}`));
  /* ⚠ AN ABORTED REQUEST IS NOT A FAILED ONE. Navigation cancels in-flight loads, and under a
     loaded machine that happens often enough to turn a deploy gate into a coin flip. A gate that
     fails at random gets switched off, which is worse than not having it. */
  page.on('requestfailed', (r) => {
    const why = r.failure()?.errorText ?? '';
    if (/ERR_ABORTED/.test(why)) return;
    noise.push(`request failed: ${r.url()} (${why})`);
  });
  await page.goto(`${base}/index.html${query}`, { waitUntil: 'load', timeout: 60_000 });
  /* The scene mounts asynchronously; give it a bounded chance rather than a fixed sleep. */
  await page.waitForFunction(
    () => document.querySelector('canvas') && document.querySelector('canvas').width > 0,
    null, { timeout: 60_000 },
  ).catch(() => {});
  /* ⚠ WAIT ON THE PICTURE, NOT ON THE CLOCK. A fixed sleep is a guess about how long a machine
     takes to mount a scene, and it was wrong the first time three browser suites ran back to back
     — which is exactly what CI does. Poll until the canvas has actually drawn something, and let
     the assertion below report the last reading if it never does.
     ⚠ CALLED, NOT JUST EVALUATED: page.evaluate given a STRING evaluates it as an expression, so
     `() => ...` is a function reference that serialises to undefined. The parentheses are the fix. */
  let seen = null;
  for (let i = 0; i < 40; i += 1) {
    seen = await page.evaluate(`(${INSPECT})()`);
    if (seen && !seen.why && seen.distinctColours > 40) break;
    await page.waitForTimeout(500);
  }
  return { page, noise, seen };
}

const missing = !existsSync(join(root, 'node_modules', 'playwright'));

test('the viewer and the part embed both draw a real picture', { skip: missing
  && 'playwright is not installed — run npm ci (it is a devDependency and CI installs it)' },
async (t) => {
  const { chromium } = await import('playwright');
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await launch(chromium);

  const ROUTES = [
    ['the viewer', '?build=185-tabletop-2w2h'],
    ['the part embed', '?part=185-case-2w-1h&mode=preview'],
  ];

  try {
    for (const [what, query] of ROUTES) {
      await t.test(`⚔ ${what} draws, and says nothing on the console`, async () => {
        const { page, noise, seen } = await open(browser, base, query);
        assert.ok(!seen.why, `${what}: ${seen.why}`);
        assert.deepEqual(noise, [], `${what} logged errors`);
        /* ⚠ NOT BLACK, AND NOT A FLAT FILL. A cleared canvas is one colour; a scene is hundreds.
           The floor is set well below what either route measures and well above a clear. */
        assert.ok(seen.meanLuma > 4,
          `${what}: the canvas is essentially black (mean luma ${seen.meanLuma.toFixed(1)})`);
        assert.ok(seen.distinctColours > 40,
          `${what}: the canvas has ${seen.distinctColours} distinct colours — that is a flat fill, `
          + 'not a rendered scene. The page loaded and drew nothing.');
        await page.close();
      });
    }

    await t.test('⚔ the vendored modules are loaded and doing their job', async () => {
      const { page, noise, seen } = await open(browser, base, '?debug=1&build=185-tabletop-2w2h');
      assert.deepEqual(noise, [], 'the debug route logged errors');
      assert.ok(seen.distinctColours > 40, 'the debug route drew a flat fill');
      const got = await page.evaluate(async () => {
        const V = window.__GEN2_VIEWER__;
        const mod = await import('./js/filament-profiles.js');
        return {
          reliefAttached: V && V.layerHandles ? V.layerHandles.size : -1,
          profiles: Object.keys(mod.FILAMENT_PROFILES ?? {}).length,
          count: mod.FILAMENT_PROFILE_COUNT,
        };
      });
      /* The layer-detail module lives in another repo and is reached through one import. If it
         failed to load, every part still renders — just flat — and nothing else here would notice. */
      assert.ok(got.reliefAttached > 0,
        `no layer-detail handles attached (${got.reliefAttached}) — the vendored module did not load, `
        + 'or no part in this build resolved a build axis');
      assert.equal(got.profiles, got.count, 'the profile table disagrees with its own count');
      await page.close();
    });
  } finally {
    await browser.close();
    server.close();
  }
});
