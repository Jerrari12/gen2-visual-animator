/* Label text in the 3D Build Studio - PROTOTYPE (2026-10-01, Joey: "if we named a drawer "Torx Bits" it would then
   display the label for that drawer in the 3d viewer as well").

   The text a drawer is named in the planner (its unit's `label`, up to 40 characters) is laid out and extruded EXACTLY as the
   EdgeLabel label generator does it, so the label in the 3D view reads the way the printed one will: the same font, the same
   5 mm cap height, the same 0.6 mm raised letters, the same word wrap and auto-shrink inside the same usable area, ALL CAPS on.
   Everything between the "ported" markers is the generator's code (gen2-edgelabel-label-generator `18a2d87`, index.html,
   "Text -> 3D geometry" and "Robust path -> shapes"), changed only where noted: THREE comes from the import map, and the badge
   (the generator's left icon/letter) is left out because the planner does not store one.

   ⚠ A PORT CAN DRIFT FROM THE GENERATOR. The next step, if this is kept, is ONE shared file the generators and the viewer both
   load (the tabletop-completion.js pattern: byte-identical copies, pinned by hash in both repos).

   ⚠ THE FRAME WAS MEASURED, NOT ASSUMED. The generator builds a label lying flat: X 57 mm long, Y 27 mm wide, Z 0..4.5 up,
   text on Z = 4.5. The viewer's Label_EdgeLabel model stands upright: X 57, Y 0..27 (bottom-anchored), Z -2.25..2.25 with the
   face toward +Z. Matching all 1,028 of the generator's own label vertices (BASE_VERTS) against the model for the 8 axis-sign
   choices picked (x, y + 13.5, z - 2.25) - mean 0.06 mm, worst 0.22 mm (the model's quantization); the next best was 1.4 mm
   mean. So the generator's geometry needs a shift and no rotation: LABEL_FRAME_OFFSET. */
import * as THREE from 'three';

/* ======================= ported from the EdgeLabel generator (18a2d87) ======================= */
const LABEL_LEN = 57.0;   // X span (length)
const LABEL_WID = 27.0;   // Y span (width)
const LABEL_HT  = 4.5;    // top flat plane where text/badge sit
const DIAG_DXDY = (27.1 - 2.1) / (13.5 - (-12.5));   // right-edge slope, Δx per Δy (~0.96)
const DIAG_X0   = 2.1 + DIAG_DXDY * 12.5;            // right-edge x at y=0 (~14.1)
const AREA_MARGIN = 1.8;                   // inset from part edges
const AREA_LEFT  = -LABEL_LEN / 2 + AREA_MARGIN;   // left text/badge margin
const AREA_RIGHT =  LABEL_LEN / 2 - AREA_MARGIN;   // theoretical right tip
const AREA_TOP   =  LABEL_WID / 2 - AREA_MARGIN;   // top edge inset
const AREA_BOTTOM= -LABEL_WID / 2 + AREA_MARGIN;   // bottom edge inset (left side)
const LINE_GAP  = 1.25;    // line pitch as a multiple of cap height
const MIN_PRINT_CAP = 3.0; // never auto-shrink text below this (mm) — keeps it printable
const BOLD_OFFSET = 0.12;  // stroke thickening (mm) applied when "Bold text" is on

let font = null;

function getCapHeight() {
  if (font.tables.os2 && font.tables.os2.sCapHeight) {
    return font.tables.os2.sCapHeight;
  }
  // Fallback: measure 'H'
  const path = font.getPath('H', 0, 0, font.unitsPerEm);
  const bb = path.getBoundingBox();
  return Math.abs(bb.y2 - bb.y1);
}

function fontSizeForCap(capMm) {
  return capMm * font.unitsPerEm / getCapHeight();
}

// Merge several (non-indexed) extruded geometries into one BufferGeometry.
function mergeGeoms(geos) {
  let total = 0;
  for (const g of geos) total += g.getAttribute('position').array.length;
  const arr = new Float32Array(total);
  let o = 0;
  for (const g of geos) {
    const p = g.getAttribute('position').array;
    arr.set(p, o); o += p.length;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  m.computeVertexNormals();
  return m;
}

// Fake-bold: dilate strokes by merging slightly offset copies. Copies sit a hair
// lower in z so the original's top face wins in overlaps (avoids z-fighting flicker).
function emboldenGeo(geo, b) {
  const dirs = [[b,0],[-b,0],[0,b],[0,-b],[b*0.7,b*0.7],[b*0.7,-b*0.7],[-b*0.7,b*0.7],[-b*0.7,-b*0.7]];
  const copies = [geo];
  dirs.forEach((d, k) => {
    const c = geo.clone();
    c.translate(d[0], d[1], -0.02 - k * 0.004);
    copies.push(c);
  });
  return mergeGeoms(copies);
}

// Extrude one line of text; returns geometry with boundingBox computed (origin = glyph origin).
function buildLineGeo(line, fontSize, depth, bold) {
  const path = font.getPath(line, 0, 0, fontSize);
  const shapes = pathToShapes(path);
  if (!shapes.length) return null;
  let g = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: false, curveSegments: 6 });
  if (bold) g = emboldenGeo(g, BOLD_OFFSET);
  g.computeBoundingBox();
  return g;
}

// Max usable X (right limit) for a horizontal band whose lowest point is at yBot,
// constrained by the diagonal right edge: x_right(y) = DIAG_X0 + DIAG_DXDY * y.
function rightLimitAt(yBot) {
  const onDiag = DIAG_X0 + DIAG_DXDY * yBot;
  return Math.min(AREA_RIGHT, onDiag - AREA_MARGIN);
}

// Which left margin a line uses: a line that sits entirely below the badge can start
// at the full left edge; a line beside the badge starts after it.
function lineLeftX(topY, leftXBadge, badgeBottomY) {
  return (topY <= badgeBottomY + 0.01) ? AREA_LEFT : leftXBadge;
}

// Word-wrap text into lines, respecting the narrowing area and the badge.
function wrapText(text, capMm, leftXBadge, badgeBottomY) {
  const fontSize = fontSizeForCap(capMm);
  const pitch = capMm * LINE_GAP;
  const words = text.trim().split(/\s+/);
  const lines = [];
  let cur = '';
  const maxWidthForLine = (n) => {
    const topY = AREA_TOP - n * pitch;
    const yBot = topY - capMm;
    const lx = lineLeftX(topY, leftXBadge, badgeBottomY);
    return Math.max(0, rightLimitAt(yBot) - lx);
  };
  for (const word of words) {
    const trial = cur ? cur + ' ' + word : word;
    if (cur === '' || font.getAdvanceWidth(trial, fontSize) <= maxWidthForLine(lines.length)) {
      cur = trial;
    } else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return { lines, fontSize, pitch };
}

// Build a left-justified, top-anchored, word-wrapped text block. Auto-shrinks to fit.
// Returns { geo, top, bottom } in label-local coords, or null.
function buildTextBlock(text, capMm, depth, leftXBadge, badgeBottomY, bold) {
  let cap = Math.max(MIN_PRINT_CAP, capMm);   // start at the requested size
  let geos = [], totalH = 0, fits = false;
  for (let it = 0; it < 24; it++) {
    const w = wrapText(text, cap, leftXBadge, badgeBottomY);
    geos = [];
    let overflow = false;
    for (let i = 0; i < w.lines.length; i++) {
      const g = buildLineGeo(w.lines[i], w.fontSize, depth, bold);
      if (!g) continue;
      const bb = g.boundingBox;
      const lw = bb.max.x - bb.min.x;
      const topY = AREA_TOP - i * w.pitch;
      const lx = lineLeftX(topY, leftXBadge, badgeBottomY);
      // left-justify (left edge -> lx) and align this line's top -> topY
      g.translate(lx - bb.min.x, topY - bb.max.y, 0);
      geos.push(g);
      const yBot = topY - cap;
      if (lx + lw > rightLimitAt(yBot) + 0.1) overflow = true;
    }
    totalH = w.lines.length * w.pitch;
    const tooTall = (AREA_TOP - totalH) < AREA_BOTTOM;
    fits = !overflow && !tooTall;
    // Stop once it fits, or once we've hit the printable floor (don't shrink further).
    if (fits || cap <= MIN_PRINT_CAP + 1e-6) break;
    cap = Math.max(MIN_PRINT_CAP, cap * 0.92);
  }
  if (!geos.length) return null;
  return { geo: mergeGeoms(geos), top: AREA_TOP, bottom: AREA_TOP - totalH, fits };
}

// ----- Robust path → shapes conversion -----
// Splits an opentype.js path into subpaths, samples curves to polylines for
// containment tests, and nests holes under their parent outers using
// even/odd depth based on point-in-polygon. Handles glyphs like g, 6, B, O.
function _sampleQuad(p0, p1, p2, out, n) {
  // Sample n points along quadratic bezier (excluding p0, including p2)
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const x = u*u*p0[0] + 2*u*t*p1[0] + t*t*p2[0];
    const y = u*u*p0[1] + 2*u*t*p1[1] + t*t*p2[1];
    out.push([x, y]);
  }
}
function _sampleCubic(p0, p1, p2, p3, out, n) {
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const x = u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0];
    const y = u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1];
    out.push([x, y]);
  }
}
function _signedArea(pts) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}
function _pointInPoly(pt, poly) {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function pathToShapes(otPath) {
  // 1. Split into subpaths with sampled polylines (Y is flipped here so all
  //    downstream geometry is in Three.js Y-up coords).
  const subpaths = [];
  let cur = null;
  let lastPt = null;
  const NSAMP = 8;

  for (const cmd of otPath.commands) {
    if (cmd.type === 'M') {
      if (cur && cur.points.length > 2) subpaths.push(cur);
      const p = [cmd.x, -cmd.y];
      cur = { commands: [cmd], points: [p] };
      lastPt = p;
    } else if (cmd.type === 'L') {
      const p = [cmd.x, -cmd.y];
      cur.commands.push(cmd);
      cur.points.push(p);
      lastPt = p;
    } else if (cmd.type === 'Q') {
      cur.commands.push(cmd);
      const p2 = [cmd.x, -cmd.y];
      _sampleQuad(lastPt, [cmd.x1, -cmd.y1], p2, cur.points, NSAMP);
      lastPt = p2;
    } else if (cmd.type === 'C') {
      cur.commands.push(cmd);
      const p3 = [cmd.x, -cmd.y];
      _sampleCubic(lastPt, [cmd.x1, -cmd.y1], [cmd.x2, -cmd.y2], p3, cur.points, NSAMP);
      lastPt = p3;
    } else if (cmd.type === 'Z') {
      if (cur) cur.commands.push(cmd);
    }
  }
  if (cur && cur.points.length > 2) subpaths.push(cur);

  if (!subpaths.length) return [];

  // 2. Compute signed area; sort by |area| descending so parents come first.
  for (const sp of subpaths) sp.area = _signedArea(sp.points);
  subpaths.sort((a, b) => Math.abs(b.area) - Math.abs(a.area));

  // 3. For each subpath, find its immediate parent (smallest containing
  //    earlier subpath). Use a representative interior point.
  for (let i = 0; i < subpaths.length; i++) {
    const sp = subpaths[i];
    const pt = sp.points[0];
    sp.parent = null;
    for (let j = i - 1; j >= 0; j--) {
      const cand = subpaths[j];
      if (_pointInPoly(pt, cand.points)) {
        sp.parent = cand;
        break; // first hit is the smallest (sorted by area desc)
      }
    }
  }

  // 4. Even depth = outer, odd depth = hole.
  for (const sp of subpaths) {
    let d = 0, p = sp.parent;
    while (p) { d++; p = p.parent; }
    sp.isOuter = (d % 2) === 0;
  }

  // 5. Build Three.js shapes. Apply commands (with Y flip) to a Shape or Path.
  function applyCommands(commands, target) {
    for (const cmd of commands) {
      switch (cmd.type) {
        case 'M': target.moveTo(cmd.x, -cmd.y); break;
        case 'L': target.lineTo(cmd.x, -cmd.y); break;
        case 'Q': target.quadraticCurveTo(cmd.x1, -cmd.y1, cmd.x, -cmd.y); break;
        case 'C': target.bezierCurveTo(cmd.x1, -cmd.y1, cmd.x2, -cmd.y2, cmd.x, -cmd.y); break;
      }
    }
  }

  const shapes = [];
  for (const sp of subpaths) {
    if (sp.isOuter) {
      const s = new THREE.Shape();
      applyCommands(sp.commands, s);
      sp.threeShape = s;
      shapes.push(s);
    }
  }
  for (const sp of subpaths) {
    if (!sp.isOuter && sp.parent && sp.parent.threeShape) {
      const h = new THREE.Path();
      applyCommands(sp.commands, h);
      sp.parent.threeShape.holes.push(h);
    }
  }

  return shapes;
}
/* ============================ end of the ported generator code ============================ */

/* The generator's defaults (its "Text size" 5 mm, "Text depth" 0.6 mm, "Bold" off, "All caps" on, text colour #1a1a1a).
   The planner stores only the words, so these stand for every label until a label's own settings are stored too. */
export const LABEL_TEXT_DEFAULTS = Object.freeze({ capMm: 5, depth: 0.6, bold: false, allCaps: true, hex: '#1a1a1a' });

/* Which label models get text. EdgeLabel only in this prototype: the Classic Pro label lies on a sloped grip and its frame
   has not been measured. */
export const LABEL_TEXT_NODES = new Set(['Label_EdgeLabel']);

// generator frame -> the Label_EdgeLabel model's frame (measured, see the header): the text's base on the model's front face
const LABEL_FRAME_OFFSET = Object.freeze([0, LABEL_WID / 2, LABEL_HT - LABEL_HT / 2]);

/* Loading. opentype.js 1.3.4 is the generators' UMD build, so it goes in with a script tag (it sets window.opentype); the font
   is fetched as bytes. Both load ONCE, and only when a build has label text to show. */
let loading = null;
export function labelFontReady() { return !!font; }
export function loadLabelFont() {
  if (font) return Promise.resolve();
  if (loading) return loading;
  const lib = new URL('../vendor/opentype/opentype.min.js', import.meta.url).href;
  const ttf = new URL('../vendor/fonts/LiberationSansNarrow-Bold.ttf', import.meta.url).href;
  const script = window.opentype ? Promise.resolve() : new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = lib; s.async = true;
    s.onload = () => res(); s.onerror = () => rej(new Error('opentype.js did not load'));
    document.head.appendChild(s);
  });
  loading = Promise.all([script, fetch(ttf).then((r) => { if (!r.ok) throw new Error('label font ' + r.status); return r.arrayBuffer(); })])
    .then(([, buf]) => { font = window.opentype.parse(buf); })
    .catch((e) => { loading = null; throw e; });   // a failed load may be retried by the next mount
  return loading;
}

/* One label's text as geometry in the Label_EdgeLabel model's own frame, or null for empty text. `fits` is the generator's
   own verdict: false means even the 3 mm floor overflows the label, exactly where the generator warns. */
const cache = new Map();
export function labelTextGeometry(text, opts = {}) {
  if (!font) throw new Error('label font not loaded');
  const o = { ...LABEL_TEXT_DEFAULTS, ...opts };
  const shown = (o.allCaps ? String(text).toUpperCase() : String(text)).trim();
  if (!shown) return null;
  const key = `${shown}|${o.capMm}|${o.depth}|${o.bold ? 1 : 0}`;
  if (cache.has(key)) return cache.get(key);
  // no badge: leftXBadge = the plain left margin, and the badge's bottom far above the area so every line uses it
  const tb = buildTextBlock(shown, o.capMm, o.depth, AREA_LEFT, AREA_TOP + 999, o.bold);
  const out = tb ? { geo: tb.geo.translate(...LABEL_FRAME_OFFSET), fits: tb.fits, shown } : null;
  if (out) out.geo.computeBoundingBox();
  cache.set(key, out);
  return out;
}
