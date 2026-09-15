/* A STYLE SWAP'S SHADOWS (hotfix, Joey relaying Astra, 2026-09-15) - main.js, run against three r185's real objects.
 *
 * The defect, measured on the build-plate-finish branch (vault measurements.md, "Parts swapped in at rest carry no shadow
 * flags", and p31): castShadow/receiveShadow were written only by applyShadowQuality, so the template clones a handle swap
 * or a static kit's faceplate swap adds never cast or received a shadow; and a swap moves nothing, so the shadow map kept
 * the old part until the camera next moved.
 * The hotfix: the swaps flag their clones through setPartShadows(), the helper applyShadowQuality itself uses, and ask for
 * a shadow render with markShadowDirty(). The branch carries the fuller fix (snaps at rest too) and its own test,
 * test/shadow-at-rest.test.mjs; this file is the swap subset of it.
 *
 * ⚠ THESE TESTS CALL THE CODE: main.js cannot be imported under node (it builds a WebGL renderer at module scope), so the
 * functions are extracted by balanced scan and evaluated with stubs, and each fix line is removed in a copy that must fail.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const THREE = await import(pathToFileURL(join(root, 'viewer', 'vendor', 'three', 'three.module.js')).href);
const src = readFileSync(join(root, 'viewer', 'js', 'main.js'), 'utf8');

function takeAt(needle, { fn = false } = {}) {
  const start = src.indexOf(needle);
  assert.ok(start >= 0, `could not find "${needle}" in main.js - if it was renamed, update this test rather than deleting it`);
  let depth = 0, opened = false;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if ('([{'.includes(c)) { depth++; if (c === '{') opened = true; }
    else if (')]}'.includes(c)) { depth--; if (fn && opened && depth === 0 && c === '}') return src.slice(start, i + 1); }
    else if (!fn && c === ';' && depth === 0) return src.slice(start, i + 1);
  }
  assert.fail(`unterminated "${needle}"`);
}
const mutate = (code, from, to) => {
  assert.equal(code.split(from).length - 1, 1, `mutation anchor "${from.slice(0, 60)}" must occur exactly once`);
  return code.replace(from, to);
};

const HELPERS = [takeAt('function markShadowDirty()', { fn: true }), takeAt('function setPartShadows(root, on)', { fn: true })].join('\n');
const SHADOW_QUALITY = [takeAt('function shadowsWanted()', { fn: true }), takeAt('function applyShadowQuality()', { fn: true })].join('\n');
const HANDLE_SWAP = takeAt('async function applyHandleStyle(style)', { fn: true });
const FACEPLATE_SWAP = takeAt('async function applyFaceplateStyle(style)', { fn: true });

/* a part as buildInstances makes it: an instance group holding a clone of a template (a scene root holding one mesh) */
function template(flagged = false) {
  const rootNode = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(40, 20, 10), new THREE.MeshStandardMaterial());
  mesh.castShadow = flagged; mesh.receiveShadow = flagged;
  rootNode.add(mesh);
  return rootNode;
}
function instance(id, node, flagged = true) {
  const group = new THREE.Group();
  group.add(template(flagged).clone(true));
  return { cfg: { id, node, pos: [0, 0, 0] }, group, staged: false };
}
const meshesOf = (group) => { const out = []; group.traverse((o) => { if (o.isMesh) out.push(o); }); return out; };
const shadowMap = (enabled) => ({ enabled, needsUpdate: false, autoUpdate: false, type: null });

/* ------------------------------------------------------------------------------------------------ the scenarios */
function qualityScenario(helpers, code) {
  const failures = [];
  const renderer = { shadowMap: shadowMap(false) };
  const instances = new Map([['a', instance('a', 'Case', false)], ['b', instance('b', 'Handle', false)]]);
  const sun = new THREE.DirectionalLight();
  const scene = new THREE.Scene();
  for (const inst of instances.values()) scene.add(inst.group);
  const table = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial());
  let stage = 'light';
  const env = new Function('THREE', 'QUALITY', 'quality', 'getStage', 'cinema', 'isWallBuild', 'isUnderTableBuild', 'IS_PART', 'renderer',
    'sun', 'instances', 'table', 'fitShadowCamera', 'scene',
    `${helpers}\n${code.replace("stageTheme === 'light'", "getStage() === 'light'")}\nreturn { applyShadowQuality };`)(
    THREE, { high: { shadow: true } }, 'high', () => stage, { on: false }, false, false, false, renderer, sun, instances, table, () => {}, scene);
  env.applyShadowQuality();
  for (const inst of instances.values()) for (const m of meshesOf(inst.group)) if (!m.castShadow || !m.receiveShadow) failures.push(`light stage: ${inst.cfg.node} mesh left unflagged`);
  stage = 'dark';
  env.applyShadowQuality();
  for (const inst of instances.values()) for (const m of meshesOf(inst.group)) if (m.castShadow || m.receiveShadow) failures.push(`dark stage: ${inst.cfg.node} mesh still flagged`);
  return failures;
}

async function handleSwapScenario(helpers, code) {
  const failures = [];
  for (const enabled of [true, false]) {
    const renderer = { shadowMap: shadowMap(enabled) };
    const handle = instance('h1', 'Handle_Deco', enabled);          // flagged the way applyShadowQuality left it
    const instances = new Map([['h1', handle]]);
    const templates = { Handle_BlockBar_B: template(false) };         // templates are never flagged
    const style = { node: 'Handle_BlockBar_B', label: 'BlockBar B', planner: 'blockbar', h: 9, d: 27 };
    // the last four stubs are names the build-plate-finish branch's applyHandleStyle reads, so this file still runs after it lands
    const applyHandleStyle = new Function('renderer', 'ao', 'activeHandleStyle', 'build', 'templates', 'loader', 'PARTS_BASE', 'materials',
      'fallbackMat', 'instances', 'typeByNode', 'basePos', 'faceplateHeightOf', 'nodeDepth', 'manifest', 'HANDLE_LINKS', 'partInfoByNode',
      'renderChecklist', 'syncBuildToPlanner', 'adoptTemplate', 'dropStaleAxisMaterials', 'materialFor', 'applyPalette',
      `${helpers}\n${code}\nreturn applyHandleStyle;`)(
      renderer, { rev: 0 }, null, null, templates, null, '', {}, null, instances, { Handle_Deco: 'Handle' }, () => new THREE.Vector3(),
      () => 55, () => 5, { parts: [] }, {}, {}, () => {}, () => {}, null, () => [], () => new THREE.MeshStandardMaterial(), () => {});
    await applyHandleStyle(style);
    const meshes = meshesOf(handle.group);
    if (handle.cfg.node !== 'Handle_BlockBar_B' || meshes.length !== 1) { failures.push('the swap did not replace the handle - the scenario is broken'); continue; }
    if (meshes[0].castShadow !== enabled || meshes[0].receiveShadow !== enabled) failures.push(`handle swap with shadows ${enabled ? 'on' : 'off'}: new mesh cast ${meshes[0].castShadow} receive ${meshes[0].receiveShadow}`);
    if (renderer.shadowMap.needsUpdate !== enabled) failures.push(`handle swap with shadows ${enabled ? 'on' : 'off'}: needsUpdate ${renderer.shadowMap.needsUpdate}`);
  }
  return failures;
}

async function faceplateSwapScenario(helpers, code) {
  const failures = [];
  for (const enabled of [true, false]) {
    const renderer = { shadowMap: shadowMap(enabled) };
    const plate = instance('p1', 'Faceplate_Essential_1W-1H', enabled);
    const instances = new Map([['p1', plate]]);
    const templates = { 'Faceplate_Chevron_1W-1H': template(false) };
    const style = { key: 'chevron', label: 'Chevron', node: (code) => `Faceplate_Chevron_${code}`, img: () => '', links: {}, hasHandle: true };
    const applyFaceplateStyle = new Function('renderer', 'ao', 'dropFaceplateMaterials', 'activeFaceplateStyle', 'build', 'regenerate', 'selectedId',
      'setSelected', 'instances', 'typeByNode', 'fpSizeCode', 'templates', 'loader', 'PARTS_BASE', 'adoptTemplate', 'basePos', 'nodeDepth', 'fpFocus',
      'pageVisibility', 'manifest', 'partInfoByNode', 'renderChecklist', 'computeBounds', 'setDims', 'dims', 'syncBuildToPlanner',
      `${helpers}\n${code}\nreturn applyFaceplateStyle;`)(
      renderer, { rev: 0 }, () => {}, null, null, async () => {}, null, () => {}, instances, { 'Faceplate_Essential_1W-1H': 'Faceplate' },
      (node) => (node.match(/_(\d+W-\d+H)$/) || [])[1] || null, templates, null, '', null, () => new THREE.Vector3(), () => 5, { id: null },
      () => true, { parts: [] }, {}, () => {}, () => {}, () => {}, { on: false }, () => {});
    // computeBounds is stubbed out: the swap must ask for the render itself, not lean on a call a later edit could drop
    await applyFaceplateStyle(style);
    const meshes = meshesOf(plate.group);
    if (plate.cfg.node !== 'Faceplate_Chevron_1W-1H' || meshes.length !== 1) { failures.push('the swap did not replace the plate - the scenario is broken'); continue; }
    if (meshes[0].castShadow !== enabled || meshes[0].receiveShadow !== enabled) failures.push(`faceplate swap with shadows ${enabled ? 'on' : 'off'}: new mesh cast ${meshes[0].castShadow} receive ${meshes[0].receiveShadow}`);
    if (renderer.shadowMap.needsUpdate !== enabled) failures.push(`faceplate swap with shadows ${enabled ? 'on' : 'off'}: needsUpdate ${renderer.shadowMap.needsUpdate}`);
  }
  return failures;
}

/* ------------------------------------------------------------------------------------------------ the tests */
test('applyShadowQuality flags every part mesh on the light stage and clears them on the dark stage', () => {
  assert.deepEqual(qualityScenario(HELPERS, SHADOW_QUALITY), []);
});
test('a handle swap gives the new clones the current shadow flags and asks for a shadow render', async () => {
  assert.deepEqual(await handleSwapScenario(HELPERS, HANDLE_SWAP), []);
});
test('a static kit\'s faceplate swap gives the new clones the current shadow flags and asks for a shadow render', async () => {
  assert.deepEqual(await faceplateSwapScenario(HELPERS, FACEPLATE_SWAP), []);
});

test('each part of the fix has power: removed from a copy, its scenario fails', async () => {
  const cases = [
    ['the dirty mark ignores the enabled state', () => handleSwapScenario(mutate(HELPERS, 'if (renderer.shadowMap.enabled) ', ''), HANDLE_SWAP)],
    ['applyShadowQuality stops flagging', () => qualityScenario(HELPERS, mutate(SHADOW_QUALITY, 'setPartShadows(inst.group, on);', ''))],
    ['the handle swap stops flagging its clones', () => handleSwapScenario(HELPERS, mutate(HANDLE_SWAP, 'setPartShadows(inst.group, renderer.shadowMap.enabled);', ''))],
    ['the handle swap no longer asks', () => handleSwapScenario(HELPERS, mutate(HANDLE_SWAP, 'markShadowDirty();', ''))],
    ['the faceplate swap stops flagging its clones', () => faceplateSwapScenario(HELPERS, mutate(FACEPLATE_SWAP, 'setPartShadows(inst.group, renderer.shadowMap.enabled);', ''))],
    ['the faceplate swap no longer asks', () => faceplateSwapScenario(HELPERS, mutate(FACEPLATE_SWAP, 'markShadowDirty();', ''))],
  ];
  for (const [name, run] of cases) {
    const failures = await run();
    assert.ok(failures.length > 0, `with "${name}", every expectation still held - that line is untested`);
  }
});
