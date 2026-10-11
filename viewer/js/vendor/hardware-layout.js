/* GEN2 hardware-label layout - one hardware label item (part-picker-label-item/1, the Part Picker's saved-record export)
   laid out on the measured EdgeLabel face. This is the browser port of the Python print engine that laid out every
   printed hardware plate (MODULITH/handoffs/hardware-library/icons-v1: label_from_items.lay_out ->
   printtest_v1.fields_value), ported rule for rule so the browser and the printed plates agree:
     - the value (its fields, e.g. "M12" "× 25") top-left at the largest cap from 12.0 down to the 6.0 mm minimum, wrapping
       only BETWEEN fields, never inside one;
     - the attributes at 4.7 mm caps, below the value or beside a value line, in reading order; pinned ones must print or
       the label is a NON-FIT naming them; the others go on while they fit and the rest are "not shown on label";
     - the compact family icon (nut / washer; screws have none since 2026-10-09) top-right when it fits beside everything else;
     - every element inside the face's usable area (1.8 mm margin) and 1.3 mm apart (1.4 mm from the icon);
     - text tracked in 0.05 mm steps until every glyph-to-glyph gap is at least 0.6 mm.
   Text outlines come from the generator's own font exactly as the Python engine reads it: FreeType's unhinted outline at
   100 px (26.6 fixed point, its rounding and its implied on-curve points), advances and GPOS kerning rounded to 1/64 pixel
   as matplotlib 3.11 places glyphs, and matplotlib's curve flattening (agg curve3_div, 0.5 tolerance in mm) - so the polygons are the same
   polygons, not a look-alike.

   A classic script with no imports and no THREE (the 3D extrusion stays in index.html):
     const hw = GEN2HardwareLayout.create({ data: GEN2HardwareData });   // hardware-data.js
     hw.setFont(opentypeFont);                                           // the generator font, before laying anything out
     const r = hw.layOut(item);   // { elements: {main1: rings, icon: rings, ...} | null, record: {...} }
   Element rings are in the generator label frame (mm, y up, the label centred at the origin; extrude from z 4.5).

   PROFILE LABELS (v5, label tool 2026-10-07; Jerrari: "I'd really like them to default to have the side and top profile of
   the bolt like this", holding his printed v5 M5 x 20 SHCS label). With hardware-v5-data.js loaded -
     GEN2HardwareLayout.create({ data: GEN2HardwareData, v5: GEN2HardwareV5Data })
   - a socket-cap or button-head screw, a hex nut or a regular nylon-insert nut is laid out as a PROFILE label first: the
   value on top, the head-on view and the side profile under it, the attributes on a 4.7 mm line below - the port of
   MODULITH/handoffs/hardware-library/v5/v5_items.lay_out (on labels_v5.py), checked against it in
   test/hardware-v5.test.mjs. The drawing shows the head, so a screw's head word (SHCS, BHCS) is not printed (Jerrari
   2026-10-07); a nut keeps its word beside the size. An item with no drawing, or whose pinned words do not fit the profile
   layout, gets the text layout above, and its record says why (profile_why). layOut(item, { profile: false }) asks for the
   text layout. */
(function (root) {
'use strict';

function create(deps) {
  const D = deps.data;
  if (!D || D.format !== 'modulith-hardware-face') throw new Error('hardware-layout: hardware-data.js is missing');
  const RU = D.rules;
  const MAIN_MIN = RU.mainMin, MAIN_MAX = RU.mainMax, SEC_CAP = RU.secCap, GAP_TEXT = RU.gapText, GAP_ICON = RU.gapIcon;
  const ATTR_BESIDE_GAP = RU.attrBesideGap, GLYPH_GAP = RU.glyphGap, TRACK_STEP = RU.trackStep, CAP_RATIO = D.capRatio;
  // no screw icon (Jerrari 2026-10-09: it "reads more like a 'T' out of place"); nuts and washers keep theirs. A screw's profile
  // drawing (v5) is a separate thing and stays.
  const FAMILY_ICON = { nut: 'nut', washer: 'washer' };
  const FONT_SUBS = [['\u2300', '\u00D8']];      // the font has no DIAMETER SIGN; Ø is in it (label_sheet_v1.FONT_SUBS)

  // ----- the usable area: convex (checked), so containment is a half-plane test per edge
  const US = D.usable.map(p => [p[0], p[1]]);
  const usOrient = Math.sign(signedArea(US.flat()));
  for (let i = 0; i < US.length; i++) {
    const a = US[i], b = US[(i + 1) % US.length], c = US[(i + 2) % US.length];
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (cr * usOrient < -1e-9) throw new Error('hardware-layout: the usable area is not convex');
  }
  let usMinX = Infinity, usMaxY = -Infinity;
  for (const [x, y] of US) { usMinX = Math.min(usMinX, x); usMaxY = Math.max(usMaxY, y); }
  const X0 = usMinX, YTOP = usMaxY;

  // ----- CUTOUTS (Classic Pro, label types step 3): pieces of that convex area that are NOT usable. Classic Pro's face less its
  // margin is not convex - the two slits that make its lower corners springy cut into it (export_hw_data_classicpro.py) - so its
  // data gives the area as its convex hull (usable) less convex cutouts, and an element's area off the face is its area outside
  // the hull plus its area inside each cutout: shapely's g.difference(USABLE).area, as the Python engine counts it. EdgeLabel's
  // face is convex and has none.
  const CUTS = (D.cutouts || []).map(c => {
    const P = c.map(p => [p[0], p[1]]), o = Math.sign(signedArea(P.flat()));
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length], d = P[(i + 2) % P.length];
      if (((b[0] - a[0]) * (d[1] - b[1]) - (b[1] - a[1]) * (d[0] - b[0])) * o < -1e-9) throw new Error('hardware-layout: a cutout is not convex');
    }
    return { P, o, minx: Math.min(...P.map(p => p[0])), maxx: Math.max(...P.map(p => p[0])),
             miny: Math.min(...P.map(p => p[1])), maxy: Math.max(...P.map(p => p[1])) };
  });
  // ----- ALIGNMENT: 'left' (EdgeLabel: everything from the usable area's top-left, as the printed plates) or 'centre' (Classic
  // Pro, Jerrari 2026-10-09: centred, as its plain labels - each row centred across the area, the label in the middle of it)
  const ALIGN = D.align === 'centre' ? 'centre' : 'left';
  const ICON_LEFT = ALIGN === 'centre' && D.iconSide === 'left';   // centred rows only: the icon before the value line
  const ICON_MIDDLE = ALIGN === 'centre' && D.iconAlign === 'middle';   // centred rows only: the icon on the value's mid-height
  let usMaxX = -Infinity, usMinY = Infinity;
  for (const [x, y] of US) { usMaxX = Math.max(usMaxX, x); usMinY = Math.min(usMinY, y); }
  const XC = (usMinX + usMaxX) / 2;

  const V5 = deps.v5 || null;
  if (V5 && (V5.format !== 'modulith-hardware-v5' || V5.version !== 1)) throw new Error('hardware-layout: hardware-v5-data.js is not v5 data');
  if (V5 && ALIGN !== 'left') throw new Error('hardware-layout: profile drawings are laid out from the top-left only');

  let font = null, xScale = 0, yScale = 0;
  const glyphCache = new Map(), textCache = new Map(), trackCache = new Map(), tgCache = new Map(), nutTextCache = new Map();
  function setFont(f) {
    font = f;
    // matplotlib's text_to_path: FT_Set_Char_Size(100 pt, 72 dpi) with text.hinting_factor 8 - 800 px per em across,
    // 100 px down - and FT_Set_Transform(1/8, 1) to bring x back; scales = FT_DivFix(ppem << 6, units_per_EM)
    xScale = Math.floor(800 * 64 * 65536 / f.unitsPerEm + 0.5);
    yScale = Math.floor(100 * 64 * 65536 / f.unitsPerEm + 0.5);
    glyphCache.clear(); textCache.clear(); trackCache.clear(); tgCache.clear(); nutTextCache.clear();
  }

  // ===================================================================== geometry
  // A ring is a flat array [x0, y0, x1, y1, ...] (implicitly closed). A part is {rings, minx, miny, maxx, maxy}: one glyph or
  // one icon shape, filled even-odd. An element is {parts, minx, miny, maxx, maxy}.
  function signedArea(r) {
    let a = 0;
    for (let i = 0, n = r.length; i < n; i += 2) {
      const j = (i + 2) % n; a += r[i] * r[j + 1] - r[j] * r[i + 1];
    }
    return a / 2;
  }
  function mkPart(rings) {
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const r of rings) for (let i = 0; i < r.length; i += 2) {
      const x = r[i], y = r[i + 1];
      if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
    }
    return { rings, minx, miny, maxx, maxy };
  }
  function mkEl(parts) {
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const p of parts) {
      if (p.minx < minx) minx = p.minx; if (p.maxx > maxx) maxx = p.maxx;
      if (p.miny < miny) miny = p.miny; if (p.maxy > maxy) maxy = p.maxy;
    }
    return { parts, minx, miny, maxx, maxy };
  }
  function shiftPart(p, dx, dy) {
    return { rings: p.rings.map(r => { const o = new Array(r.length); for (let i = 0; i < r.length; i += 2) { o[i] = r[i] + dx; o[i + 1] = r[i + 1] + dy; } return o; }),
             minx: p.minx + dx, maxx: p.maxx + dx, miny: p.miny + dy, maxy: p.maxy + dy };
  }
  function shift(el, dx, dy) { return mkEl(el.parts.map(p => shiftPart(p, dx, dy))); }
  // labelcore.place: the bounding box's left edge to `left`, its top to `top`
  function place(el, left, top) { return shift(el, left - el.minx, top - el.maxy); }

  function pointInRings(x, y, rings) {            // even-odd over every ring of a part
    let inside = false;
    for (const r of rings) {
      for (let i = 0, n = r.length, j = n - 2; i < n; j = i, i += 2) {
        const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
      }
    }
    return inside;
  }
  function segsCross(ax, ay, bx, by, cx, cy, dx, dy) {
    const d1 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx), d2 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
    const d3 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax), d4 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }
  function ptSeg2(px, py, ax, ay, bx, by) {
    const vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy;
    let t = L > 0 ? ((px - ax) * vx + (py - ay) * vy) / L : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = ax + t * vx - px, ey = ay + t * vy - py;
    return ex * ex + ey * ey;
  }
  // true when the two parts are closer than `lim` (shapely distance; 0 when they overlap or one lies inside the other)
  function partsCloser(A, B, lim) {
    const gx = Math.max(0, A.minx - B.maxx, B.minx - A.maxx), gy = Math.max(0, A.miny - B.maxy, B.miny - A.maxy);
    if (gx * gx + gy * gy >= lim * lim) return false;
    const lim2 = lim * lim;
    const bx0 = B.minx - lim, bx1 = B.maxx + lim, by0 = B.miny - lim, by1 = B.maxy + lim;
    for (const ra of A.rings) {
      for (let i = 0, n = ra.length; i < n; i += 2) {
        const ax = ra[i], ay = ra[i + 1], cx = ra[(i + 2) % n], cy = ra[(i + 3) % n];
        if (Math.max(ax, cx) < bx0 || Math.min(ax, cx) > bx1 || Math.max(ay, cy) < by0 || Math.min(ay, cy) > by1) continue;
        for (const rb of B.rings) {
          for (let k = 0, m = rb.length; k < m; k += 2) {
            const ex = rb[k], ey = rb[k + 1], fx = rb[(k + 2) % m], fy = rb[(k + 3) % m];
            if (Math.max(ex, fx) < Math.min(ax, cx) - lim || Math.min(ex, fx) > Math.max(ax, cx) + lim ||
                Math.max(ey, fy) < Math.min(ay, cy) - lim || Math.min(ey, fy) > Math.max(ay, cy) + lim) continue;
            if (segsCross(ax, ay, cx, cy, ex, ey, fx, fy)) return true;
            if (ptSeg2(ax, ay, ex, ey, fx, fy) < lim2 || ptSeg2(cx, cy, ex, ey, fx, fy) < lim2 ||
                ptSeg2(ex, ey, ax, ay, cx, cy) < lim2 || ptSeg2(fx, fy, ax, ay, cx, cy) < lim2) return true;
          }
        }
      }
    }
    // no edge within reach: either apart, or one wholly inside the other's fill (distance 0)
    for (const ra of A.rings) if (pointInRings(ra[0], ra[1], B.rings)) return true;
    for (const rb of B.rings) if (pointInRings(rb[0], rb[1], A.rings)) return true;
    return false;
  }
  function elsCloser(a, b, lim) {
    const gx = Math.max(0, a.minx - b.maxx, b.minx - a.maxx), gy = Math.max(0, a.miny - b.maxy, b.miny - a.maxy);
    if (gx * gx + gy * gy >= lim * lim) return false;
    for (const p of a.parts) for (const q of b.parts) if (partsCloser(p, q, lim)) return true;
    return false;
  }

  // shapely's distance between two elements (0 when they overlap or one lies inside the other's fill). Only the v5 nut word
  // needs the number itself (it is placed AT the v5 word gap); everything else asks elsCloser.
  function partsDist(A, B, best) {
    const gx = Math.max(0, A.minx - B.maxx, B.minx - A.maxx), gy = Math.max(0, A.miny - B.maxy, B.miny - A.maxy);
    if (gx * gx + gy * gy >= best * best) return best;
    let b2 = best * best;
    for (const ra of A.rings) for (let i = 0, n = ra.length; i < n; i += 2) {
      const ax = ra[i], ay = ra[i + 1], cx = ra[(i + 2) % n], cy = ra[(i + 3) % n];
      for (const rb of B.rings) for (let k = 0, m = rb.length; k < m; k += 2) {
        const ex = rb[k], ey = rb[k + 1], fx = rb[(k + 2) % m], fy = rb[(k + 3) % m];
        if (segsCross(ax, ay, cx, cy, ex, ey, fx, fy)) return 0;
        b2 = Math.min(b2, ptSeg2(ax, ay, ex, ey, fx, fy), ptSeg2(cx, cy, ex, ey, fx, fy), ptSeg2(ex, ey, ax, ay, cx, cy), ptSeg2(fx, fy, ax, ay, cx, cy));
      }
    }
    for (const ra of A.rings) if (pointInRings(ra[0], ra[1], B.rings)) return 0;
    for (const rb of B.rings) if (pointInRings(rb[0], rb[1], A.rings)) return 0;
    return Math.sqrt(b2);
  }
  function elsDistance(a, b) {
    let best = Infinity;
    for (const p of a.parts) for (const q of b.parts) { best = partsDist(p, q, best); if (best === 0) return 0; }
    return best;
  }

  // the area of an element outside the usable area (Python: g.difference(USABLE).area). Each ring is clipped against the
  // convex area (Sutherland-Hodgman); outer rings add, holes subtract (even-odd depth within the part).
  function clipRing(r) { return clipTo(r, US, usOrient); }
  function clipTo(r, P, orient) {                 // the ring clipped to the convex polygon P (Sutherland-Hodgman)
    let pts = r;
    for (let e = 0; e < P.length && pts.length; e++) {
      const [ax, ay] = P[e], [bx, by] = P[(e + 1) % P.length];
      const side = (x, y) => orient * ((bx - ax) * (y - ay) - (by - ay) * (x - ax));
      const out = [];
      for (let i = 0, n = pts.length; i < n; i += 2) {
        const px = pts[i], py = pts[i + 1], qx = pts[(i + 2) % n], qy = pts[(i + 3) % n];
        const sp = side(px, py), sq = side(qx, qy);
        if (sp >= 0) out.push(px, py);
        if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push(px + t * (qx - px), py + t * (qy - py)); }
      }
      pts = out;
    }
    return pts;
  }
  function onFace(x, y) {                          // inside the usable area or on its edge (the tolerance the area test uses)
    for (let e = 0; e < US.length; e++) {
      const [ax, ay] = US[e], [bx, by] = US[(e + 1) % US.length];
      if (usOrient * ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) < -1e-9) return false;
    }
    return true;
  }
  // the area is convex, so a box whose four corners are on it is wholly on it: a part (or element) whose bounding box passes
  // needs no per-point test (exact - the half-plane test is linear, so no point of the box can fall below its corners' minimum)
  const boxOnFace = b => onFace(b.minx, b.miny) && onFace(b.maxx, b.miny) && onFace(b.minx, b.maxy) && onFace(b.maxx, b.maxy);
  // strictly inside (no tolerance, the clip's own test sp >= 0): clipRing keeps such a ring unchanged, so skipping it is exact
  function inside0(x, y) {
    for (let e = 0; e < US.length; e++) {
      const [ax, ay] = US[e], [bx, by] = US[(e + 1) % US.length];
      if (usOrient * ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) < 0) return false;
    }
    return true;
  }
  const boxInside = b => inside0(b.minx, b.miny) && inside0(b.maxx, b.miny) && inside0(b.minx, b.maxy) && inside0(b.maxx, b.maxy);
  function ringBox(r) {
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (let i = 0; i < r.length; i += 2) { const x = r[i], y = r[i + 1]; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
    return { minx, miny, maxx, maxy };
  }
  function outsideArea(el) { return CUTS.length ? outsideHull(el) + inCutouts(el) : outsideHull(el); }
  // the area of an element inside the cutouts: each ring clipped to each cutout it can reach, outer rings add, holes subtract
  function inCutouts(el) {
    let area = 0;
    for (const C of CUTS) {
      const near = b => b.maxx > C.minx && b.minx < C.maxx && b.maxy > C.miny && b.miny < C.maxy;
      if (!near(el)) continue;
      for (const p of el.parts) {
        if (!near(p)) continue;
        for (const r of p.rings) {
          if (!near(ringBox(r))) continue;
          let depth = 0;
          for (const o of p.rings) if (o !== r && pointInRings(r[0], r[1], [o])) depth++;
          area += (depth % 2 ? -1 : 1) * Math.abs(signedArea(clipTo(r, C.P, C.o)));
        }
      }
    }
    return area;
  }
  function outsideHull(el) {
    if (boxOnFace(el)) return 0;
    let any = false;
    for (const p of el.parts) {
      if (any) break;
      if (boxOnFace(p)) continue;
      for (const r of p.rings) {
        for (let i = 0; i < r.length; i += 2) if (!onFace(r[i], r[i + 1])) { any = true; break; }
        if (any) break;
      }
    }
    if (!any) return 0;
    let area = 0;
    for (const p of el.parts) {
      if (boxInside(p)) continue;                // every ring of it is kept whole by the clip: it adds exactly 0
      for (const r of p.rings) {
        if (boxInside(ringBox(r))) continue;
        let depth = 0;
        for (const o of p.rings) if (o !== r && pointInRings(r[0], r[1], [o])) depth++;
        const k = depth % 2 ? -1 : 1;
        area += k * (Math.abs(signedArea(r)) - Math.abs(signedArea(clipRing(r))));
      }
    }
    return area;
  }

  // ===================================================================== text, as the Python engine reads the font
  function mulFix(a, b) { const c = Math.floor((Math.abs(a) * b + 32768) / 65536); return a < 0 ? -c : c; }   // FT_MulFix
  const ptX = xu => mulFix(mulFix(xu, xScale), 8192);       // loaded at 800 px/em, then the 1/8 transform (26.6 at 100 px)
  const ptY = yu => mulFix(yu, yScale);
  function glyphOf(ch) { return font.charToGlyph(ch); }
  // FreeType's FT_Outline_Decompose over the unhinted outline in 26.6 units: implied on-curve points are integer midpoints
  function outline26(g) {
    void g.path;                                  // opentype parses points lazily
    const pts = g.points || [], ops = [];
    let first = 0;
    for (let last = 0; last < pts.length; last++) {
      if (!pts[last].lastPointOfContour) continue;
      const P = [];
      for (let i = first; i <= last; i++) P.push({ x: ptX(pts[i].x), y: ptY(pts[i].y), on: !!pts[i].onCurve });
      first = last + 1;
      if (!P.length) continue;
      let start = { x: P[0].x, y: P[0].y }, idx = 0, limit = P.length - 1;
      if (!P[0].on) {
        if (P[limit].on) { start = { x: P[limit].x, y: P[limit].y }; limit--; }
        else start = { x: Math.trunc((P[0].x + P[limit].x) / 2), y: Math.trunc((P[0].y + P[limit].y) / 2) };
        idx = -1;
      }
      ops.push(['M', start.x, start.y]);
      let closed = false;
      while (idx < limit) {
        idx++;
        const p = P[idx];
        if (p.on) { ops.push(['L', p.x, p.y]); continue; }
        let ctl = { x: p.x, y: p.y };
        for (;;) {
          if (idx < limit) {
            idx++;
            const v = P[idx];
            if (v.on) { ops.push(['Q', ctl.x, ctl.y, v.x, v.y]); break; }
            const mid = { x: Math.trunc((ctl.x + v.x) / 2), y: Math.trunc((ctl.y + v.y) / 2) };
            ops.push(['Q', ctl.x, ctl.y, mid.x, mid.y]);
            ctl = { x: v.x, y: v.y };
            continue;
          }
          ops.push(['Q', ctl.x, ctl.y, start.x, start.y]); closed = true; break;
        }
        if (closed) break;
      }
      if (!closed) ops.push(['L', start.x, start.y]);
      ops.push(['Z']);
    }
    return ops;
  }
  // matplotlib Path.to_polygons -> agg conv_curve -> curve3_div (approximation scale 1: distance tolerance 0.5 units)
  const TOL2 = 0.25;
  function recBez(x1, y1, x2, y2, x3, y3, level, out) {
    if (level > 32) return;
    const x12 = (x1 + x2) / 2, y12 = (y1 + y2) / 2, x23 = (x2 + x3) / 2, y23 = (y2 + y3) / 2;
    const x123 = (x12 + x23) / 2, y123 = (y12 + y23) / 2;
    const dx = x3 - x1, dy = y3 - y1;
    let d = Math.abs((x2 - x3) * dy - (y2 - y3) * dx);
    if (d > 1e-30) {
      if (d * d <= TOL2 * (dx * dx + dy * dy)) { out.push(x123, y123); return; }
    } else {
      const da = dx * dx + dy * dy;
      const sq = (ax, ay, bx, by) => (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
      if (da === 0) d = sq(x1, y1, x2, y2);
      else {
        d = ((x2 - x1) * dx + (y2 - y1) * dy) / da;
        if (d > 0 && d < 1) return;
        if (d <= 0) d = sq(x2, y2, x1, y1);
        else if (d >= 1) d = sq(x2, y2, x3, y3);
        else d = sq(x2, y2, x1 + d * dx, y1 + d * dy);
      }
      if (d < TOL2) { out.push(x2, y2); return; }
    }
    recBez(x1, y1, x12, y12, x123, y123, level + 1, out);
    recBez(x123, y123, x23, y23, x3, y3, level + 1, out);
  }
  function glyphPart(ch, cap) {                   // the glyph at the pen origin, in mm (labelcore.text_geom of one char)
    const key = ch + '\u0000' + cap;
    if (glyphCache.has(key)) return glyphCache.get(key);
    const s = (cap / CAP_RATIO) / 100 / 64;       // 26.6 px at 100 px/em -> mm at this cap
    const rings = [];
    let r = null, lx = 0, ly = 0;
    const flush = () => { if (r && r.length >= 6) rings.push(r); r = null; };
    for (const op of outline26(glyphOf(ch))) {
      if (op[0] === 'M') { flush(); lx = op[1] * s; ly = op[2] * s; r = [lx, ly]; }
      else if (op[0] === 'L') { lx = op[1] * s; ly = op[2] * s; r.push(lx, ly); }
      else if (op[0] === 'Q') {
        const x2 = op[1] * s, y2 = op[2] * s, x3 = op[3] * s, y3 = op[4] * s;
        recBez(lx, ly, x2, y2, x3, y3, 0, r); r.push(x3, y3); lx = x3; ly = y3;
      } else flush();
    }
    flush();
    for (const q of rings) {                      // the decomposer closes back onto the start: drop that duplicate
      const n = q.length;
      if (n >= 4 && q[n - 2] === q[0] && q[n - 1] === q[1]) q.length = n - 2;
    }
    const part = rings.filter(q => q.length >= 6).length ? mkPart(rings.filter(q => q.length >= 6)) : null;
    glyphCache.set(key, part);
    return part;
  }
  // pen positions as matplotlib 3.11 lays text out (_text_helpers.layout, shaped by HarfBuzz over FreeType at 100 px/em):
  // each advance and each GPOS kerning value scaled to 26.6 pixels and rounded there, positions summed in 26.6 - checked
  // against matplotlib itself on 'AV TO' (A-V -123 units -> -384/64 px, T-O -29 -> -91/64)
  function penX(s, cap) {
    const scale = (cap / CAP_RATIO) / 100, xs = [], em = 6400 / font.unitsPerEm;
    let x26 = 0, prev = null;
    for (const ch of s) {
      const g = glyphOf(ch);
      if (prev !== null) x26 += Math.floor(font.getKerningValue(prev, g) * em + 0.5);
      xs.push(x26 / 64 * scale);
      x26 += Math.floor(g.advanceWidth * em + 0.5);
      prev = g;
    }
    return xs;
  }
  function glyphList(s, cap, track) {
    const xs = penX(s, cap), chars = [...s], out = [];
    chars.forEach((ch, i) => {
      if (ch === ' ') return;
      const g = glyphPart(ch, cap);
      if (g) out.push(shiftPart(g, xs[i] + i * track, 0));
    });
    return out;
  }
  function trackFor(s, cap) {                     // labels_v5.track_for: every glyph gap >= 0.6 mm, in 0.05 mm steps
    const key = s + '\u0000' + cap;
    if (trackCache.has(key)) return trackCache.get(key);
    let t = 0;
    for (;;) {
      const tr = Math.round(t * 1000) / 1000, gl = glyphList(s, cap, tr);
      let close = false;
      for (let i = 0; i < gl.length && !close; i++) for (let j = i + 1; j < gl.length; j++) {
        if (partsCloser(gl[i], gl[j], GLYPH_GAP - 1e-9)) { close = true; break; }
      }
      if (!close) { trackCache.set(key, tr); return tr; }
      t += TRACK_STEP;
    }
  }
  function text(s, cap) {                         // printtest_v1.text: the string at this cap, tracked, baseline at y 0
    const key = s + '\u0000' + cap;
    if (textCache.has(key)) return textCache.get(key);
    const el = mkEl(glyphList(s, cap, trackFor(s, cap)));
    textCache.set(key, el);
    return el;
  }

  // ===================================================================== the icon (printtest_v1.icon_mm, compact)
  function iconAt(iid, x0, ytop) {
    const ic = D.icons[iid];
    if (!ic) return null;
    return mkEl(ic.polys.map(rr => mkPart(rr.map(ring => { const o = []; for (const [x, y] of ring) o.push(x + x0, y + ytop); return o; }))));
  }

  // ===================================================================== CENTRED (Classic Pro)
  // The label is built as on EdgeLabel - value lines stacked from the top, an attribute beside a value line or in lines below,
  // the family icon beside the first line - and every check reads it ARRANGED: each row (a value line with the attribute beside
  // it and, on the first, the icon 1.4 mm after them; each attribute line below) centred across the usable area. Rows keep their
  // heights and gaps, so moving them sideways never brings two rows closer. The search runs with the label at the top of the
  // area, where it is furthest from the slits; the label it picks is then moved down towards the middle as far as it still
  // fits (centreDown) - the lower corners narrow, so a wide bottom row may keep it higher than the middle.
  function rowOf(k) {
    let m = /^(?:main|beside)(\d+)$/.exec(k);
    if (m) return 'm' + m[1];
    if (k === 'icon') return 'm1';
    m = /^secondary(\d+)$/.exec(k);
    return m ? 's' + m[1] : k;
  }
  function arrangeRows(els) {
    const rows = new Map(), out = {};
    for (const k of Object.keys(els)) { const r = rowOf(k); if (!rows.has(r)) rows.set(r, []); rows.get(r).push(k); }
    for (const keys of rows.values()) {
      const words = keys.filter(k => k !== 'icon');
      let minx = Infinity, maxx = -Infinity;
      for (const k of words) { minx = Math.min(minx, els[k].minx); maxx = Math.max(maxx, els[k].maxx); }
      const row = {};
      for (const k of words) row[k] = els[k];
      if (keys.includes('icon')) {            // after the row's words, or before them (iconSide 'left': Classic Pro, Jerrari 2026-10-09 -
        const g = els.icon;                   // right after the value a washer ring read as a degree sign, "M5°")
        row.icon = !words.length ? g : ICON_LEFT ? shift(g, minx - GAP_ICON - g.maxx, 0) : shift(g, maxx + GAP_ICON - g.minx, 0);
        if (ICON_MIDDLE && els.main1) {      // centred on the value line's height, not top-aligned (top-aligned beside a tall value
          const m = els.main1;               // it reads as a superscript); never above the area's top
          const dy = Math.min((m.miny + m.maxy) / 2 - (row.icon.miny + row.icon.maxy) / 2, YTOP - row.icon.maxy);
          if (dy) row.icon = shift(row.icon, 0, dy);
        }
        minx = Math.min(minx, row.icon.minx); maxx = Math.max(maxx, row.icon.maxx);
      }
      const dx = XC - (minx + maxx) / 2;
      for (const [k, el] of Object.entries(row)) out[k] = dx ? shift(el, dx, 0) : el;
    }
    return out;
  }
  function centreDown(els) {
    let miny = Infinity, maxy = -Infinity;
    for (const el of Object.values(els)) { miny = Math.min(miny, el.miny); maxy = Math.max(maxy, el.maxy); }
    const move = ((miny - usMinY) - (YTOP - maxy)) / 2;   // down by this, the room above and below is the same
    if (!(move > 1e-9)) return els;
    const at = dy => Object.fromEntries(Object.entries(els).map(([k, el]) => [k, shift(el, 0, -dy)]));
    if (okHere(at(move))[0]) return at(move);
    let lo = 0, hi = move;                         // lo fits (where the search checked it), hi does not: halve towards the lowest that fits
    for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (okHere(at(mid))[0]) lo = mid; else hi = mid; }
    return lo > 0 ? at(lo) : els;
  }

  // ===================================================================== the layout (printtest_v1, verbatim in logic)
  function ok(els) { return okHere(ALIGN === 'centre' ? arrangeRows(els) : els); }
  function okHere(els) {                          // the elements where they are
    const ks = Object.keys(els);
    for (const k of ks) {
      const a = outsideArea(els[k]);
      if (a > 1e-4) return [false, `${k} leaves the usable face by ${a.toFixed(3)} mm²`];
      // the slits' margin is kept exactly, without the area test's 1e-4 mm² (which let ink reach 7 µm into it; Jerrari: "avoid the
      // compliant mechanisms at all cost")
      if (CUTS.length && inCutouts(els[k]) > 1e-9) return [false, `${k} comes inside the margin around a slit`];
    }
    for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
      const need = (ks[i] + ks[j]).includes('icon') ? GAP_ICON : GAP_TEXT;
      if (elsCloser(els[ks[i]], els[ks[j]], need - 1e-6)) return [false, `${ks[i]} - ${ks[j]} closer than ${need} mm`];
    }
    return [true, null];
  }
  function* capsDown(lo, hi) {
    let c = hi;
    while (c >= lo - 1e-9) { yield Math.round(c * 100) / 100; c -= 0.1; }
  }
  function splits(s, sep) {
    const parts = s.split(sep), out = [[s]];
    for (let k = 1; k < parts.length; k++) out.push([parts.slice(0, k).join(sep).trim(), parts.slice(k).join(sep).trim()]);
    return out;
  }
  function stack(lines, cap, left, top, key) {
    const els = {};
    lines.forEach((ln, n) => { const g = place(text(ln, cap), left, top); els[key + (n + 1)] = g; top = g.miny - GAP_TEXT; });
    return [els, top];
  }
  function secondaryFit(els, secondary, left, top, loose) {
    const seen = new Set(), options = [];
    for (const sep of (loose ? [' · ', ', ', ' '] : [' · '])) {
      for (const lines of splits(secondary, sep)) {
        const key = JSON.stringify(lines);
        if (!seen.has(key)) { seen.add(key); options.push(lines); }
      }
    }
    for (const lines of options) {
      const [add] = stack(lines, SEC_CAP, left, top, 'secondary');
      if (ok({ ...els, ...add })[0]) return [add, lines];
    }
    return [null, null];
  }
  function product(slots, n) {
    let out = [[]];
    for (let i = 0; i < n; i++) { const nx = []; for (const c of out) for (const s of slots) nx.push([...c, s]); out = nx; }
    return out;
  }
  function placeAttrs(els, attrs, nLines, bottom, ordered) {
    if (!attrs.length) return [els, {}];
    const slots = ['below']; for (let i = 0; i < nLines; i++) slots.push(`beside line ${i + 1}`);
    const reading = { below: nLines }; for (let i = 0; i < nLines; i++) reading[`beside line ${i + 1}`] = i;
    const cmpTuple = (a, b) => { for (let i = 0; i < a.length; i++) { if (a[i] < b[i]) return -1; if (a[i] > b[i]) return 1; } return 0; };
    let combos = product(slots, attrs.length).sort((a, b) =>
      (a.filter(s => s !== 'below').length - b.filter(s => s !== 'below').length) || cmpTuple(a, b));
    if (ordered) combos = combos.filter(c => c.every((s, i) => i === 0 || reading[c[i - 1]] <= reading[s]));
    for (const combo of combos) {
      const out = { ...els };
      for (let i = 0; i < nLines; i++) {
        const here = attrs.filter((a, k) => combo[k] === `beside line ${i + 1}`);
        if (!here.length) continue;
        const line = els[`main${i + 1}`];
        let g = place(text(here.join(' · '), SEC_CAP), line.maxx + ATTR_BESIDE_GAP, YTOP);
        g = shift(g, 0, line.miny - g.miny);
        out[`beside${i + 1}`] = g;
      }
      if (!ok(out)[0]) continue;
      const below = attrs.filter((a, k) => combo[k] === 'below');
      if (below.length) {
        const [add] = secondaryFit(out, below.join(' · '), X0, bottom, false);
        if (!add) continue;
        Object.assign(out, add);
      }
      const where = {}; attrs.forEach((a, k) => { where[a] = combo[k]; });
      return [out, where];
    }
    return null;
  }
  let iconPosCache = new Map();
  function compactIcon(iid) {                     // the compact icon top-right: the rightmost 0.2 mm step that stays inside
    if (iconPosCache.has(iid)) return iconPosCache.get(iid);
    let g = null;
    for (let k = 560; k > 200; k -= 2) {
      const xr = k / 10 - 28.5;                   // Python frame x -> generator frame
      const t = iconAt(iid, xr - RU.iconCompact, YTOP);
      if (!t) break;
      if (outsideArea(t) < 1e-4) { g = t; break; }
    }
    iconPosCache.set(iid, g);
    return g;
  }
  function fieldsValue(fields, opts) {
    const required = opts.pinned || [], order = opts.order || null, iid = opts.iid || null;
    const optional = (opts.optional || []).filter(a => !required.includes(a));
    const tried = [];
    const valueSplits = [[fields.join(' ')]];
    for (let k = 1; k < fields.length; k++) valueSplits.push([fields.slice(0, k).join(' '), fields.slice(k).join(' ')]);
    const iconG = iid ? compactIcon(iid) : null;
    for (let nOpt = optional.length; nOpt >= 0; nOpt--) {
      const attrs = [...required, ...optional.slice(0, nOpt)];
      if (order) attrs.sort((a, b) => (order.includes(a) ? order.indexOf(a) : order.length) - (order.includes(b) ? order.indexOf(b) : order.length));
      for (const withIcon of (iconG ? [true, false] : [false])) {
        let best = null;
        for (const lines of valueSplits) {
          for (const cap of capsDown(MAIN_MIN, MAIN_MAX)) {
            if (best && cap <= best[1]) break;
            const [els, bottom] = stack(lines, cap, X0, YTOP, 'main');
            if (withIcon) els.icon = iconG;
            if (!ok(els)[0]) continue;
            const placed = placeAttrs(els, attrs, lines.length, bottom, !!(order && order.length));
            if (!placed) continue;
            best = [lines, cap, placed[0], placed[1]];
            break;
          }
        }
        if (best) {
          const [lines, cap, built, where] = best;
          const els = ALIGN === 'centre' ? centreDown(arrangeRows(built)) : built;
          return [els, { layout: 'value by fields + attributes', fields: [...fields], main_lines: lines, main_cap: cap,
            attributes: attrs, attribute_places: where, pinned: [...required], not_shown: optional.slice(nOpt),
            secondary_cap: attrs.length ? SEC_CAP : null, icon: withIcon ? iid : null,
            icon_version: withIcon ? (RU.iconVersion || 'compact') : null,
            // the family has an icon and this label has no room for it (design review 2026-10-09: an icon left off is shown, never silent)
            icon_left_off: iid && !withIcon ? iid : null, tried_before: tried }];
        }
        tried.push(`attributes ${JSON.stringify(attrs)} ${withIcon ? 'with' : 'without'} the icon: no split fits at >= ${MAIN_MIN} mm caps`);
      }
    }
    return [null, { layout: 'value by fields + attributes', fields: [...fields], pinned: [...required], not_shown: [...optional],
      nonfit: `'${fields.join(' ')}' with its pinned attributes ${required.join(', ') || '(none)'} does not fit at the minimum sizes - unpin one or choose a larger label`,
      tried }];
  }

  // ===================================================================== label items (label_from_items)
  function printable(s) {
    s = String(s).toUpperCase();
    for (const [a, b] of FONT_SUBS) s = s.split(a).join(b);
    return s;
  }
  function attrText(it, path) {
    const a = (it.attributes || []).find(x => x.path === path);
    if (!a) throw new Error(`label item ${it.id}: no attribute for path ${path}`);
    return printable(a.text);
  }
  function ringsOut(el) { return el.parts.map(p => p.rings.map(r => r.slice())); }
  function layOut(it, opts) {
    if (!font) throw new Error('hardware-layout: setFont() first');
    if (!it.fields || !it.fields.length) return notReady(it);
    let profileWhy = null;
    if (V5) {
      if (opts && opts.profile === false) profileWhy = covered5(it) ? 'the text layout was asked for' : 'no profile drawing for this part type';
      else {
        const r5 = layOut5(it);
        if (r5.els) return finish5(it, r5);
        profileWhy = r5.why;
      }
    }
    const byPath = {}; for (const a of it.attributes || []) byPath[a.path] = printable(a.text);
    const pinned = (it.pinned || []).map(p => attrText(it, p));
    const optional = (it.optional || []).map(p => attrText(it, p));
    const fields = it.fields.map(printable);
    const order = (it.attributes || []).map(a => byPath[a.path]);
    const [els, r] = fieldsValue(fields, { pinned, optional, iid: FAMILY_ICON[it.family], order });
    const textOf = {}; for (const [k, v] of Object.entries(byPath)) textOf[v] = k;
    const rec = { ...r };
    delete rec.tried_before;
    rec.not_shown_paths = (r.not_shown || []).map(t => textOf[t]);
    rec.pinned_unprinted = it.pinned_unprinted || [];
    rec.value_missing = it.value_missing || [];
    if (profileWhy) rec.profile_why = profileWhy;
    const elements = els ? Object.fromEntries(Object.entries(els).map(([k, el]) => [k, ringsOut(el)])) : null;
    return { elements, record: rec };
  }
  function notReady(it) {        // no value to print (the size is not recorded): never a placeholder like 'M?'
    return { elements: null, record: { not_ready: (it.value_missing || []).map(m => m.why).join(', ') || 'no value to print',
      value_missing: it.value_missing || [], pinned_unprinted: it.pinned_unprinted || [], not_shown: [], attributes: [] } };
  }
  // a NON-FIT with pins: the layout leaving off the FEWEST lowest-priority pins (never the first, the type). A PROPOSAL only:
  // the label stays a non-fit until the person unpins (label_from_items.propose, design review 2026-10-06)
  function propose(it, opts) {
    const order = it.pinned_by_priority || it.pinned || [];
    for (let k = 1; k < order.length; k++) {
      const drop = order.slice(order.length - k);
      const trial = { ...it, pinned: (it.pinned || []).filter(p => !drop.includes(p)) };
      const r = layOut(trial, opts);
      if (r.elements && !r.record.nonfit) return { ...r, record: { ...r.record, proposal: true, omit_paths: drop, omit: drop.map(p => attrText(it, p)) } };
    }
    const keep = order.length ? (it.attributes.find(a => a.path === order[0]) || {}).text : null;
    return { elements: null, record: { why: keep ? `nothing fits even with only ${keep} pinned: ${keep} itself does not fit beside or under '${it.fields.join(' ')}' at the minimum sizes`
                                                 : 'no pins to leave off' } };
  }

  // ===================================================================== v5 PROFILE labels (v5_items.py, rule for rule)
  function symEl(polys) { return mkEl(polys.map(rr => mkPart(rr.map(ring => { const o = []; for (const [x, y] of ring) o.push(x, y); return o; })))); }
  function boxOf(...els) { return mkEl(els.flatMap(e => e.parts)); }
  const v5Screw = {}, v5Nut = {};
  if (V5) {
    for (const [k, g] of Object.entries(V5.screws)) v5Screw[k] = { headon: symEl(g.headon), side: symEl(g.side), envelope: symEl(g.envelope) };
    for (const [k, list] of Object.entries(V5.nuts)) v5Nut[k] = new Map(list.map(g => [g.H, { headon: symEl(g.headon), side: symEl(g.side) }]));
  }
  function need5(a, b) {
    const v = V5.need[[a, b].sort().join('|')];
    if (typeof v !== 'number') throw new Error(`hardware-layout: no v5 spacing for ${a} / ${b}`);
    return v;
  }
  function fits5(els) {                           // labels_v5.fits
    const ks = Object.keys(els);
    for (const k of ks) if (outsideArea(els[k]) >= V5.fitTol) return false;
    for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
      if (elsCloser(els[ks[i]], els[ks[j]], need5(ks[i], ks[j]) - 1e-6)) return false;
    }
    return true;
  }
  function tg(s, cap) {                           // labels_v5.TG: the string untracked (TextPath = its glyphs at the pen positions)
    const key = s + '\u0000' + cap;
    if (!tgCache.has(key)) tgCache.set(key, mkEl(glyphList(s, cap, 0)));
    return tgCache.get(key);
  }
  function covered5(it) {
    if (!V5) return null;
    if (it.family === 'screw' && Object.prototype.hasOwnProperty.call(V5.screwHeads, it.head)) return 'screw';
    const hk = it.head === undefined || it.head === null ? 'null' : it.head;
    if (it.family === 'nut' && Object.prototype.hasOwnProperty.call(V5.nutHeads, hk)) return 'nut';
    return null;
  }
  function buildScrew5(main, head, secondary, cap) {
    const g = v5Screw[head];
    const m = place(tg(main, cap), X0, YTOP);
    const b = boxOf(g.headon, g.side, g.envelope);
    const dx = X0 - b.minx, dy = (m.miny - V5.groupToMain) - b.maxy;
    const headon = shift(g.headon, dx, dy), side = shift(g.side, dx, dy);
    const els = { 'main spec': m, 'head-on view': headon, 'side profile': side };
    if (secondary) els.secondary = place(text(secondary, V5.secCap), X0, boxOf(headon, side).miny - V5.mainToSub);
    return els;
  }
  function nutTexts5(main, word, cap) {           // the size and the word for one cap (labels_v5.layout_nut_v5's first half)
    const key = JSON.stringify([main, word, cap]);   // unambiguous for any strings (a code review: a NUL inside main or word made two items one key)
    if (nutTextCache.has(key)) return nutTextCache.get(key);
    let m5 = place(tg(main, cap), X0, YTOP);
    for (let i = 0; i < 20; i++) {
      if (outsideArea(m5) < 1e-4) break;
      m5 = shift(m5, 0.1, 0);
    }
    let wd = tg(word, cap * V5.nutWordCap);
    wd = shift(wd, m5.maxx + V5.nutWordGap - wd.minx, 0);
    wd = shift(wd, 0, m5.miny - wd.miny);
    for (let i = 0; i < 6; i++) wd = shift(wd, V5.nutWordGap - elsDistance(m5, wd), 0);
    const out = [m5, wd];
    nutTextCache.set(key, out);
    return out;
  }
  function buildNut5(main, word, secondary, lock, cap, H) {
    const [m5, wd] = nutTexts5(main, word, cap);
    const g = v5Nut[lock ? 'lock' : 'plain'].get(H);
    const b = boxOf(g.headon, g.side);
    const dx = m5.minx - b.minx, dy = (m5.miny - V5.groupToMain) - b.maxy;
    const headon = shift(g.headon, dx, dy), side = shift(g.side, dx, dy);
    const els = { 'main spec': m5, 'family word': wd, 'head-on view': headon, 'side profile': side };
    if (secondary) els.secondary = place(text(secondary, V5.secCap), m5.minx, boxOf(headon, side).miny - V5.mainToSub);
    return els;
  }
  // v5_items.secondaries: the attribute lines to try, fullest first - every printed attribute in the item's reading order,
  // then the optional ones left off from the end one at a time (a pinned one never)
  function secondaries5(it, skip) {
    const attrs = (it.attributes || []).filter(a => !skip.includes(a.path)).map(a => [a.path, printable(a.text)]);
    const pinned = new Set(it.pinned || []), optional = (it.optional || []).filter(p => !skip.includes(p));
    const keep = new Set(attrs.filter(([p]) => pinned.has(p) || optional.includes(p)).map(([p]) => p));
    const out = [];
    for (let k = 0; k <= optional.length; k++) {
      const drop = new Set(k ? optional.slice(optional.length - k) : []);
      const shown = attrs.filter(([p]) => keep.has(p) && !drop.has(p));
      out.push({ s: shown.map(([, t]) => t).join(' \u00B7 '), shown: shown.map(([, t]) => t), shownPaths: shown.map(([p]) => p),
                 notShown: attrs.filter(([p]) => drop.has(p)).map(([, t]) => t), notShownPaths: attrs.filter(([p]) => drop.has(p)).map(([p]) => p) });
    }
    return out;
  }
  function layOut5(it) {
    const kind = covered5(it);
    if (!kind) return { why: 'no profile drawing for this part type' };
    const fields = it.fields.map(printable);
    const headWord = (it.attributes || []).find(a => a.path === 'head');
    const hw = headWord ? printable(headWord.text) : null;
    if (kind === 'screw') {
      const main = fields.join(' '), head = V5.screwHeads[it.head];
      for (const sc of secondaries5(it, ['head'])) {
        for (const cap of V5.caps) {
          const els = buildScrew5(main, head, sc.s, cap);
          if (fits5(els)) return { els, sc, rec: { layout: 'v5', kind, head, head_as_drawing: hw, main, main_cap: cap, H: V5.hScrew, secondary: sc.s,
            sec_cap: V5.secCap, sec_track: sc.s ? trackFor(sc.s, V5.secCap) : null, shown: sc.shown, not_shown: sc.notShown } };
        }
      }
      return { why: `'${main}' with its pinned attributes does not fit the profile layout at ${V5.caps[V5.caps.length - 1].toFixed(1)} mm` };
    }
    const lock = V5.nutHeads[it.head === undefined || it.head === null ? 'null' : it.head];
    const word = hw || (lock ? 'LOCKNUT' : 'NUT'), main = fields.join(' ');
    for (const sc of secondaries5(it, ['head'])) {
      for (const cap of V5.caps) {
        for (const H of V5.nutHs) {
          const els = buildNut5(main, word, sc.s, lock, cap, H);
          if (fits5(els)) return { els, sc, rec: { layout: 'v5', kind, lock, main, word, main_cap: cap, word_cap: Math.round(cap * V5.nutWordCap * 1e4) / 1e4, H,
            secondary: sc.s, sec_cap: V5.secCap, sec_track: sc.s ? trackFor(sc.s, V5.secCap) : null, shown: sc.shown, not_shown: sc.notShown } };
        }
      }
    }
    return { why: `${main} ${word} with its pinned attributes does not fit the profile layout at ${V5.caps[V5.caps.length - 1].toFixed(1)} mm` };
  }
  // a v5 layout as layOut returns it: the record also carries what the page reads from a text layout - the value line, the
  // words the label carries (the head word of a screw INCLUDED, in the item's order: the drawing carries it), what is left off
  function finish5(it, r) {
    const carried = new Set(['head', ...r.sc.shownPaths]);
    const rec = { ...r.rec, main_lines: [r.rec.main], icon: null,
      attributes: (it.attributes || []).filter(a => carried.has(a.path)).map(a => printable(a.text)),
      not_shown_paths: r.sc.notShownPaths, pinned_unprinted: it.pinned_unprinted || [], value_missing: it.value_missing || [] };
    if (r.rec.kind === 'nut' && !(it.attributes || []).some(a => a.path === 'head')) rec.attributes.unshift(r.rec.word);
    const elements = Object.fromEntries(Object.entries(r.els).map(([k, el]) => [k, ringsOut(el)]));
    return { elements, record: rec };
  }

  return { setFont, layOut, propose, printable, FACE: D.face, USABLE: D.usable, CUTOUTS: D.cutouts || [], ALIGN, X0, YTOP, profiles: !!V5, profileCovered: it => !!covered5(it),
           _text: text, _trackFor: trackFor, _penX: penX, _glyphPart: glyphPart, _ok: ok, _tg: tg, _elsDistance: elsDistance,
           _okRings: els => okHere(Object.fromEntries(Object.entries(els).map(([k, rings]) => [k, mkEl(rings.map(rr => mkPart(rr)))])))[0],
           _fits5: els => fits5(Object.fromEntries(Object.entries(els).map(([k, rings]) => [k, mkEl(rings.map(rr => mkPart(rr)))]))) };
}

root.GEN2HardwareLayout = { version: 1, create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
