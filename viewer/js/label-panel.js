/* The label panel's pure parts (2026-10-02, label plan step 2): what one edit writes into `build`, how label fields cross the
   planner relay, and how the identify card names a badge's state. No DOM, no three - main.js wires these to the card and
   to the buildOptions / layout channels, and test/label-panel.test.mjs runs them under node.

   The data model is step 1's: a unit's `label` (as typed), its `labelBadge` (absent = the generator predicts), the build's
   `labelStyle` (null = the generator's defaults) and `buildId`. Every value that leaves or enters this page goes through
   label-spec.js first; the planner runs the same cleaners, so the two tools always hold one canonical form.

   ⚠ Only DECOR units carry a faceplate label the viewer can show (classic drawers print their front in), so the relay maps
   below are keyed by decor unit only. The PLANNER lets any unit be named (its field has no fill gate, and the txt export
   lists them all) - a missing key here means "leave that unit alone", never "it has no label". */
import { LABEL_SPEC, cleanLabelText, cleanLabelBadge, cleanLabelStyle, cleanBuildId } from './label-spec.js';

/* The generator's set-wide defaults, for the Labels rows before the vendored core has loaded (it loads lazily, with the
   font). test/edgelabel-core-vendor.test.mjs pins these six to the core's own DEFAULTS. */
export const LABEL_STYLE_FALLBACK = Object.freeze({ capMm: 5, depth: 0.6, badgeSize: 14, bold: false, allCaps: true, predictIcons: true });
/* The generator's inputs: step and unit per row (its min/max are LABEL_SPEC.limits). */
export const LABEL_STYLE_ROWS = Object.freeze([
  Object.freeze({ key: 'capMm', label: 'Text size', step: 0.5, unit: 'mm' }),
  Object.freeze({ key: 'depth', label: 'Text depth', step: 0.1, unit: 'mm' }),
  Object.freeze({ key: 'badgeSize', label: 'Icon size', step: 0.5, unit: 'mm' }),
]);

export const isLabelUnit = (u) => !!u && u.fill === 'decor';
/* ONE drawer order for every list of labels - the planner's labelOrder (top row first, left to right). */
export const labelOrder = (units) => units.slice().sort((a, b) => (a.y - b.y) || (a.x - b.x));
/* The build's effective style: the generator's defaults under whatever the build stored. */
export const effectiveStyle = (build, defaults = LABEL_STYLE_FALLBACK) => ({ ...defaults, ...(cleanLabelStyle(build && build.labelStyle) || {}) });

/* ---- the relay ------------------------------------------------------------------------------------------------- */

/* The label keys of one buildOptions post, CLEANED - a hand-made hash can boot this page with a 60-character label or a
   `buildId` of "../../x", and the planner would store neither; relaying them raw would leave the two ends disagreeing
   forever. `labels` names every decor unit ("" = no label); `labelBadges` only the labelled ones (null = absent = let the
   generator predict); `labelStyle` the cleaned style or null; `buildId` only when this build has a valid one. */
export function labelOptsOf(build) {
  const labels = {}, labelBadges = {};
  for (const u of (build && build.placed) || []) {
    if (!isLabelUnit(u)) continue;
    const t = cleanLabelText(u.label);
    labels[u.id] = t;
    if (t) labelBadges[u.id] = cleanLabelBadge(u.labelBadge);
  }
  return { buildId: cleanBuildId(build && build.buildId), labels, labelBadges, labelStyle: cleanLabelStyle(build && build.labelStyle) };
}

/* What an incoming buildOptions message would change about the labels. `mismatch` = the message names another build (both
   ends have an id and they differ) - the caller drops the WHOLE message then. A missing id on either side is a legacy or
   official-kit build and is accepted. */
export function labelOptsChanges(build, o) {
  const out = { mismatch: false, text: false, badge: false, style: false };
  if (!build || !o || typeof o !== 'object') return out;
  const mine = cleanBuildId(build.buildId), theirs = cleanBuildId(o.buildId);
  if (mine && theirs && mine !== theirs) { out.mismatch = true; return out; }
  const placed = build.placed || [];
  const textAfter = (u) => {
    const v = o.labels && typeof o.labels === 'object' ? o.labels[u.id] : undefined;
    return typeof v === 'string' ? cleanLabelText(v) : cleanLabelText(u.label);
  };
  if (o.labels && typeof o.labels === 'object') for (const u of placed) {
    if (!isLabelUnit(u) || typeof o.labels[u.id] !== 'string') continue;
    if (cleanLabelText(o.labels[u.id]) !== cleanLabelText(u.label)) out.text = true;
  }
  if (o.labelBadges && typeof o.labelBadges === 'object') for (const u of placed) {
    if (!isLabelUnit(u) || !(u.id in o.labelBadges)) continue;
    if (!textAfter(u)) continue;                       // a unit with no words carries no badge (the planner's rule)
    const v = o.labelBadges[u.id];
    const next = v === null ? null : cleanLabelBadge(v);
    if (v !== null && !next) continue;                 // hostile value: leave the stored badge alone
    if (JSON.stringify(next) !== JSON.stringify(cleanLabelBadge(u.labelBadge))) out.badge = true;
  }
  if ('labelStyle' in o &&
      JSON.stringify(cleanLabelStyle(o.labelStyle)) !== JSON.stringify(cleanLabelStyle(build.labelStyle))) out.style = true;
  return out;
}

/* Apply the label keys of an incoming buildOptions message to `build` (the planner's own rules: cleaned text, the badge
   dies with the words, a hostile badge leaves the stored one alone, the style replaced by its cleaned value). Returns the
   same booleans as labelOptsChanges; nothing is written on a mismatch. */
export function applyLabelOpts(build, o) {
  const ch = labelOptsChanges(build, o);
  if (ch.mismatch) return ch;
  const placed = build.placed || [];
  if (ch.text) for (const u of placed) {
    if (!isLabelUnit(u) || typeof o.labels[u.id] !== 'string') continue;
    const t = cleanLabelText(o.labels[u.id]);
    if (t) u.label = t; else { delete u.label; delete u.labelBadge; }
  }
  if (ch.badge) for (const u of placed) {
    if (!isLabelUnit(u) || !(u.id in o.labelBadges) || !cleanLabelText(u.label)) continue;
    const v = o.labelBadges[u.id];
    if (v === null) { delete u.labelBadge; continue; }
    const b = cleanLabelBadge(v);
    if (b) u.labelBadge = b;
  }
  if (ch.style) build.labelStyle = cleanLabelStyle(o.labelStyle);
  return ch;
}

/* A planner layout that differs from the current build ONLY in label words, badges, the label style and/or the build id.
   `layoutKey` is main.js's own echo guard, handed in (it is a const there and cannot be imported under node; the test
   passes the extracted real one) - never a second copy of it. Such a layout is applied by copying those fields
   (copyLabelFields) and refreshing the label meshes in place, because regenerate() deselects and would close the card the
   user is typing in - and because a layout that differs only in `buildId` (an official kit the planner just gave an id)
   must not deselect either. */
export function labelOnlyDiff(nb, cur, layoutKey) {
  if (!nb || !cur || !Array.isArray(nb.placed) || !Array.isArray(cur.placed)) return false;
  const strip = (b) => {
    const s = { ...b, placed: b.placed.map((u) => { const c = { ...u }; delete c.label; delete c.labelBadge; return c; }) };
    delete s.labelStyle; delete s.buildId;
    return s;
  };
  return layoutKey(nb) !== layoutKey(cur) && layoutKey(strip(nb)) === layoutKey(strip(cur));
}

/* Copy the label fields of a layout into the current build AS THE PLANNER HOLDS THEM (it is the source of truth and has
   already run its cleaners; re-cleaning here could reorder a badge's keys and leave layoutKey disagreeing for ever). Returns
   the ids of the units whose WORDS changed - the card shows "Changed in the planner" for the one it has open. */
export function copyLabelFields(nb, cur) {
  const changed = [];
  const src = new Map((nb.placed || []).map((u) => [u.id, u]));
  for (const u of cur.placed || []) {
    const s = src.get(u.id);
    if (!s) continue;
    const before = typeof u.label === 'string' ? u.label : '';
    if (typeof s.label === 'string' && s.label) u.label = s.label; else delete u.label;
    if (u.label && s.labelBadge && typeof s.labelBadge === 'object') u.labelBadge = JSON.parse(JSON.stringify(s.labelBadge));
    else delete u.labelBadge;
    if ((typeof u.label === 'string' ? u.label : '') !== before) changed.push(u.id);
  }
  cur.labelStyle = nb.labelStyle ?? null;
  if (typeof nb.buildId === 'string' && nb.buildId) cur.buildId = nb.buildId;
  return changed;
}

/* ---- the card's edits ------------------------------------------------------------------------------------------ */

/* One commit from the identify card: `patch.label` (the words, cleaned; empty deletes the words AND the badge) and/or
   `patch.labelBadge` (null = Auto, i.e. delete; a badge object = set when it cleans; only a unit WITH words takes one).
   Returns the unit's previous { label, labelBadge } for the card's Undo, or null when the unit is not a decor unit. */
export function editCommit(build, unitId, patch) {
  const u = ((build && build.placed) || []).find((p) => p.id === unitId);
  if (!isLabelUnit(u)) return null;
  const prev = { label: u.label, labelBadge: u.labelBadge == null ? undefined : JSON.parse(JSON.stringify(u.labelBadge)) };
  if (patch && 'label' in patch) {
    const t = cleanLabelText(patch.label);
    if (t) u.label = t; else { delete u.label; delete u.labelBadge; }
  }
  if (patch && 'labelBadge' in patch && cleanLabelText(u.label)) {
    if (patch.labelBadge === null) delete u.labelBadge;
    else { const b = cleanLabelBadge(patch.labelBadge); if (b) u.labelBadge = b; }
  }
  return prev;
}

/* A unit's two label fields as one comparable value - what the card's Undo slot remembers and checks. */
export const labelSnap = (u) => JSON.stringify([(u && u.label) ?? '', (u && u.labelBadge) ?? null]);

/* The card's 6-s Undo (release check 2026-10-03, Astra item 4). `slot` = { unitId, prev, after, buildId } recorded by a commit:
   `prev` is editCommit's return, `after` the unit's labelSnap right after the commit. Returns the patch that puts back ONLY the
   words and the badge (editCommit's two fields - nothing else on the unit or the build), or null when the Undo must not run:
     - the card is open on another drawer, or the slot is from another build (unit ids restart at 1 on every build);
     - the unit's words or badge are no longer what this commit left (a planner edit, a planner undo/redo, a Reset, a second
       edit by any path) - compare-and-swap, so the Undo can never write over a later change, whoever made it.
   The patch then goes through the ordinary commit path (one post, buildId first), so the planner stores it as one edit
   and one entry in its own history. */
export function labelUndoPatch(slot, build, openUnitId) {
  if (!slot || !build || slot.unitId !== openUnitId || slot.buildId !== (build.buildId || '')) return null;
  const u = (build.placed || []).find((p) => p.id === slot.unitId);
  if (!isLabelUnit(u) || labelSnap(u) !== slot.after) return null;
  const prev = slot.prev || {};
  return { label: prev.label ?? '', labelBadge: prev.labelBadge === undefined ? null : prev.labelBadge };
}

/* The planner answers a post naming another build with { gen2: 'buildRejected', buildId } (the stale pop-out, release check
   2026-10-03, Astra item 2). It concerns this page only when that id is this page's own: a late answer to a post made before
   a reconnect names the build this page has since left, and must not raise a "not saved" over a page that is in step. */
export const rejectionIsMine = (build, d) =>
  !!(build && d && typeof build.buildId === 'string' && build.buildId && d.buildId === build.buildId);

/* One Build-options row: store `value` under `key` in the build's style IF it survives cleanLabelStyle, else store nothing
   and report false (the row snaps back). Nothing is ever clamped. A value equal to the generator's default is still stored
   - the generator stores what its inputs hold, and null-vs-{capMm:5} would flip the echo guards for no visible change. */
export function styleEdit(build, key, value) {
  if (!build || !(key in LABEL_SPEC.limits) && !LABEL_SPEC.flags.includes(key)) return false;
  const cand = { ...(cleanLabelStyle(build.labelStyle) || {}), [key]: value };
  const cleaned = cleanLabelStyle(cand);
  if (!cleaned || !(key in cleaned)) return false;
  build.labelStyle = cleaned;
  return true;
}

/* ---- the badge, in words --------------------------------------------------------------------------------------- */

/* The icon picker's choices: exactly the vendored core's ICON_LIBRARY, so the card can never offer an icon the printed
   label lacks (test/edgelabel-core-vendor.test.mjs pins it). Null until the core has loaded. */
export function iconChoices(core) {
  return core && Array.isArray(core.ICON_LIBRARY) ? core.ICON_LIBRARY.map((i) => ({ id: i.id, name: i.name, svg: i.svg })) : null;
}

/* The three badge states as the card says them, so the words beside the button can never disagree with the geometry:
   ABSENT = Auto (the core's own guessIconId, under the style's predictIcons switch), { type: 'none' } = No icon (chosen),
   icon / letter = manual. A letter reads the way the LABEL prints it (upper-cased under allCaps, like prepareLabel); the
   picker's own input shows it as typed. `core` may be null before the font has loaded - then Auto names no icon yet. */
export function badgeStateText(text, badge, style, core) {
  const S = effectiveStyle({ labelStyle: style });
  const name = (id) => { const it = core && core.ICON_LIBRARY && core.ICON_LIBRARY.find((i) => i.id === id); return it ? it.name.toLowerCase() : id; };
  const b = cleanLabelBadge(badge);
  if (!b) {
    if (!S.predictIcons) return 'Auto · off';
    if (!core) return 'Auto';
    const id = core.guessIconId(cleanLabelText(text));
    return id ? `Auto · ${name(id)}` : 'Auto · none matched';
  }
  if (b.type === 'none') return 'No icon';
  if (b.type === 'icon') return `Manual · ${name(b.value)}`;
  return `Letter · ${S.allCaps ? b.value.toUpperCase() : b.value}`;
}

/* The badge the label is actually wearing (for the button's face): the manual one, or the predicted one under Auto. */
export function shownBadge(text, badge, style, core) {
  const b = cleanLabelBadge(badge);
  if (b) return b;
  const S = effectiveStyle({ labelStyle: style });
  const id = S.predictIcons && core ? core.guessIconId(cleanLabelText(text)) : null;
  return id ? { type: 'icon', value: id, predicted: true } : { type: 'none', predicted: true };
}

/* ---- the keyboard ---------------------------------------------------------------------------------------------- */

/* Which history command a keydown is: 'undo' (Ctrl/Cmd+Z), 'redo' (Ctrl/Cmd+Y, Ctrl/Cmd+Shift+Z) or null. main.js keeps the
   browser's own text-undo away from saved label words with it (review D2, 2026-10-03). `code` covers layouts whose Z/Y key
   reports another `key` (the browser's own undo binding follows the physical key there too); Alt+ combos are left alone. */
export function historyKeyOf(e) {
  if (!e || !(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const k = typeof e.key === 'string' && e.key.length === 1 && /[a-z]/i.test(e.key) ? e.key.toLowerCase()
    : (e.code === 'KeyZ' ? 'z' : e.code === 'KeyY' ? 'y' : '');
  if (k === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (k === 'y' && !e.shiftKey) return 'redo';
  return null;
}
