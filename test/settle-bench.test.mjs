/* The settle benchmark's statistics and void rules (viewer/js/settle-bench.js; protocol pre-registered in
   SETTLE-BENCH-PREREG-2026-09-16.md + amendment A1). Every run here is SIMULATED frame by frame with the viewer's own settle
   rules at a165f1a (main.js): the camera-motion debounce SETTLE_MS = 160 (qualityTick), the mirror hidden while moving and
   re-rendered on the first still frame (updateReflection), AO blocked while moving and adding one pass a frame after
   (holdAOForMotion / updateAO), the accumulator reset by a block and adding one sample a frame, drawing its mean once
   acc.n > ACC_WARMUP (accumFrame). The simulator decides when a hold ends with the module's own holdShouldEnd, as the page does.
   The expected numbers are worked by hand in the comments. SETTLE_BENCH_MODULE points the suite at a mutant copy. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const MOD = process.env.SETTLE_BENCH_MODULE ? pathToFileURL(process.env.SETTLE_BENCH_MODULE).href : '../viewer/js/settle-bench.js';
const B = await import(MOD);
const { runSegments, analyzeRun, judgeSettleRun, armConfig, holdShouldEnd, emptyFrames, COLUMNS, accumMemoryMb, HOLD_CAP_MS,
  addSettleRun, addSettleVoided, judgeSettleSeries, settleSeriesKey } = B;

const VH = (over = {}) => armConfig({ accum: true, ao: true, refl: true, ACC_SAMPLES: 24, ACC_WARMUP: 6, aoAccumMax: 16, ...over });
const HIGH = (over = {}) => armConfig({ accum: false, ao: true, refl: true, ACC_SAMPLES: 24, ACC_WARMUP: 6, aoAccumMax: 16, ...over });

/**
 * dur(g, segIndex, rowInSeg) -> this frame's duration in ms (default 10).
 * sab: { drift: stop, noPause: true (neither lite nor a hidden mirror), noLite: true, mirrorNeverHidden: true, noDetail: stop,
 *        noRestart: true, noRestartAfterInterrupt: true, stuckAt: stop (acc.n stops at 20), noRefl: true,
 *        renderHidden: stop (the mirror renders while hidden and is later shown without rendering),
 *        restartAt: [stop, row] (the accumulator is reset mid-hold, as a scene change would),
 *        offPose: stop (the rendered camera 0.5 mm from the commanded pose on every frame of that hold),
 *        noMean: stop (the accumulated mean is never drawn at that stop) }
 */
function simulate(cfg, { dur = () => 10, sab = {} } = {}) {
  const segs = runSegments();
  const F = emptyFrames();
  let t = 1000, g = 0, camChange = -1e9, moving = true;
  let reflOpacity = 0, reflCount = 0, aoBlocked = true, aoPasses = 0, passCount = 0;
  let accBlocked = true, accN = 0, sampleCount = 0, detailCount = 0, afterInterrupt = false;
  for (let si = 0; si < segs.length; si++) {
    const sg = segs[si];
    const rows = sg.kind === 'move' ? Math.round(sg.ms / 10) : Infinity;   // moves: fixed frame count at 10 ms
    const h0 = F.t.length;
    for (let r = 0; r < rows; r++) {
      const camChanged = sg.kind === 'move' || r === 0;
      if (camChanged) { camChange = t; moving = true; } else if (moving && t - camChange > 160) moving = false;
      const lite = moving;
      const hideMirror = !sab.noPause && !sab.mirrorNeverHidden;
      if (cfg.refl && sab.renderHidden === sg.stop && sg.kind === 'hold') {
        if (r === 0) reflCount++;             // rendered while hidden...
        if (!lite) reflOpacity = 0.16;        // ...then shown without a render
        else reflOpacity = 0;
      } else if (cfg.refl) {
        if (lite && hideMirror) reflOpacity = 0;
        // updateReflection: shown again on the first non-moving call, and re-rendered whenever the camera's key changed
        else if ((!lite || !hideMirror) && !sab.noRefl && (reflOpacity !== 0.16 || camChanged)) { reflOpacity = 0.16; reflCount++; }
      }
      if (cfg.ao) {
        if (lite) aoBlocked = true;
        else { if (aoBlocked) { aoPasses = 0; aoBlocked = false; } if (aoPasses < cfg.aoAccumMax) { aoPasses++; passCount++; } }
      }
      let accDrew = 0;
      if (cfg.accum) {
        if (moving) accBlocked = true;
        else {
          if (accBlocked) { if (!sab.noRestart && !(sab.noRestartAfterInterrupt && afterInterrupt)) accN = 0; accBlocked = false; }
          if (sab.restartAt && sab.restartAt[0] === sg.stop && sab.restartAt[1] === r) accN = 0;
          const cap = sab.stuckAt === sg.stop ? 20 : cfg.ACC_SAMPLES;
          if (accN < cap) { accN++; sampleCount++; if (sab.noDetail !== sg.stop) detailCount++; accDrew = accN > cfg.ACC_WARMUP ? 1 : 0; }
          else accDrew = 1;
          if (sab.noMean === sg.stop) accDrew = 0;
        }
      }
      F.t.push(t); F.seg.push(si); F.lite.push(sab.noPause || sab.noLite ? 0 : lite ? 1 : 0); F.accN.push(accN); F.accDrew.push(accDrew);
      F.aoPasses.push(aoPasses); F.sampleCount.push(sampleCount); F.detailCount.push(detailCount); F.passCount.push(passCount);
      F.reflCount.push(reflCount); F.reflOpacity.push(cfg.refl ? reflOpacity : -1);
      F.still.push(sg.kind === 'hold' && sab.drift === sg.stop && r === 5 ? 0 : 1);
      F.poseErr.push(sg.kind === 'hold' && sab.offPose === sg.stop ? 0.5 : 0);
      t += dur(g, si, r); g++;
      // the page decides at the start of the next frame, when this row's end (t) is known
      if (sg.kind === 'hold' && holdShouldEnd(F, h0, F.t.length - 1, cfg, sg.stopKind, t)) { afterInterrupt = sg.stopKind === 'interrupt'; break; }
    }
  }
  // the closing row: gives the final hold's last frame its end (the page does the same)
  F.t.push(t); F.seg.push(segs.length);
  for (const c of COLUMNS) if (c !== 't' && c !== 'seg') F[c].push(F[c][F[c].length - 1]);
  return F;
}
const judge = (F, cfg, extra = {}) => { const A = analyzeRun(F, cfg); return { A, J: judgeSettleRun({ analysis: A, frames: F.t.length, browserHz: 120, browserHzAfter: 120, ...extra }) }; };

test('the run: a 6 s lead-in, stops 0-13 45 degrees apart, cold / measured / interrupt / final', () => {
  const segs = runSegments();
  assert.equal(segs.length, 28);
  assert.deepEqual(segs[0], { kind: 'move', from: -90, to: 0, ms: 6000 });
  const holds = segs.filter((s) => s.kind === 'hold');
  assert.deepEqual(holds.map((h) => h.az), [0, 45, 90, 135, 180, 225, 270, 315, 360, 405, 450, 495, 540, 585]);
  assert.deepEqual(holds.map((h) => h.stopKind), ['cold', ...Array(8).fill('measured'), ...Array(4).fill('interrupt'), 'final']);
  for (const m of segs.slice(1).filter((s) => s.kind === 'move')) assert.deepEqual([m.to - m.from, m.ms], [45, 3000]);
});

test('Very High, dark, 10 ms frames: every number worked by hand', () => {
  /* A hold's frame k starts at tStill + 10k. The camera debounce ends when 10k > 160: frame 17 is the first still one.
     Frame 17: the mirror re-renders (ends 180), AO pass 1, sample 1. AO pass 16 at frame 32 (ends 330). Sample 7, the first
     drawn mean, at frame 23 (ends 240). Sample 24 at frame 40 (ends 410) = settled. Burst: frames 0..40, 41 frames of 10 ms.
     Interrupt: sample 12 at frame 28, then the first move frame: 10 + 10 = 20 ms. */
  const cfg = VH();
  const F = simulate(cfg);
  const { A, J } = judge(F, cfg);
  assert.equal(J.valid, true, J.invalidReason);
  const s1 = A.stops.find((s) => s.stop === 1);
  assert.deepEqual([s1.reflMs, s1.aoDoneMs, s1.firstMeanMs, s1.accDoneMs, s1.settledMs], [180, 330, 240, 410, 410]);
  assert.deepEqual([s1.burstFrames, s1.burstMaxFrameMs, s1.burstP95FrameMs, s1.burstMedianFrameMs, s1.burstOver2xMedian, s1.warmupMaxFrameMs, s1.settledFrameMs], [41, 10, 10, 10, 0, 10, 10]);
  assert.deepEqual([s1.samplesRendered, s1.detailSamples, s1.accRestarts], [24, 24, 0]);
  // margin: the settling frame ends at 410; the hold ends at the first frame START 1,000 ms later (1410 = frame 141), so its
  // last row is frame 140: 141 rows
  assert.equal(s1.rows, 141);
  const i9 = A.stops.find((s) => s.stop === 9);
  assert.deepEqual([i9.brokeOff, i9.burstFrameMs, i9.firstMoveFrameMs, i9.interruptDelayMs, i9.breakRow], [true, 10, 10, 20, 28]);
  assert.equal(i9.settled, false, 'an interrupt stop is not a settled stop');
  const H = A.headline;
  assert.deepEqual([H.medianSettledMs, H.worstSettledMs, H.medianFirstMeanMs, H.worstBurstFrameMs, H.medianInterruptDelayMs, H.worstInterruptDelayMs], [410, 410, 240, 10, 20, 20]);
  assert.ok(A.checks.restarted.length === 4 && A.checks.restarted.every((c) => c.ok), 'stops 10-13 restart after each interrupt');
  assert.equal(A.checks.paused.length, 13, 'every move but the lead-in is checked');
  assert.equal(A.cold.settledMs, 410);
});

test('High, dark: no accumulation fields, settle = AO or mirror, interrupt at half the AO passes', () => {
  /* AO pass 16 at frame 32, ends 330; mirror ends 180 -> settled 330. Interrupt: pass 8 at frame 24 -> 10 + 10. */
  const cfg = HIGH();
  const { A, J } = judge(simulate(cfg), cfg);
  assert.equal(J.valid, true, J.invalidReason);
  const s1 = A.stops.find((s) => s.stop === 1);
  assert.deepEqual([s1.settledMs, s1.firstMeanMs, s1.accDoneMs, s1.warmupMaxFrameMs, s1.samplesRendered], [330, null, null, null, null]);
  assert.equal(A.stops.find((s) => s.stop === 9).breakRow, 24);
  assert.equal(A.headline.medianFirstMeanMs, null);
  assert.equal(A.headline.worstWarmupFrameMs, null);
});

test('Very High, light (no reflection): settled = accumulation; a float-less device settles AO in one pass', () => {
  const cfg = VH({ refl: false, aoAccumMax: 1 });
  const { A, J } = judge(simulate(cfg), cfg);
  assert.equal(J.valid, true, J.invalidReason);
  const s1 = A.stops.find((s) => s.stop === 1);
  assert.deepEqual([s1.reflMs, s1.aoDoneMs, s1.settledMs], [null, 180, 410]);
});

test('burst statistics: one slow sample frame lands in max, p95 and over-2x; the warm-up max only when it is a double-render frame', () => {
  const segs = runSegments(); const s1 = segs.findIndex((s) => s.kind === 'hold' && s.stop === 1);
  const cfg = VH();
  // frame 20 of stop 1 is sample 4 (a warm-up frame): 90 ms. Everything after it in the hold shifts by 80 ms.
  const F = simulate(cfg, { dur: (g, si, r) => (si === s1 && r === 20 ? 90 : 10) });
  const { A, J } = judge(F, cfg);
  assert.equal(J.valid, true, J.invalidReason);
  const s = A.stops.find((x) => x.stop === 1);
  assert.deepEqual([s.settledMs, s.burstMaxFrameMs, s.burstOver2xMedian, s.warmupMaxFrameMs], [490, 90, 1, 90]);
  // p95 nearest rank of 41 values: rank ceil(38.95) = 39 -> still 10 (one outlier)
  assert.equal(s.burstP95FrameMs, 10);
  // frame 30 is sample 14, not a warm-up frame
  const G = simulate(cfg, { dur: (g, si, r) => (si === s1 && r === 30 ? 90 : 10) });
  assert.equal(judge(G, cfg).A.stops.find((x) => x.stop === 1).warmupMaxFrameMs, 10);
});

test('the cold stop: a compile stall there is S4, not a pause void; the same stall at a measured stop voids the run', () => {
  const segs = runSegments(); const s0 = segs.findIndex((s) => s.kind === 'hold' && s.stop === 0);
  const s3 = segs.findIndex((s) => s.kind === 'hold' && s.stop === 3);
  const cfg = VH();
  const cold = simulate(cfg, { dur: (g, si, r) => (si === s0 && r === 17 ? 700 : 10) });
  const c = judge(cold, cfg);
  assert.equal(c.J.valid, true, c.J.invalidReason);
  assert.deepEqual([c.A.cold.longIntervals, c.A.cold.burstMaxFrameMs, c.A.cold.settledMs], [1, 700, 1100]);
  assert.equal(c.A.headline.medianSettledMs, 410, 'the warm stops are untouched');
  const warm = judge(simulate(cfg, { dur: (g, si, r) => (si === s3 && r === 30 ? 600 : 10) }), cfg);
  assert.equal(warm.J.valid, false);
  assert.equal(warm.J.kind, 'pauses');
  assert.match(warm.J.invalidReason, /1 pause of half a second/);
});

test('sabotage: each broken promise voids the run with its own reason', () => {
  const cfg = VH();
  const cases = [
    [{ drift: 4 }, /camera was not exactly still during the hold at stop 4/],
    [{ stuckAt: 6 }, /stop 6 did not settle within 15 s \(accumulation\)/],
    [{ noRefl: true }, /stop 0 did not settle within 15 s \(floor reflection\)/],
    [{ noPause: true }, /did not pause during move/],
    [{ noLite: true }, /did not pause during move/],
    [{ mirrorNeverHidden: true }, /did not pause during move/],
    [{ renderHidden: 5 }, /stop 5 did not settle within 15 s \(floor reflection\)/],
    [{ noDetail: 2 }, /settle detail was not on for every accumulation sample at stop 2/],
  ];
  for (const [sab, re] of cases) {
    const { J } = judge(simulate(cfg, { sab }), cfg);
    assert.equal(J.valid, false, JSON.stringify(sab));
    assert.match(J.invalidReason, re, JSON.stringify(sab));
  }
});

test('an accumulator that is not restarted: at a full hold it never settles; after an interrupt the restart check says so', () => {
  const cfg = VH();
  const full = judge(simulate(cfg, { sab: { noRestart: true } }), cfg);
  assert.match(full.J.invalidReason, /stop 1 did not settle within 15 s \(accumulation\)/);
  /* carried on from 12 after each interrupt: stop 10's first sample reads 13, not 1. The run voids (the final stop then renders
     only 12 samples, so the detail check fires first in the pre-registered order), and the restart check itself fails. */
  const inter = judge(simulate(cfg, { sab: { noRestartAfterInterrupt: true } }), cfg);
  assert.equal(inter.J.valid, false);
  assert.deepEqual(inter.A.checks.restarted.map((c) => c.ok), [false, false, false, false]);
  const ok = judge(simulate(cfg), cfg);
  assert.deepEqual(ok.A.checks.restarted.map((c) => c.ok), [true, true, true, true]);
});

test('the inherited voids, in order, and the browser-rate drift last', () => {
  const cfg = VH(); const A = analyzeRun(simulate(cfg), cfg);
  const j = (x) => judgeSettleRun({ analysis: A, frames: 999, browserHz: 120, browserHzAfter: 120, ...x });
  assert.match(j({ spoiled: 'the tab was hidden during the run', tierCount: 2 }).invalidReason, /hidden/);
  assert.match(j({ tierCount: 2 }).invalidReason, /quality tier changed/);
  assert.match(j({ pixelRatioCount: 2 }).invalidReason, /pixel ratio/);
  assert.match(j({ bufferSizeCount: 2 }).invalidReason, /resized/);
  assert.match(j({ frames: 2 }).invalidReason, /too few frames/);
  assert.match(j({ browserHz: 120, browserHzAfter: 107 }).invalidReason, /browser's own frame rate changed/);
  assert.equal(j({ browserHz: 120, browserHzAfter: 109 }).valid, true, '9.2% is inside the 10% rule');
  assert.match(j({ browserHzAfter: null }).invalidReason, /could not be read/, 'a missing reading is not a pass');
  assert.match(j({ browserHz: NaN }).invalidReason, /could not be read/);
});

test('a run that stops early did not reach every stop', () => {
  const cfg = VH(); const F = simulate(cfg);
  const cut = F.seg.indexOf(20);
  for (const c of COLUMNS) F[c] = F[c].slice(0, cut);
  assert.match(judge(F, cfg).J.invalidReason, /did not reach every stop/);
});

test('a hold reaching the cap: the page ends it, the run is void', () => {
  const cfg = VH();
  const F = simulate(cfg, { sab: { stuckAt: 1 } });
  const segs = runSegments(); const s1 = segs.findIndex((s) => s.kind === 'hold' && s.stop === 1);
  const rows = F.seg.filter((v) => v === s1).length;
  assert.equal(rows, 1500, '15,000 ms of 10 ms frames: row 1499 ends at the cap, and the hold ends there');
});

test('memory is computed from the drawing buffer: 1920x1080 -> 39.6 MiB, 3840x2160 -> 158.2 MiB', () => {
  assert.equal(accumMemoryMb([1920, 1080]), 39.6);
  assert.equal(accumMemoryMb([3840, 2160]), 158.2);
});

test('the series: 3 valid runs; mean of the medians; the worst run by its slowest stop; a resize starts over', () => {
  const e = (m, w, px = [1920, 1080]) => ({ when: 'x', medianSettledMs: m, worstSettledMs: w, bufferPx: px });
  let rec = addSettleRun(null, e(400, 450));
  rec = addSettleVoided(rec, { reason: 'r', bufferPx: [1920, 1080] });
  rec = addSettleRun(rec, e(420, 700));
  rec = addSettleRun(rec, e(440, 500));
  const S = judgeSettleSeries(rec.runs);
  assert.deepEqual([S.complete, S.meanMedianSettledMs, S.worstRun.worstSettledMs, rec.voided.length], [true, 420, 700, 1]);
  const next = addSettleRun(rec, e(1, 1));
  assert.deepEqual([next.restarted, next.runs.length], ['complete', 1]);
  const resized = addSettleRun(addSettleRun(null, e(400, 450)), e(410, 460, [1280, 720]));
  assert.deepEqual([resized.restarted, resized.runs.length, resized.superseded.length], ['canvas', 1, 1]);
  const key = settleSeriesKey({ protocol: 1, viewer: 'v', tier: 'veryhigh', stage: 'dark', viewport: { orientation: 'landscape' }, resolution: { pixelRatio: [2] } });
  assert.equal(key, 'settle|1|1|v|veryhigh|dark|landscape|2');
});

test('the margin: the frames after the settling frame, not including it, and not one more (41..140 at 10 ms)', () => {
  const cfg = VH();
  const s1 = judge(simulate(cfg), cfg).A.stops.find((s) => s.stop === 1);
  assert.equal(s1.settledFrames, 100);
});

test('a stop whose settling frame ENDS after the cap is not settled, although the frame started inside it', () => {
  /* stop 4: frame 40 (the 24th sample) lasts 15,000 ms - it starts at 400 and ends at 15,400, past the 15,000 cap */
  const segs = runSegments(); const s4 = segs.findIndex((s) => s.kind === 'hold' && s.stop === 4);
  const cfg = VH();
  const { A, J } = judge(simulate(cfg, { dur: (g, si, r) => (si === s4 && r === 40 ? HOLD_CAP_MS : 10) }), cfg);
  assert.equal(A.stops.find((s) => s.stop === 4).settled, false);
  assert.match(J.invalidReason, /stop 4 did not settle within 15 s \(finished only after the 15 s cap\)/);
});

test('the rendered camera must be at the commanded view, not merely still', () => {
  const cfg = VH();
  const { A, J } = judge(simulate(cfg, { sab: { offPose: 3 } }), cfg);
  assert.equal(A.checks.still.every((c) => c.ok), true, 'a consistently wrong pose is still still');
  assert.match(J.invalidReason, /camera was not at stop 3's view \(0.5 mm from it\)/);
});

test('a missing statistic voids the run instead of shrinking the median', () => {
  const cfg = VH();
  const { A, J } = judge(simulate(cfg, { sab: { noMean: 5 } }), cfg);
  assert.deepEqual(A.incomplete, [{ stop: 5, statistic: 'firstMeanMs' }]);
  assert.match(J.invalidReason, /stop 5 has no firstMeanMs/);
});

test('a restart mid-hold: completion and the first mean come from the LAST accumulation', () => {
  /* reset at frame 45 (after sample 24 at frame 40): samples restart at 1 on frame 45, sample 7 (first mean) at 51 -> ends
     520, sample 24 at 68 -> ends 690. The mirror (180) and AO (330) are unchanged. Samples rendered: 24 + 24 = 48. */
  const cfg = VH();
  const { A, J } = judge(simulate(cfg, { sab: { restartAt: [2, 45] } }), cfg);
  assert.equal(J.valid, true, J.invalidReason);
  const s2 = A.stops.find((s) => s.stop === 2);
  assert.deepEqual([s2.accRestarts, s2.firstMeanMs, s2.accDoneMs, s2.settledMs, s2.samplesRendered], [1, 520, 690, 690, 48]);
});

test('burst percentile and outliers: two 15 ms and one 30 ms frame in 38', () => {
  /* frames 5-7 are 15, 15, 30 ms, so frame k >= 8 starts at 10k + 30. The debounce ends at the first start past 160: frame 14
     (170). Sample 24 at frame 37, ending at frame 38's start: 410. Burst frames 0..37: sorted 35 x 10, 15, 15, 30. p95 nearest
     rank = ceil(0.95 x 38) = 37 -> 15. Median 10. Over 2x the median (> 20): one. */
  const segs = runSegments(); const s1 = segs.findIndex((s) => s.kind === 'hold' && s.stop === 1);
  const cfg = VH();
  const F = simulate(cfg, { dur: (g, si, r) => (si !== s1 ? 10 : r === 5 || r === 6 ? 15 : r === 7 ? 30 : 10) });
  const s = judge(F, cfg).A.stops.find((x) => x.stop === 1);
  assert.deepEqual([s.settledMs, s.burstP95FrameMs, s.burstMedianFrameMs, s.burstOver2xMedian, s.burstMaxFrameMs], [410, 15, 10, 1, 30]);
});

test('the headline: worst is the slowest measured stop; the cold stop never enters it', () => {
  const segs = runSegments();
  const s3 = segs.findIndex((s) => s.kind === 'hold' && s.stop === 3), s0 = segs.findIndex((s) => s.kind === 'hold' && s.stop === 0);
  const cfg = VH();
  // stop 3 frame 30 (a sample frame): 200 ms, under the pause cut -> stop 3 settles at 600
  const H = judge(simulate(cfg, { dur: (g, si, r) => (si === s3 && r === 30 ? 200 : 10) }), cfg).A.headline;
  assert.deepEqual([H.medianSettledMs, H.worstSettledMs, H.worstBurstFrameMs], [410, 600, 200]);
  const C = judge(simulate(cfg, { dur: (g, si, r) => (si === s0 && r === 17 ? 700 : 10) }), cfg).A.headline;
  assert.deepEqual([C.worstSettledMs, C.worstBurstFrameMs], [410, 10]);
});
