/* Label text in the 3D Build Studio (2026-10-01 prototype, Joey: "if we named a drawer "Torx Bits" it would then display the
   label for that drawer in the 3d viewer as well"; 2026-10-02: "are you able to use what it already creates one to one?").

   The words a drawer is named in the planner (its unit's `label`) are built into a label by the EdgeLabel GENERATOR'S OWN
   CODE: js/vendor/edgelabel-core.js is a byte-for-byte copy of the generator's label-core.js (pinned by
   test/edgelabel-core-vendor.test.mjs). So the font, the 5 mm cap height, the 0.6 mm raised letters, the word wrap against
   the slanted right edge, the auto-shrink to the 3 mm floor, the left badge (icon or letter) and the 2 mm it pushes the text
   over by, the icon library and the keyword -> icon prediction are the generator's, not a port of them.

   What a label is built FROM is the planner's: the unit's words (stored as typed), its `labelBadge` (absent = the
   generator's own icon prediction, which is on by default - "Torx Bits" gets the Torx head) and the build's `labelStyle`
   (null = the generator's defaults), each checked by label-spec.js first. The only thing decided HERE is where the
   generator's flat label sits on the viewer's upright Label_EdgeLabel model (below).

   ⚠ THE FRAME WAS MEASURED, NOT ASSUMED. The generator builds a label lying flat: X 57 mm long, Y 27 mm wide, Z 0..4.5 up,
   text on Z = 4.5. The viewer's Label_EdgeLabel model stands upright: X 57, Y 0..27 (bottom-anchored), Z -2.25..2.25 with the
   face toward +Z. Matching all 1,028 of the generator's own label vertices against the model for the 8 axis-sign choices
   picked (x, y + 13.5, z - 2.25) - mean 0.06 mm, worst 0.22 mm (the model's quantization); the next best was 1.4 mm mean.
   So the generator's geometry needs a shift and no rotation: LABEL_FRAME_OFFSET. */
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { cleanLabelBadge, cleanLabelStyle } from './label-spec.js';
import { isLabelSvg } from './label-panel.js';

/* The generator's text colour. Only this one value is needed before the core has loaded (main.js seeds the TEXT zone's
   colour when a build mounts); test/edgelabel-core-vendor.test.mjs pins it to the core's own DEFAULTS.colorText. */
export const LABEL_TEXT_DEFAULTS = Object.freeze({ hex: '#1a1a1a' });

/* Which label models get text. EdgeLabel only: the Classic Pro label lies on a sloped grip, its frame has not been measured,
   and its generator lays a label out differently (badge and text centred as a group), so it needs its own core. */
export const LABEL_TEXT_NODES = new Set(['Label_EdgeLabel']);

let core = null;      // GEN2EdgeLabelCore.create(...), once its script and the font have loaded
let icons = null;     // GEN2LabelIcons.create({ core }): the generator's icon catalog (groups, the MODULITH icon family, the guess)
let frame = null;     // generator frame -> the Label_EdgeLabel model's frame
let font = null;      // the parsed label font (opentype), kept for the part-label layout (loadLabelParts)

/* Loading: opentype.js (the generators' UMD build) and the core are classic scripts, the font is fetched as bytes. All three
   load ONCE, and only when a build has label text to show. Each URL carries this module's own ?v= stamp, so a deploy can
   never pair a new label-text.js with a cached old core. */
let loading = null;
export function labelFontReady() { return !!core; }
/* The generator's core itself (its DEFAULTS, prepareLabel ...), for the label tools and for checks; null until loaded. */
export function labelCore() { return core; }
/* The generator's icon catalog (js/vendor/label-icons.js over the core: the icons a label can carry, their groups, the guess,
   the drawing a badge prints); null until loaded. The label tools read icons ONLY through it. */
export function labelIcons() { return icons; }
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
    script(url('./vendor/label-icon-art.js'), () => !!window.GEN2LabelIconArt),
    script(url('./vendor/label-icons.js'), () => !!window.GEN2LabelIcons),
    fetch(url('../vendor/fonts/LiberationSansNarrow-Bold.ttf')).then((r) => { if (!r.ok) throw new Error('label font ' + r.status); return r.arrayBuffer(); }),
  ]).then(([, , , , buf]) => {
    // the core reads THREE.SVGLoader the way the generator's three global carries it; a module namespace cannot take a new
    // property, so the core gets a plain copy of it with the addon added
    const c = window.GEN2EdgeLabelCore.create({ THREE: { ...THREE, SVGLoader } });
    font = window.opentype.parse(buf);
    c.setFont(font);
    frame = [0, c.LABEL_WID / 2, c.LABEL_HT - c.LABEL_HT / 2];
    icons = window.GEN2LabelIcons.create({ core: c, art: window.GEN2LabelIconArt });
    core = c;
  }).catch((e) => { loading = null; throw e; });   // a failed load may be retried by the next mount
  return loading;
}

/* The badge a label wears when nobody has picked one: the generator's own prediction (its catalog's guess), under the
   style's switch. */
function defaultBadge(text, S) {
  const id = S.predictIcons ? icons.guessIconId(text) : null;
  return id ? { type: 'icon', value: id } : { type: 'none' };
}

/* One label as geometry in the Label_EdgeLabel model's own frame, built by the generator's buildLabelMeshes. `badge` is
   the unit's labelBadge (absent or invalid = the generator's prediction), `style` the build's labelStyle (absent or invalid
   values = the generator's defaults). Returns null when there is nothing to print. `fits` is the generator's own verdict:
   false means even the 3 mm floor overflows the label, exactly where the generator warns. `upload` is the drawer's uploaded
   icon (label-panel.js labelUploadFor): it wins, as an upload does in the generator. */
const cache = new Map();
export function labelGeometry(text, badge, style, upload) {
  if (!core) throw new Error('label core not loaded');
  const S = { ...core.DEFAULTS, ...(cleanLabelStyle(style) || {}) };
  const raw = String(text || '');
  const up = isLabelSvg(upload) ? { type: 'icon', svg: upload } : null;
  const chosen = up || cleanLabelBadge(badge) || defaultBadge(raw, S);
  // the generator's one adapter: an icon its core does not hold reaches the core as the badge's own drawing, chosen for
  // the style's Badge size exactly as the generator chooses it
  const data = core.prepareLabel(raw, icons.resolveBadge(chosen, S.badgeSize), S.allCaps);
  if (!data) return null;
  const key = JSON.stringify([data.text, data.badge, S.capMm, S.depth, S.badgeSize, S.bold]);
  if (cache.has(key)) return cache.get(key);
  let m;
  try { m = core.buildLabelMeshes(data, S.capMm, S.depth, S.badgeSize, S.bold); }
  catch (e) {
    if (!up) throw e;
    // an upload this page cannot draw: the words alone, as the generator refuses an SVG it cannot read
    console.warn(`[label text] an uploaded icon could not be drawn (${(e && e.message) || e}) - shown without it`);
    return labelGeometry(text, { type: 'none' }, style);
  }
  const parts = [];
  if (m.textGeo) parts.push({ part: 'text', geo: m.textGeo });
  if (m.badgeGeo) parts.push({ part: 'badge', geo: m.badgeGeo });
  for (const p of parts) { p.geo.translate(...frame); p.geo.computeBoundingBox(); }
  const out = { parts, fits: m.textFits, shown: data.text.trim(), badge: data.badge };
  cache.set(key, out);
  return out;
}

/* ---- part labels and colour stripes, as the Label Studio draws them (2026-10-10) -----------------------------------------
   A PART label (a Part Picker item in the build's label list) is laid out by the Label Studio's own part-label code, and a
   colour STRIPE (a part item's metric / SAE band, or any label's own stripe) is the Label Studio's own label body cut into
   base / band / accent pieces: js/vendor/label-hardware.js over hardware-layout.js, hardware-data.js, hardware-v5-data.js and
   hardware-band-data.js, all five byte-for-byte copies of the Label Studio's (test/label-hardware-vendor.test.mjs pins them).
   label-look.js decides which drawer wears what; this half loads the files and builds the geometry.

   ⚠ LAZY, AND ONLY WHAT IS NEEDED: the five are ~0.75 MB together. A build with no part label and no stripe loads none of
   them; a stripe alone loads label-hardware.js + hardware-band-data.js; a part label loads all five. Each URL carries this
   module's own ?v= stamp, like the core's.

   THE FRAME: label-hardware.js builds in the generator frame (the label body z 0..4.5 with its top face at LABEL_HT, the ink
   z 0..depth, placed AT the top face), the same frame label-core.js builds in, so the measured shift to the Label_EdgeLabel
   model applies unchanged: the ink moves by `frame` exactly like label-core's text, the body pieces by `frame` less LABEL_HT
   (they start at the bed, not at the top face). */
let parts = null, partsHave = { layout: false, bands: false }, partsLoading = null;
const vendorUrl = (rel) => new URL(rel + new URL(import.meta.url).search, import.meta.url).href;
const loadScript = (src, ready) => (ready() ? Promise.resolve() : new Promise((res, rej) => {
  const s = document.createElement('script');
  s.src = src; s.async = false;
  s.onload = () => res(); s.onerror = () => rej(new Error(src.split('/').pop().split('?')[0] + ' did not load'));
  document.head.appendChild(s);
}));
/* Whether the files a build needs (label-look.js labelLookNeeds) have loaded. */
export function labelPartsReady(need) {
  return !!parts && (!need || ((!need.layout || partsHave.layout) && (!need.bands || partsHave.bands)));
}
/* The Label Studio's part-label module itself (its colour(), treatments ...), for checks; null until loaded. */
export function labelParts() { return parts; }
export function loadLabelParts(need) {
  const want = { layout: !!(need && need.layout), bands: !!(need && need.bands) };
  if (labelPartsReady(want)) return Promise.resolve();
  if (partsLoading) return partsLoading.then(() => loadLabelParts(want));   // one load at a time; then whatever is still missing
  const list = [loadLabelFont(), loadScript(vendorUrl('./vendor/label-hardware.js'), () => !!window.GEN2LabelHardware)];
  if (want.bands) list.push(loadScript(vendorUrl('./vendor/hardware-band-data.js'), () => !!window.GEN2HardwareBandData));
  if (want.layout) list.push(
    loadScript(vendorUrl('./vendor/hardware-layout.js'), () => !!window.GEN2HardwareLayout),
    loadScript(vendorUrl('./vendor/hardware-data.js'), () => !!window.GEN2HardwareData),
    loadScript(vendorUrl('./vendor/hardware-v5-data.js'), () => !!window.GEN2HardwareV5Data));
  partsLoading = Promise.all(list).then(() => {
    // created again whenever more data arrives (the layout instances are made by create); the caches below are keyed by what
    // the data gives, so a re-create changes no geometry already built
    const lh = window.GEN2LabelHardware.create({
      THREE, layout: window.GEN2HardwareLayout || null, data: window.GEN2HardwareData || null, v5: window.GEN2HardwareV5Data || null,
      bands: window.GEN2HardwareBandData || null, mergeGeoms: (g) => core.mergeGeoms(g),
    });
    lh.setFont(font);
    partsHave = { layout: !!lh.layouts.edgelabel, bands: lh.treatments.length > 0 };
    parts = lh;
    // loaded but unusable (data of another format): say so, so no caller waits on it again
    if (!labelPartsReady(want)) throw new Error('the part-label data did not load as expected');
  }).finally(() => { partsLoading = null; });
  return partsLoading;
}

/* The body pieces of a stripe, in the model's frame: [{ piece: 'base'|'band'|'accent', geo, hex }] (hex null = the label's
   base colour, i.e. its Body), or null (no band data, an unknown position). `colours` = a CLEANED { band, band_accent }
   (parts.colours). The geometries are translated COPIES of label-hardware.js's own (it hands out one shared geometry per
   piece and would be the one to dispose it), cached here for the page's life: 3 positions x 2 patterns x 3 pieces at most. */
const pieceCache = new Map();
function stripePieces(position, colours) {
  const bp = parts.bandParts(position, colours);
  if (!bp) return null;
  const kind = colours.band && colours.band.pattern === 'dashed' ? 'dashed' : 'solid';
  return bp.map((p) => {
    const key = position + '/' + kind + '/' + p.piece;
    if (!pieceCache.has(key)) {
      const g = p.geo.clone();
      g.translate(frame[0], frame[1], frame[2] - core.LABEL_HT);
      g.computeBoundingBox();
      pieceCache.set(key, g);
    }
    return { piece: p.piece, geo: pieceCache.get(key), hex: p.colour ? p.colour.hex.toLowerCase() : null };
  });
}
/* An ordinary label's stripe (label-look.js kind 'stripe'): its body pieces, or null when the band data has not loaded. */
export function stripeGeometry(colours, position) {
  if (!parts || !partsHave.bands || !core) return null;
  return stripePieces(position, parts.colours(colours || {}));
}

/* A PART label as the Label Studio prints it: { parts: [{ part: 'ink', geo }], pieces | null, record, shown }, or null when the
   layout cannot print it (the Label Studio's red row note: not ready, or it does not fit) - the caller then shows the drawer's
   words instead. Laid out on EdgeLabel with the screw and nut drawings on (the Label Studio's default), the stripe at
   `position` (null: none); the ink stands 0.45 mm proud (the part label's own depth, not the build's text depth). */
const partCache = new Map();
export function partLabelGeometry(item, position) {
  if (!parts || !partsHave.layout || !core) return null;
  const key = JSON.stringify([item, position || 'off']);
  if (partCache.has(key)) return partCache.get(key);
  const r = parts.layOut(item, { type: 'edgelabel', profile: true, band: position || 'off' });
  let out = null;
  if (r.elements) {
    const ink = parts.inkGeometry(r.elements, r.inkDepth);
    const list = [];
    if (ink) { ink.translate(...frame); ink.computeBoundingBox(); list.push({ part: 'ink', geo: ink }); }
    out = { parts: list, pieces: r.band ? stripePieces(r.band, r.colours) : null, record: r.record,
            shown: (r.record.main_lines || [r.record.main || '']).join(' ') };
  }
  else console.warn(`[label text] a part label could not be laid out (${r.record.not_ready || r.record.nonfit}) - its words are shown`);
  partCache.set(key, out);
  return out;
}
