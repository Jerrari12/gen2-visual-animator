/* What a drawer label may carry besides its words (2026-10-02) - the viewer's half of the planner's rules (gen2-planner
   js/app.js cleanLabelBadge / cleanLabelStyle, GEN2.labelSpec in js/data.js). A build reaches this page from the planner's
   relay, a share link or a hand-made hash, so the viewer checks the fields itself before they reach the label generator's
   code. No imports, so node can test it.

   - A unit's `labelBadge` is the left icon or letter; ABSENT means "let the generator predict one from the words".
       { type: 'none' } | { type: 'icon', value: <icon id> } | { type: 'char', value: <up to 4 characters> }
     An icon id is checked for SHAPE, not against the icon list: the generator's code ignores an id it does not know (the
     label prints without an icon), so a newer icon works without a change here. Custom uploaded SVGs are not build state.
   - A build's `labelStyle` is the generator's set-wide settings; null = its defaults. A value outside the generator's own
     input limits, or of the wrong type, is DROPPED, never clamped - clamping would print something nobody chose.

   ⚠ The limits are the EdgeLabel generator's inputs (Text size 2-6.5 mm, Text depth 0.2-1.2 mm, Badge size 4-22 mm, the
   letter badge's maxlength 4) and are mirrored in the planner's GEN2.labelSpec - test/label-spec.test.mjs compares all
   three when the checkouts sit side by side. */
export const LABEL_SPEC = Object.freeze({
  limits: Object.freeze({ capMm: Object.freeze([2, 6.5]), depth: Object.freeze([0.2, 1.2]), badgeSize: Object.freeze([4, 22]) }),
  flags: Object.freeze(['bold', 'allCaps', 'predictIcons']),
  charMax: 4,
});

export function cleanLabelBadge(b) {
  if (!b || typeof b !== 'object') return null;
  if (b.type === 'none') return { type: 'none' };
  if (b.type === 'icon' && typeof b.value === 'string' && b.value.length <= 40 &&
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(b.value)) return { type: 'icon', value: b.value };
  if (b.type === 'char' && typeof b.value === 'string') {
    const v = b.value.trim();
    if (v && v.length <= LABEL_SPEC.charMax) return { type: 'char', value: v };
  }
  return null;
}

export function cleanLabelStyle(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
  const out = {};
  for (const [k, [lo, hi]] of Object.entries(LABEL_SPEC.limits)) {
    const v = s[k];
    if (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi) out[k] = v;
  }
  for (const k of LABEL_SPEC.flags) if (typeof s[k] === 'boolean') out[k] = s[k];
  return Object.keys(out).length ? out : null;
}
