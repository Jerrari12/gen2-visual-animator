/* GEN2 part labels in 3D - shared by the MODULITH Label Studio and the 3D Build Studio, so a part label on a drawer in the
   Build Studio is the part label printed here, colour band included. A classic script with no imports and no DOM: every
   setting the Label Studio reads from its page (the label type, the "Screw and nut drawings" switch, the "Colour band"
   position) is an ARGUMENT here. It sits on hardware-layout.js (the part-label layout, ported rule for rule from the Python
   print engine) and builds what that layout does not: the raised ink, the label body cut into colour-band pieces, the
   colours from a Part Picker item, and the row note. Moved out of index.html unchanged (2026-10-10); the Label Studio's
   exports are byte-identical before and after the move.

   const LH = GEN2LabelHardware.create({
     THREE,                          // three.js; only the geometry functions use it (laying out needs none)
     layout: GEN2HardwareLayout,     // hardware-layout.js (defaults to the global one)
     data: GEN2HardwareData,         // hardware-data.js - the EdgeLabel face; without it nothing lays out on EdgeLabel
     v5: GEN2HardwareV5Data,         // hardware-v5-data.js - the screw and nut drawings (optional)
     classicpro: GEN2HardwareDataClassicPro,   // hardware-data-classicpro.js - the Classic Pro face (optional)
     bands: GEN2HardwareBandData,    // hardware-band-data.js - the colour-band pieces and usable areas (optional)
     mergeGeoms,                     // label-core.js's mergeGeoms (concatenates non-indexed geometries); needed by meshes()
   });
   LH.setFont(opentypeFont)          // the label font, before anything is laid out (every layout instance gets it)

   LAYING OUT
   LH.layOut(item, { type, profile, band }) -> r
       item     a part-picker-label-item/1 (the Part Picker's label item)
       type     'edgelabel' | 'classicpro' (anything but 'classicpro' is EdgeLabel)
       profile  false asks for the text layout; anything else gives the screw / nut drawing where the part has one
       band     the colour-band position SETTING: 'bottom' | 'end' | 'wedge' (| 'off' or anything else: no band). It applies
                only on EdgeLabel and only to an item that carries colours (item.colours, the Part Picker's colour scheme);
                the words are then laid out in the face less the band and its 0.8 mm gap.
     r = { elements: { name: [rings, ...] } | null,  record: {...}  (hardware-layout.js's result, as it gives it)
           covered: bool        the part type has a drawing (whether or not it printed)
           band, colours        set when the label carries a band: the position and colours(item.colours)
           proposal: record     on a NON-FIT with more than one pin: the layout leaving off the fewest pins (never applied)
           inkDepth: mm         how proud the ink stands (0.45 on EdgeLabel)
           typeSkips: [words]   what the type does not print yet ('drawing', 'colour band' on Classic Pro); absent when none }
     An item that cannot be read gives { elements: null, record: { not_ready: 'the label item could not be read (...)' } }.
   LH.layoutFor(item, type, band) -> { layout, band, inkDepth }   the hardware-layout instance layOut uses, the band
                                    position it resolves to (null = no band) and the ink depth
   LH.bandFor(item, band) -> band | null      the band position an item gets on EdgeLabel (null: no colours, or no such position)
   LH.typeSkips(item, type) -> [words]        as r.typeSkips
   LH.layouts = { edgelabel, classicpro, bands: { bottom, end, wedge } }   the hardware-layout instances (null when not loaded)
   LH.treatments -> ['bottom', 'end', 'wedge']   the band positions the band data holds; LH.bandNames -> { bottom: 'Bottom band', ... }
   LH.inkDepth                                 EdgeLabel's ink depth (hardware-data.js rules.inkDepth, 0.45 mm)

   COLOURS
   LH.colour(c) -> {colour, hex, label, pattern} | null | undefined
       a slot of item.colours, cleaned (it can come from a link): the colour; null when the scheme leaves the slot
       UNASSIGNED (printed in the base colour, never a guess); undefined when there is no such slot
   LH.colours(cs) -> { band, band_accent }     both slots cleaned. NOT idempotent (a cleaned null would read as "no slot"):
                                               clean once, pass the result on.

   GEOMETRY (needs THREE)
   LH.meshes(r, depth) -> { textGeo, badgeGeo: null, textFits: true, baseParts }
       r the layOut result; textGeo = LH.inkGeometry(r.elements, depth); baseParts = r.band ? LH.bandParts(r.band, r.colours) : null
       (null: the label body is the plain label, e.g. label-core.js's BASE_VERTS).
   LH.inkGeometry(elements, depth) -> BufferGeometry | null    every outline filled even-odd and extruded, merged with mergeGeoms
   LH.bandParts(treatment, colours) -> [{ piece: 'base'|'band'|'accent', geo, colour }] | null (unknown position / no data)
       The EdgeLabel label body cut for one band position, for ANY label - a part label, or an ordinary label whose words come
       from label-core.js: the three pieces together are the whole label (they replace the plain body, not add to it).
       colours is a cleaned { band, band_accent } (LH.colours, or { band: LH.colour({...}) } for a stripe of one colour):
       the band piece takes band, the accent piece (the band's first 8 mm) takes band_accent, or band's colour when there is no
       band_accent slot (undefined); colour null = print it in the base colour. A 'dashed' band pattern gives the dashed cut.
   LH.resetBandGeometry()   bandParts caches each piece's geometry and hands out the same BufferGeometry every call; whoever
                            disposes them (the Label Studio, on every preview rebuild) calls this so the next call builds fresh

   NOTES (what the Label Studio writes under a part-label row)
   LH.noteText(r, profile) -> string   profile: whether drawings are on (the note says when a drawing could not be used)
   LH.noteDetail(r) -> string          the layout numbers (the note's tooltip)
   LH.bandNote(r) -> string            the band's part of the note (' <band label> band, <accent label> accent.'), '' unbanded

   COORDINATE FRAME (mm, y up, the label centred at the origin as its label core builds it - label-core.js on EdgeLabel,
   label-core-classicpro.js on Classic Pro):
   - layout rings (r.elements): x, y on the label's top face;
   - ink (textGeo): those outlines extruded from z 0 to z depth. It is NOT placed: put it on the top face, z = LABEL_HT of the
     label core (4.5 on EdgeLabel, 1.5 on Classic Pro) - the Label Studio positions the mesh at z LABEL_HT;
   - band pieces: the EdgeLabel label body itself (57 x 27 mm, z 0 the bed to z 4.5 the top face), the same frame as
     label-core.js's label - placed like the plain label body. The band and accent pieces are the body's top layers over the
     band's area (from z = bands.treatments[position].z0, 3.2 or 4.0, up to 4.5); the base piece is the rest.
   The 3D Build Studio maps this generator frame onto its EdgeLabel label model as (x, y, z) -> (x, y + 13.5, z - 2.25)
   (measured 2026-10-01). */
(function (root) {
'use strict';

function create(deps) {
  const o = deps || {};
  const THREE = o.THREE || null;
  const Layout = o.layout || root.GEN2HardwareLayout || null;
  const D = o.data || null, V5 = o.v5 || null, CP = o.classicpro || null, B = o.bands || null;
  const mergeGeoms = o.mergeGeoms || null;
  // A hole is pulled in towards its centre by this much before it is triangulated (hwPullIn, below). Tests set 0 to show the
  // closed-ink check can fail without it.
  const PULL = o.holePullIn === undefined ? 1e-5 : o.holePullIn;

  // ---------------------------------------------------------------- the layout instances
  // EdgeLabel (with the screw and nut drawings when hardware-v5-data.js loaded), one per band position (the same face with
  // that position's usable area - the face less the band and its gap), and Classic Pro (words and the family icon only).
  const edgelabel = Layout && D ? Layout.create({ data: D, v5: V5 || null }) : null;
  const BANDS_OK = !!(B && B.format === 'modulith-hardware-bands');
  const bands = Object.create(null);
  if (edgelabel && BANDS_OK) for (const tr of Object.keys(B.treatments)) {
    bands[tr] = Layout.create({ data: Object.assign({}, D, { usable: B.treatments[tr].usable }), v5: V5 || null });
  }
  const classicpro = Layout && CP ? Layout.create({ data: CP }) : null;
  const INK_DEPTH = (D && D.rules.inkDepth) || 0.45;
  const has = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);

  function setFont(font) {
    if (edgelabel) edgelabel.setFont(font);
    if (classicpro) classicpro.setFont(font);
    Object.values(bands).forEach(h => h.setFont(font));
  }

  // the band position an item gets: the setting, when the item carries colours and the position exists
  function bandFor(item, position) {
    return item && item.colours && typeof item.colours === 'object' && bands[position] ? position : null;
  }
  // the layout a part label gets on a type, its band position (EdgeLabel only) and its ink depth
  function layoutFor(item, type, position) {
    if (type === 'classicpro') return { layout: classicpro, band: null, inkDepth: classicpro ? CP.rules.inkDepth : INK_DEPTH };
    const band = bandFor(item, position);
    return { layout: band ? bands[band] : edgelabel, band, inkDepth: INK_DEPTH };
  }
  // what a part label carries that Classic Pro does not print yet (it prints again on EdgeLabel)
  function typeSkips(item, type) {
    if (type !== 'classicpro' || !item) return [];
    const out = [];
    if (edgelabel && edgelabel.profileCovered(item)) out.push('drawing');
    if (item.colours && typeof item.colours === 'object') out.push('colour band');
    return out;
  }
  function layOut(item, opt) {
    const a = opt || {};
    const { layout: L, band, inkDepth } = layoutFor(item, a.type, a.band);
    const opts = { profile: a.profile !== false };
    let r;
    try {
      if (!L) throw new Error(a.type === 'classicpro' ? 'the Classic Pro part-label layout did not load' : 'the part-label layout did not load');
      r = L.layOut(item, opts);
      r.covered = L.profileCovered ? L.profileCovered(item) : false;
      if (band && r.elements) { r.band = band; r.colours = colours(item.colours); }
    }
    catch (e) { r = { elements: null, record: { not_ready: 'the label item could not be read (' + e.message + ')' } }; }
    if (r.record.nonfit && (item.pinned || []).length > 1) { try { r.proposal = L.propose(item, opts).record; } catch (e) {} }
    r.inkDepth = inkDepth;
    const skips = typeSkips(item, a.type);
    if (skips.length) r.typeSkips = skips;
    return r;
  }

  // ---------------------------------------------------------------- colours
  // an item's colours, cleaned (they can come from a link): per slot a colour {colour, hex, label, pattern}, null when the
  // scheme leaves it UNASSIGNED (the record does not hold the value - printed in the base colour, never a guess), or
  // undefined when the scheme has no such slot (no band accent: the band's colour covers the whole band)
  function colour(c) {
    if (c === null || c === undefined) return undefined;
    if (typeof c !== 'object' || typeof c.colour !== 'string' || !/^[a-z0-9-]{1,30}$/i.test(c.colour) ||
        typeof c.hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(c.hex)) return null;
    return { colour: c.colour, hex: c.hex, label: typeof c.label === 'string' ? c.label.slice(0, 40) : c.colour,
             pattern: c.pattern === 'dashed' ? 'dashed' : 'solid' };
  }
  function colours(cs) { return { band: colour(cs.band), band_accent: colour(cs.band_accent) }; }

  // ---------------------------------------------------------------- the label body cut into band pieces
  let bandCache = new Map();
  function needThree() { if (!THREE) throw new Error('label-hardware: create({ THREE }) is needed to build geometry'); }
  function bandGeo(tr, kind, piece) {
    const key = tr + '/' + kind + '/' + piece;
    if (!bandCache.has(key)) {
      const m = B.treatments[tr][kind][piece], g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(m.v, 3));
      g.setIndex(m.t);
      g.computeVertexNormals();
      bandCache.set(key, g);
    }
    return bandCache.get(key);
  }
  // the label body of a banded label: base / band / accent pieces, each with its colour (null = the base colour)
  function bandParts(treatment, cs) {
    if (!BANDS_OK || typeof treatment !== 'string' || !has(B.treatments, treatment)) return null;
    needThree();
    const c = cs || {};
    const b = c.band || null, a = c.band_accent;
    const kind = b && b.pattern === 'dashed' ? 'dashed' : 'solid';
    return [
      { piece: 'base', geo: bandGeo(treatment, kind, 'base'), colour: null },
      { piece: 'band', geo: bandGeo(treatment, kind, 'band'), colour: b },
      { piece: 'accent', geo: bandGeo(treatment, kind, 'accent'), colour: a === undefined ? b : a },
    ];
  }
  function resetBandGeometry() { bandCache = new Map(); }

  // ---------------------------------------------------------------- the ink
  function hwInPoly(p, loop) {
    let inside = false;
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
      const a = loop[i], b = loop[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }
  // A hole pulled in towards its centre by 0.00001 mm before it is triangulated. three's triangulator (earcut) drops points
  // it finds exactly collinear once a hole is bridged to its outline, so a hole edge on the same line as an outline edge -
  // the centre square of the '#' glyph sits on the line of its bars - left the caps without two vertices the side walls
  // use: T-junctions, an ink solid that is not closed (8 open edges on "#10-24"). Far below the 0.0001 mm the exports write.
  function hwPullIn(L) {
    let cx = 0, cy = 0;
    for (const p of L) { cx += p.x; cy += p.y; }
    cx /= L.length; cy /= L.length;
    return L.map(p => { const dx = cx - p.x, dy = cy - p.y, d = Math.hypot(dx, dy) || 1; return new THREE.Vector2(p.x + PULL * dx / d, p.y + PULL * dy / d); });
  }
  // the laid-out outlines as one extruded geometry (z 0..depth; the caller places it at the label's top face)
  function inkGeometry(elements, depth) {
    needThree();
    if (!mergeGeoms) throw new Error('label-hardware: create({ mergeGeoms }) is needed to build the ink');
    const geos = [];
    for (const parts of Object.values(elements)) {
      for (const rings of parts) {
        const loops = rings.map(r => { const o = []; for (let i = 0; i < r.length; i += 2) o.push(new THREE.Vector2(r[i], r[i + 1])); return o; });
        // even-odd, as the outlines are filled: a ring inside an odd number of the others is a hole in the innermost one around it
        const lvl = loops.map((L, i) => loops.reduce((n, M, j) => n + (j !== i && hwInPoly(L[0], M) ? 1 : 0), 0));
        const outers = [];
        loops.forEach((L, i) => { if (lvl[i] % 2 === 0) outers.push({ i, shape: new THREE.Shape(L) }); });
        loops.forEach((L, i) => {
          if (lvl[i] % 2 === 0) return;
          const host = outers.find(o => lvl[o.i] === lvl[i] - 1 && hwInPoly(L[0], loops[o.i]));
          if (host) host.shape.holes.push(new THREE.Path(hwPullIn(L)));
        });
        for (const o of outers) geos.push(new THREE.ExtrudeGeometry(o.shape, { depth, bevelEnabled: false, curveSegments: 1 }));
      }
    }
    const textGeo = geos.length ? mergeGeoms(geos) : null;
    geos.forEach(g => g.dispose());
    return textGeo;
  }
  function meshes(hw, depth) {
    const textGeo = inkGeometry(hw.elements, depth);
    return { textGeo, badgeGeo: null, textFits: true, baseParts: hw.band ? bandParts(hw.band, hw.colours) : null };
  }

  // ---------------------------------------------------------------- the row note
  function bandNote(r) {
    if (!r.band) return '';
    const b = r.colours.band, a = r.colours.band_accent;
    const bits = [b ? `${b.label} band` : 'band unassigned'];
    if (a !== undefined) bits.push(a ? `${a.label} accent` : 'accent unassigned');
    return ` ${bits.join(', ')}.`;
  }
  function noteText(r, profile) {
    const rec = r.record;
    if (rec.not_ready) return `Not ready: ${rec.not_ready}. Nothing is printed - complete the part record first.`;
    if (rec.nonfit) {
      const p = r.proposal;
      return `Doesn't fit: ${rec.nonfit}.` + (p && p.omit ? ` It fits without ${p.omit.join(', ')} - unpin ${p.omit_paths.join(', ')} to print it.` : '');
    }
    // a person's line (design review: the old "Hardware label · value at 9.8 mm caps · screw icon" read like debug text); the layout
    // numbers are in the note's tooltip (noteDetail)
    const fellBack = r.covered && profile && rec.layout !== 'v5' ? ' No drawing: its pinned words do not fit beside it.' : '';
    return (rec.layout === 'v5' ? `Part label with the ${rec.kind} drawing, laid out from the part record.` : 'Part label, laid out from the part record.' + fellBack) +
      bandNote(r) +
      (r.typeSkips ? ` Its ${r.typeSkips.join(' and ')} print${r.typeSkips.length === 1 ? 's' : ''} on EdgeLabel only, for now.` : '') +
      (rec.icon_left_off ? ` No room for the ${rec.icon_left_off} icon beside the words.` : '') +   // never left off silently (design review 2026-10-09)
      (rec.not_shown.length ? ` Left off to fit: ${rec.not_shown.join(', ')}.` : '') +
      (rec.value_missing.length ? ` ${rec.value_missing.map(m => m.why).join('; ').replace(/^./, c => c.toUpperCase())}.` : '');   // each why already says it ("length not recorded")
  }
  function noteDetail(r) {
    const rec = r.record;
    if (rec.not_ready || rec.nonfit || !rec.main_cap) return '';
    if (rec.layout === 'v5') return `Main value ${rec.main_cap} mm tall, ${rec.kind} drawing ${rec.H} mm tall` +
      (rec.head_as_drawing ? `; the drawing stands for ${rec.head_as_drawing}, which is not printed` : '') +
      '. The layout is decided by the part record: text size, bold, caps and icon settings do not apply to this row.';
    return `Main value ${rec.main_cap} mm tall` + (rec.icon ? `, ${rec.icon} icon` : ', no icon') + (rec.profile_why && r.covered ? ` (no drawing: ${rec.profile_why})` : '') +
      '. The layout is decided by the part record: text size, bold, caps and icon settings do not apply to this row.';
  }

  return {
    setFont, layOut, layoutFor, bandFor, typeSkips,
    colour, colours,
    meshes, inkGeometry, bandParts, resetBandGeometry,
    noteText, noteDetail, bandNote,
    layouts: { edgelabel, classicpro, bands },
    treatments: BANDS_OK ? Object.keys(B.treatments) : [],
    bandNames: BANDS_OK && B.names ? Object.assign({}, B.names) : {},
    inkDepth: INK_DEPTH,
  };
}

root.GEN2LabelHardware = { version: 1, create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
