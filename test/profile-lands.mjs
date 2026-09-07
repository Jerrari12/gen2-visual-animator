/**
 * DOES AN AUTHORED PROFILE ACTUALLY REACH THE RENDERED MATERIAL?
 *
 *   npm run profile-lands
 *
 * ⚠ EVERY OTHER TEST OF THIS FEATURE CHECKS THE SPEC, WHICH IS A PURE FUNCTION. `partMaterialSpec`
 * returning 0.34 for a label proves the table loaded and the lookup works; it proves nothing about
 * whether anything on screen is 0.34. Between the spec and the picture sit three things that have
 * to agree, and each one has failed this way before in this repo:
 *
 *   activeLabel     must find the label on the same branches activeHex finds the colour
 *   newPartMaterial must pass it, at construction
 *   applyPalette    must carry the FINISH and not only the colour — it walked six material maps
 *                   setting `.color` and nothing else, so a profiled filament assigned after boot
 *                   rendered at 0.55 until something rebuilt the material
 *
 * So this drives the real page: assigns the profiled filament as a custom palette pick, and reads
 * the roughness off the material a mesh is actually wearing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FILAMENT_PROFILES } from '../viewer/js/filament-profiles.js';

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
const [LABEL] = Object.keys(FILAMENT_PROFILES);

test('an authored profile reaches the material a mesh is wearing', { skip: (missing
  && 'playwright is not installed — run npm ci') || (!LABEL && 'no profile is authored') },
async (t) => {
  const { chromium } = await import('playwright');
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await launch(chromium);
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });

  try {
    await page.goto(`${base}/index.html?debug=1&build=185-tabletop-2w2h`,
      { waitUntil: 'load', timeout: 60_000 });
    await page.waitForFunction(
      () => window.__GEN2_VIEWER__ && window.__GEN2_VIEWER__.instances
        && [...window.__GEN2_VIEWER__.instances.values()].length > 0,
      null, { timeout: 60_000 },
    );
    await page.waitForTimeout(2000);

    /** The roughness a Case mesh is actually wearing, read off the live material. */
    const roughnessOnScreen = () => page.evaluate(() => {
      const V = window.__GEN2_VIEWER__;
      const inst = [...V.instances.values()].find((i) => /Case/i.test(i.cfg.node));
      let m = null;
      inst.group.traverse((o) => { if (o.isMesh && !m) m = o.material; });
      return m ? { roughness: m.roughness, metalness: m.metalness } : null;
    });

    await t.test('⚔ the default view is the BASE finish — no palette, no profile', async () => {
      /* Instruction-colours mode is what a fresh visitor gets, and the decision of 2026-09-07 is
         that a profile does not fire there. If this reads 0.34 the transport is firing on a colour
         nobody chose. */
      const got = await roughnessOnScreen();
      assert.equal(got.roughness, 0.55, 'the default view is already wearing a profile');
      assert.equal(got.metalness, 0.05);
    });

    await t.test('⚔ assigning the profiled filament moves the finish on the live material',
      async () => {
        /* ⚠ THROUGH applyPalette, WHICH IS THE HALF THAT WAS MISSING. This is the picker's own
           sequence — write the pick, turn the palette on, apply — with NO rebuild and no reload. If
           applyPalette still walked the six material maps setting `.color` and nothing else, the
           swatch would show the new filament while the model stayed at 0.55. */
        const got = await page.evaluate((label) => {
          const V = window.__GEN2_VIEWER__;
          V.customColors.Case = { name: label, hex: '#F56233', url: '' };
          V.applyPalette();
          const inst = [...V.instances.values()].find((i) => /Case/i.test(i.cfg.node));
          let m = null;
          inst.group.traverse((o) => { if (o.isMesh && !m) m = o.material; });
          return { label: V.activeLabel('Case'), roughness: m.roughness, metalness: m.metalness };
        }, LABEL);
        assert.equal(got.label, null,
          'activeLabel found a label with the palette still OFF — useCustom is not being honoured');
        assert.equal(got.roughness, 0.55, 'the finish moved before the palette was even switched on');
      });

    await t.test('⚔ and with the palette ON it lands, at the authored values', async () => {
      const got = await page.evaluate((label) => {
        const V = window.__GEN2_VIEWER__;
        V.customColors.Case = { name: label, hex: '#F56233', url: '' };
        /* the restore path's own flag; the picker sets it beside the pick */
        const saved = JSON.parse(localStorage.getItem(V.COLOR_STORE_KEY) || '{}');
        localStorage.setItem(V.COLOR_STORE_KEY, JSON.stringify({
          ...saved, on: true, t: 1, colors: { Case: { name: label, hex: '#F56233', url: '' } },
        }));
        return true;
      }, LABEL);
      assert.ok(got);
      await page.reload({ waitUntil: 'load', timeout: 60_000 });
      await page.waitForFunction(
        () => window.__GEN2_VIEWER__ && window.__GEN2_VIEWER__.instances
          && [...window.__GEN2_VIEWER__.instances.values()].length > 0,
        null, { timeout: 60_000 },
      );
      await page.waitForTimeout(2000);

      const want = FILAMENT_PROFILES[LABEL];
      const built = await roughnessOnScreen();
      assert.equal(built.roughness, want.roughness,
        `the Case is wearing ${LABEL} and rendering at ${built.roughness}, not the authored `
        + `${want.roughness}. The profile did not reach the material.`);
      assert.equal(built.metalness, want.metalness);

      /* ⚠ AND IT COMES BACK. Switching to a filament nobody has profiled must return the base
         finish through applyPalette alone — no rebuild. A finish that lands and then sticks is the
         same bug in the other direction, and would leave one filament's roughness on every
         subsequent pick. */
      const back = await page.evaluate(() => {
        const V = window.__GEN2_VIEWER__;
        V.customColors.Case = { name: 'An Unprofiled Filament', hex: '#3b7ddd', url: '' };
        V.applyPalette();
        const inst = [...V.instances.values()].find((i) => /Case/i.test(i.cfg.node));
        let m = null;
        inst.group.traverse((o) => { if (o.isMesh && !m) m = o.material; });
        return { label: V.activeLabel('Case'), roughness: m.roughness, metalness: m.metalness };
      });
      assert.equal(back.label, 'An Unprofiled Filament');
      assert.equal(back.roughness, 0.55,
        'an unprofiled filament is still rendering at a profiled roughness — the finish did not '
        + 'follow the palette back');
      assert.equal(back.metalness, 0.05);
    });

  } finally {
    await browser.close();
    server.close();
  }
});
