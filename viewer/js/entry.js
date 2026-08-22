/* ENTRY ROUTING — which door the visitor came in by, as a PURE function.
 *
 * This lived inline in main.js as a run of interdependent `const`s. That made
 * the single most consequential branch in the app - the one every printed kit
 * link, every planner hand-off and every product-page embed takes - reachable
 * only by loading the whole WebGL viewer in a browser and looking. It was
 * therefore the one path with no test coverage at all, which is how two
 * separate boot bugs shipped: `?build=` (present but empty) silently fell
 * through to the static demo instead of the 404 card, and a root kit whose
 * generateManifest threw hung the spinner forever with no message.
 *
 * Nothing here touches the DOM, `location`, or the network, so node can test
 * every combination. main.js imports the result and keeps its original names.
 *
 * PRECEDENCE, highest first:
 *   1. part preview   ?part=<slug>&mode=preview   (the MODULITH iframe)
 *   2. #build=<b64>   the planner hand-off        (wins over any query)
 *   3. ?build=<id>    a named official kit
 *   4. ?kit=<name>    a hand-authored static kit
 *   5. bare root      the current recommended starter
 */

/* The kit the BARE ROOT opens. 185 is deliberate: with 165 it is one of only
 * two collections that generate with ZERO runtime warnings (115/240/270 each
 * report "hardware positions are scaled from the 185 calibration"), which is
 * not a sentence the front door should say.
 * ⚠ Changing this changes what `/` opens for everyone, immediately and by
 * design - the root does not pin itself into the address bar, precisely so
 * that moving this constant REACHES people. Anyone needing a link to one exact
 * kit uses ?build=<id> (the cover's "Copy link to this kit"). */
export const ROOT_BUILD = '185-tabletop-2w2h';

export const DEFAULT_KIT = 'tabletop-185';

/** Parse &plate=<W>x<D>, the true-scale build plate. Returns null unless both
 *  dimensions are present and inside 50-1000 mm; a bad value must fall back to
 *  the ordinary turntable preview, never to a plate of nonsense size. */
export function parsePlate(raw) {
  const m = String(raw == null ? '' : raw).match(/^(\d{2,4})[xX](\d{2,4})$/);
  if (!m) return null;
  const w = +m[1], d = +m[2];
  return (w >= 50 && w <= 1000 && d >= 50 && d <= 1000) ? { w, d } : null;
}

/**
 * @param {string} search  location.search
 * @param {string} hash    location.hash
 */
export function resolveEntry(search = '', hash = '') {
  const QS = new URLSearchParams(search);

  // the planner hand-off, matched out of the hash rather than parsed as a query
  const buildHash = (hash || '').match(/build=([^&]+)/);

  const partSlug = QS.get('part');
  const isPart = QS.get('mode') === 'preview' && !!partSlug;

  /* ?embed=1 only means anything WITH a hash build - the docked planner view.
     ⚠ Gated on !isPart so the MODES ARE MUTUALLY EXCLUSIVE. Ungated (as this
     was), a URL carrying part+mode=preview AND a build hash produced isPart
     AND isEmbed together, which the precedence order says is impossible -
     part preview wins over everything. No producer mints that hybrid, but two
     "modes" both true is the kind of thing that reads as a coin-flip later
     rather than a decision. */
  const isEmbed = !isPart && QS.has('embed') && !!buildHash;

  /* ⚠ ROOT IS TESTED BY PRESENCE, NEVER BY TRUTHINESS. `?kit=` with an empty
     value is still an explicit request for the static path, and `?build=` with
     an empty value is still someone asking for a kit by name; reading either
     as "nothing was asked for" hands them the front door instead of an error. */
  const isRoot = !isPart && !buildHash && !QS.has('build') && !QS.has('kit');

  const officialId = !buildHash ? QS.get('build') : null;

  /* ⚠ WHETHER THE OFFICIAL BRANCH RUNS IS A SEPARATE FACT FROM WHAT IT LOADS.
     Branching on the target string sends `?build=` (present, empty) down the
     static path, so a visitor who named a kit silently gets the demo. */
  const wantsOfficial = !isPart && !buildHash && (QS.has('build') || isRoot);

  // '' rather than null, so the id regex in main.js rejects it and it fails as
  // a bad kit id (the visible 404 card) instead of resolving to anything
  const officialTarget = officialId || (isRoot ? ROOT_BUILD : '');

  return {
    QS,
    buildHash,
    kit: QS.get('kit') || DEFAULT_KIT,
    partSlug,
    isPart,
    partRid: QS.get('rid') || '',
    /* ⚠ REQUESTED and PARSED are separate facts, and main.js needs both. A
       `plate=` that does not parse is a HARD FAILURE there (the site keeps its
       poster) rather than a silent fall-through to the ordinary turntable
       preview - so "no plate asked for" and "a plate asked for in a size we
       refuse" must stay distinguishable. Collapsing them to `partPlate: null`
       turns a typo in a printer profile into a product view that looks fine
       and answers the wrong question. */
    plateRequested: isPart && QS.has('plate'),
    partPlate: isPart && QS.has('plate') ? parsePlate(QS.get('plate')) : null,
    isEmbed,
    isRoot,
    officialId,
    wantsOfficial,
    officialTarget,
  };
}
