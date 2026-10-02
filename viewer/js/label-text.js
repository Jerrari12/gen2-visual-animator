/* Label text in the 3D Build Studio (2026-10-01 prototype, Joey: "if we named a drawer "Torx Bits" it would then display the
   label for that drawer in the 3d viewer as well"; 2026-10-02: "are you able to use what it already creates one to one?").

   The words a drawer is named in the planner (its unit's `label`) are built into a label by the EdgeLabel GENERATOR'S OWN
   CODE: js/vendor/edgelabel-core.js is a byte-for-byte copy of the generator's label-core.js (pinned by
   test/edgelabel-core-vendor.test.mjs). So the font, the 5 mm cap height, the 0.6 mm raised letters, the word wrap against
   the slanted right edge, the auto-shrink to the 3 mm floor, the left badge (icon or letter) and the 2 mm it pushes the text
   over by, the icon library and the keyword -> icon prediction are the generator's, not a port of them.

   The only things decided HERE: which badge a label gets (none is stored by the planner yet, so the generator's default
   applies - "Predict icons from text" is on, the same thing it does to names the planner sends it, so "Torx Bits" gets the
   Torx head), and where the generator's flat label sits on the viewer's upright Label_EdgeLabel model (below).

   ⚠ THE FRAME WAS MEASURED, NOT ASSUMED. The generator builds a label lying flat: X 57 mm long, Y 27 mm wide, Z 0..4.5 up,
   text on Z = 4.5. The viewer's Label_EdgeLabel model stands upright: X 57, Y 0..27 (bottom-anchored), Z -2.25..2.25 with the
   face toward +Z. Matching all 1,028 of the generator's own label vertices against the model for the 8 axis-sign choices
   picked (x, y + 13.5, z - 2.25) - mean 0.06 mm, worst 0.22 mm (the model's quantization); the next best was 1.4 mm mean.
   So the generator's geometry needs a shift and no rotation: LABEL_FRAME_OFFSET. */
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';

/* The generator's text colour. Only this one value is needed before the core has loaded (main.js seeds the TEXT zone's
   colour when a build mounts); test/edgelabel-core-vendor.test.mjs pins it to the core's own DEFAULTS.colorText. */
export const LABEL_TEXT_DEFAULTS = Object.freeze({ hex: '#1a1a1a' });

/* Which label models get text. EdgeLabel only: the Classic Pro label lies on a sloped grip, its frame has not been measured,
   and its generator lays a label out differently (badge and text centred as a group), so it needs its own core. */
export const LABEL_TEXT_NODES = new Set(['Label_EdgeLabel']);

let core = null;      // GEN2EdgeLabelCore.create(...), once its script and the font have loaded
let frame = null;     // generator frame -> the Label_EdgeLabel model's frame

/* Loading: opentype.js (the generators' UMD build) and the core are classic scripts, the font is fetched as bytes. All three
   load ONCE, and only when a build has label text to show. Each URL carries this module's own ?v= stamp, so a deploy can
   never pair a new label-text.js with a cached old core. */
let loading = null;
export function labelFontReady() { return !!core; }
/* The generator's core itself (its ICON_LIBRARY, guessIconId, DEFAULTS ...), for the label tools and for checks; null until loaded. */
export function labelCore() { return core; }
export function loadLabelFont() {
  if (core) return Promise.resolve();
  if (loading) return loading;
  const v = new URL(import.meta.url).search;
  const url = (rel) => new URL(rel + v, import.meta.url).href;
  const script = (src, ready) => (ready() ? Promise.resolve() : new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.async = false;
    s.onload = () => res(); s.onerror = () => rej(new Error(src.split('/').pop().split('?')[0] + ' did not load'));
    document.head.appendChild(s);
  }));
  loading = Promise.all([
    script(url('../vendor/opentype/opentype.min.js'), () => !!window.opentype),
    script(url('./vendor/edgelabel-core.js'), () => !!window.GEN2EdgeLabelCore),
    fetch(url('../vendor/fonts/LiberationSansNarrow-Bold.ttf')).then((r) => { if (!r.ok) throw new Error('label font ' + r.status); return r.arrayBuffer(); }),
  ]).then(([, , buf]) => {
    // the core reads THREE.SVGLoader the way the generator's three global carries it; a module namespace cannot take a new
    // property, so the core gets a plain copy of it with the addon added
    const c = window.GEN2EdgeLabelCore.create({ THREE: { ...THREE, SVGLoader } });
    c.setFont(window.opentype.parse(buf));
    frame = [0, c.LABEL_WID / 2, c.LABEL_HT - c.LABEL_HT / 2];
    core = c;
  }).catch((e) => { loading = null; throw e; });   // a failed load may be retried by the next mount
  return loading;
}

/* The badge a label wears when nobody has picked one: the generator's own prediction, under its own default switch. */
function defaultBadge(text) {
  const id = core.DEFAULTS.predictIcons ? core.guessIconId(text) : null;
  return id ? { type: 'icon', value: id } : { type: 'none' };
}

/* One label as geometry in the Label_EdgeLabel model's own frame, built by the generator's buildLabelMeshes with the
   generator's defaults. `badge` is { type: 'none' | 'icon' | 'char', value?, svg? } when one has been chosen; leave it out
   for the generator's default (predicted). Returns null when there is nothing to print. `fits` is the generator's own
   verdict: false means even the 3 mm floor overflows the label, exactly where the generator warns. */
const cache = new Map();
export function labelGeometry(text, badge) {
  if (!core) throw new Error('label core not loaded');
  const D = core.DEFAULTS;
  const raw = String(text || '');
  const chosen = badge || defaultBadge(raw);
  const data = core.prepareLabel(raw, chosen, D.allCaps);
  if (!data) return null;
  const key = JSON.stringify([data.text, data.badge]);
  if (cache.has(key)) return cache.get(key);
  const m = core.buildLabelMeshes(data, D.capMm, D.depth, D.badgeSize, D.bold);
  const parts = [];
  if (m.textGeo) parts.push({ part: 'text', geo: m.textGeo });
  if (m.badgeGeo) parts.push({ part: 'badge', geo: m.badgeGeo });
  for (const p of parts) { p.geo.translate(...frame); p.geo.computeBoundingBox(); }
  const out = { parts, fits: m.textFits, shown: data.text.trim(), badge: data.badge };
  cache.set(key, out);
  return out;
}
