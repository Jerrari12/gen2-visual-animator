/* GEN2 EdgeLabel label core - how ONE EdgeLabel label is laid out and built: the label's dimensions and text area, the
   word wrap against the slanted right edge, the auto-shrink to the 3 mm floor, the left badge (icon or letter) and the gap it
   pushes the text over by, the icon library, and the keyword -> icon prediction.

   It is the generator's own code, moved out of index.html unchanged so that two pages can run the SAME code:
     - the EdgeLabel generator (this repo's index.html), and
     - the GEN2 3D Build Studio (gen2-visual-animator, viewer/js/vendor/edgelabel-core.js), which vendors this file
       BYTE-FOR-BYTE and pins its sha256 - so a label previewed on a drawer there is the label this page prints.
   Edit it HERE, then copy it to the viewer and move the pin. Never edit the viewer's copy.

   A classic script with no imports (both pages load it with a <script> tag):
     const core = GEN2EdgeLabelCore.create({ THREE });   // a THREE carrying SVGLoader as THREE.SVGLoader
     core.setFont(opentypeFont);                         // before building anything
   The generator passes its three 0.146 global (SVGLoader attaches itself to it); the viewer passes its own three build with
   the SVGLoader addon added. Nothing here touches the page, the DOM or the printer layout - those stay in index.html. */
(function (root) {
function create(deps) {
const THREE = deps.THREE;
let font = null;
function setFont(f) { font = f; }

// EdgeLabel dimensions & usable text area (mm). The top face is a rectangle on the
// left (full height) with the bottom-right cut off by a straight diagonal. Measured
// from the mesh, that right edge runs from (x,y)=(2.1,-12.5) up to (27.1,13.5).
const LABEL_LEN = 57.0;   // X span (length)
const LABEL_WID = 27.0;   // Y span (width)
const LABEL_HT  = 4.5;    // top flat plane where text/badge sit
const TOP_Z     = 4.5;
const DIAG_DXDY = (27.1 - 2.1) / (13.5 - (-12.5));   // right-edge slope, Δx per Δy (~0.96)
const DIAG_X0   = 2.1 + DIAG_DXDY * 12.5;            // right-edge x at y=0 (~14.1)
const AREA_MARGIN = 1.8;                   // inset from part edges
const AREA_LEFT  = -LABEL_LEN / 2 + AREA_MARGIN;   // left text/badge margin
const AREA_RIGHT =  LABEL_LEN / 2 - AREA_MARGIN;   // theoretical right tip
const AREA_TOP   =  LABEL_WID / 2 - AREA_MARGIN;   // top edge inset
const AREA_BOTTOM= -LABEL_WID / 2 + AREA_MARGIN;   // bottom edge inset (left side)

function getCapHeight() {
  if (font.tables.os2 && font.tables.os2.sCapHeight) {
    return font.tables.os2.sCapHeight;
  }
  // Fallback: measure 'H'
  const path = font.getPath('H', 0, 0, font.unitsPerEm);
  const bb = path.getBoundingBox();
  return Math.abs(bb.y2 - bb.y1);
}

//============================================================
// Text → 3D geometry
//============================================================
// Layout tuning
const BADGE_GAP = 2.0;     // gap between badge and text (mm)
const LINE_GAP  = 1.25;    // line pitch as a multiple of cap height
const MIN_PRINT_CAP = 3.0; // never auto-shrink text below this (mm) — keeps it printable
const BADGE_MAX_W_RATIO = 0.85; // cap badge width to this × its height so wide icons don't crowd the text
const BOLD_OFFSET = 0.12;  // stroke thickening (mm) applied when "Bold text" is on

// Built-in icon set (simple filled SVGs, extrude cleanly). Users can also upload custom SVG.
const ICON_LIBRARY = [
  { id: 'bolt-hex-head', name: 'Bolt Hex Head', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28.35 24.55"><path d="M28.35,12.27l-7.09,12.27H7.09L0,12.27,7.09,0h14.17l7.09,12.27Z"/></svg>' },
  { id: 'screw-hex-socket', name: 'Screw Hex Socket', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24.55 24.55"><path d="M12.27,24.55C5.5,24.55,0,19.05,0,12.27S5.5,0,12.27,0s12.27,5.5,12.27,12.27-5.5,12.27-12.27,12.27ZM16.25,5.39h-7.95l-3.97,6.88,3.97,6.88h7.95l3.97-6.88-3.97-6.88Z"/></svg>' },
  { id: 'screw-phillips-head', name: 'Screw Phillips Head', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24.55 24.55"><path d="M12.27,24.55C5.5,24.55,0,19.05,0,12.27S5.5,0,12.27,0s12.27,5.5,12.27,12.27-5.5,12.27-12.27,12.27ZM19.87,13.45v-2.35h-5.38l-1.05-1.05v-5.38h-2.35v5.38l-1.05,1.05h-5.38v2.35h5.38l1.05,1.05v5.38h2.35v-5.38l1.05-1.05h5.38Z"/></svg>' },
  { id: 'screw-slotted-head', name: 'Screw Slotted Head', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24.55 24.55"><path d="M.06,13.45c.59,6.23,5.83,11.1,12.22,11.1s11.62-4.87,12.21-11.1H.06Z"/><path d="M24.49,11.1C23.9,4.87,18.66,0,12.27,0S.65,4.87.06,11.1h24.43Z"/></svg>' },
  { id: 'screw-torx-head', name: 'Screw Torx Head', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24.55 24.55"><path d="M12.27,24.55C5.5,24.55,0,19.05,0,12.27S5.5,0,12.27,0s12.27,5.5,12.27,12.27-5.5,12.27-12.27,12.27ZM19.71,11.3l-1.46-.86c-.86-.5-1.39-1.42-1.4-2.42l-.02-1.7c0-.86-.94-1.4-1.69-.98l-1.48.84c-.87.49-1.92.49-2.79,0l-1.48-.84c-.75-.43-1.68.11-1.69.98l-.02,1.7c0,.99-.54,1.91-1.4,2.42l-1.46.86c-.74.44-.74,1.51,0,1.95l1.46.86c.86.5,1.39,1.42,1.4,2.42l.02,1.7c0,.86.94,1.4,1.69.98l1.48-.84c.87-.49,1.92-.49,2.79,0l1.48.84c.75.43,1.68-.11,1.69-.98l.02-1.7c0-.99.54-1.91,1.4-2.42l1.46-.86c.74-.44.74-1.51,0-1.95Z"/></svg>' },
  { id: 'nut', name: 'Nut', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28.35 24.55"><path d="M28.35,12.27l-7.09,12.27H7.09L0,12.27,7.09,0h14.17l7.09,12.27ZM14.17,4.67c-4.2,0-7.6,3.4-7.6,7.6s3.4,7.6,7.6,7.6,7.6-3.4,7.6-7.6-3.4-7.6-7.6-7.6Z"/></svg>' },
  { id: 'washer', name: 'Washer', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24.55 24.55"><path d="M12.27,0C5.5,0,0,5.5,0,12.27s5.5,12.27,12.27,12.27,12.27-5.5,12.27-12.27S19.05,0,12.27,0ZM12.27,17.72c-3,0-5.44-2.44-5.44-5.44s2.44-5.44,5.44-5.44,5.44,2.44,5.44,5.44-2.44,5.44-5.44,5.44Z"/></svg>' },
  { id: 'screw-driver', name: 'Screw Driver', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28.35 28.72"><path d="M14.02,15.73l-8.09,8.19c-.86.93-1.52,2.02-2.2,3.09-.86.42-1.73,1.25-2.59,1.64-.09.04-.17.1-.27.03l-.84-.88-.03-.16,1.58-2.68c.99-.6,2.01-1.16,2.88-1.95l8.41-8.44s.03-.03.06-.07c.06-.06.12-.13.05-.21-.39-.48-.97-.89-1.35-1.36-.07-.09-.18-.21-.16-.32.04-.2.94-.9,1.11-1.11,1.51-.14,3.03-1.57,3.58-2.93.13-.33.14-.66.26-1,.19-.55.66-.83,1.05-1.23.89-.9,1.77-1.83,2.64-2.74.77-.8,1.58-1.57,2.36-2.36.54-.55.94-1.16,1.8-1.24,1.05-.1,2.32,1.11,2.96,1.87.45.53,1.19,1.54,1.12,2.24-.13,1.28-1.81,2.3-2.57,3.24-1.38,1.43-2.81,2.83-4.23,4.23-.72.71-.77.45-1.63.75-.98.34-2.19,1.59-2.64,2.51-.22.45-.14.89-.4,1.26-.12.17-.76.8-.92.93-.09.07-.27.18-.37.12l-1.29-1.45s-.14-.08-.27.04Z"/></svg>' },
  { id: 'wrench-a', name: 'Wrench A', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28.35 31.02"><path d="M22.15,0c.42-.02,1.06-.02,1.41.26.09.07.2.16.11.28-.92.99-1.99,1.89-2.9,2.89-.3.34-.62.63-.53,1.12.08.43.64,1.89.88,2.24.45.65,1.4.9,2.13,1.13.65.21.76.29,1.31-.18,1.11-.95,2.09-2.21,3.19-3.19.44-.31.55.34.58.65.14,1.73-.75,5.31-2.23,6.36s-3.29.57-4.89,1c-1.2.32-2.13.86-2.96,1.78-3.29,3.63-6.3,7.52-9.5,11.23-1.25,2.24-1.13,5.23-4.39,5.44-2.96.19-4.74-2.21-4.29-5.02.41-2.56,3.56-2.56,5.16-3.96.51-.45,1.1-1.14,1.58-1.65,2.1-2.25,4.12-4.59,6.1-6.95,1.39-1.65,2.94-3.14,3.24-5.39.15-1.12-.24-2.13-.17-3.29.05-.95.28-1.83.93-2.54C18.01,1.01,20.55.09,22.15,0ZM2.07,28.4c.1.09.35-.01.53.11.29.2.19.57.37.65.13.06.26-.13.38-.15.3-.06.39.36.59.38.15.01.27-.29.42-.32.25-.05.43.19.59.14.1-.03.02-.41.18-.52.18-.12.55.05.65-.06.12-.13-.06-.32-.07-.46-.04-.42.55-.41.55-.63-.03-.13-.17-.16-.25-.27-.29-.39.25-.53.19-.74-.03-.09-.28-.15-.38-.22-.39-.28-.08-.58-.21-.77-.11-.15-.3-.04-.44-.05-.43-.03-.43-.61-.63-.63-.27-.04-.28.39-.71.19-.16-.08-.26-.28-.47-.25-.17.02-.1.41-.37.5-.16.05-.26-.04-.4-.05-.57-.06-.11.3-.27.61-.14.27-.58.17-.62.33s.31.3.28.59c-.02.22-.36.27-.37.42-.02.25.55.22.51.66-.02.17-.2.37-.02.54Z"/></svg>' },
  { id: 'flush-cutter', name: 'Flush Cutter', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18.56 28.35"><path d="M18.55,27.33c.06.55-.12.9-.76,1-.64.1-.91-.26-1.08-.73-.17-.47-1.33-5.19-2.55-8.57-1.22-3.38-3.31-7.61-3.31-7.61,0,0-.08-.54-.04-1.24l-1.38-2.67,1.56-3.01,1.04,2.48s.01-.02.02-.02c.2-.29.65-.21.73.14.18.84.54,2.22,1.19,3.87,1.08,2.77,1.92,4.76,2.72,7.27.8,2.51,1.63,6.79,1.88,9.1ZM10.92,4.07l-3.16,6.1c.04.7-.04,1.25-.04,1.25,0,0-2.09,4.23-3.31,7.61-1.22,3.38-2.37,8.11-2.55,8.57-.17.47-.44.82-1.08.73-.64-.1-.82-.44-.76-1,.26-2.31,1.08-6.59,1.88-9.1.8-2.51,1.64-4.5,2.72-7.27.65-1.65,1-3.03,1.19-3.87.08-.35.53-.44.73-.14,0,0,.01.02.02.02l1.1-2.64s.06-.2.55-.77c.49-.58,1.29-.36,1.29-.36l.32-.75.13-1.72.24-.73.79,3.72c.03.12,0,.24-.05.35ZM10.15,4.43c0-.48-.39-.87-.87-.87s-.87.39-.87.87.39.87.87.87.87-.39.87-.87ZM8.09,3.21c.24-.29.56-.38.82-.39l-.16-.37-.17-1.73-.2-.72-.79,3.72c-.01.05-.01.11,0,.17.06-.11.19-.31.5-.67Z"/></svg>' },
  { id: 'drill-bit', name: 'Drill Bit', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 28"><path d="M6.5,0 L9.5,0 L9.5,8.5 L14,11 L14,21.5 L10.6,21.5 L8,27.6 L5.4,21.5 L2,21.5 L2,11 L6.5,8.5 Z"/></svg>' },
  { id: 'nozzle', name: 'Nozzle', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25.45 28.35"><polygon points="20.29 12.19 20.29 11.8 22.32 10.63 20.29 9.46 20.29 8.65 22.32 7.48 20.29 6.31 20.29 5.5 22.32 4.33 20.29 3.15 20.29 2.34 22.32 1.17 20.29 0 5.16 0 5.16 1.55 3.13 2.73 5.16 3.9 5.16 4.71 3.13 5.88 5.16 7.05 5.16 7.86 3.13 9.03 5.16 10.21 5.16 11.02 3.13 12.19 0 12.19 0 22.08 5.16 22.08 11.67 28.35 13.78 28.35 20.29 22.08 25.45 22.08 25.45 12.19 20.29 12.19"/></svg>' },
  { id: 'resistor', name: 'Resistor', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 24"><rect x="6" y="6.5" width="16" height="11" rx="2.5"/><rect x="0" y="10.5" width="7" height="3"/><rect x="21" y="10.5" width="7" height="3"/></svg>' },
  { id: 'capacitor', name: 'Capacitor', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="9" y="4" width="2.2" height="16"/><rect x="12.8" y="4" width="2.2" height="16"/><rect x="0" y="10.9" width="9" height="2.2"/><rect x="15" y="10.9" width="9" height="2.2"/></svg>' },
  { id: 'diode', name: 'Diode', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polygon points="8,5 8,19 18,12"/><rect x="16.5" y="5" width="2.2" height="14"/><rect x="0" y="10.9" width="8" height="2.2"/><rect x="18.7" y="10.9" width="5.3" height="2.2"/></svg>' },
  { id: 'ic-chip', name: 'IC Chip', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="6.5" y="6" width="11" height="12" rx="1"/><rect x="2.5" y="7.8" width="4" height="2"/><rect x="2.5" y="11" width="4" height="2"/><rect x="2.5" y="14.2" width="4" height="2"/><rect x="17.5" y="7.8" width="4" height="2"/><rect x="17.5" y="11" width="4" height="2"/><rect x="17.5" y="14.2" width="4" height="2"/></svg>' },
  { id: 'battery', name: 'Battery', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14.51 28.35"><path d="M10.57,1.45V0H3.94v1.45H1.07c-.59,0-1.07.48-1.07,1.07v24.75c0,.59.48,1.07,1.07,1.07h12.37c.59,0,1.07-.48,1.07-1.07V2.52c0-.59-.48-1.07-1.07-1.07h-2.86ZM10.91,24.02H3.61v-1.73h7.3v1.73ZM10.91,8.9h-2.78v2.78h-1.73v-2.78h-2.78v-1.73h2.78v-2.78h1.73v2.78h2.78v1.73Z"/></svg>' },
  { id: 'sd-card', name: 'SD Card', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21.55 28.35"><path d="M.09,14.18c.29-.29.91.09,1.11-.33v-3.96c-.29-.47-.99.05-1.19-.47v-5.05c0-.41.19-.77.45-1.08C1.34,2.24,2.61,1.22,3.59.24,3.82.1,4.08.03,4.34,0h16.04c.74.07,1.09.58,1.12,1.3,0,.19-.04.35-.04.51.04,2.17.04,4.35.04,6.52,0,.81.09,1.91,0,2.67s-1,.08-1.06.66l.02,2.62c.12.28.41.16.65.19.31.04.37.21.39.49.05.67,0,1.39,0,2.05,0,1.26-.03,2.54,0,3.81-.13,2.07.16,4.33,0,6.37-.04.54-.34.96-.86,1.11-6.48.09-12.99.01-19.48.04-.53-.01-.98-.35-1.13-.85l-.02-13.18s.04-.09.08-.12ZM5.71,6.23c.02-.07.03-.13.04-.2.1-1.28-.08-2.7,0-3.99,0-.05-.01-.1-.05-.13-.13-.1-1.39,0-1.65-.03l-.11.11v4.14s.08.11.08.11h1.7ZM6.35,1.87l-.05.05v4.25l.05.05h1.68l.05-.05V1.92l-.05-.05h-1.68ZM8.73,1.87l-.05.05v4.25l.05.05h1.65c.08-.07.08-.14.09-.24.11-1.23-.09-2.63,0-3.88l-.09-.24h-1.65ZM11.06,6.19s.08.04.09.04h1.61l.05-.05V1.92l-.05-.05h-1.65l-.05.05v4.27ZM13.49,6.23h1.65l.05-.05V1.96s-.11-.09-.16-.09c-.15-.02-1.49-.02-1.56.02-.03.02-.04.06-.06.09v4.14s.08.11.08.11ZM15.84,1.87l-.05.05v4.25l.05.05h1.65c.19-.33.06-.8.05-1.15-.01-.95,0-1.91,0-2.86,0-.05.07-.35-.05-.35h-1.65ZM18.22,6.23h1.65l.05-.05V1.96s-.06-.06-.07-.07c-.08-.04-1.35-.04-1.52-.02-.09,0-.16,0-.19.1v4.18s.07.07.08.07ZM1.67,4.18l-.08.07v4.26c.02.08.07.09.14.1.47.06,1.08-.04,1.57,0l.07-.08v-4.24c-.02-.09-.05-.1-.14-.11-.48-.06-1.08.04-1.57,0Z"/></svg>' },
  { id: 'gear', name: 'Gear', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M20.00,12.00 L22.94,13.12 L22.54,15.15 L19.39,15.06 L18.65,16.44 L17.66,17.66 L18.94,20.53 L17.22,21.68 L15.06,19.39 L13.56,19.85 L12.00,20.00 L10.88,22.94 L8.85,22.54 L8.94,19.39 L7.56,18.65 L6.34,17.66 L3.47,18.94 L2.32,17.22 L4.61,15.06 L4.15,13.56 L4.00,12.00 L1.06,10.88 L1.46,8.85 L4.61,8.94 L5.35,7.56 L6.34,6.34 L5.06,3.47 L6.78,2.32 L8.94,4.61 L10.44,4.15 L12.00,4.00 L13.12,1.06 L15.15,1.46 L15.06,4.61 L16.44,5.35 L17.66,6.34 L20.53,5.06 L21.68,6.78 L19.39,8.94 L19.85,10.44 Z M15.40,12.00 A3.4,3.4 0 1 0 8.60,12.00 A3.4,3.4 0 1 0 15.40,12.00 Z"/></svg>' },
  { id: 'lightning', name: 'Lightning', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polygon points="13,2 4,14 11,14 9,22 20,9 13,9"/></svg>' },
  { id: 'star', name: 'Star', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polygon points="12,2 14.6,9 22,9 16,13.5 18.5,21 12,16.6 5.5,21 8,13.5 2,9 9.4,9"/></svg>' },
  { id: 'arrow', name: 'Arrow', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polygon points="2,9 13,9 13,4 22,12 13,20 13,15 2,15"/></svg>' },
  { id: 'plus', name: 'Plus', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polygon points="9,3 15,3 15,9 21,9 21,15 15,15 15,21 9,21 9,15 3,15 3,9 9,9"/></svg>' }
];

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

// Parse an SVG string into THREE.Shapes (for icons, built-in or uploaded).
function shapesFromSVG(svgText) {
  const loader = new THREE.SVGLoader();
  const data = loader.parse(svgText);
  let shapes = [];
  for (const p of data.paths) {
    shapes = shapes.concat(THREE.SVGLoader.createShapes(p));
  }
  return shapes;
}

// Build the left badge (icon or letter/number), sized to ~sizeMm tall, centered at origin.
// Returns { geo, w } or null.
function buildBadgeGeo(badge, sizeMm, depth) {
  let shapes = null, isIcon = false;
  if (badge.type === 'char' && badge.value && badge.value.trim()) {
    const fs = fontSizeForCap(sizeMm);
    shapes = pathToShapes(font.getPath(badge.value.trim(), 0, 0, fs));
  } else if (badge.type === 'icon') {
    let svg = badge.svg;
    if (!svg && badge.value) {
      const it = ICON_LIBRARY.find(i => i.id === badge.value);
      if (it) svg = it.svg;
    }
    if (!svg) return null;
    try { shapes = shapesFromSVG(svg); } catch (e) { return null; }
    isIcon = true;
  }
  if (!shapes || !shapes.length) return null;

  let geo = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: false, curveSegments: 8 });
  if (isIcon) {
    // SVG y points down — flip upright with a proper rotation (preserves winding so
    // normals stay outward), then push the extrusion back to z = [0, depth].
    geo.rotateX(Math.PI);
    geo.translate(0, 0, depth);
  }
  geo.computeBoundingBox();
  let bb = geo.boundingBox;
  const h = bb.max.y - bb.min.y, wd = bb.max.x - bb.min.x;
  if (h <= 0 || wd <= 0) return null;
  const maxH = AREA_TOP - AREA_BOTTOM;       // never taller than the usable area
  const targetH = Math.min(sizeMm, maxH);
  let s = targetH / h;
  const maxW = targetH * BADGE_MAX_W_RATIO;   // keep wide icons from crowding the text
  if (wd * s > maxW) s = maxW / wd;
  geo.scale(s, s, 1);
  geo.computeBoundingBox(); bb = geo.boundingBox;
  geo.translate(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, 0);
  geo.computeBoundingBox(); bb = geo.boundingBox;
  return { geo, w: bb.max.x - bb.min.x, h: bb.max.y - bb.min.y };
}

// Build all meshes for one label (text + optional badge), positioned in label-local XY.
// Text/badge sit at z=0 here; the caller lifts them to TOP_Z.
function buildLabelMeshes(data, capMm, depth, badgeSize, bold) {
  let badgeGeo = null, badgeW = 0, badgeH = 0;
  if (data.badge && data.badge.type && data.badge.type !== 'none') {
    const b = buildBadgeGeo(data.badge, badgeSize, depth);
    if (b) { badgeGeo = b.geo; badgeW = b.w; badgeH = b.h; }
  }
  const leftXBadge = AREA_LEFT + (badgeGeo ? badgeW + BADGE_GAP : 0);
  const badgeBottomY = badgeGeo ? (AREA_TOP - badgeH) : (AREA_TOP + 999);
  const tb = (data.text && data.text.trim())
    ? buildTextBlock(data.text, capMm, depth, leftXBadge, badgeBottomY, bold) : null;
  if (badgeGeo) {
    // Top-justified: badge top sits at AREA_TOP (keeps the top margin) and grows downward,
    // so a tall icon never pokes out above the label.
    const cy = AREA_TOP - badgeH / 2;
    badgeGeo.translate(AREA_LEFT + badgeW / 2, cy, 0);
  }
  return { textGeo: tb ? tb.geo : null, badgeGeo, textFits: tb ? tb.fits : true };
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
    // Pick a representative point: midpoint between first two points
    // (slightly inset is best, but the first sampled vertex usually works).
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

/* Keyword → icon auto-match. Scans the label text and assigns a matching icon;
   first match wins, so list specific terms before generic ones. Skips rows the
   user has set manually. Easy to extend — just add keywords to this list. */
const KEYWORD_ICONS = [
  [['torx'], 'screw-torx-head'],
  [['phillips', 'philips', 'cross-head', 'crosshead'], 'screw-phillips-head'],
  [['slotted', 'flathead', 'flat-head'], 'screw-slotted-head'],
  [['hex socket', 'socket head', 'socket-head', 'allen', 'shcs', 'cap screw'], 'screw-hex-socket'],
  [['bolt', 'bolts', 'hex bolt', 'hex head'], 'bolt-hex-head'],
  // Generic "screw" / "m3" etc. intentionally has NO mapping — a phillips icon
  // would be wrong as often as right. Add a generic-screw icon to ICON_LIBRARY
  // later, then map it here so plain "screws" gets a head-agnostic icon.
  [['nut', 'nuts', 'nyloc', 'locknut', 'lock nut'], 'nut'],
  [['washer', 'washers'], 'washer'],
  [['wrench', 'wrenches', 'spanner', 'spanners', 'sae', 'allen key', 'hex key'], 'wrench-a'],
  [['screwdriver', 'screw driver', 'driver', 'drivers'], 'screw-driver'],
  [['cutter', 'cutters', 'snips', 'flush', 'side cutter'], 'flush-cutter'],
  [['drill', 'drills', 'drill bit', 'bits'], 'drill-bit'],
  [['nozzle', 'nozzles', 'hotend'], 'nozzle'],
  [['resistor', 'resistors', 'ohm', 'ohms'], 'resistor'],
  [['capacitor', 'capacitors', 'caps', 'farad'], 'capacitor'],
  [['diode', 'diodes', 'led', 'leds'], 'diode'],
  [['ic', 'chip', 'chips', 'mcu', 'microcontroller', 'transistor', 'transistors'], 'ic-chip'],
  [['battery', 'batteries', 'cell', 'cells', 'aa', 'aaa', '18650', 'lipo', 'li-po'], 'battery'],
  [['sd', 'sd card', 'microsd', 'micro sd', 'memory card', 'tf card'], 'sd-card'],
  [['gear', 'gears', 'cog', 'cogs'], 'gear'],
  [['power', 'electrical', 'volt', 'volts', 'amp', 'amps', 'fuse', 'fuses'], 'lightning'],
  [['favorite', 'favourite', 'important', 'star'], 'star'],
];
function guessIconId(text) {
  if (!text) return null;
  for (const [keys, id] of KEYWORD_ICONS) {
    if (!ICON_LIBRARY.some(i => i.id === id)) continue;   // skip if this build lacks the icon
    for (const k of keys) {
      const re = new RegExp('(^|[^a-z0-9])' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)', 'i');
      if (re.test(text)) return id;
    }
  }
  return null;
}

// The generator's defaults - the values its inputs start at (index.html: font-size, text-depth, badge-size, bold-text,
// all-caps, predict-icons, color-base, color-text). A label nobody has customised is built with these.
const DEFAULTS = Object.freeze({ capMm: 5, depth: 0.6, badgeSize: 14, bold: false, allCaps: true, predictIcons: true,
  colorBase: '#f0f0f2', colorText: '#1a1a1a' });

// One label as buildLabelMeshes takes it: ALL CAPS applied to the text and to a letter badge, an icon badge carried by id
// and/or svg. Returns null when there is nothing to print (no text and no badge). This is what getLabelData() does per row.
function prepareLabel(text, badge, allCaps) {
  text = text || '';
  const bt = (badge && badge.type) || 'none';
  const b = { type: bt };
  if (bt === 'char') {
    const cv = badge.value || '';
    b.value = allCaps ? cv.toUpperCase() : cv;   // match the all-caps label text
  }
  else if (bt === 'icon') {
    if (badge.value) b.value = badge.value;
    if (badge.svg) b.svg = badge.svg;
  }
  const hasBadge = (bt === 'char' && (b.value || '').trim()) ||
                   (bt === 'icon' && (b.value || b.svg));
  return ((text && text.trim()) || hasBadge) ? { text: allCaps ? text.toUpperCase() : text, badge: b } : null;
}

return {
  setFont, DEFAULTS, prepareLabel,
  LABEL_LEN, LABEL_WID, LABEL_HT, TOP_Z, DIAG_DXDY, DIAG_X0,
  AREA_MARGIN, AREA_LEFT, AREA_RIGHT, AREA_TOP, AREA_BOTTOM,
  BADGE_GAP, LINE_GAP, MIN_PRINT_CAP, BADGE_MAX_W_RATIO, BOLD_OFFSET,
  ICON_LIBRARY, KEYWORD_ICONS, guessIconId,
  getCapHeight, fontSizeForCap, mergeGeoms, emboldenGeo, buildLineGeo, rightLimitAt, lineLeftX, wrapText, buildTextBlock,
  shapesFromSVG, buildBadgeGeo, buildLabelMeshes, pathToShapes,
};
}

root.GEN2EdgeLabelCore = { version: 1, create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
