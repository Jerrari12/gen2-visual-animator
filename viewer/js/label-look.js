/* What a drawer's label LOOKS like beyond its words (2026-10-10, Joey: "we need to get the labels to match the studio with the
   part pickers color stripes, also if we can manually select or add those stripes in the studio to any custom label"). No DOM,
   no three: main.js and label-text.js use it, and test/label-look.test.mjs runs it under node.

   A build carries its labels twice (the label tool's format, D:/MODULITH/handoffs/label-release/LABEL-LIST-FORMAT.md):
   - each drawer unit's MIRROR - `label` (the words, 40 characters) and `labelBadge` - which is all an older tool reads;
   - the LABEL LIST - `labelList.labels[]` and `labelAssign` (drawer unit id -> label id) - which holds what the mirror cannot:
     an uploaded icon (label-panel.js labelUploadFor), a PART label's item from the Part Picker (`hardware`, a
     part-picker-label-item/1) and a colour STRIPE. The list keeps keys it does not know verbatim, so a field the Label Studio
     adds rides through the planner unchanged.

   THE STRIPE (the Label Studio's "colour band"), by the Label Studio's own rules (its label-stripes.js, 2026-10-10):
   - colours: `label.colours`, the shape a Part Picker item's colours have - { band: { colour, hex, label, pattern }, band_accent? }.
     On an ordinary label it IS the stripe; on a part label it replaces the item's own `hardware.colours` (the Part Picker's
     scheme: band = metric blue / SAE red, band_accent = the material), and `colours: null` there takes the stripe off.
     Cleaned as the Label Studio cleans it (cleanStripe): no readable band colour = no stripe (the label's own colours are
     then ignored, so a part label keeps its item's); an unreadable accent is dropped (the band's colour covers the accent).
     A part item's own colours are cleaned later by label-hardware.js, which prints an unreadable slot in the base colour.
   - position: the Label Studio's "Colour band" setting is SET-WIDE and does not travel in a build, so this page uses its
     default: a part label's stripe along the BOTTOM edge, an ordinary label's at the END - the only position an ordinary
     label's words can never reach (label-core.js lays them out left-justified; the bottom and 45° stripes would run under
     the ink). A label may name its own `bandPosition` ('bottom' | 'end' | 'wedge' | 'off'); nothing writes one yet. An
     ordinary label honours only 'off'.

   WHICH LABEL A DRAWER WEARS - the planner's own rule (label-list.js reconcile, with its live sync's editInPlace):
   - the drawer's assigned label, while the drawer's mirror is still that label's mirror (same words, same badge);
   - a PART label shows its drawing and stripe ONLY then: an edit to its words or icon makes it an ordinary label for that
     drawer (the planner gives the drawer a new plain label; its part item stays with the old one);
   - an ordinary label with a stripe keeps the stripe through an edit while this drawer is its only carrier (the planner edits
     such a label in place), and loses it when the label is shared (the planner then makes this drawer a new label). */
import { cleanLabelText, cleanLabelBadge } from './label-spec.js';

export const PART_ITEM = 'part-picker-label-item/1';
/* label-list.js HW_MAX (= the Label Studio's import limits): they bound the hardware layout's 3^n search, so an oversized item
   from a hand-made link cannot freeze the page. */
export const PART_ITEM_MAX = Object.freeze({ printable: 8, attributes: 24, fields: 6, text: 60, json: 8 * 1024 });
export const STRIPE_POSITIONS = Object.freeze(['bottom', 'end', 'wedge']);
export const STRIPE_DEFAULTS = Object.freeze({ part: 'bottom', ordinary: 'end' });

const isObj = (v) => Object.prototype.toString.call(v) === '[object Object]';

/* A part label's item, checked exactly as label-list.js cleanHardware checks it (test/label-look.test.mjs runs both on the
   same inputs when the Label Studio is checked out beside this repo): a deep copy, or null. */
export function cleanPartItem(h) {
  if (!isObj(h) || h.schema !== PART_ITEM || typeof h.id !== 'string' || !h.id || h.id.length > 64) return null;
  const M = PART_ITEM_MAX;
  const strs = (a, max) => Array.isArray(a) && a.length <= max && a.every((x) => typeof x === 'string' && x.length <= M.text);
  if (!strs(h.fields, M.fields)) return null;
  if (!Array.isArray(h.attributes) || h.attributes.length > M.attributes) return null;
  if (!h.attributes.every((a) => isObj(a) && typeof a.path === 'string' && typeof a.text === 'string' && a.text.length <= M.text)) return null;
  for (const k of ['pinned', 'optional']) if (h[k] !== undefined && !strs(h[k], M.printable)) return null;
  const printable = [...(h.pinned || []), ...(h.optional || [])];
  if (printable.length > M.printable || !printable.every((p) => h.attributes.some((a) => a.path === p))) return null;
  let out;
  try { out = JSON.parse(JSON.stringify(h)); } catch (e) { return null; }
  return JSON.stringify(out).length <= M.json ? out : null;
}

/* One stripe colour slot, cleaned as label-hardware.js colour() cleans it: { colour, hex, label, pattern }, null when the slot
   is there but unreadable or unassigned (printed in the label's base colour, never a guess), undefined when there is none. */
export function stripeColour(c) {
  if (c === null || c === undefined) return undefined;
  if (typeof c !== 'object' || typeof c.colour !== 'string' || !/^[a-z0-9-]{1,30}$/i.test(c.colour) ||
      typeof c.hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(c.hex)) return null;
  return { colour: c.colour, hex: c.hex, label: typeof c.label === 'string' ? c.label.slice(0, 40) : c.colour,
           pattern: c.pattern === 'dashed' ? 'dashed' : 'solid' };
}

/* A label's own colours, cleaned as the Label Studio's label-stripes.js clean() cleans them: { band, band_accent? } with a
   readable band, null for `null` when allowNone (a part label's "no stripe"), else undefined (no stripe of its own). */
export function cleanStripe(c, allowNone) {
  if (c === null) return allowNone ? null : undefined;
  if (!isObj(c)) return undefined;
  const band = stripeColour(c.band);
  if (!isObj(band)) return undefined;
  const out = { band };
  const a = stripeColour(c.band_accent);
  if (isObj(a)) out.band_accent = a;
  return out;
}

/* Where a label's stripe runs - 'part' or 'ordinary' (the header): one of STRIPE_POSITIONS, or null for 'off'. */
export function stripePositionOf(l, kind = 'part') {
  const p = l && l.bandPosition;
  if (p === 'off') return null;
  if (kind !== 'part') return STRIPE_DEFAULTS.ordinary;
  return STRIPE_POSITIONS.includes(p) ? p : STRIPE_DEFAULTS.part;
}

/* The label the build's list assigns to a drawer unit, or null. */
export function assignedLabelOf(build, unit) {
  const list = build && build.labelList, assign = build && build.labelAssign;
  if (!unit || !isObj(list) || !Array.isArray(list.labels) || !isObj(assign)) return null;
  const id = assign[String(unit.id)];
  return typeof id === 'string' ? (list.labels.find((x) => isObj(x) && x.id === id) || null) : null;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isPart = (l) => isObj(l.hardware) || isObj(l.part);

/* The label a drawer wears, by the planner's rule (the header): { label, exact } or null. `words` overrides the drawer's own
   words (the identify card's draft); exact = the drawer's mirror is the label's own. */
export function wornLabelOf(build, unit, words) {
  const l = assignedLabelOf(build, unit);
  if (!l) return null;
  const w = cleanLabelText(words === undefined ? unit.label : words);
  if (!w) return null;
  const exact = cleanLabelText(l.text) === w && same(cleanLabelBadge(l.badge), cleanLabelBadge(unit.labelBadge));
  if (exact) return { label: l, exact: true };
  if (isPart(l)) return null;
  const carriers = Object.values(build.labelAssign).filter((v) => v === l.id).length;
  return carriers === 1 ? { label: l, exact: false } : null;
}

/* What a drawer's label draws beyond the words label-core.js lays out, or null when it draws only those (today's label):
     { kind: 'part', item, position }      a PART label: the hardware layout lays out `item` (its colours already the label's
                                           own when it has some); `position` the stripe position, or null (none)
     { kind: 'stripe', colours, position } an ordinary label with a stripe: colours cleaned (cleanStripe), position 'end'
   A part item that does not pass cleanPartItem is not drawn as a part label (the words stand in for it). */
export function labelLookOf(build, unit, words) {
  const worn = wornLabelOf(build, unit, words);
  if (!worn) return null;
  const l = worn.label;
  const item = worn.exact && isObj(l.hardware) ? cleanPartItem(l.hardware) : null;
  if (item) {
    const own = Object.prototype.hasOwnProperty.call(l, 'colours') ? cleanStripe(l.colours, true) : undefined;
    if (own === null) delete item.colours; else if (own) item.colours = own;
    return { kind: 'part', item, position: stripePositionOf(l, 'part') };
  }
  if (isPart(l)) return null;
  const colours = cleanStripe(l.colours);
  const position = stripePositionOf(l, 'ordinary');
  return colours && position ? { kind: 'stripe', colours, position } : null;
}

/* Every drawer's look, for main.js's layoutKey (the echo guard): a layout that changes only a part item, a stripe or its
   position must still apply. The looks themselves, not a digest (the uploadsKey rule). */
export function labelLooksKey(build) {
  return JSON.stringify(((build && build.placed) || []).map((u) => [u.id, labelLookOf(build, u)]).filter(([, k]) => k));
}

/* Which of the Label Studio's files a build needs to draw its labels (label-text.js loads them only then):
   layout = a part label (hardware-layout.js, hardware-data.js, hardware-v5-data.js - and hardware-band-data.js with them, as
   nearly every Part Picker item carries a stripe and is laid out on the face less it), bands = a stripe on an ordinary label
   (hardware-band-data.js alone). Drawers whose words are empty draw no label at all and are left out, as main.js leaves them. */
export function labelLookNeeds(build) {
  const out = { layout: false, bands: false };
  for (const u of (build && build.placed) || []) {
    const k = labelLookOf(build, u);
    if (!k) continue;
    if (k.kind === 'part') out.layout = true;
    out.bands = true;
  }
  return out;
}

/* ---- the stripe's colour zone -----------------------------------------------------------------------------------------
   A stripe piece is drawn in the stripe's own colour - the label's, never a filament pick - through the ordinary material
   registry, as a ZONE of the Label type whose name carries the colour: 'STRIPE#56b4e9'. So fades, the selection glow, the
   build-plate finish and the printed layer lines treat it like any other zone of the label, and main.js's activeHex reads the
   colour off the key (stripeHexOfKey) - no palette entry, no filament, no identify-card chip. */
export const STRIPE_ZONE_PREFIX = 'STRIPE#';
export const stripeZone = (hex) => STRIPE_ZONE_PREFIX + String(hex).replace(/^#/, '').toLowerCase();
export const isStripeZone = (z) => typeof z === 'string' && /^STRIPE#[0-9a-f]{6}$/.test(z);
/* '#56b4e9' for a stripe key ('Label:STRIPE#56b4e9') or a stripe zone, else null. */
export function stripeHexOfKey(key) {
  const m = typeof key === 'string' ? /(?:^|:)STRIPE#([0-9a-f]{6})$/.exec(key) : null;
  return m ? '#' + m[1] : null;
}
