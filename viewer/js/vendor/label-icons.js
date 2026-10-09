/* label-icons.js - the label icon catalog: groups, the icons a label can carry, which drawing a badge prints, and the
   word -> icon guess (2026-10-09; Joey: the new icons in the label icon menu, in collapsible groups, and a much wider
   icon prediction; design reviewed by Sol 01a122f1).

   Shared byte for byte with the 3D Build Studio (viewer/js/vendor/label-icons.js, sha-pinned there), so a drawer in 3D
   shows the icon its printed label carries. A fixed LF keeps every copy the same bytes (.gitattributes).

   It builds ON the EdgeLabel label core rather than copying it (Sol, finding 9): the core's 23 icons (ICON_LIBRARY)
   are read from the loaded core, and its word rules run FIRST - the new rules are asked only when the core's guess
   finds nothing. So a word that predicts an icon today keeps that same icon, by construction (the rule agreed with
   Joey). Neither label core changes: label-core.js stays the viewer-pinned file, label-core-classicpro.js stays the
   Classic Pro generator's own.

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
  'nut': ['nuts', 'Nut, outline'],
  'washer': ['nuts', 'Washer, outline'],
  'screw-driver': ['tools', 'Screwdriver'],
  'wrench-a': ['tools', 'Wrench'],
  'flush-cutter': ['tools', 'Flush cutter'],
  'drill-bit': ['tools', 'Drill bit'],
  'gear': ['tools', 'Gear'],
  'nozzle': ['tools', 'Nozzle'],
  'resistor': ['electronics', 'Resistor, symbol'],
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

/* The NEW word rules, asked only when the core's own rules find nothing. Same matching as the core: whole words,
   case-insensitive, the first rule with a matching phrase wins. Only phrases that mean one thing wherever they appear
   (Sol, finding 7): no bare "box", "clip", "needle", "connector" or "cap". Each rule's own words are tested both ways in
   test/label-icons.test.mjs (EXAMPLES), and every phrase must reach its own icon (a phrase an earlier rule always catches
   is dead and fails the test). A rule may point at a core icon: that is how plurals the core misses
   ("screwdrivers", "cap screws") reach the icon the singular already gets. */
const RULES = Object.freeze([
  // plurals and forms the core's own keywords miss
  [['cap screws', 'socket head screws', 'socket cap', 'socket cap screws'], 'screw-hex-socket'],
  [['nylock', 'nylocks', 'nylon lock nuts', 'nylon insert nuts', 'lock nuts', 'locknuts'], 'nut'],
  [['hex keys'], 'wrench-a'],   // "allen ..." is the core's: its 'allen' rule (socket-head screw) comes first, unchanged
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
  const words = new Map();   // icon id -> every phrase that predicts it (search finds an icon by its words too)
  const addWords = (keys, id) => { if (!words.has(id)) words.set(id, []); words.get(id).push(...keys); };
  if (core && Array.isArray(core.KEYWORD_ICONS)) core.KEYWORD_ICONS.forEach(([keys, id]) => addWords(keys, id));
  RULES.forEach(([keys, id]) => addWords(keys, id));

  function find(id) { return byId.get(id) || null; }

  // The drawing a badge of this size prints: the standard drawing from its `stdFrom` (the size at which every feature
  // keeps 0.9 mm under the core's scaling), else the compact one. The size is the label type's Badge size setting, in mm,
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

  // The word -> icon guess: the core's own rules first (unchanged results), then the new rules. An icon that is not
  // selectable or not to be predicted is never guessed.
  function guessIconId(text) {
    if (!text) return null;
    const old = core && typeof core.guessIconId === 'function' ? core.guessIconId(text) : null;
    if (old) return old;
    for (const [, id, res] of rules) {
      const ic = byId.get(id);
      if (!ic || !ic.selectable || !ic.predict) continue;
      if (res.some((re) => re.test(text))) return id;
    }
    return null;
  }

  // Menu search: an icon matches when every typed word appears in its name, its group's name or one of its phrases.
  function search(query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return icons.slice();
    const terms = q.split(/\s+/);
    const gName = new Map(GROUPS.map((g) => [g.id, g.name.toLowerCase()]));
    return icons.filter((ic) => {
      const hay = [ic.name.toLowerCase(), gName.get(ic.group) || '', ...(words.get(ic.id) || [])].join(' | ');
      return terms.every((t) => hay.includes(t));
    });
  }

  return { GROUPS, icons, find, svgFor, resolveBadge, guessIconId, search, RULES };
}

root.GEN2LabelIcons = { version: 1, create, GROUPS, LEGACY, RULES };
})(typeof globalThis !== 'undefined' ? globalThis : this);
