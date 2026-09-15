/* STORAGE CAN THROW - every localStorage / sessionStorage access in the viewer's own scripts sits inside a try block.
 *
 * A browser that blocks the site's storage throws on the first touch of either one ("Access is denied for this document").
 * main.js is a module, so one unguarded access while it loads ends it there and the viewer never boots. setPresetsOpen did
 * exactly that until 2026-09-15: the p34 benchmark harness ran a page whose sessionStorage refused writes, and the
 * benchmark never started.
 *
 * ⚠ A STATIC SCAN, BECAUSE main.js CANNOT RUN UNDER NODE (it builds a WebGL renderer at module scope). The behaviour is
 * checked in a real browser by p34's s7 (integration/scripts/p34). So the scanner is tested first: a scanner that finds
 * nothing proves nothing until it has been shown to find something.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// comments and quoted strings masked (a string ends at its quote or its line), so neither a brace nor the word inside one counts
function mask(src) {
  let out = '', i = 0;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { const j = src.indexOf('\n', i); const e = j < 0 ? src.length : j; out += ' '.repeat(e - i); i = e; continue; }
    if (c === '/' && n === '*') { const j = src.indexOf('*/', i + 2); const e = j < 0 ? src.length : j + 2; out += src.slice(i, e).replace(/[^\n]/g, ' '); i = e; continue; }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') j++; j++; }
      out += c + src.slice(i + 1, j).replace(/[^\n]/g, ' ') + (src[j] === c ? c : '');
      i = src[j] === c ? j + 1 : j;
      continue;
    }
    out += c; i++;
  }
  return out;
}
// every storage access that no enclosing block opened by `try {` contains - where it is WRITTEN, not where it is called from
function unguardedStorage(src) {
  const m = mask(src), lines = src.split('\n'), found = [];
  for (const hit of m.matchAll(/\b(localStorage|sessionStorage)\b/g)) {
    let depth = 0, guarded = false;
    for (let k = hit.index - 1; k >= 0 && !guarded; k--) {
      if (m[k] === '}') depth++;
      else if (m[k] === '{') {
        if (depth > 0) depth--;
        else if (/\btry\s*$/.test(m.slice(Math.max(0, k - 12), k))) guarded = true;
      }
    }
    if (!guarded) { const line = src.slice(0, hit.index).split('\n').length; found.push({ line, text: lines[line - 1].trim() }); }
  }
  return found;
}

test('the scanner flags an unguarded storage access, and passes a guarded one', () => {
  const lines = (src) => unguardedStorage(src).map((x) => x.line);
  assert.deepEqual(lines("const a = 1;\nconst open = sessionStorage.getItem('k');\n"), [2]);
  assert.deepEqual(lines("let open = null;\ntry { open = sessionStorage.getItem('k'); } catch (e) {}\n"), []);
  assert.deepEqual(lines("try {\n  if (x) { localStorage.setItem('k', '1'); }\n} catch (e) {}\n"), [], 'an access nested inside a try block is guarded');
  assert.deepEqual(lines("try { a(); } catch (e) { localStorage.removeItem('k'); }\n"), [1], 'a catch block is not a try block');
  assert.deepEqual(lines("// sessionStorage.getItem('k') in a comment\nconst s = 'sessionStorage {';\n"), [], 'comments and strings are not code');
  assert.deepEqual(lines("function f() {\n  sessionStorage.setItem('k', '1');\n}\ntry { f(); } catch (e) {}\n"), [2],
    'an access in a function that a try calls is still flagged - the scan reads where the access is written');
});

test("every storage access in the viewer's own scripts is inside a try block", () => {
  const found = [];
  const dir = join(root, 'viewer', 'js');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    for (const u of unguardedStorage(readFileSync(join(dir, f), 'utf8').replace(/\r\n/g, '\n'))) found.push(`viewer/js/${f}:${u.line}: ${u.text}`);
  }
  // the pages' own inline scripts (the pre-paint theme snippet among them), each read alone
  for (const page of [['viewer', 'index.html'], ['viewer', 'builds', 'index.html']]) {
    const html = readFileSync(join(root, ...page), 'utf8').replace(/\r\n/g, '\n');
    for (const s of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
      const offset = html.slice(0, s.index + s[0].indexOf('>') + 1).split('\n').length - 1;
      for (const u of unguardedStorage(s[1])) found.push(`${page.join('/')}:${u.line + offset}: ${u.text}`);
    }
  }
  assert.deepEqual(found, [], 'storage touched outside a try block - a browser that blocks storage throws right there:\n' + found.join('\n'));
});
