/* What a drawer label may carry besides its words (2026-10-02) - the viewer's half of the planner's rules (gen2-planner
   js/app.js cleanLabelBadge / cleanLabelStyle, GEN2.labelSpec in js/data.js). A build reaches this page from the planner's
   relay, a share link or a hand-made hash, so the viewer checks the fields itself before they reach the label generator's
   code. No imports, so node can test it.

   - A unit's `label` is its words, STORED AS TYPED (the generator uppercases at print time unless the style says not to).
     The planner's field takes 40 characters (#ut-label maxlength, LABEL_MAX) and trims; cleanLabelText is that one rule -
     trim, THEN cut to 40 - so a label that enters either tool by any path has one canonical form. ⚠ The EdgeLabel
     generator's own field takes 48; anything sent there must still respect 40.
   - A unit's `labelBadge` is the left icon or letter; ABSENT means "let the generator predict one from the words".
       { type: 'none' } | { type: 'icon', value: <icon id> } | { type: 'char', value: <up to 4 characters> }
     An icon id is checked for SHAPE, not against the icon list: the generator's code ignores an id it does not know (the
     label prints without an icon), so a newer icon works without a change here. Custom uploaded SVGs are not build state.
   - A build's `labelStyle` is the generator's set-wide settings; null = its defaults. A value outside the generator's own
     input limits, or of the wrong type, is DROPPED, never clamped - clamping would print something nobody chose.
   - A build's `buildId` names the build the planner is editing (12 random [a-z0-9]; the planner accepts 8-32). The relay
     refuses an options message whose id names another build, so a stale viewer tab cannot write into whichever drawer now
     carries the same unit number. A viewer booted from an official kit has none, and none means "legacy, accept".

   ⚠ The limits are the EdgeLabel generator's inputs (Text size 2-6.5 mm, Text depth 0.2-1.2 mm, Badge size 4-22 mm, the
   letter badge's maxlength 4) and are mirrored in the planner's GEN2.labelSpec - test/label-spec.test.mjs compares all
   three when the checkouts sit side by side, and runs the planner's own cleaners on the same inputs. */
export const LABEL_SPEC = Object.freeze({
  limits: Object.freeze({ capMm: Object.freeze([2, 6.5]), depth: Object.freeze([0.2, 1.2]), badgeSize: Object.freeze([4, 22]) }),
  flags: Object.freeze(['bold', 'allCaps', 'predictIcons']),
  charMax: 4,
});
/* The words: the planner's LABEL_MAX (= #ut-label maxlength). Kept outside LABEL_SPEC because GEN2.labelSpec, which the
   planner's copy of LABEL_SPEC is compared with byte for byte, does not carry it (the planner keeps it as its own const). */
export const LABEL_TEXT_MAX = 40;
export const BUILD_ID_RE = /^[a-z0-9]{8,32}$/;

export function cleanLabelText(v) {
  return typeof v === 'string' ? v.trim().slice(0, LABEL_TEXT_MAX) : '';
}

export function cleanBuildId(v) {
  return (typeof v === 'string' && BUILD_ID_RE.test(v)) ? v : null;
}

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
