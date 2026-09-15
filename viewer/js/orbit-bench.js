/* THE ORBIT BENCHMARK - `?bench=orbit` (Joey relaying Astra, 2026-09-14).
 *
 * One fixed workload that any device can run with no developer tools, so the support floor can be chosen from
 * real hardware instead of from a throttled laptop: the 80-unit build (1,268 parts), a 10-second warm-up, then a
 * 30-second scripted camera orbit at a locked quality tier, with the automatic resolution drop and the automatic
 * downgrade held off. The result names the tier, PASS or FAIL against the provisional target (30 fps average on
 * Balanced, decisions.md), and the numbers behind it, with a copy button.
 *
 * ⚠ IT MEASURES THE REAL VIEWER. The scene, materials, labels and passes are the shipped ones; this module only
 * drives the camera, holds the tier, and times the frames the viewer's own loop draws. A private scene would be a
 * second renderer whose numbers describe itself.
 * ⚠ THE CAMERA PATH IS A FUNCTION OF TIME, NOT OF FRAMES. A slow device draws fewer frames of the same orbit, never
 * a shorter orbit, so every device renders the same views. And the distance fits the whole build into BOTH fields
 * of view, so a portrait phone does not frustum-cull half the parts and report a lighter workload as a faster one.
 * ⚠ THE WORKLOAD IS PINNED BY test/orbit-bench.test.mjs (the build's composition, part by part). A generator change
 * that alters it fails there first, because results from two different workloads do not compare.
 * ⚠ Not in this module: anything that can change between devices silently. What does change - canvas size, pixel
 * ratio, GPU, browser - is recorded in every result, labelled best-effort where the browser only hints.
 *
 * Pure functions (benchBuild, orbitPose, summarizeFrames, measureRun, median, formatFps, atBrowserLimit, judgeRun and the
 * series functions) are exported for node; createOrbitBench is the browser half, verified in a real browser by
 * integration/scripts/p33 (a run) and p34 (the series).
 */

export const BENCH_PROTOCOL = 1;          // bump when the workload, the path or the statistics change
export const WARMUP_MS = 10000;
export const MEASURE_MS = 30000;
export const TARGET_FPS = 30;             // provisional (decisions.md, "What frame rate must the 3D viewer hold")
export const WINDOW_MS = 2000;            // the "worst sustained" window
export const PAUSE_MS = 500;              // an interval this long is reported as a pause (a hitch, a GC, a hidden tab)
export const ORBIT_PERIOD_S = 24;         // one revolution: 15 degrees a second
export const ORBIT_POLAR_DEG = 68;        // from straight up - a three-quarter view from above
export const ORBIT_FIT = 1.1;             // the fitted sphere's radius, in bounding radii: a 10% margin
export const BENCH_FOV = 40;
export const BENCH_TIERS = ['veryhigh', 'high', 'balanced', 'fast'];
const TIER_LABEL = { veryhigh: 'Very High', high: 'High', balanced: 'Balanced', fast: 'Fast' };

/** The 80-unit standard benchmark build: 16 columns x 5 rows of 1W-1H decor drawers on the 185 collection, Essential
 *  plates with Deco handles, magnet closures and back covers - the build every 2026-09-14 measurement used. */
export function benchBuild() {
  const cols = 16, rows = 5, placed = [];
  let id = 1;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
    placed.push({ id: id++, x: c, y: 2 * (rows - 1 - r), w: 1, hh: 2, fill: 'decor', shelves: 0, closure: 'magnet' });
  return {
    mount: 'tabletop', length: 185, printer: 'any', customBed: { x: null, y: null }, spaceW: null, spaceH: null,
    faceStyle: 'essential', doorStyle: 'essential', handleStyle: 'deco', wallStagger: false, backCover: true,
    buildPlate: 'powder', removedStoppers: [], gridW: cols, gridH: rows, placed, nextId: id,
  };
}

/** Camera placement t seconds into the run: azimuth turns at a constant rate, polar and fit stay fixed.
 *  Returns spherical angles (radians) and the distance for a view that fits `radius` into the narrower field. */
export function orbitPose(t, { radius, fovDeg = BENCH_FOV, aspect = 16 / 9 } = {}) {
  const azimuth = (2 * Math.PI * t) / ORBIT_PERIOD_S;
  const polar = (ORBIT_POLAR_DEG * Math.PI) / 180;
  const vFov = (fovDeg * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const distance = (ORBIT_FIT * radius) / Math.sin(Math.min(vFov, hFov) / 2);
  return { azimuth, polar, distance };
}

/**
 * The statistics, from the animation-frame timestamps (ms) the viewer drew inside the measured window.
 *   meanFps            frames per second over the window: intervals / (their total / 1000) - i.e. 1000 / the mean
 *                      interval. The PASS rule uses this one.
 *   avgFrameMs         the mean interval.
 *   onePercentLowFps   1000 / the mean of the slowest 1% of intervals (at least one interval).
 *   worst2sFps         the fewest frames completed in any 2-second span that starts at a drawn frame and ends inside
 *                      the window, divided by 2. A stall longer than 2 s reads 0.
 *   medianFrameMs, p95FrameMs, maxFrameMs, pauses (intervals of 500 ms or more).
 * Refuses (returns { error }) with fewer than two intervals, rather than inventing a number.
 */
export function summarizeFrames(times, { targetFps = TARGET_FPS, windowMs = WINDOW_MS } = {}) {
  const t = Array.from(times || []).filter((v) => Number.isFinite(v));
  for (let i = 1; i < t.length; i++) if (t[i] < t[i - 1]) return { error: 'timestamps out of order' };
  if (t.length < 3) return { error: 'too few frames to measure' };
  const iv = [];
  for (let i = 1; i < t.length; i++) iv.push(t[i] - t[i - 1]);
  const total = iv.reduce((s, v) => s + v, 0);
  if (!(total > 0)) return { error: 'no time elapsed' };
  const sorted = [...iv].sort((a, b) => a - b);
  const medianFrameMs = median(sorted);
  const slowCount = Math.max(1, Math.ceil(iv.length * 0.01));
  const slowest = sorted.slice(sorted.length - slowCount);
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
  let worst = null, j = 0;
  const last = t[t.length - 1];
  for (let i = 0; i < t.length && t[i] + windowMs <= last; i++) {
    if (j < i) j = i;
    while (j + 1 < t.length && t[j + 1] <= t[i] + windowMs) j++;
    const fps = (j - i) / (windowMs / 1000);
    if (worst === null || fps < worst) worst = fps;
  }
  const meanFps = iv.length / (total / 1000);
  return {
    frames: t.length,
    durationMs: total,
    meanFps,
    avgFrameMs: total / iv.length,
    onePercentLowFps: 1000 / (slowest.reduce((s, v) => s + v, 0) / slowest.length),
    worst2sFps: worst,
    medianFrameMs,
    p95FrameMs: pct(0.95),
    maxFrameMs: sorted[sorted.length - 1],
    pauses: iv.filter((v) => v >= PAUSE_MS).length,
    targetFps,
    pass: meanFps >= targetFps,
  };
}

/** The measured frames as a result keeps them - ms from the first, to 0.01 ms - and the statistics OF THAT LIST. A run is
 *  judged on what it stores (review 01a0a567, second turn): judged on the raw timestamps, a run within about 0.00001 fps of
 *  the target could re-derive from its own frame times to the other verdict. */
export function measureRun(times) {
  const t = Array.from(times || []);
  const t0 = t.length ? t[0] : 0;
  const frameTimesMs = t.map((v) => Math.round((v - t0) * 100) / 100);
  return { frameTimesMs, stats: summarizeFrames(frameTimesMs) };
}

const r1 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);

/** The median: the mean of the two middle values when the count is even (review 01a0a37b: `list[length >> 1]` is the
 *  upper middle, and it was used for two "medians" here). */
export function median(values) {
  const s = Array.from(values || []).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** An fps figure as the result card shows it: one decimal, except that a value just below the target never rounds up to
 *  it - 29.96 reads "29.96", not a "30.0" printed beside FAIL. */
export function formatFps(v, targetFps = TARGET_FPS) {
  if (v == null || !Number.isFinite(v)) return '-';
  if (v < targetFps && Math.round(v * 10) / 10 >= targetFps) return (Math.floor(v * 100) / 100).toFixed(2);
  return String(Math.round(v * 10) / 10);
}

/* THE BROWSER'S OWN FRAME RATE - read with the viewer's loop stopped, before the run and again after it. PROTOCOL 1 FIXES
   THESE THREE NUMBERS BEFORE ANY DEVICE RUN (review 01a0a37b: the 90% rule was chosen while this module was being built,
   so it is written down here and in the vault ahead of the data it will judge, and a change to it bumps BENCH_PROTOCOL).
   ⚠ An at-rest reading can be LOWER than what the page gets while it animates - a display with adaptive refresh may slow
   down for a still canvas - so an average more than 5% above it means the reading was not the limit, and nothing is
   claimed. */
export const LIMIT_SHARE = 0.9;     // "at the limit": the average reached 90% of the browser's own rate...
export const LIMIT_OVER = 1.05;     // ...and did not exceed it by more than 5%
export const LIMIT_DRIFT = 0.1;     // the before and after readings may differ by 10%; more voids the run
export function atBrowserLimit(meanFps, browserHz) {
  return Number.isFinite(meanFps) && Number.isFinite(browserHz) && browserHz > 0
    && meanFps >= LIMIT_SHARE * browserHz && meanFps <= LIMIT_OVER * browserHz;
}

/**
 * Whether a run counts, and what its card must say - pure, so every rule is tested in node (test/orbit-bench.test.mjs).
 * The first reason found wins, in this order: what the page saw happen (a hidden tab, a lost context, a moving build),
 * the statistics' own refusal, a changed tier, pixel ratio or canvas, a pause, a changed browser frame rate.
 * ⚠ A PAUSE VOIDS THE RUN (review 01a0a37b, reversing this module's first version, which only flagged it). An interval of
 * half a second is what a slow device's worst hitch looks like, and also what a page the browser still calls visible
 * looks like while something stops its frames - the first p33 run brought a second tab to the front under CDP's focus
 * emulation, the page never reported itself hidden, and two such intervals landed in a result marked valid. Inside the
 * page the two cannot be told apart, and a spoiled run must not be reported as a result, so it is not valid - but its
 * numbers stay on the card, because if the pauses come back on an untouched page they are the device's own.
 * 500 ms is the viewer's own pause cut (its automatic downgrade counts single intervals over 500 ms as pauses; decisions
 * .md, 2026-09-14), not a value chosen from this data. The one exception is a device whose MEDIAN frame is that long: its
 * pauses are its ordinary frames, and it fails on its average anyway.
 */
export function judgeRun({ stats, spoiled = null, tierCount = 1, pixelRatioCount = 1, bufferSizeCount = 1, browserHz = null, browserHzAfter = null }) {
  let invalid = spoiled || stats.error
    || (tierCount !== 1 ? 'the quality tier changed during the run' : null)
    || (pixelRatioCount > 1 ? 'the pixel ratio changed during the run' : null)
    || (bufferSizeCount > 1 ? 'the window was resized during the run' : null);
  let kind = invalid ? 'spoiled' : null;
  const n = stats.pauses || 0;
  if (!invalid && n > 0 && stats.medianFrameMs < PAUSE_MS) {
    invalid = `${n} ${n === 1 ? 'pause' : 'pauses'} of half a second or more during the run`;
    kind = 'pauses';
  }
  if (!invalid && Number.isFinite(browserHz) && Number.isFinite(browserHzAfter) && Math.abs(browserHzAfter - browserHz) > LIMIT_DRIFT * browserHz) {
    invalid = `the browser's own frame rate changed during the run (${r1(browserHz)} to ${r1(browserHzAfter)} frames a second)`;
    kind = 'spoiled';
  }
  const limited = !invalid && atBrowserLimit(stats.meanFps, browserHz);
  const notes = [];
  if (kind === 'pauses') notes.push('If the page was in front and untouched, the pauses are this device\'s own - the numbers above are kept for that case.');
  if (!invalid && n > 0) notes.push(`Every frame took half a second or more (median ${r1(stats.medianFrameMs)} ms), so its ${n} long intervals are this device's ordinary frames, not pauses.`);
  if (limited) notes.push(`The average came within 10% of this browser's own limit of ${r1(browserHz)} frames a second (set by the screen, the browser or a battery saver), so this device may be faster than the result shows.`);
  return { valid: !invalid, invalidReason: invalid || null, kind, limited, notes };
}

export const DEFINITIONS = {
  meanFps: 'frames per second over the 30 s window: intervals / (their total / 1000). PASS is this >= the target.',
  avgFrameMs: 'the mean interval between drawn frames (1000 / meanFps)',
  onePercentLowFps: '1000 / the mean of the slowest 1% of intervals (at least one)',
  worst2sFps: 'the fewest frames drawn in any 2-second span that starts at a drawn frame, / 2; a stall over 2 s reads 0',
  medianFrameMs: 'the median interval (the mean of the two middle ones for an even count)',
  p95FrameMs: 'the 95th-percentile interval, nearest rank',
  pauses: 'intervals of 500 ms or more (the viewer\'s own pause cut); any makes the run not valid, unless the median interval is itself 500 ms or more',
  browserFrameRateHz: "the browser's own animation-frame rate with the viewer's loop stopped: 1000 / the median of 44 intervals, read before the run (browserFrameRateHzAfter: after it). More than 10% apart makes the run not valid.",
  atBrowserLimit: 'the average is at least 90% and at most 105% of browserFrameRateHz: the device may be faster than the result',
  drawCalls: "draw calls of each measured frame's last scene render, as { calls: frames }; drawCallsMedian is their median",
  frameTimesMs: 'every measured frame\'s timestamp, ms from the first, to 0.01 ms - the list the run was judged on: summarizeFrames() of it gives back the timing block and the verdict exactly',
  protocol: 'BENCH_PROTOCOL: the workload, the orbit, these statistics and these thresholds. Compare results of one protocol, one tier, one stage and one orientation.',
  series: 'SERIES_POLICY: a device passes a tier when 3 valid runs - each on its own page load, in one tab, with the same series policy, protocol, viewer, tier, stage, orientation and pixel ratio, and a drawing buffer within 10% of the first run\'s pixel count and aspect - ALL average the target or better. meanFps is the mean of the 3 runs\' averages; worstRun is the run with the lowest average. Not-valid runs are not counted but are listed in voided, with their page size, whatever it was. An unfinished series that a valid run on another page size replaced is listed in superseded (its runs\' verdicts and averages, and its not-valid runs). Each counted run keeps its frame times, so the series can be re-derived.',
};

/* ================================================================================================ the series */
/* ⚠ ONE RUN IS NOT A DEVICE RESULT (Joey relaying Astra, 2026-09-15): "3 valid runs per device/tier, reload between runs,
   all 3 must meet the 30 fps floor; report mean and worst run". A series is the valid runs of one tab for one protocol,
   viewer version, tier, stage, orientation and pixel ratio - a change to any of them is a different workload, so it starts
   a series of its own. A page load makes at most one run and "Run again" reloads, so the reload between runs is built in.
   A complete series is final: the next run starts a new series rather than sliding the window, because a window that
   keeps the latest three would let a failed run be re-run away.
   Review 01a0a567 (Terra) added three rules: the pixel workload must match (a window resized between runs is another
   workload, so it starts a new series - within 10% of the first run's drawing-buffer pixel count and aspect, so a phone's
   address bar settling differently between loads does not reset it), every run keeps its frame times (the series is
   re-derivable, not just its last run), and a not-valid run is listed rather than silently dropped. Its second turn added
   the fourth: a series that a page-size change replaces before it is complete is not dropped either - it is kept, compact,
   in the series that replaced it, so a failed run cannot leave the record by way of a resized window. */
export const SERIES_POLICY = 1;           // bump when the series rule changes
export const SERIES_RUNS = 3;
export const SERIES_SIZE_TOLERANCE = 0.1; // a run joins a series if its drawing buffer's pixels and aspect are within 10% of the first run's
export function seriesKey(res) {
  return [SERIES_POLICY, res.protocol, res.viewer, res.tier, res.stage, res.viewport.orientation, res.resolution.pixelRatio.join('/')].join('|');
}
// what a series keeps of a valid run: its verdict, its headline numbers, what judged it valid, and its frame times
export function seriesEntry(res) {
  const T = res.timing;
  return { when: res.when, pass: res.verdict.pass, meanFps: res.verdict.meanFpsExact, onePercentLowFps: T.onePercentLowFps,
    worst2sFps: T.worst2sFps, avgFrameMs: T.avgFrameMs, pauses: T.pauses, canvasCssPx: res.resolution.canvasCssPx,
    bufferPx: res.resolution.drawingBufferPx, browserFrameRateHz: res.browserFrameRateHz, browserFrameRateHzAfter: res.browserFrameRateHzAfter,
    frameTimesMs: res.frameTimesMs };
}
// the same pixel workload: drawing-buffer pixel count and aspect each within the tolerance of the first run's
export function sameCanvas(a, b, tol = SERIES_SIZE_TOLERANCE) {
  const [aw, ah] = Array.isArray(a) ? a : [], [bw, bh] = Array.isArray(b) ? b : [];
  if (!(aw > 0 && ah > 0 && bw > 0 && bh > 0)) return false;
  return Math.abs(bw * bh - aw * ah) <= tol * aw * ah && Math.abs(bw / bh - aw / ah) <= tol * (aw / ah);
}
// a stored series: { runs, voided, superseded }; anything else read back from storage is an empty one
export function normalizeSeries(rec) {
  if (!rec || !Array.isArray(rec.runs)) return { runs: [], voided: [], superseded: [] };
  return { runs: rec.runs, voided: Array.isArray(rec.voided) ? rec.voided : [], superseded: Array.isArray(rec.superseded) ? rec.superseded : [] };
}
/* A run counts toward the floor by its own verdict (pass = its exact average >= the target), so a 29.996 average that the
   card shows as 29.99 cannot pass in the series either. pass is null while the series is incomplete and every run so far
   meets the floor, false as soon as one does not (it can no longer pass), and settled once the series is complete. */
export function judgeSeries(runs, { need = SERIES_RUNS } = {}) {
  const counted = (runs || []).slice(0, need);
  const out = { need, count: counted.length, complete: counted.length >= need, runsAtTarget: 0, pass: null, meanFps: null, worstRun: null };
  if (!counted.length) return out;
  out.runsAtTarget = counted.filter((r) => r.pass === true).length;
  out.meanFps = counted.reduce((s, r) => s + r.meanFps, 0) / counted.length;
  out.worstRun = counted.reduce((w, r) => (r.meanFps < w.meanFps ? r : w));
  if (out.runsAtTarget < counted.length) out.pass = false;
  else if (out.complete) out.pass = true;
  return out;
}
/* Which series the next run belongs to. A series is the runs of one tab, in order, from the first run after the last
   complete one (review 01a0a567, both turns):
   - after a COMPLETE series, any run - valid or not - opens a new one ('complete'): the finished series was reported whole,
     on the card that completed it;
   - a VALID run on another pixel workload (a drawing buffer not within the tolerance of the series' first run) opens a new
     one ('canvas'), and the unfinished series it replaces goes into the new one's `superseded`, compact - its runs' verdicts
     and averages and its not-valid runs - so the report of the new series still shows it, a failed run included;
   - a NOT-VALID run never opens one: `voided` is the record of what happened while the series was open, whatever the page
     size (a run voided for a resize ends at the new size, so its size cannot say which workload it was), and each item
     carries its size.
   `entry` is the valid run being placed, or null for a not-valid one. */
function seriesFor(rec, need, entry) {
  const cur = normalizeSeries(rec);
  if (judgeSeries(cur.runs, { need }).complete) return { cur: { runs: [], voided: [], superseded: [] }, restarted: 'complete' };
  if (entry && cur.runs.length && !sameCanvas(cur.runs[0].bufferPx, entry.bufferPx)) {
    const left = { bufferPx: cur.runs[0].bufferPx, runs: cur.runs.map((r) => ({ when: r.when, pass: r.pass, meanFps: r.meanFps })), voided: cur.voided };
    return { cur: { runs: [], voided: [], superseded: [...cur.superseded, left] }, restarted: 'canvas' };
  }
  return { cur, restarted: null };
}
// the series to store after a valid run, and why it restarted (null, 'complete' or 'canvas')
export function addToSeries(rec, entry, { need = SERIES_RUNS } = {}) {
  const { cur, restarted } = seriesFor(rec, need, entry);
  return { runs: [...cur.runs, entry], voided: cur.voided, superseded: cur.superseded, restarted };
}
// the series to store after a not-valid run: listed with its reason and size, so a report cannot leave it out
export function addVoided(rec, item, { need = SERIES_RUNS } = {}) {
  const { cur, restarted } = seriesFor(rec, need, null);
  return { runs: cur.runs, voided: [...cur.voided, item], superseded: cur.superseded, restarted };
}

/* ================================================================================================ the browser half */
/**
 * @param api  what main.js lends: THREE, camera, controls, renderer, goTo(i, opts), stepCount(), tweenCount(),
 *             applyQuality(name), applyStageTheme(name), quality(), stage(), setHold(on), pauseLoop(on), closePanel(),
 *             bounds() -> { center, radius }, instanceCount(), version
 */
export function createOrbitBench(api) {
  const params = new URLSearchParams(location.search);
  const state = {
    phase: 'idle',                      // idle -> preparing -> warmup -> measure -> closing -> done
    tier: BENCH_TIERS.includes(params.get('tier')) ? params.get('tier') : 'balanced',
    stage: params.get('stage') === 'light' ? 'light' : 'dark',
    startAt: 0, measureAt: 0, times: [], calls: [], dprs: new Set(), tiers: new Set(), sizes: new Set(),
    invalid: null, browserHz: null, browserHzAfter: null, wake: null, result: null, judged: null,
  };
  const el = {};
  /* the series (SERIES_POLICY) lives in sessionStorage: it survives "Run again" (a reload) within this tab, and a tab closed
     or opened later starts clean. A private window or blocked storage throws - the run still reports, the series cannot. */
  const SERIES_STORE = 'gen2-orbit-bench-series';
  const readSeries = () => { try { const v = JSON.parse(sessionStorage.getItem(SERIES_STORE) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } };
  const writeSeries = (all) => { try { sessionStorage.setItem(SERIES_STORE, JSON.stringify(all)); return true; } catch (e) { return false; } };

  /* ---------------------------------------------------------------- the page */
  const style = document.createElement('style');
  style.textContent = `
    body.orbit-bench #topbar, body.orbit-bench #note-panel, body.orbit-bench #checklist-tab, body.orbit-bench #checklist-panel,
    body.orbit-bench #identify-card, body.orbit-bench #filament-menu, body.orbit-bench #outro-overlay, body.orbit-bench #cover-overlay,
    body.orbit-bench #cover-bg, body.orbit-bench #tap-hint, body.orbit-bench #embed-begin, body.orbit-bench #incomplete-status,
    body.orbit-bench #embed-hint, body.orbit-bench #controls, body.orbit-bench #measure-toggle, body.orbit-bench #measure-label,
    body.orbit-bench #color-toggle, body.orbit-bench #pointer-line { display: none !important; }
    .ob-card { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 60; box-sizing: border-box;
      width: min(460px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto; padding: 20px 22px;
      background: var(--panel, rgba(255,255,255,.92)); color: var(--ink, #23262b); border: 1px solid var(--panel-border, #e3e5e9);
      border-radius: 14px; box-shadow: 0 12px 40px rgba(0,0,0,.25); backdrop-filter: blur(10px);
      font: 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .ob-card h2 { margin: 0 0 6px; font-size: 18px; }
    .ob-card p { margin: 6px 0; color: var(--ink-soft, #5b6069); }
    .ob-row { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 4px; align-items: center; }
    .ob-row > span { min-width: 64px; font-weight: 600; }
    .ob-seg { border: 1px solid var(--panel-border, #e3e5e9); background: transparent; color: inherit; border-radius: 8px;
      padding: 6px 10px; font: inherit; font-weight: 600; cursor: pointer; }
    .ob-seg[aria-pressed="true"] { background: var(--accent, #ff8a40); border-color: var(--accent, #ff8a40); color: #fff; }
    .ob-go { margin-top: 14px; width: 100%; border: 0; border-radius: 8px; padding: 11px 14px; font: inherit; font-weight: 700;
      background: var(--accent, #ff8a40); color: #fff; cursor: pointer; }
    .ob-ghost { background: transparent; color: inherit; border: 1px solid var(--panel-border, #e3e5e9); }
    .ob-pill { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 60; padding: 8px 14px; border-radius: 999px;
      background: var(--panel, rgba(255,255,255,.92)); color: var(--ink, #23262b); border: 1px solid var(--panel-border, #e3e5e9);
      font: 600 13px/1.2 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; white-space: nowrap; }
    .ob-verdict { font-size: 24px; font-weight: 800; margin: 2px 0; }
    .ob-runline { font-size: 16px; font-weight: 700; margin: 10px 0 2px; }
    .ob-card p.ob-series { font-size: 13px; color: inherit; border: 1px solid var(--panel-border, #e3e5e9); border-radius: 8px; padding: 7px 10px; }
    .ob-pass { color: #1a9e5c; } .ob-fail { color: #d6453d; } .ob-void { color: var(--ink-soft, #5b6069); }
    .ob-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 14px; margin: 12px 0; }
    .ob-grid b { display: block; font-size: 18px; } .ob-grid small { color: var(--ink-soft, #5b6069); }
    .ob-detail { font-size: 12px; color: var(--ink-soft, #5b6069); word-break: break-word; }
    .ob-card p.ob-note { font-size: 13px; color: inherit; background: rgba(255, 170, 0, .16); border-radius: 8px; padding: 7px 10px; }
    .ob-buttons { display: flex; gap: 8px; } .ob-buttons .ob-go { margin-top: 10px; }
    .ob-copy { width: 100%; box-sizing: border-box; min-height: 120px; margin-top: 10px; font: 12px/1.35 ui-monospace, Consolas, monospace; }
  `;
  document.head.appendChild(style);
  document.body.classList.add('orbit-bench');

  function segRow(label, values, current, onPick) {
    const row = document.createElement('div');
    row.className = 'ob-row';
    const name = document.createElement('span');
    name.textContent = label;
    row.appendChild(name);
    for (const v of values) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'ob-seg'; b.textContent = v.label; b.setAttribute('aria-pressed', String(v.value === current));
      b.onclick = () => { for (const x of row.querySelectorAll('.ob-seg')) x.setAttribute('aria-pressed', String(x === b)); onPick(v.value); };
      row.appendChild(b);
    }
    return row;
  }

  function startCard() {
    const card = document.createElement('div');
    card.className = 'ob-card'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'Viewer benchmark');
    card.innerHTML = `<h2>Viewer benchmark</h2>
      <p>The same test on any device: the 80-unit build (${api.instanceCount().toLocaleString()} parts), a ${WARMUP_MS / 1000}-second warm-up, then a ${MEASURE_MS / 1000}-second camera orbit.</p>
      <p>Keep this tab in front and leave the page alone until the result appears.</p>`;
    card.appendChild(segRow('Quality', BENCH_TIERS.map((v) => ({ value: v, label: TIER_LABEL[v] })), state.tier, (v) => { state.tier = v; }));
    card.appendChild(segRow('Stage', [{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }], state.stage, (v) => { state.stage = v; }));
    const note = document.createElement('p');
    note.textContent = `Pass: ${TARGET_FPS} fps average or better (provisional target).`;
    card.appendChild(note);
    const go = document.createElement('button');
    go.type = 'button'; go.className = 'ob-go'; go.textContent = 'Start';
    go.onclick = () => start();
    card.appendChild(go);
    document.body.appendChild(card);
    el.card = card;
  }

  /* ---------------------------------------------------------------- the run */
  const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
  /* ⚠ WITH THE VIEWER'S LOOP STOPPED. A first version timed idle frames with the loop running and called that the refresh
     rate; on the 80-unit build a still frame costs about what a moving one does, and it read 103 Hz on a 120 Hz display.
     What the benchmark needs is the ceiling the browser imposes - a 60 Hz screen, or 30 in a battery saver - so the
     canvas holds its last frame for these ~45 animation frames and nothing else runs in them. Read before the run and
     again after it: a battery saver that switches on mid-run is otherwise invisible (judgeRun). */
  async function browserCadence(frames = 45) {
    api.pauseLoop(true);
    try {
      const ts = [];
      for (let i = 0; i < frames; i++) ts.push(await nextFrame());
      const mid = median(ts.slice(1).map((v, i) => v - ts[i]));
      return mid > 0 ? 1000 / mid : null;
    } finally { api.pauseLoop(false); }
  }

  async function start() {
    if (state.phase !== 'idle') return;
    state.phase = 'preparing';
    if (el.card) el.card.remove();
    showPill('Preparing');
    api.setHold(true);                   // no resolution drop, no automatic tier change, for the rest of this page
    api.applyStageTheme(state.stage);
    api.applyQuality(state.tier);
    api.goTo(api.stepCount(), { animate: false });   // the finished build
    /* ⚠ AND ITS PARTS PANEL SHUT, NOT MERELY HIDDEN. The final step opens the panel; this page's CSS hides it, and the
       dimension labels keep clear of an open panel by reading its left edge - which a hidden panel reports as 0, so every
       label was pinned to the screen's left edge for the whole first verification run (p33). Shut, the labels are placed
       on their lines as on a phone or a desktop with the panel closed. */
    api.closePanel();
    for (let i = 0; i < 600 && api.tweenCount() > 0; i++) await nextFrame();
    for (let i = 0; i < 30; i++) await nextFrame();   // shader compiles after the tier and stage change
    api.controls.enabled = false;        // a stray touch must not bend the path
    /* nor select a part: a tap would light it up and slide its drawer open, which is a different workload (main.js
       ignores the arrow keys on this page for the same reason) */
    api.renderer.domElement.style.pointerEvents = 'none';
    /* a phone that dims its screen 15 or 30 seconds in hides the tab and voids a 40-second run; best effort - the API
       needs a secure context and not every browser has it, and the result says whether it was held */
    try { if (navigator.wakeLock) state.wake = await navigator.wakeLock.request('screen'); } catch (e) { state.wake = null; }
    const c = api.controls;
    if (c._sphericalDelta) c._sphericalDelta.set(0, 0, 0);
    if (c._panOffset) c._panOffset.set(0, 0, 0);
    api.camera.fov = BENCH_FOV;
    api.camera.updateProjectionMatrix();
    state.browserHz = await browserCadence();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && (state.phase === 'warmup' || state.phase === 'measure')) state.invalid = 'the tab was hidden during the run';
    });
    state.startAt = 0;
    state.phase = 'warmup';
  }

  function placeCamera(tSeconds) {
    const { center, radius } = api.bounds();
    const p = orbitPose(tSeconds, { radius, fovDeg: api.camera.fov, aspect: api.camera.aspect || 16 / 9 });
    const s = Math.sin(p.polar);
    api.camera.position.set(center.x + p.distance * s * Math.sin(p.azimuth), center.y + p.distance * Math.cos(p.polar),
      center.z + p.distance * s * Math.cos(p.azimuth));
    api.controls.target.copy(center);
    api.camera.lookAt(center);
  }

  /* called at the top of the viewer's animation-frame callback, before anything else reads the camera */
  function tick(now) {
    if (state.phase !== 'warmup' && state.phase !== 'measure') return;
    if (!state.startAt) state.startAt = now;
    placeCamera((now - state.startAt) / 1000);
    if (api.tweenCount() > 0 && !state.invalid) state.invalid = 'the build moved during the run';
    /* a lost context still ticks the animation frame, and renders nothing in it - fast frames of an empty canvas
       (review 01a0a37b) */
    if (!state.invalid && api.renderer.getContext().isContextLost()) state.invalid = 'the graphics context was lost during the run';
    if (state.phase === 'warmup' && now - state.startAt >= WARMUP_MS) { state.phase = 'measure'; state.measureAt = now; }
    if (state.phase === 'measure') {
      /* ⚠ NOT closeRun() HERE. tick runs inside three's animation-frame callback, and WebGLAnimation re-requests its next
         frame AFTER the callback returns (three.module.js 16-22) - so stopping the loop from in here leaves that request
         alive, and the restart after the reading starts a SECOND chain: the viewer would draw every frame twice for the rest
         of the page. A microtask runs once the callback (re-request included) has finished, where stopping really stops. */
      if (now - state.measureAt > MEASURE_MS) { state.phase = 'closing'; Promise.resolve().then(closeRun); return; }
      state.times.push(now);
      state.calls.push(api.renderer.info.render.calls);   // the previous frame's last render
      state.dprs.add(api.renderer.getPixelRatio());
      state.tiers.add(api.quality());
      state.sizes.add(api.renderer.domElement.width + 'x' + api.renderer.domElement.height);
    }
    const left = state.phase === 'warmup' ? Math.ceil((WARMUP_MS - (now - state.startAt)) / 1000) : Math.ceil((MEASURE_MS - (now - state.measureAt)) / 1000);
    showPill(state.phase === 'warmup' ? `Warming up · ${Math.max(0, left)} s` : `Measuring · ${Math.max(0, left)} s left`);
  }

  // the page is touched only when the text changes - once a second - so the pill costs the timed frames nothing else
  function showPill(text) {
    if (!el.pill) { el.pill = document.createElement('div'); el.pill.className = 'ob-pill'; el.pill.setAttribute('role', 'status'); document.body.appendChild(el.pill); }
    if (el.pill.textContent !== text) el.pill.textContent = text;
  }

  function device() {
    const out = { gpu: null, gpuVendor: null, note: 'browser-reported, best effort: no browser exposes the CPU model, and some mask the GPU' };
    try {
      const gl = api.renderer.getContext();
      const d = gl.getExtension('WEBGL_debug_renderer_info');
      if (d) { out.gpu = gl.getParameter(d.UNMASKED_RENDERER_WEBGL); out.gpuVendor = gl.getParameter(d.UNMASKED_VENDOR_WEBGL); }
    } catch (e) { /* masked */ }
    out.userAgent = navigator.userAgent;
    out.browserBrands = navigator.userAgentData ? navigator.userAgentData.brands.map((b) => `${b.brand} ${b.version}`) : null;
    out.logicalCores = navigator.hardwareConcurrency || null;
    out.deviceMemoryGbHint = navigator.deviceMemory || null;
    out.screenCssPx = [screen.width, screen.height];
    out.devicePixelRatio = window.devicePixelRatio;
    return out;
  }

  // the measured window is over: the camera holds still while the browser's own frame rate is read a second time
  async function closeRun() {
    state.browserHzAfter = await browserCadence();
    finish();
  }

  function finish() {
    state.phase = 'done';
    api.controls.enabled = true;
    api.renderer.domElement.style.pointerEvents = '';
    const wakeHeld = !!state.wake;
    if (state.wake) { state.wake.release().catch(() => {}); state.wake = null; }
    if (el.pill) { el.pill.remove(); el.pill = null; }
    const { frameTimesMs, stats } = measureRun(state.times);
    const canvas = api.renderer.domElement;
    const judged = judgeRun({ stats, spoiled: state.invalid, tierCount: state.tiers.size, pixelRatioCount: state.dprs.size,
      bufferSizeCount: state.sizes.size, browserHz: state.browserHz, browserHzAfter: state.browserHzAfter });
    const drawCalls = {};
    for (const c of state.calls) drawCalls[c] = (drawCalls[c] || 0) + 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    state.result = {
      benchmark: 'gen2-orbit', protocol: BENCH_PROTOCOL, when: new Date().toISOString(), viewer: api.version,
      valid: judged.valid, invalidReason: judged.invalidReason,
      tier: state.tier, tierLabel: TIER_LABEL[state.tier], tierDuringRun: [...state.tiers], stage: state.stage,
      verdict: judged.valid ? { pass: stats.pass, targetFps: TARGET_FPS, meanFps: r1(stats.meanFps), meanFpsExact: Math.round(stats.meanFps * 1000) / 1000 } : null,
      notes: judged.notes,
      timing: stats.error ? { error: stats.error } : {
        warmupMs: WARMUP_MS, measureMs: MEASURE_MS, frames: stats.frames, meanFps: r1(stats.meanFps), avgFrameMs: r1(stats.avgFrameMs),
        onePercentLowFps: r1(stats.onePercentLowFps), worst2sFps: r1(stats.worst2sFps), medianFrameMs: r1(stats.medianFrameMs),
        p95FrameMs: r1(stats.p95FrameMs), maxFrameMs: r1(stats.maxFrameMs), pauses: stats.pauses },
      workload: { build: '80-unit standard: 16 x 5 decor drawers, 185 collection, Essential plates + Deco handles, magnets, back covers',
        parts: api.instanceCount(), orbit: `${ORBIT_PERIOD_S} s per turn at ${ORBIT_POLAR_DEG} degrees, whole build in view` },
      /* ⚠ ORIENTATION IS PART OF THE WORKLOAD (review 01a0a37b): the orbit fits the build into the narrower field, so a
         portrait canvas sees it from further back and its pixels cover a different share of the screen. Compare like with
         like. */
      viewport: { aspect: h ? Math.round((w / h) * 1000) / 1000 : null, orientation: w >= h ? 'landscape' : 'portrait' },
      resolution: { resolutionDrop: 'held off', pixelRatio: [...state.dprs], canvasCssPx: [w, h],
        drawingBufferPx: [canvas.width, canvas.height], drawingBufferDuringRun: [...state.sizes] },
      screenWakeLock: wakeHeld ? 'held' : 'not available',
      drawCallsMedian: median(state.calls), drawCalls,
      browserFrameRateHz: r1(state.browserHz), browserFrameRateHzAfter: r1(state.browserHzAfter),
      atBrowserLimit: judged.valid ? judged.limited : null,
      device: device(),
      definitions: DEFINITIONS,
      // the frames the run was judged on, so any result can be re-derived and checked (reviews 01a0a37b, 01a0a567);
      // summaryText writes it on one line
      frameTimesMs,
    };
    // the series: a valid run joins it (or opens a new one); a not-valid run is listed in it, not counted
    const key = seriesKey(state.result);
    const all = readSeries();
    const next = judged.valid ? addToSeries(all[key], seriesEntry(state.result))
      : addVoided(all[key], { when: state.result.when, reason: judged.invalidReason, bufferPx: state.result.resolution.drawingBufferPx });
    const rec = { runs: next.runs, voided: next.voided, superseded: next.superseded };
    all[key] = rec;
    const stored = writeSeries(all);
    state.result.series = { policy: SERIES_POLICY, key, counted: judged.valid, stored, restarted: next.restarted, runs: rec.runs, voided: rec.voided,
      superseded: rec.superseded, ...judgeSeries(rec.runs) };
    state.judged = judged;
    resultCard(state.result);
  }
  function clearSeries(key) {
    const all = readSeries();
    delete all[key];
    writeSeries(all);
  }

  const voidedText = (S) => (S.voided.length ? ` · ${S.voided.length} not-valid run${S.voided.length === 1 ? '' : 's'} not counted` : '');
  /* the unfinished series a page-size change replaced (seriesFor), in one phrase for the card and for Copy */
  function supersededPhrase(S) {
    const sup = S.superseded || [];
    if (!sup.length) return null;
    const runs = sup.flatMap((x) => x.runs), below = runs.filter((r) => r.pass !== true).length, nv = sup.reduce((s, x) => s + x.voided.length, 0);
    return `${sup.length === 1 ? 'an unfinished series' : `${sup.length} unfinished series`} on another page size, not counted - ${runs.length} valid run${runs.length === 1 ? '' : 's'}${below ? `, ${below} below ${TARGET_FPS} fps` : ''}, ${nv} not valid`;
  }
  const supersededText = (S) => { const p = supersededPhrase(S); return p ? ` · before it, ${p}` : ''; };
  function seriesLine(res) {
    const S = res.series;
    if (!S) return null;
    if (S.complete) return `${res.tierLabel} series: ${S.pass ? 'PASS' : 'FAIL'} - ${S.runsAtTarget} of ${S.need} valid runs at ${TARGET_FPS} fps or better · mean ${formatFps(S.meanFps)} fps · worst run ${formatFps(S.worstRun.meanFps)} fps${voidedText(S)}${supersededText(S)}`;
    return `${res.tierLabel} series: ${S.count} of ${S.need} valid runs so far${S.pass === false ? ` - one is below ${TARGET_FPS} fps, so this series cannot pass` : ''}${S.counted ? '' : ' (this run was not counted)'}${voidedText(S)}${supersededText(S)}`;
  }
  /* readable JSON, with every long list of numbers (each run's ~3,000 frame times) on one line rather than one line each */
  function compactJson(obj) {
    const lists = [];
    const text = JSON.stringify(obj, (k, v) => (Array.isArray(v) && v.length > 50 && v.every((x) => typeof x === 'number') ? `__OB_LIST_${lists.push(v) - 1}__` : v), 1);
    return text.replace(/"__OB_LIST_(\d+)__"/g, (m, i) => JSON.stringify(lists[+i]));
  }

  function summaryText(res) {
    const T = res.timing || {};
    const done = !!(res.series && res.series.complete);
    const lines = [
      done ? seriesLine(res) : null,      // a complete series is the device's result, so it leads, as on the card
      res.valid ? `${res.tierLabel}: ${res.verdict.pass ? 'PASS' : 'FAIL'} - ${formatFps(res.verdict.meanFpsExact)} fps average (target ${TARGET_FPS} fps)` : `${res.tierLabel}: NOT VALID - ${res.invalidReason}`,
      done ? null : seriesLine(res),
      `1% low ${T.onePercentLowFps} fps · average frame ${T.avgFrameMs} ms · worst 2 s window ${T.worst2sFps} fps · ${T.frames} frames · ${T.pauses} pauses`,
      ...res.notes,
      `stage ${res.stage} · ${res.viewport.orientation} · pixel ratio ${res.resolution.pixelRatio.join('/')} · canvas ${res.resolution.canvasCssPx.join('x')} CSS px (${res.resolution.drawingBufferPx.join('x')} px) · resolution drop held off · browser limit ${res.browserFrameRateHz} then ${res.browserFrameRateHzAfter} fps`,
      `GPU ${res.device.gpu || 'not reported'} · ${(res.device.browserBrands || [res.device.userAgent]).join(', ')}`,
      `viewer ${res.viewer} · protocol ${res.protocol} · ${res.when}`,
    ];
    // readable JSON for everything, with this run's ~3,000 frame times on ONE line at the end
    const { frameTimesMs, ...rest } = res;
    const json = compactJson(rest).replace(/\n}$/, `,\n "frameTimesMs": ${JSON.stringify(frameTimesMs)}\n}`);
    return lines.filter((l) => l != null).join('\n') + '\n\n' + json;
  }

  function resultCard(res) {
    const card = document.createElement('div');
    card.className = 'ob-card'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'Benchmark result');
    const T = res.timing || {};
    const S = res.series || null;
    const seriesDone = !!(S && S.complete);
    // a complete series is the device's result, so it leads; the run that completed it follows as one line
    if (seriesDone) {
      const head = document.createElement('div');
      head.className = 'ob-verdict ' + (S.pass ? 'ob-pass' : 'ob-fail');
      head.textContent = `${res.tierLabel}: ${S.pass ? 'PASS' : 'FAIL'} - ${S.runsAtTarget} of ${S.need} runs at ${TARGET_FPS} fps`;
      card.appendChild(head);
      const sum = document.createElement('p');
      sum.textContent = `Mean ${formatFps(S.meanFps)} fps · worst run ${formatFps(S.worstRun.meanFps)} fps (1% low ${S.worstRun.onePercentLowFps} fps, worst 2 s ${S.worstRun.worst2sFps} fps) · target: ${TARGET_FPS} fps on every run${voidedText(S)}${supersededText(S)}`;
      card.appendChild(sum);
    }
    const verdict = document.createElement('div');
    verdict.className = (seriesDone ? 'ob-runline ' : 'ob-verdict ') + (res.valid ? (res.verdict.pass ? 'ob-pass' : 'ob-fail') : 'ob-void');
    const runLabel = seriesDone && S.counted ? `Run ${S.count} of ${S.need} - ` : seriesDone ? 'This run - ' : '';
    verdict.textContent = runLabel + (res.valid ? `${res.tierLabel}: ${res.verdict.pass ? 'PASS' : 'FAIL'} - ${formatFps(res.verdict.meanFpsExact)} fps average` : `${res.tierLabel}: not valid`);
    card.appendChild(verdict);
    const target = document.createElement('p');
    target.textContent = res.valid ? (seriesDone ? '' : `Target: ${TARGET_FPS} fps`) : `${res.invalidReason[0].toUpperCase() + res.invalidReason.slice(1)}. Leave the page in front and untouched, and run it again.`;
    if (target.textContent) card.appendChild(target);
    if (S && !seriesDone) {
      const prog = document.createElement('p');
      prog.className = 'ob-series';     // not an .ob-note: those are the run's own findings (judgeRun)
      const left = S.need - S.count;
      const before = supersededPhrase(S);
      const listed = (S.voided.length ? ` Not-valid runs in this series so far: ${S.voided.length}.` : '') + (before ? ` Before this series: ${before}.` : '');
      prog.textContent = S.stored === false
        ? `This browser would not keep results between page loads, so the ${S.need} runs a device result needs cannot add up here - copy each result instead.`
        : S.counted === false
          ? `Not counted. A device result needs ${S.need} valid runs; this series has ${S.count}.${listed}`
          : (S.restarted === 'canvas' ? 'The page is a different size than for the earlier runs, so this run starts a new series. ' : '') +
            `Run ${S.count} of ${S.need}. A device result needs ${S.need} valid runs, each on a fresh page load: tap Run again ${left} more time${left === 1 ? '' : 's'}.` +
            (S.pass === false ? ` ${res.verdict.pass ? 'An earlier run' : 'This run'} is below ${TARGET_FPS} fps, so the series cannot pass - finish it for the mean and the worst run.` : '') + listed;
      card.appendChild(prog);
    }
    // a run voided by its pauses keeps its numbers: if they repeat on an untouched page, the stalls are the device's
    if (res.valid || (state.judged && state.judged.kind === 'pauses')) {
      const grid = document.createElement('div');
      grid.className = 'ob-grid';
      const cell = (value, label) => { const d = document.createElement('div'); const b = document.createElement('b'); b.textContent = value; const s = document.createElement('small'); s.textContent = label; d.append(b, s); return d; };
      grid.append(cell(`${T.onePercentLowFps} fps`, '1% low'), cell(`${T.avgFrameMs} ms`, 'average frame time'),
        cell(`${T.worst2sFps} fps`, 'worst 2-second window'), cell(`${T.frames}`, `frames in ${MEASURE_MS / 1000} s`));
      card.appendChild(grid);
    }
    for (const n of res.notes) { const p = document.createElement('p'); p.className = 'ob-note'; p.textContent = n; card.appendChild(p); }
    const detail = document.createElement('p');
    detail.className = 'ob-detail';
    detail.textContent = `${res.stage === 'light' ? 'Light' : 'Dark'} stage · ${res.viewport.orientation} · pixel ratio ${res.resolution.pixelRatio.join('/')} · ${res.resolution.canvasCssPx.join(' x ')} CSS px · resolution drop held off · GPU: ${res.device.gpu || 'not reported by this browser'} · viewer ${res.viewer}`;
    card.appendChild(detail);
    const buttons = document.createElement('div');
    buttons.className = 'ob-buttons';
    const copy = document.createElement('button');
    copy.type = 'button'; copy.className = 'ob-go'; copy.textContent = 'Copy results';
    copy.onclick = async () => {
      const text = summaryText(res);
      try { await navigator.clipboard.writeText(text); copy.textContent = 'Copied'; return; } catch (e) { /* not a secure context, or refused */ }
      // the clipboard needs a secure context: fall back to a selected text box
      if (!el.copyBox) { el.copyBox = document.createElement('textarea'); el.copyBox.className = 'ob-copy'; el.copyBox.readOnly = true; card.appendChild(el.copyBox); }
      el.copyBox.value = text; el.copyBox.focus(); el.copyBox.select();
    };
    const again = document.createElement('button');
    again.type = 'button'; again.className = 'ob-go ob-ghost';
    again.textContent = seriesDone ? 'Start a new series' : 'Run again';
    // a fresh page: nothing from this run carries into the next, except the series record in this tab
    again.onclick = () => { if (seriesDone) clearSeries(S.key); location.reload(); };
    buttons.append(copy, again);
    card.appendChild(buttons);
    document.body.appendChild(card);
    el.card = card;
    window.__GEN2_BENCH_RESULT__ = res;           // for harnesses that drive the page
  }

  startCard();
  if (params.get('autostart') === '1') start();
  return { tick, start, get phase() { return state.phase; }, get result() { return state.result; } };
}
