/* label-icons.js - the label icon catalog: groups, the icons a label can carry, which drawing a badge prints, and the
   word -> icon guess (2026-10-09; Joey: the new icons in the label icon menu, in collapsible groups, and a much wider
   icon prediction; design reviewed by Sol 01a122f1).

   Shared byte for byte with the 3D Build Studio (viewer/js/vendor/label-icons.js, sha-pinned there), so a drawer in 3D
   shows the icon its printed label carries. A fixed LF keeps every copy the same bytes (.gitattributes).

   It builds ON the EdgeLabel label core rather than copying it (Sol, finding 9): the core's 23 icons (ICON_LIBRARY)
   are read from the loaded core. The guess asks, in order: the CORRECTIONS (a short, documented list of phrases the
   core reads wrongly - "Socket caps" is not a capacitor), then the core's own word rules, then the new RULES. So a word
   keeps the icon it predicts today unless it is on the corrections list. Neither label core changes: label-core.js
   stays the viewer-pinned file, label-core-classicpro.js stays the Classic Pro generator's own.

   New icons reach a core as the badge's own SVG (both cores use badge.svg before their own list), through ONE adapter,
   resolveBadge(), on every path that builds a label: an uploaded SVG always wins; otherwise a library id gets its
   drawing for the badge size; an unknown id is left alone. Stored data never carries a library drawing - rows, saved
   sets and label lists keep {type:'icon', value:id}.

   The artwork is label-icon-art.js (GENERATED from the MODULITH icon family; never hand-edit). Usage:
     const icons = GEN2LabelIcons.create({ core: GEN2EdgeLabelCore-instance, art: GEN2LabelIconArt });
*/
(function (root) {
'use strict';

// Menu groups, in menu order. A group with no selectable icon is not shown.
const GROUPS = Object.freeze([
  { id: 'screws', name: 'Screws & bolts' },
  { id: 'nuts', name: 'Nuts & washers' },
  { id: 'tools', name: 'Tools & 3D printing' },
  { id: 'electronics', name: 'Electronics' },
  { id: 'office', name: 'Office & sewing' },
  { id: 'general', name: 'Storage & symbols' },
]);

// The core's 23 icons: their group and the name the menu shows (the core's own names stay the core's).
const LEGACY = Object.freeze({
  'bolt-hex-head': ['screws', 'Hex bolt'],
  'screw-hex-socket': ['screws', 'Socket-head screw'],
  'screw-phillips-head': ['screws', 'Phillips screw'],
  'screw-slotted-head': ['screws', 'Slotted screw'],
  'screw-torx-head': ['screws', 'Torx screw'],
  'nut': ['nuts', 'Hex nut'],
  'washer': ['nuts', 'Washer'],
  'screw-driver': ['tools', 'Screwdriver'],
  'wrench-a': ['tools', 'Wrench'],
  'flush-cutter': ['tools', 'Flush cutter'],
  'drill-bit': ['tools', 'Drill bit'],
  'gear': ['tools', 'Gear'],
  'nozzle': ['tools', 'Nozzle'],
  'resistor': ['electronics', 'Resistor'],
  'capacitor': ['electronics', 'Capacitor'],
  'diode': ['electronics', 'Diode / LED'],
  'ic-chip': ['electronics', 'Chip'],
  'battery': ['electronics', 'Battery'],
  'sd-card': ['electronics', 'SD card'],
  'lightning': ['electronics', 'Power'],
  'star': ['general', 'Star'],
  'arrow': ['general', 'Arrow'],
  'plus': ['general', 'Plus'],
});

/* CORRECTIONS (2026-10-09; ChatGPT's review, relayed by Joey: "Fix known wrong predictions rather than preserving them
   indefinitely ... Recognize specific phrases before ambiguous single words"). Asked BEFORE the core's own rules, so
   these phrases are the only labels whose guess differs from the deployed generator's, and each change is deliberate
   (decisions.md lists them). Same matching as the core: whole words, case-insensitive.
   - [phrases, id]: the phrase takes that icon.
   - [phrases, null]: the phrase means something no icon shows; its words are taken out of the label before anything
     is guessed, so "Bottle caps" gets no icon while "Cell phone chargers" still gets power from "chargers".
   Only a guess changes: an icon picked by hand, and "No badge", are never touched (the apps keep a manual choice). */
const CORRECTIONS = Object.freeze([
  [['socket cap', 'socket caps'], 'screw-hex-socket'],                           // was the capacitor ("caps")
  [['allen key', 'allen keys', 'allen wrench', 'allen wrenches'], 'wrench-a'],   // was the socket-head screw ("allen")
  [['hex bit', 'hex bits'], 'screw-hex-socket'],   // was the drill bit; a bit shows the drive it fits, as "Torx bits" does
  [['star bit', 'star bits', 'star drive', 'star screws'], 'screw-torx-head'],   // was the star or the drill bit
  [['impact bits', 'nut driver', 'nut drivers'], 'screw-driver'],                // was the drill bit / the nut
  [['stepper driver', 'stepper drivers', 'motor driver', 'motor drivers', 'led driver', 'led drivers', 'driver board',
    'driver boards'], 'ic-chip'],                                                // was the screwdriver ("driver")
  [['bolt cutter', 'bolt cutters'], 'flush-cutter'],                             // was the hex bolt
  [['power bank', 'power banks'], 'battery'],                                    // was power
  [['bits and pieces', 'bits and bobs', 'bits & bobs'], 'storage-box'],          // was the drill bit
  [['bottle caps', 'end caps', 'pen caps', 'lens caps'], null],                  // not capacitors
  [['power tool', 'power tools'], null],                                         // not electrical power
  [['camping gear', 'fishing gear', 'climbing gear', 'hiking gear', 'rain gear', 'safety gear', 'gear tie', 'gear ties'], null],   // not cogs
  [['flush mount', 'flush mounts'], null],                                       // not the flush cutter
  [['cell phone', 'cell phones'], null],                                         // not a battery cell
  [['cookie cutter', 'cookie cutters', 'pizza cutter', 'pizza cutters'], null],  // not the flush cutter
]);

/* Near twins: the core's nut, washer and resistor, and the icon family's own drawings of the same parts. A menu shows
   ONE of each pair (ChatGPT's review via Joey: new users should not have to decipher near-identical choices). The other
   stays a working icon - a label that carries it still prints it - and appears in a menu only while it is that label's
   icon. The first of each pair is the one shown and the one the guess predicts: today the core's, so no printed label
   changes. Swapping a pair's order would move new labels to the family's drawing (Joey's call). */
const TWINS = Object.freeze([['nut', 'hex-nut'], ['washer', 'flat-washer'], ['resistor', 'resistor-axial']]);

/* The NEW word rules, asked only when the corrections and the core's own rules find nothing. Same matching as the core:
   whole words, case-insensitive, the first rule with a matching phrase wins. Only phrases that mean one thing wherever they appear
   (Sol, finding 7): no bare "box", "clip", "needle", "connector" or "cap". Each rule's own words are tested both ways in
   test/label-icons.test.mjs (EXAMPLES), and every phrase must reach its own icon (a phrase an earlier rule always catches
   is dead and fails the test). A rule may point at a core icon: that is how plurals the core misses
   ("screwdrivers", "cap screws") reach the icon the singular already gets. */
const RULES = Object.freeze([
  // plurals and forms the core's own keywords miss
  [['cap screws', 'socket head screws'], 'screw-hex-socket'],
  [['nylock', 'nylocks', 'nylon lock nuts', 'nylon insert nuts', 'lock nuts', 'locknuts'], 'nut'],
  [['hex keys'], 'wrench-a'],   // "allen key(s)" / "allen wrench(es)" are corrections; a bare "allen" keeps the core's screw
  [['screwdrivers', 'screw drivers', 'bit driver', 'bit drivers'], 'screw-driver'],
  [['nippers', 'pliers', 'wire cutters'], 'flush-cutter'],
  [['drill bits', 'step drill', 'step drills', 'countersink bits'], 'drill-bit'],
  [['hotends', 'hot end', 'hot ends', 'heatbreak', 'heatbreaks', 'heat break', 'heat breaks'], 'nozzle'],
  [['microcontrollers', 'mcus', 'ics', 'arduino', 'arduinos', 'esp32', 'esp32s', 'esp8266', 'raspberry pi', 'mosfet', 'mosfets'], 'ic-chip'],
  [['coin cell', 'coin cells', 'cr2032', 'cr2025', 'cr2016', '9v', 'aaa batteries'], 'battery'],
  [['memory cards', 'tf cards', 'micro sd cards'], 'sd-card'],
  [['cables', 'usb cables', 'power supply', 'power supplies', 'psu', 'psus', 'charger', 'chargers', 'extension cords'], 'lightning'],
  [['favorites', 'favourites'], 'star'],
  // the MODULITH icon family
  [['jst', 'dupont', 'wire connector', 'wire connectors', 'crimp connector', 'crimp connectors', 'jst connectors', 'dupont connectors'], 'wire-connector'],
  [['scissors'], 'scissors'],
  [['sewing needle', 'sewing needles', 'hand needles', 'embroidery needles'], 'sewing-needle'],
  [['paper clip', 'paper clips', 'paperclip', 'paperclips', 'binder clips'], 'paper-clip'],
  [['misc', 'miscellaneous', 'odds and ends', 'odds & ends', 'spares', 'spare parts', 'storage'], 'storage-box'],
]);

const esc = (k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (k) => new RegExp('(^|[^a-z0-9])' + esc(k) + '([^a-z0-9]|$)', 'i');   // the core's own matching

function create(opts) {
  const core = opts && opts.core;
  const art = (opts && opts.art) || root.GEN2LabelIconArt || null;
  const coreIcons = (core && Array.isArray(core.ICON_LIBRARY)) ? core.ICON_LIBRARY : [];
  const byId = new Map();
  const list = [];
  for (const it of coreIcons) {
    const meta = LEGACY[it.id] || ['general', it.name];
    const ic = { id: it.id, name: meta[1], group: meta[0], svg: it.svg, core: true, selectable: true, predict: true };
    byId.set(ic.id, ic); list.push(ic);
  }
  for (const a of (art && art.icons) || []) {
    if (byId.has(a.id)) continue;   // a core id always means the core's drawing
    // An icon the art carries but marks not selectable (the coffee filter, until a blind test identifies it) is not in
    // the catalog at all: not in the menu, never guessed, and its id resolves to nothing, so no label prints it
    // (Sol 01a122f1, finding 1).
    if (!a.selectable) continue;
    const ic = { id: a.id, name: a.name, group: a.group, svg: a.std.svg, svgCompact: a.compact.svg, stdFrom: a.std.from,
      core: false, selectable: true, predict: !!a.predict, status: a.status };
    byId.set(ic.id, ic); list.push(ic);
  }
  const groupOrder = new Map(GROUPS.map((g, i) => [g.id, i]));
  const icons = list.filter((i) => i.selectable)
    .sort((a, b) => (groupOrder.get(a.group) ?? 99) - (groupOrder.get(b.group) ?? 99));   // stable: core order, then family order
  const rules = RULES.map(([keys, id]) => [keys, id, keys.map(wordRe)]);
  const fixes = CORRECTIONS.filter(([, id]) => id).map(([keys, id]) => [keys, id, keys.map(wordRe)]);
  const masks = CORRECTIONS.filter(([, id]) => !id).flatMap(([keys]) => keys)
    .map((k) => new RegExp('(^|[^a-z0-9])' + esc(k) + '(?=[^a-z0-9]|$)', 'gi'));
  const hidden = new Set(TWINS.map(([, other]) => other).filter((id) => byId.has(id)));
  const words = new Map();   // icon id -> every phrase that predicts it (search finds an icon by its words too)
  const addWords = (keys, id) => { if (!words.has(id)) words.set(id, []); words.get(id).push(...keys); };
  CORRECTIONS.forEach(([keys, id]) => { if (id) addWords(keys, id); });
  if (core && Array.isArray(core.KEYWORD_ICONS)) core.KEYWORD_ICONS.forEach(([keys, id]) => addWords(keys, id));
  RULES.forEach(([keys, id]) => addWords(keys, id));

  function find(id) { return byId.get(id) || null; }

  // The drawing a badge of this size prints: the standard drawing from its `stdFrom`, else the compact one. `stdFrom` is
  // a GEOMETRIC SCREEN, not a print result: the badge size at which the drawing's 2-unit minimum features measure 0.9 mm
  // on paper under the core's scaling: stdFrom = 0.45 x max(h, w / 0.85), h and w the drawing's height and width in
  // drawing units. Whether they print and read is what a printed sheet answers (the family's icons.json records which
  // have been). The size is the label type's Badge size setting, in mm,
  // as stored (Sol, finding 6: one rule both apps apply to the same stored number).
  function svgFor(id, badgeMm) {
    const ic = byId.get(id);
    if (!ic) return null;
    if (!ic.svgCompact || !(Number(badgeMm) + 1e-9 < ic.stdFrom)) return ic.svg;
    return ic.svgCompact;
  }

  // The ONE adapter every label build goes through (Sol, finding 5): an uploaded/supplied svg wins; a core icon is left
  // as it is (each core draws its own 23 from the id, exactly as before - existing labels take the unchanged path);
  // a library icon the cores do not hold gets its drawing for the badge size; an unknown id is left alone.
  // Never mutates its argument.
  function resolveBadge(badge, badgeMm) {
    if (!badge || badge.type !== 'icon' || badge.svg || !badge.value) return badge;
    const ic = byId.get(badge.value);
    if (!ic || ic.core) return badge;
    return Object.assign({}, badge, { svg: svgFor(badge.value, badgeMm) });
  }

  // The word -> icon guess: the corrections first, then the core's own rules (unchanged results), then the new rules.
  // An icon that is not selectable, not to be predicted, or the hidden one of a twin pair is never guessed.
  const guessable = (id) => { const ic = byId.get(id); return !!(ic && ic.selectable && ic.predict && !hidden.has(id)); };
  function guessIconId(text) {
    if (!text) return null;
    for (const re of masks) text = text.replace(re, '$1 ');
    for (const [, id, res] of fixes) if (guessable(id) && res.some((re) => re.test(text))) return id;
    const old = core && typeof core.guessIconId === 'function' ? core.guessIconId(text) : null;
    if (old) return old;
    for (const [, id, res] of rules) {
      if (guessable(id) && res.some((re) => re.test(text))) return id;
    }
    return null;
  }

  // The icons a menu offers: every selectable icon except the hidden one of a twin pair, which appears only while it is
  // the current icon of the label being edited.
  function menu(currentId) {
    return icons.filter((ic) => !hidden.has(ic.id) || ic.id === currentId);
  }

  // Menu search, over menu(currentId): an icon matches when every typed word appears in its name, its group's name or
  // one of its phrases.
  function search(query, currentId) {
    const offered = menu(currentId);
    const q = String(query || '').trim().toLowerCase();
    if (!q) return offered;
    const terms = q.split(/\s+/);
    const gName = new Map(GROUPS.map((g) => [g.id, g.name.toLowerCase()]));
    return offered.filter((ic) => {
      const hay = [ic.name.toLowerCase(), gName.get(ic.group) || '', ...(words.get(ic.id) || [])].join(' | ');
      return terms.every((t) => hay.includes(t));
    });
  }

  return { GROUPS, icons, find, svgFor, resolveBadge, guessIconId, menu, search, RULES, CORRECTIONS, TWINS };
}

root.GEN2LabelIcons = { version: 1, create, GROUPS, LEGACY, RULES, CORRECTIONS, TWINS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
