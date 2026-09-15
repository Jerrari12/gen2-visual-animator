/**
 * DOES THE QUALITY LADDER ACTUALLY REACH THE PRINTED RELIEF?
 *
 *   npm run relief-tier
 *
 * ⚠ THE MEASUREMENT THAT PUT IT THERE. Benched against deployed `413cd5a` under a forced software
 * rasteriser, the candidate ran at 0.739x the deployed frame rate at `high` and **0.452x at
 * `fast`** — worse at the cheap tier, because `fast` turns off the environment, tone mapping, the
 * key light, shadows, reflections and AO while the relief kept running. It is a per-fragment cost,
 * so it became a larger share of a smaller frame: the ladder's own floor more than twice as
 * expensive as it had been, on a device that stepped down BECAUSE it was struggling.
 *
 * ⚠ AND IT CANNOT BE ASSERTED ON A CONSTANT. `QUALITY.fast.relief === false` is one line agreeing
 * with itself. What has to be true is that a material a mesh is WEARING at `fast` carries no layer
 * shader — which needs the tier change to have dropped and rebuilt the material cache, not merely
 * set a flag that the next rebuild would have honoured. The cache key is the evidence: the Lab's
 * module chains onto `customProgramCacheKey` and leaves `|ld` on the end, so its absence means the
 * program genuinely does not contain the term.
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
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.stl': 'application/octet-stream',
};

function serve() {
  const server = createServer(async (req, res) => {
    try {
      const rel = normalize(decodeURIComponent(new URL(req.url, 'http://localhost').pathname))
        .replace(/^([/\\])+/, '');
      const file = join(VIEWER, rel === '' ? 'index.html' : rel);
      if (!file.startsWith(VIEWER)) { res.writeHead(403).end(); return; }
      res.writeHead(200, {
        'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      }).end(await readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

async function launch(chromium) {
  const args = ['--enable-unsafe-swiftshader'];
  for (const opts of [{ channel: 'chrome', args }, { args }]) {
    try { return await chromium.launch(opts); } catch { /* next */ }
  }
  throw new Error('no browser: install Chrome, or run `npx playwright install chromium`');
}

const missing = !existsSync(join(root, 'node_modules', 'playwright'));

test('the quality ladder reaches the printed relief', { skip: missing
  && 'playwright is not installed — run npm install' }, async (t) => {
  const { chromium } = await import('playwright');
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await launch(chromium);
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });

  /** What a Case mesh is actually wearing: whether its PROGRAM carries the layer term. */
  const reliefOnScreen = () => page.evaluate(() => {
    const V = window.__GEN2_VIEWER__;
    const inst = [...V.instances.values()].find((i) => /Case/i.test(i.cfg.node));
    let m = null;
    inst.group.traverse((o) => { if (o.isMesh && !m) m = o.material; });
    const key = m && m.customProgramCacheKey ? String(m.customProgramCacheKey()) : '';
    return {
      tier: V.quality,
      wanted: V.reliefWanted(),
      /* `|ld` as a SEGMENT, not the end: the build plate's finish chains after the relief and
         appends its own `|bf1` (2026-09-14), so the relief's mark is no longer last */
      inProgram: /\|ld(?=\||$)/.test(key),
      cacheKey: key.slice(-16),
      handles: V.layerHandles.size,
    };
  });

  const setTier = (t) => page.evaluate((tier) => {
    window.__GEN2_VIEWER__.setQuality(tier);
  }, t).then(() => page.waitForTimeout(700));

  try {
    await page.goto(`${base}/index.html?debug=1&build=185-tabletop-2w2h`,
      { waitUntil: 'load', timeout: 60_000 });
    await page.waitForFunction(
      () => window.__GEN2_VIEWER__ && window.__GEN2_VIEWER__.instances
        && [...window.__GEN2_VIEWER__.instances.values()].length > 0,
      null, { timeout: 60_000 },
    );
    await page.waitForTimeout(2000);

    await t.test('⚔ high RENDERS the relief', async () => {
      await setTier('high');
      const got = await reliefOnScreen();
      assert.equal(got.tier, 'high');
      assert.equal(got.wanted, true);
      assert.ok(got.inProgram,
        `at high the Case's program is ${got.cacheKey} — no |ld, so the layer term is not compiled `
        + 'into what is on screen. The feature is off at the tier that is meant to have it.');
      assert.ok(got.handles > 0, 'no layer handles at high');
    });

    await t.test('⚔ fast renders NONE of it, in the program and not merely in a uniform',
      async () => {
        /* ⚠ THIS IS THE ONE THE 0.452x BOUGHT. A flag that only the NEXT rebuild would honour
           leaves every material already on screen carrying the shader, which is every material a
           struggling device has — the downgrade would cost a rebuild and save nothing. */
        await setTier('fast');
        const got = await reliefOnScreen();
        assert.equal(got.tier, 'fast');
        assert.equal(got.wanted, false);
        assert.equal(got.inProgram, false,
          `at fast the Case's program is still ${got.cacheKey} — the tier changed and the material `
          + 'did not, so the relief is still being shaded on a device that stepped down to escape it');
        assert.equal(got.handles, 0, 'layer handles survived the downgrade to fast');
      });

    await t.test('⚔ and it comes BACK on the way up — the ladder is not one-way', async () => {
      /* The auto-downgrade is one-way by design, but a USER pick is not, and a tier that can only
         lose the relief would quietly make Best Quality worse than it was the first time. */
      await setTier('high');
      const got = await reliefOnScreen();
      assert.ok(got.inProgram, 'the relief did not come back when the tier went up again');
      assert.ok(got.handles > 0);
    });

    await t.test('⚔ balanced keeps it — the first downgrade step is not the one that spends it',
      async () => {
        await setTier('balanced');
        const got = await reliefOnScreen();
        assert.equal(got.wanted, true);
        assert.ok(got.inProgram, 'balanced dropped the relief');
      });

    await t.test('⚔ and the kill switch sits ABOVE the ladder, not inside it', async () => {
      /* Read from the source rather than exercised: flipping the constant needs a redeploy, which
         is the point of it. What is checked here is that it GATES the tier lever rather than
         sitting beside it — `reliefWanted` must be false whenever the constant is false, at every
         tier, or the 2am lever leaves the relief on wherever the ladder happens to want it. */
      const src = await (await fetch(`${base}/js/main.js`)).text();
      assert.match(src, /const reliefWanted = \(\) =>\s*LAYER_DETAIL_ENABLED && !!QUALITY\[quality\]\.relief;/,
        'reliefWanted no longer reads BOTH the constant and the tier — the kill switch has stopped '
        + 'being able to override the ladder');
    });
  } finally {
    await browser.close();
    server.close();
  }
});
