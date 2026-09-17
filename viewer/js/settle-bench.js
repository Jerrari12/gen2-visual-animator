/* THE SETTLE BENCHMARK - `?bench=settle` (Joey, 2026-09-16: "Settle benchmark ... measuring time to final image, worst
 * frame, interrupt delay and cold compile, and record today's Very High"; Astra: "The next deliverable should be the
 * working benchmark and baseline results").
 *
 * The orbit benchmark (orbit-bench.js) times MOVING frames. Very High, and every still-only effect that may follow it,
 * spends its budget once the camera STOPS: the accumulation burst, the AO passes, the floor reflection coming back. This
 * benchmark stops the camera at fixed views and times that spend. It sets NO pass limits: it records a baseline.
 *
 * THE PROTOCOL IS PRE-REGISTERED: D:\Claude - Output\GEN2 veryhigh\SETTLE-BENCH-PREREG-2026-09-16.md (with amendment A1).
 * A change to the run, the statistics or the validity rules bumps SETTLE_PROTOCOL.
 *
 * ⚠ IT MEASURES THE REAL VIEWER, like the orbit benchmark: the shipped scene, tiers and passes. It reads the settle machinery
 * through four MONOTONIC counters main.js keeps for it (samples rendered, samples rendered with the settle detail on, AO
 * passes, mirror renders) plus the values those machines already hold (acc.n, ao.passes, the mirror's opacity), all read
 * AFTER each frame's render (main.js calls afterFrame at the end of the render loop).
 * ⚠ MONOTONIC, BECAUSE A HELD VALUE LIES. acc.n and ao.passes keep their last value through a move (the accumulator is simply
 * not called), so "acc.n is 24" at the start of a hold is the PREVIOUS view's burst. A counter that rose during this hold is
 * the only proof that a sample of THIS view was rendered (amendment A1.5).
 * ⚠ EVERY COMPLETION TIME IS THE END OF A FRAME. The state read after a frame's render is on screen no earlier than the next
 * animation-frame timestamp, so a frame "ends" at the next frame's timestamp (amendment A1.3).
 *
 * Pure functions (runSegments, summarizeStop, analyzeRun, judgeSettleRun, the series functions) are exported for node and
 * tested in test/settle-bench.test.mjs; createSettleBench is the browser half.
 */
import { benchBuild, orbitPose, median, PAUSE_MS, LIMIT_DRIFT, BENCH_FOV, sameCanvas, normalizeSeries } from './orbit-bench.js';

export { benchBuild };
export const SETTLE_PROTOCOL = 1;
export const STEP_DEG = 45;
export const DEG_PER_S = 15;               // orbit protocol 1's rate
export const MOVE_MS = (STEP_DEG / DEG_PER_S) * 1000;   // 3,000
export const LEADIN_FROM_DEG = -90;
export const LEADIN_MS = (-LEADIN_FROM_DEG / DEG_PER_S) * 1000;   // 6,000
export const MEASURED_STOPS = 8;
export const INTERRUPT_STOPS = 4;
export const MARGIN_MS = 1000;             // converged frames kept after a stop settles
export const HOLD_CAP_MS = 15000;          // a stop not settled by then voids the run
export const POSE_TOL_MM = 0.001;          // the rendered camera position may differ from the commanded pose by this much (review 01a0ad2b)
export const SETTLE_TIERS = ['veryhigh', 'high'];
const TIER_LABEL = { veryhigh: 'Very High', high: 'High' };

/* The run as a list of segments. Stop 0 cold, 1-8 measured, 9-12 interrupt, 13 final. A move's `to` is the next hold's view. */
export function runSegments() {
  const segs = [{ kind: 'move', from: LEADIN_FROM_DEG, to: 0, ms: LEADIN_MS }];
  const last = MEASURED_STOPS + INTERRUPT_STOPS + 1;
  for (let s = 0; s <= last; s++) {
    const az = s * STEP_DEG;
    if (s > 0) segs.push({ kind: 'move', from: az - STEP_DEG, to: az, ms: MOVE_MS });
    const stopKind = s === 0 ? 'cold' : s <= MEASURED_STOPS ? 'measured' : s <= MEASURED_STOPS + INTERRUPT_STOPS ? 'interrupt' : 'final';
    segs.push({ kind: 'hold', stop: s, stopKind, az });
  }
  return segs;
}

/* the orbit benchmark's own pose at an azimuth in degrees (orbitPose turns 15 degrees a second) */
export function poseAtDeg(azDeg, opts) { return orbitPose(azDeg / DEG_PER_S, opts); }

/* What a tier and stage settle, and the interrupt condition that belongs to the arm (amendment A1.5). */
export function armConfig({ accum, ao, refl, ACC_SAMPLES, ACC_WARMUP, aoAccumMax }) {
  return { accum: !!accum, ao: !!ao, refl: !!refl, ACC_SAMPLES, ACC_WARMUP, aoAccumMax,
    interruptOn: accum ? 'accum' : ao ? 'ao' : null,
    interruptAt: accum ? Math.ceil(ACC_SAMPLES / 2) : ao ? Math.ceil(aoAccumMax / 2) : null };
}

/* A frame record is columns of equal length (compact to store and post):
   t (rAF ms), seg (segment index), lite (0/1), accN, accDrew (0/1), aoPasses, sampleCount, detailCount, passCount, reflCount,
   reflOpacity, still (0/1: the camera matrices equal the hold's first frame's; 1 on move frames), poseErr (mm between the
   rendered camera position and the pose the benchmark commanded that frame, to 1e-6). */
export const COLUMNS = ['t', 'seg', 'lite', 'accN', 'accDrew', 'aoPasses', 'sampleCount', 'detailCount', 'passCount', 'reflCount', 'reflOpacity', 'still', 'poseErr'];
export function emptyFrames() { const f = {}; for (const c of COLUMNS) f[c] = []; return f; }

const delta = (col, i) => (i > 0 ? col[i] - col[i - 1] : 0);
const nearestRank = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];

/* Where the hold's progress stands at frame index i (inclusive), for a hold starting at index h0. Used live, to decide when a
   hold ends, and by summarizeStop - one definition for both. */
export function holdProgress(F, h0, i, cfg) {
  const out = { accDone: null, aoDone: null, reflDone: null, settledRow: null, breakRow: null, missing: [] };
  let accGen = null;
  for (let k = h0; k <= i; k++) {
    if (cfg.accum && delta(F.sampleCount, k) > 0) {
      if (F.accN[k] === 1) { accGen = k; out.accDone = null; }
      if (accGen !== null && F.accN[k] === cfg.ACC_SAMPLES && out.accDone === null) out.accDone = k;
      if (cfg.interruptOn === 'accum' && out.breakRow === null && F.accN[k] >= cfg.interruptAt) out.breakRow = k;
    }
    if (cfg.ao && delta(F.passCount, k) > 0) {
      if (F.aoPasses[k] === 1 && cfg.aoAccumMax > 1) out.aoDone = null;
      if (F.aoPasses[k] === cfg.aoAccumMax && out.aoDone === null) out.aoDone = k;
      if (cfg.interruptOn === 'ao' && out.breakRow === null && F.aoPasses[k] >= cfg.interruptAt) out.breakRow = k;
    }
    if (cfg.refl && out.reflDone === null && delta(F.reflCount, k) > 0 && F.reflOpacity[k] > 0) out.reflDone = k;
  }
  const need = [];
  if (cfg.accum) need.push(['accumulation', out.accDone]);
  if (cfg.ao) need.push(['ambient occlusion', out.aoDone]);
  if (cfg.refl) need.push(['floor reflection', out.reflDone]);
  out.missing = need.filter(([, v]) => v === null).map(([n]) => n);
  out.settledRow = !need.length || out.missing.length ? (need.length ? null : h0) : Math.max(...need.map(([, v]) => v));
  return out;
}

/* Whether the hold that began at row h0 ends before the frame that starts at nextT (row i, the hold's last recorded row, ends
   there). Decided at the START of that frame, when row i's end is known (review 01a0ad2b): an interrupt hold ends on its break
   row; a full hold once the frames after the settling frame span MARGIN_MS - and not one frame more; either ends at
   HOLD_CAP_MS from tStill. A stop whose settling frame ENDS after the cap is not settled (summarizeStop). One rule for the page
   and for the tests' simulator. */
export function holdShouldEnd(F, h0, i, cfg, stopKind, nextT) {
  const p = holdProgress(F, h0, i, cfg);
  const endOf = (r) => (r < i ? F.t[r + 1] : nextT);
  const held = nextT - F.t[h0];
  if (stopKind === 'interrupt') return p.breakRow !== null || held >= HOLD_CAP_MS;
  if (p.settledRow !== null && endOf(p.settledRow) - F.t[h0] <= HOLD_CAP_MS) return nextT - endOf(p.settledRow) >= MARGIN_MS;
  return held >= HOLD_CAP_MS;
}

/* One hold's statistics (section 4 + A1). h0 = its first row, h1 = one past its last row (the next segment's first row, or
   the frame count). */
export function summarizeStop(F, h0, h1, cfg, stopKind) {
  const n = F.t.length;
  const end = (i) => (i + 1 < n ? F.t[i + 1] : null);
  const dur = (i) => (end(i) === null ? null : end(i) - F.t[i]);
  const tStill = F.t[h0];
  const p = holdProgress(F, h0, h1 - 1, cfg);
  const since = (i) => (i === null || end(i) === null ? null : end(i) - tStill);
  const s = { stopKind, rows: h1 - h0, missing: p.missing };
  // the camera stayed exactly still for the whole hold
  s.still = true;
  for (let k = h0; k < h1; k++) if (!F.still[k]) { s.still = false; break; }
  s.poseErrMm = 0;
  for (let k = h0; k < h1; k++) if (F.poseErr[k] > s.poseErrMm) s.poseErrMm = F.poseErr[k];
  // accumulation generations: a sample that brought acc.n to 1 starts one
  let gens = 0, lastGen = null, samples = 0, details = 0;
  for (let k = h0; k < h1; k++) {
    const ds = delta(F.sampleCount, k);
    samples += ds; details += delta(F.detailCount, k);
    if (ds > 0 && F.accN[k] === 1) { gens++; lastGen = k; }
  }
  s.accRestarts = cfg.accum ? Math.max(0, gens - 1) : null;
  s.samplesRendered = cfg.accum ? samples : null;
  s.detailSamples = cfg.accum ? details : null;
  let firstMean = null;
  if (cfg.accum && lastGen !== null) for (let k = lastGen; k < h1; k++) if (F.accDrew[k]) { firstMean = k; break; }
  s.firstMeanMs = cfg.accum ? since(firstMean) : null;
  s.accDoneMs = cfg.accum ? since(p.accDone) : null;
  s.aoDoneMs = cfg.ao ? since(p.aoDone) : null;
  s.reflMs = cfg.refl ? since(p.reflDone) : null;
  s.settled = stopKind !== 'interrupt' && p.settledRow !== null && end(p.settledRow) !== null && since(p.settledRow) <= HOLD_CAP_MS;
  if (stopKind !== 'interrupt' && p.settledRow !== null && !s.settled) s.missing = [...s.missing, `finished only after the ${HOLD_CAP_MS / 1000} s cap`];
  s.settledMs = s.settled ? since(p.settledRow) : null;
  if (s.settled) {
    const burst = [];
    for (let k = h0; k <= p.settledRow; k++) burst.push(dur(k));
    const sorted = [...burst].sort((a, b) => a - b);
    const med = median(sorted);
    s.burstFrames = burst.length;
    s.burstMaxFrameMs = sorted[sorted.length - 1];
    s.burstP95FrameMs = nearestRank(sorted, 0.95);
    s.burstMedianFrameMs = med;
    s.burstOver2xMedian = burst.filter((v) => v > 2 * med).length;
    const warm = [];
    if (cfg.accum && lastGen !== null) for (let k = lastGen; k <= p.settledRow; k++) {
      if (delta(F.sampleCount, k) > 0 && F.accN[k] >= 1 && F.accN[k] <= cfg.ACC_WARMUP) warm.push(dur(k));
    }
    s.warmupMaxFrameMs = cfg.accum && warm.length ? Math.max(...warm) : null;
    const margin = [];
    for (let k = p.settledRow + 1; k < h1; k++) { const d = dur(k); if (d !== null) margin.push(d); }
    s.settledFrames = margin.length;
    s.settledFrameMs = margin.length ? median(margin) : null;
  }
  if (stopKind === 'interrupt') {
    s.breakRow = p.breakRow === null ? null : p.breakRow - h0;
    s.brokeOff = p.breakRow !== null && p.breakRow === h1 - 1 && h1 < n;
    s.burstFrameMs = s.brokeOff ? dur(p.breakRow) : null;
    s.firstMoveFrameMs = s.brokeOff ? dur(h1) : null;
    s.interruptDelayMs = s.brokeOff && s.burstFrameMs !== null && s.firstMoveFrameMs !== null ? s.burstFrameMs + s.firstMoveFrameMs : null;
  }
  // settle detail on for every sample of the hold, and at least a full burst of samples (A1.6); full holds only
  s.detailOk = !cfg.accum || stopKind === 'interrupt' || (details === samples && samples >= cfg.ACC_SAMPLES);
  return s;
}

/* The first row that changed a counter in the hold must be a restart (A1.5): 1, not a stale value carried on. */
export function restartedAt(F, h0, h1, cfg) {
  const col = cfg.interruptOn === 'accum' ? { count: F.sampleCount, val: F.accN } : cfg.interruptOn === 'ao' ? { count: F.passCount, val: F.aoPasses } : null;
  if (!col) return null;
  for (let k = h0; k < h1; k++) if (delta(col.count, k) > 0) return col.val[k] === 1;
  return false;
}

/* A move's pause check (the effects motion pauses were paused): at least one motion-lite frame, and with a reflection, one
   frame with the mirror's opacity at 0. */
export function pausedDuring(F, m0, m1, cfg) {
  let lite = false, refl0 = !cfg.refl;
  for (let k = m0; k < m1; k++) { if (F.lite[k]) lite = true; if (cfg.refl && F.reflOpacity[k] === 0) refl0 = true; }
  return lite && refl0;
}

/* The whole run from its frames and the segment index each row belongs to. Returns per-stop tables, the headline, the checks. */
export function analyzeRun(F, cfg) {
  const segs = runSegments();
  const n = F.t.length;
  /* the closing row (seg === segs.length) only gives the final hold's last frame an end; it belongs to no segment */
  let nIn = n;
  for (let i = 0; i < n; i++) if (F.seg[i] >= segs.length) { nIn = i; break; }
  const firstRow = new Array(segs.length).fill(null);
  for (let i = 0; i < nIn; i++) if (firstRow[F.seg[i]] === null) firstRow[F.seg[i]] = i;
  const range = (si) => {
    const a = firstRow[si];
    if (a === null) return null;
    let b = nIn;
    for (let j = si + 1; j < segs.length; j++) if (firstRow[j] !== null) { b = firstRow[j]; break; }
    return [a, b];
  };
  const stops = [], checks = { reached: true, paused: [], restarted: [], detail: [], still: [], pose: [] };
  for (let si = 0; si < segs.length; si++) {
    const sg = segs[si], r = range(si);
    if (!r) { checks.reached = false; continue; }
    if (sg.kind === 'move') {
      if (si > 0) checks.paused.push({ seg: si, ok: pausedDuring(F, r[0], r[1], cfg) });   // the lead-in follows preparation
      continue;
    }
    const st = summarizeStop(F, r[0], r[1], cfg, sg.stopKind);
    st.stop = sg.stop; st.azimuthDeg = sg.az;
    stops.push(st);
    checks.still.push({ stop: sg.stop, ok: st.still });
    checks.pose.push({ stop: sg.stop, ok: st.poseErrMm <= POSE_TOL_MM, mm: st.poseErrMm });
    if (sg.stopKind !== 'interrupt') checks.detail.push({ stop: sg.stop, ok: st.detailOk });
    if (sg.stop > MEASURED_STOPS + 1 && cfg.interruptOn) checks.restarted.push({ stop: sg.stop, ok: restartedAt(F, r[0], r[1], cfg) });
  }
  const measured = stops.filter((s) => s.stopKind === 'measured');
  const inter = stops.filter((s) => s.stopKind === 'interrupt');
  /* every registered statistic a stop owes, present and finite - a missing one voids the run rather than quietly shrinking a
     median (review 01a0ad2b) */
  const owed = ['settledMs', 'burstMaxFrameMs', 'burstP95FrameMs', 'settledFrameMs', ...(cfg.accum ? ['firstMeanMs', 'warmupMaxFrameMs'] : [])];
  const incomplete = [];
  for (const st of measured) if (st.settled) for (const k of owed) if (!Number.isFinite(st[k])) incomplete.push({ stop: st.stop, statistic: k });
  for (const st of inter) if (st.brokeOff && !Number.isFinite(st.interruptDelayMs)) incomplete.push({ stop: st.stop, statistic: 'interruptDelayMs' });
  const cold = stops.find((s) => s.stopKind === 'cold') || null;
  const vals = (list, k) => list.map((s) => s[k]).filter((v) => v != null && Number.isFinite(v));
  const med = (list, k) => { const v = vals(list, k); return v.length ? median(v) : null; };
  const worst = (list, k) => { const v = vals(list, k); return v.length ? Math.max(...v) : null; };
  const headline = {
    medianSettledMs: med(measured, 'settledMs'), worstSettledMs: worst(measured, 'settledMs'),
    medianFirstMeanMs: cfg.accum ? med(measured, 'firstMeanMs') : null,
    worstBurstFrameMs: worst(measured, 'burstMaxFrameMs'), medianBurstP95FrameMs: med(measured, 'burstP95FrameMs'),
    worstWarmupFrameMs: cfg.accum ? worst(measured, 'warmupMaxFrameMs') : null,
    medianSettledFrameMs: med(measured, 'settledFrameMs'),
    medianInterruptDelayMs: med(inter, 'interruptDelayMs'), worstInterruptDelayMs: worst(inter, 'interruptDelayMs'),
  };
  // S4: the cold stop against the warm ones, and the long intervals from the start of the lead-in to the end of stop 0
  let coldLong = 0, coldEnd = null;
  const coldRange = range(1);
  if (coldRange) { coldEnd = coldRange[1]; for (let i = 0; i < coldEnd; i++) { const d = i + 1 < n ? F.t[i + 1] - F.t[i] : null; if (d !== null && d >= PAUSE_MS) coldLong++; } }
  const coldStop = cold ? { settledMs: cold.settledMs, burstMaxFrameMs: cold.burstMaxFrameMs, longIntervals: coldLong,
    warmMedianSettledMs: headline.medianSettledMs, warmMedianBurstMaxFrameMs: med(measured, 'burstMaxFrameMs') } : null;
  // S5-rule 5: pauses after stop 0's hold
  const after = [];
  if (coldEnd !== null) for (let i = coldEnd; i + 1 < n; i++) after.push(F.t[i + 1] - F.t[i]);
  const pauses = after.filter((v) => v >= PAUSE_MS).length;
  return { stops, headline, cold: coldStop, checks, pauses, medianIntervalAfterColdMs: after.length ? median(after) : null,
    unsettled: stops.filter((s) => s.stopKind !== 'interrupt' && !s.settled).map((s) => ({ stop: s.stop, missing: s.missing })),
    notBrokenOff: inter.filter((s) => !s.brokeOff).map((s) => s.stop), incomplete };
}

/* Whether a run counts - the first reason wins, in the pre-registered order (section 5 + A1). */
export function judgeSettleRun({ analysis: A, spoiled = null, frames = 0, tierCount = 1, pixelRatioCount = 1, bufferSizeCount = 1, browserHz = null, browserHzAfter = null }) {
  const fail = (reason, kind = 'spoiled') => ({ valid: false, invalidReason: reason, kind });
  if (spoiled) return fail(spoiled);
  if (tierCount !== 1) return fail('the quality tier changed during the run');
  if (pixelRatioCount > 1) return fail('the pixel ratio changed during the run');
  if (bufferSizeCount > 1) return fail('the window was resized during the run');
  if (frames < 3) return fail('too few frames to measure');
  if (!A.checks.reached) return fail('the run did not reach every stop');
  const moved = A.checks.still.find((c) => !c.ok);
  if (moved) return fail(`the camera was not exactly still during the hold at stop ${moved.stop}`);
  const off = A.checks.pose.find((c) => !c.ok);
  if (off) return fail(`the camera was not at stop ${off.stop}'s view (${off.mm} mm from it)`);
  if (A.unsettled.length) { const u = A.unsettled[0]; return fail(`stop ${u.stop} did not settle within ${HOLD_CAP_MS / 1000} s (${u.missing.join(', ') || 'no frame after it'})`, 'unsettled'); }
  if (A.notBrokenOff.length) return fail(`the interrupt at stop ${A.notBrokenOff[0]} did not break off mid-burst`, 'check');
  const np = A.checks.paused.find((c) => !c.ok);
  if (np) return fail(`the effects that pause while the camera moves did not pause during move ${np.seg}`, 'check');
  const nd = A.checks.detail.find((c) => !c.ok);
  if (nd) return fail(`the settle detail was not on for every accumulation sample at stop ${nd.stop}`, 'check');
  const nr = A.checks.restarted.find((c) => !c.ok);
  if (nr) return fail(`the settle did not restart from zero after the interrupt before stop ${nr.stop}`, 'check');
  if (A.incomplete.length) return fail(`stop ${A.incomplete[0].stop} has no ${A.incomplete[0].statistic}`, 'check');
  if (A.pauses > 0 && !(A.medianIntervalAfterColdMs >= PAUSE_MS)) return fail(`${A.pauses} ${A.pauses === 1 ? 'pause' : 'pauses'} of half a second or more during the run`, 'pauses');
  if (!(browserHz > 0) || !(browserHzAfter > 0)) return fail("the browser's own frame rate could not be read before and after the run");
  if (Math.abs(browserHzAfter - browserHz) > LIMIT_DRIFT * browserHz) {
    return fail(`the browser's own frame rate changed during the run (${Math.round(browserHz * 10) / 10} to ${Math.round(browserHzAfter * 10) / 10} frames a second)`);
  }
  return { valid: true, invalidReason: null, kind: null };
}

/* COMPUTED, not measured (S5): two RGBA16F targets (8 bytes a pixel each) + a 24/8 depth-stencil (4). */
export function accumMemoryMb([w, h]) { return Math.round((w * h * 20) / (1024 * 1024) * 10) / 10; }

export const DEFINITIONS = {
  protocol: 'SETTLE_PROTOCOL: pre-registered 2026-09-16 (SETTLE-BENCH-PREREG-2026-09-16.md + amendment A1). The 80-unit build; a 6 s lead-in; stop 0 (cold), stops 1-8 (measured), 9-12 (interrupt), 13 (final), 45 degrees apart; 3 s moves at 15 degrees a second; holds last until settled + 1 s, capped at 15 s.',
  frameEnd: "a frame ends at the next frame's animation-frame timestamp; every time below is a frame end minus tStill, the timestamp of the first frame drawn at the held view",
  settledMs: 'the end of the last of: accumulation reaching ACC_SAMPLES (Very High), AO reaching ao.accumMax (tiers with AO), the floor mirror re-rendered with its opacity restored (dark stage) - each counted only if rendered during this hold',
  firstMeanMs: 'the end of the first frame that drew the accumulated mean, in the last uninterrupted accumulation of the hold',
  burst: 'the frames from tStill to the settling frame: burstMaxFrameMs, burstP95FrameMs (nearest rank), burstMedianFrameMs, burstOver2xMedian; warmupMaxFrameMs = the longest frame with acc.n in 1..ACC_WARMUP (they render twice); settledFrameMs = the median frame of the 1 s after settling',
  interruptDelayMs: 'at stops 9-12 the hold breaks off at half the burst (acc.n >= 12, or half of ao.accumMax without accumulation): the last burst frame plus the first frame drawn at the new view - the worst wait for an input arriving during that burst frame',
  headline: 'over stops 1-8: median and worst settledMs, median firstMeanMs, worst burst frame, median p95 burst frame, median settled frame; over stops 9-12: median and worst interrupt delay',
  cold: 'stop 0 (the first settle of the page; preparation keeps the camera moving so nothing settles before it) against the warm stops. Indicative only: the browser shader cache persists between page loads.',
  memory: 'COMPUTED: drawing buffer width x height x 20 bytes (two RGBA16F targets + depth-stencil), Very High only',
  series: 'a device-and-arm result is 3 valid runs, each on its own page load in one tab, same protocol, viewer, tier, stage, orientation and pixel ratio, drawing buffer within 10%. meanMedianSettledMs is the mean of the runs\' medians; worstRun is the run with the largest worstSettledMs. Not-valid runs are listed in voided. The raw frames of each run are in that run\'s own result, not in the series.',
};

/* ================================================================================================ the series */
export const SERIES_POLICY = 1;
export const SERIES_RUNS = 3;
export function settleSeriesKey(res) {
  return ['settle', SERIES_POLICY, res.protocol, res.viewer, res.tier, res.stage, res.viewport.orientation, res.resolution.pixelRatio.join('/')].join('|');
}
export function settleSeriesEntry(res) {
  const H = res.headline;
  return { when: res.when, medianSettledMs: H.medianSettledMs, worstSettledMs: H.worstSettledMs, medianFirstMeanMs: H.medianFirstMeanMs,
    worstBurstFrameMs: H.worstBurstFrameMs, medianInterruptDelayMs: H.medianInterruptDelayMs, worstInterruptDelayMs: H.worstInterruptDelayMs,
    coldSettledMs: res.cold ? res.cold.settledMs : null, bufferPx: res.resolution.drawingBufferPx };
}
export function judgeSettleSeries(runs, { need = SERIES_RUNS } = {}) {
  const counted = (runs || []).slice(0, need);
  const out = { need, count: counted.length, complete: counted.length >= need, meanMedianSettledMs: null, worstRun: null };
  if (!counted.length) return out;
  out.meanMedianSettledMs = counted.reduce((s, r) => s + r.medianSettledMs, 0) / counted.length;
  out.worstRun = counted.reduce((w, r) => (r.worstSettledMs > w.worstSettledMs ? r : w));
  return out;
}
function settleSeriesFor(rec, need, entry) {
  const cur = normalizeSeries(rec);
  if (judgeSettleSeries(cur.runs, { need }).complete) return { cur: { runs: [], voided: [], superseded: [] }, restarted: 'complete' };
  if (entry && cur.runs.length && !sameCanvas(cur.runs[0].bufferPx, entry.bufferPx)) {
    const left = { bufferPx: cur.runs[0].bufferPx, runs: cur.runs.map((r) => ({ when: r.when, medianSettledMs: r.medianSettledMs, worstSettledMs: r.worstSettledMs })), voided: cur.voided };
    return { cur: { runs: [], voided: [], superseded: [...cur.superseded, left] }, restarted: 'canvas' };
  }
  return { cur, restarted: null };
}
export function addSettleRun(rec, entry, { need = SERIES_RUNS } = {}) {
  const { cur, restarted } = settleSeriesFor(rec, need, entry);
  return { runs: [...cur.runs, entry], voided: cur.voided, superseded: cur.superseded, restarted };
}
export function addSettleVoided(rec, item, { need = SERIES_RUNS } = {}) {
  const { cur, restarted } = settleSeriesFor(rec, need, null);
  return { runs: cur.runs, voided: [...cur.voided, item], superseded: cur.superseded, restarted };
}

/* ================================================================================================ the browser half */
/**
 * @param api  the orbit benchmark's api (THREE, camera, controls, renderer, goTo, stepCount, tweenCount, applyQuality,
 *             applyStageTheme, quality, stage, setHold, pauseLoop, closePanel, bounds, instanceCount, version) plus
 *             ACC_SAMPLES, ACC_WARMUP, settleState(), tierFlags()
 */
export function createSettleBench(api) {
  const params = new URLSearchParams(location.search);
  const segs = runSegments();
  const state = {
    phase: 'idle',                         // idle -> preparing -> run -> closing -> done
    tier: SETTLE_TIERS.includes(params.get('tier')) ? params.get('tier') : 'veryhigh',
    stage: params.get('stage') === 'light' ? 'light' : 'dark',
    prerollAt: 0, cmdPos: new api.THREE.Vector3(), seg: 0, segStart: 0, holdStart: -1, cfg: null, F: emptyFrames(), pendingRow: false,
    camRef: new Float64Array(32), dprs: new Set(), tiers: new Set(), sizes: new Set(),
    aoAccumMaxChanges: [], invalid: null, browserHz: null, browserHzAfter: null, wake: null, result: null, judged: null,
  };
  const el = {};
  const SERIES_STORE = 'gen2-settle-bench-series';
  const readSeries = () => { try { const v = JSON.parse(sessionStorage.getItem(SERIES_STORE) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } };
  const writeSeries = (all) => { try { sessionStorage.setItem(SERIES_STORE, JSON.stringify(all)); return true; } catch (e) { return false; } };

  const style = document.createElement('style');
  style.textContent = `
    body.orbit-bench #topbar, body.orbit-bench #note-panel, body.orbit-bench #checklist-tab, body.orbit-bench #checklist-panel,
    body.orbit-bench #identify-card, body.orbit-bench #filament-menu, body.orbit-bench #outro-overlay, body.orbit-bench #cover-overlay,
    body.orbit-bench #cover-bg, body.orbit-bench #tap-hint, body.orbit-bench #embed-begin, body.orbit-bench #incomplete-status,
    body.orbit-bench #embed-hint, body.orbit-bench #controls, body.orbit-bench #measure-toggle, body.orbit-bench #measure-label,
    body.orbit-bench #color-toggle, body.orbit-bench #pointer-line { display: none !important; }
    .ob-card { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 60; box-sizing: border-box;
      width: min(480px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto; padding: 20px 22px;
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
    .ob-verdict { font-size: 22px; font-weight: 800; margin: 2px 0; }
    .ob-void { color: var(--ink-soft, #5b6069); } .ob-ok { color: #1a9e5c; }
    .ob-card p.ob-series { font-size: 13px; color: inherit; border: 1px solid var(--panel-border, #e3e5e9); border-radius: 8px; padding: 7px 10px; }
    .ob-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 14px; margin: 12px 0; }
    .ob-grid b { display: block; font-size: 18px; } .ob-grid small { color: var(--ink-soft, #5b6069); }
    .ob-detail { font-size: 12px; color: var(--ink-soft, #5b6069); word-break: break-word; }
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
    card.className = 'ob-card'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'Settle benchmark');
    card.innerHTML = `<h2>Settle benchmark</h2>
      <p>How long the viewer takes to finish its still image: the 80-unit build (${api.instanceCount().toLocaleString()} parts), stopped at 14 views in turn. About 2 minutes.</p>
      <p>Keep this tab in front and leave the page alone until the result appears.</p>`;
    card.appendChild(segRow('Quality', SETTLE_TIERS.map((v) => ({ value: v, label: TIER_LABEL[v] })), state.tier, (v) => { state.tier = v; }));
    card.appendChild(segRow('Stage', [{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }], state.stage, (v) => { state.stage = v; }));
    const go = document.createElement('button');
    go.type = 'button'; go.className = 'ob-go'; go.textContent = 'Start';
    go.onclick = () => start();
    card.appendChild(go);
    document.body.appendChild(card);
    el.card = card;
  }

  const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
  async function browserCadence(frames = 45) {
    api.pauseLoop(true);
    try {
      const ts = [];
      for (let i = 0; i < frames; i++) ts.push(await nextFrame());
      const mid = median(ts.slice(1).map((v, i) => v - ts[i]));
      return mid > 0 ? 1000 / mid : null;
    } finally { api.pauseLoop(false); }
  }

  function placeCamera(azDeg) {
    const { center, radius } = api.bounds();
    const p = poseAtDeg(azDeg, { radius, fovDeg: api.camera.fov, aspect: api.camera.aspect || 16 / 9 });
    const s = Math.sin(p.polar);
    api.camera.position.set(center.x + p.distance * s * Math.sin(p.azimuth), center.y + p.distance * Math.cos(p.polar),
      center.z + p.distance * s * Math.cos(p.azimuth));
    api.controls.target.copy(center);
    api.camera.lookAt(center);
  }

  async function start() {
    if (state.phase !== 'idle') return;
    if (el.card) el.card.remove();
    showPill('Preparing');
    /* ⚠ THE CAMERA MOVES FROM HERE ON (amendment A1.2): a still preparation would settle before stop 0 and stop 0 would not be
       the page's first settle. tick() places the pre-roll camera on every frame of this phase. */
    api.controls.enabled = false;
    api.renderer.domElement.style.pointerEvents = 'none';
    const c = api.controls;
    if (c._sphericalDelta) c._sphericalDelta.set(0, 0, 0);
    if (c._panOffset) c._panOffset.set(0, 0, 0);
    state.phase = 'preparing';
    api.setHold(true);
    api.applyStageTheme(state.stage);
    api.applyQuality(state.tier);
    api.goTo(api.stepCount(), { animate: false });
    api.closePanel();
    api.camera.fov = BENCH_FOV;
    api.camera.updateProjectionMatrix();
    for (let i = 0; i < 600 && api.tweenCount() > 0; i++) await nextFrame();
    for (let i = 0; i < 30; i++) await nextFrame();
    try { if (navigator.wakeLock) state.wake = await navigator.wakeLock.request('screen'); } catch (e) { state.wake = null; }
    const flags = api.tierFlags(), S = api.settleState();
    state.cfg = armConfig({ ...flags, ACC_SAMPLES: api.ACC_SAMPLES, ACC_WARMUP: api.ACC_WARMUP, aoAccumMax: S.aoAccumMax });
    state.browserHz = await browserCadence();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && state.phase === 'run') state.invalid = 'the tab was hidden during the run';
    });
    state.seg = 0; state.segStart = 0;
    state.phase = 'run';
  }

  const camStore = () => { const m = api.camera.matrixWorld.elements, p = api.camera.projectionMatrix.elements; for (let i = 0; i < 16; i++) { state.camRef[i] = m[i]; state.camRef[16 + i] = p[i]; } };
  const camSame = () => { const m = api.camera.matrixWorld.elements, p = api.camera.projectionMatrix.elements; for (let i = 0; i < 16; i++) if (state.camRef[i] !== m[i] || state.camRef[16 + i] !== p[i]) return false; return true; };

  /* at the top of the viewer's animation-frame callback, before anything reads the camera */
  function tick(now) {
    if (state.phase === 'preparing') {
      // pre-roll: a 45-degree sawtooth ending at the lead-in's start, so every preparation frame is a moving frame
      if (!state.prerollAt) state.prerollAt = now;
      placeCamera(LEADIN_FROM_DEG - STEP_DEG + (((now - state.prerollAt) / 1000) * DEG_PER_S) % STEP_DEG);
      return;
    }
    if (state.phase !== 'run') return;
    let sg = segs[state.seg];
    const last = state.F.t.length - 1;
    // the hold's end is decided here, where the last row's end (now) is known - review 01a0ad2b
    if (sg.kind === 'hold' && last >= state.holdStart && !state.pendingRow && holdShouldEnd(state.F, state.holdStart, last, state.cfg, sg.stopKind, now)) {
      state.seg++;
      if (state.seg >= segs.length) {
        // the closing row: this frame's start is the final hold's last end; it belongs to no segment
        state.F.t.push(now); state.F.seg.push(segs.length);
        for (const c of COLUMNS) if (c !== 't' && c !== 'seg') state.F[c].push(state.F[c][state.F[c].length - 1]);
        state.phase = 'closing'; Promise.resolve().then(closeRun); return;
      }
      sg = segs[state.seg];
      /* the move's clock starts at the last hold frame's START, one frame early: started at `now` its first frame would sit
         exactly on the held view, and S3 times the first frame drawn at a NEW view. So a displayed move lasts one frame less than
       MOVE_MS (review 01a0ad2b, finding 3, kept by decision: no statistic depends on it; amendment A3). */
      state.segStart = state.lastT;
    }
    if (sg.kind === 'move') {
      if (!state.segStart) state.segStart = now;
      const el = now - state.segStart;
      if (el >= sg.ms) {                                   // arrived: this frame is the hold's first
        state.seg++;
        sg = segs[state.seg];
        state.holdStart = state.F.t.length;
        placeCamera(sg.az);
      } else placeCamera(sg.from + ((sg.to - sg.from) * el) / sg.ms);
    } else placeCamera(sg.az);
    state.cmdPos.copy(api.camera.position);   // the commanded pose; afterFrame compares what was rendered against it
    if (api.tweenCount() > 0 && !state.invalid) state.invalid = 'the build moved during the run';
    if (!state.invalid && api.renderer.getContext().isContextLost()) state.invalid = 'the graphics context was lost during the run';
    state.F.t.push(now); state.F.seg.push(state.seg);
    state.pendingRow = true;
    state.lastT = now;
    state.dprs.add(api.renderer.getPixelRatio());
    state.tiers.add(api.quality());
    state.sizes.add(api.renderer.domElement.width + 'x' + api.renderer.domElement.height);
    const sgNow = segs[state.seg];
    const label = sgNow.kind === 'hold' ? `Stop ${sgNow.stop} of ${segs[segs.length - 1].stop} · settling` : sgNow.stop === undefined && state.seg === 0 ? 'Lead-in' : `Moving to stop ${segs[state.seg + 1].stop}`;
    showPill(label);
  }

  /* at the end of the render loop: the frame's post-render settle state */
  function afterFrame({ accDrew, lite }) {
    if (state.phase !== 'run' || !state.pendingRow) return;
    state.pendingRow = false;
    const S = api.settleState(), F = state.F, i = F.t.length - 1, sg = segs[state.seg];
    /* ⚠ ao.accumMax IS 1 UNTIL AO FIRST RUNS: ensureAO sets 16 after its float blend probe, on the first frame AO renders - the
       cold stop, since preparation keeps the camera moving. Read at Start, the arm judged AO done after one pass (p56, first
       run). So the arm follows the viewer's value from the frame it changes; the result records both. */
    if (S.aoAccumMax !== state.cfg.aoAccumMax) {
      state.cfg = armConfig({ ...state.cfg, aoAccumMax: S.aoAccumMax });
      state.aoAccumMaxChanges.push({ row: i, to: S.aoAccumMax });
    }
    api.camera.updateMatrixWorld();
    if (sg.kind === 'hold' && i === state.holdStart) camStore();
    F.lite.push(lite ? 1 : 0); F.accN.push(S.accN); F.accDrew.push(accDrew ? 1 : 0); F.aoPasses.push(S.aoPasses);
    F.sampleCount.push(S.sampleCount); F.detailCount.push(S.detailCount); F.passCount.push(S.passCount);
    F.reflCount.push(S.reflCount); F.reflOpacity.push(S.reflOpacity === null ? -1 : S.reflOpacity);
    F.still.push(sg.kind === 'hold' ? (camSame() ? 1 : 0) : 1);
    F.poseErr.push(Math.round(api.camera.position.distanceTo(state.cmdPos) * 1e6) / 1e6);
  }

  function showPill(text) {
    if (!el.pill) { el.pill = document.createElement('div'); el.pill.className = 'ob-pill'; el.pill.setAttribute('role', 'status'); document.body.appendChild(el.pill); }
    if (el.pill.textContent !== text) el.pill.textContent = text;
  }

  function device() {
    const out = { gpu: null, gpuVendor: null, note: 'browser-reported, best effort' };
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

  async function closeRun() {
    state.browserHzAfter = await browserCadence();
    finish();
  }

  const r1 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);
  function roundStop(s) { const o = {}; for (const [k, v] of Object.entries(s)) o[k] = typeof v === 'number' && !Number.isInteger(v) ? r1(v) : v; return o; }

  function finish() {
    state.phase = 'done';
    api.controls.enabled = true;
    api.renderer.domElement.style.pointerEvents = '';
    const wakeHeld = !!state.wake;
    if (state.wake) { state.wake.release().catch(() => {}); state.wake = null; }
    if (el.pill) { el.pill.remove(); el.pill = null; }
    /* ⚠ JUDGED ON WHAT IT STORES (the orbit benchmark's rule, review 01a0a567): the frames are stored as ms from the first, to
       0.01 ms, and analysed in that form. Analysed raw, a median of exactly x.x5 re-derived from the stored list to the other
       rounding (p56: 20.849999 on the page, 20.85 from the file). */
    const t0 = state.F.t[0] || 0;
    const F = { ...state.F, t: state.F.t.map((v) => Math.round((v - t0) * 100) / 100) }, cfg = state.cfg;
    const A = analyzeRun(F, cfg);
    const judged = judgeSettleRun({ analysis: A, spoiled: state.invalid, frames: F.t.length, tierCount: state.tiers.size,
      pixelRatioCount: state.dprs.size, bufferSizeCount: state.sizes.size, browserHz: state.browserHz, browserHzAfter: state.browserHzAfter });
    const canvas = api.renderer.domElement, w = canvas.clientWidth, h = canvas.clientHeight;
    const H = {}; for (const [k, v] of Object.entries(A.headline)) H[k] = r1(v);
    const S = api.settleState();
    state.result = {
      benchmark: 'gen2-settle', protocol: SETTLE_PROTOCOL, when: new Date().toISOString(), viewer: api.version,
      valid: judged.valid, invalidReason: judged.invalidReason, kind: judged.kind,
      tier: state.tier, tierLabel: TIER_LABEL[state.tier], tierDuringRun: [...state.tiers], stage: state.stage,
      settles: { accumulation: cfg.accum, ambientOcclusion: cfg.ao, floorReflection: cfg.refl, ACC_SAMPLES: cfg.ACC_SAMPLES,
        ACC_WARMUP: cfg.ACC_WARMUP, aoAccumMax: cfg.aoAccumMax, aoAccumMaxChanges: state.aoAccumMaxChanges, accumulatorProbeOk: S.accOk, shadowMapOn: S.shadowOn,
        interruptOn: cfg.interruptOn, interruptAt: cfg.interruptAt },
      headline: H,
      cold: A.cold ? Object.fromEntries(Object.entries(A.cold).map(([k, v]) => [k, typeof v === 'number' && !Number.isInteger(v) ? r1(v) : v])) : null,
      memoryMbComputed: cfg.accum ? accumMemoryMb([canvas.width, canvas.height]) : null,
      stops: A.stops.map(roundStop),
      checks: A.checks, pausesAfterCold: A.pauses,
      workload: { build: '80-unit standard: 16 x 5 decor drawers, 185 collection, Essential plates + Deco handles, magnets, back covers', parts: api.instanceCount() },
      viewport: { aspect: h ? Math.round((w / h) * 1000) / 1000 : null, orientation: w >= h ? 'landscape' : 'portrait' },
      resolution: { resolutionDrop: 'held off', pixelRatio: [...state.dprs], canvasCssPx: [w, h], drawingBufferPx: [canvas.width, canvas.height], drawingBufferDuringRun: [...state.sizes] },
      screenWakeLock: wakeHeld ? 'held' : 'not available',
      browserFrameRateHz: r1(state.browserHz), browserFrameRateHzAfter: r1(state.browserHzAfter),
      device: device(), definitions: DEFINITIONS,
      // every frame the run was judged on, columns of equal length; t in ms from the first frame, to 0.01 ms
      frames: F,
    };
    const key = settleSeriesKey(state.result);
    const all = readSeries();
    const next = judged.valid ? addSettleRun(all[key], settleSeriesEntry(state.result))
      : addSettleVoided(all[key], { when: state.result.when, reason: judged.invalidReason, bufferPx: state.result.resolution.drawingBufferPx });
    const rec = { runs: next.runs, voided: next.voided, superseded: next.superseded };
    all[key] = rec;
    const stored = writeSeries(all);
    state.result.series = { policy: SERIES_POLICY, key, counted: judged.valid, stored, restarted: next.restarted, runs: rec.runs, voided: rec.voided, superseded: rec.superseded, ...judgeSettleSeries(rec.runs) };
    state.judged = judged;
    resultCard(state.result);
  }

  const ms = (v) => (v == null ? '-' : `${Math.round(v)} ms`);
  function summaryText(res) {
    const H = res.headline, S = res.series;
    const lines = [
      res.valid ? `${res.tierLabel} settle (${res.stage}): settled in ${ms(H.medianSettledMs)} median, ${ms(H.worstSettledMs)} worst · worst frame ${ms(H.worstBurstFrameMs)} · interrupt ${ms(H.medianInterruptDelayMs)} median, ${ms(H.worstInterruptDelayMs)} worst`
        : `${res.tierLabel} settle (${res.stage}): NOT VALID - ${res.invalidReason}`,
      S ? `series: ${S.count} of ${S.need} valid runs${S.complete ? ` · mean of medians ${ms(S.meanMedianSettledMs)} · worst run's worst ${ms(S.worstRun.worstSettledMs)}` : ''}${S.voided.length ? ` · ${S.voided.length} not valid` : ''}` : null,
      `stage ${res.stage} · ${res.viewport.orientation} · pixel ratio ${res.resolution.pixelRatio.join('/')} · buffer ${res.resolution.drawingBufferPx.join('x')} px · browser limit ${res.browserFrameRateHz} then ${res.browserFrameRateHzAfter} fps`,
      `GPU ${res.device.gpu || 'not reported'} · viewer ${res.viewer} · settle protocol ${res.protocol} · ${res.when}`,
    ];
    return lines.filter(Boolean).join('\n') + '\n\n' + JSON.stringify(res);
  }

  function resultCard(res) {
    const card = document.createElement('div');
    card.className = 'ob-card'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'Benchmark result');
    const H = res.headline, S = res.series;
    const head = document.createElement('div');
    head.className = 'ob-verdict ' + (res.valid ? 'ob-ok' : 'ob-void');
    head.textContent = res.valid ? `${res.tierLabel}: recorded` : `${res.tierLabel}: not valid`;
    card.appendChild(head);
    const p = document.createElement('p');
    p.textContent = res.valid ? 'A baseline measurement - there is no pass mark yet.' : `${res.invalidReason[0].toUpperCase() + res.invalidReason.slice(1)}. Leave the page in front and untouched, and run it again.`;
    card.appendChild(p);
    if (res.valid) {
      const grid = document.createElement('div');
      grid.className = 'ob-grid';
      const cell = (value, label) => { const d = document.createElement('div'); const b = document.createElement('b'); b.textContent = value; const s = document.createElement('small'); s.textContent = label; d.append(b, s); return d; };
      grid.append(cell(ms(H.medianSettledMs), 'time to settled image (median)'), cell(ms(H.worstSettledMs), 'slowest stop'),
        cell(ms(H.worstBurstFrameMs), 'longest frame while settling'), cell(ms(H.medianInterruptDelayMs), 'interrupt delay (median)'));
      card.appendChild(grid);
    }
    if (S) {
      const s = document.createElement('p');
      s.className = 'ob-series';
      s.textContent = S.stored === false ? 'This browser would not keep results between page loads - copy each result instead.'
        : S.complete ? `Series complete: ${S.need} valid runs. Mean of the medians ${ms(S.meanMedianSettledMs)}; slowest stop of the worst run ${ms(S.worstRun.worstSettledMs)}.${S.voided.length ? ` ${S.voided.length} not-valid runs not counted.` : ''}`
          : `Run ${S.count} of ${S.need}${S.counted ? '' : ' (this run was not counted)'}. A result needs ${S.need} valid runs: tap Run again.${S.voided.length ? ` Not-valid runs so far: ${S.voided.length}.` : ''}`;
      card.appendChild(s);
    }
    const detail = document.createElement('p');
    detail.className = 'ob-detail';
    detail.textContent = `${res.stage === 'light' ? 'Light' : 'Dark'} stage · pixel ratio ${res.resolution.pixelRatio.join('/')} · ${res.resolution.canvasCssPx.join(' x ')} CSS px · GPU: ${res.device.gpu || 'not reported'} · viewer ${res.viewer}`;
    card.appendChild(detail);
    const buttons = document.createElement('div');
    buttons.className = 'ob-buttons';
    const copy = document.createElement('button');
    copy.type = 'button'; copy.className = 'ob-go'; copy.textContent = 'Copy results';
    copy.onclick = async () => {
      const text = summaryText(res);
      try { await navigator.clipboard.writeText(text); copy.textContent = 'Copied'; return; } catch (e) { /* not a secure context */ }
      if (!el.copyBox) { el.copyBox = document.createElement('textarea'); el.copyBox.className = 'ob-copy'; el.copyBox.readOnly = true; card.appendChild(el.copyBox); }
      el.copyBox.value = text; el.copyBox.focus(); el.copyBox.select();
    };
    const again = document.createElement('button');
    again.type = 'button'; again.className = 'ob-go ob-ghost';
    again.textContent = S && S.complete ? 'Start a new series' : 'Run again';
    again.onclick = () => { if (S && S.complete) { const all = readSeries(); delete all[S.key]; writeSeries(all); } location.reload(); };
    buttons.append(copy, again);
    card.appendChild(buttons);
    document.body.appendChild(card);
    el.card = card;
    window.__GEN2_BENCH_RESULT__ = res;
  }

  startCard();
  if (params.get('autostart') === '1') start();
  // read-only state for a harness that drives the page (integration/scripts/p56)
  return { tick, afterFrame, start, get phase() { return state.phase; }, get result() { return state.result; },
    get frames() { return state.F.t.length; }, get segment() { return state.phase === 'run' ? segs[state.seg] : null; } };
}
