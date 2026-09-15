/* THE ORBIT BENCHMARK (?bench=orbit, Joey relaying Astra 2026-09-14) - the pure half of viewer/js/orbit-bench.js.
 *
 * Three things a benchmark result silently depends on, each pinned here:
 *   - THE WORKLOAD: the build every 2026-09-14 measurement used, part for part. Results from two different workloads do
 *     not compare, and a generator change would otherwise move the benchmark without anyone deciding to.
 *   - THE STATISTICS: every expected value below is worked out by hand from a constructed frame sequence, never by
 *     re-running the formula under test.
 *   - THE PATH: a function of time, fitted to the narrower field of view, so a portrait phone renders the same parts.
 * The browser half (the cards, the run, the copy button) is exercised in a real browser - integration/scripts/p33.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bench = await import(pathToFileURL(join(root, 'viewer', 'js', 'orbit-bench.js')).href);
const { generateManifest } = await import(pathToFileURL(join(root, 'viewer', 'js', 'generate.js')).href);

/* timestamps from a list of intervals, starting at 1000 ms */
const fromIntervals = (iv) => { const t = [1000]; for (const d of iv) t.push(t[t.length - 1] + d); return t; };
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test('the workload is the 80-unit build of the 2026-09-14 measurements, part for part', () => {
  const gen = generateManifest(bench.benchBuild());
  assert.ok(gen.manifest, 'the benchmark build must generate: ' + (gen.errors || []).join('; '));
  const m = gen.manifest;
  const typeOf = Object.fromEntries(m.parts.map((p) => [p.node, p.type]));
  const byType = {};
  for (const i of m.instances) byType[typeOf[i.node]] = (byType[typeOf[i.node]] || 0) + 1;
  assert.equal(m.instances.length, 1268);
  // the counts integration/scripts/p28-p32 measured on (vault measurements.md, "An 80-unit build ...")
  assert.deepEqual(byType, { FootrailL: 9, Foot: 34, Case: 80, QuickLock: 160, MagnetClip: 160, Magnet: 160, Stopper: 160, CoverL: 9,
    CoverU: 8, Drawer: 80, Faceplate: 80, BackCover: 80, Handle: 80, Screw: 160, FootrailU: 8 });
  assert.equal(m.steps.length, 89);
  assert.equal(String(m.collection), '185');
});

test('a steady 40 fps: every statistic reads 40 fps / 25 ms, and it passes', () => {
  const s = bench.summarizeFrames(fromIntervals(Array(1200).fill(25)));   // 30.000 s of 25 ms frames
  assert.equal(s.frames, 1201);
  assert.ok(close(s.meanFps, 40));
  assert.ok(close(s.avgFrameMs, 25));
  assert.ok(close(s.onePercentLowFps, 40));
  assert.ok(close(s.worst2sFps, 40), `worst 2 s window ${s.worst2sFps}`);   // 80 frames in every 2 s span
  assert.equal(s.medianFrameMs, 25);
  assert.equal(s.p95FrameMs, 25);
  assert.equal(s.maxFrameMs, 25);
  assert.equal(s.pauses, 0);
  assert.equal(s.pass, true);
});

test('one 1-second hitch in 50 fps: the mean barely moves, the low and the worst window do', () => {
  // 1,451 frames of 20 ms and one of 1,000 ms: 1,452 intervals over 30,020 ms
  const iv = Array(1452).fill(20); iv[700] = 1000;
  const s = bench.summarizeFrames(fromIntervals(iv));
  assert.ok(close(s.meanFps, 1452 / 30.02), `mean ${s.meanFps}`);                 // 48.37 fps
  // slowest 1%: ceil(14.52) = 15 intervals = the hitch + 14 of 20 ms = 1,280 ms -> 85.33 ms each -> 11.72 fps
  assert.ok(close(s.onePercentLowFps, 1000 / (1280 / 15)), `1% low ${s.onePercentLowFps}`);
  // any 2 s span holding the hitch: m frames before it, the hitch, then (1000 - 20m) / 20 after = 51 frames -> 25.5 fps
  assert.ok(close(s.worst2sFps, 25.5), `worst 2 s window ${s.worst2sFps}`);
  assert.equal(s.medianFrameMs, 20);
  assert.equal(s.p95FrameMs, 20);      // nearest rank 1,380 of 1,452 is still a 20 ms frame
  assert.equal(s.maxFrameMs, 1000);
  assert.equal(s.pauses, 1);
  assert.equal(s.pass, true);
});

test('a stall longer than the window reads 0 fps there, however good the rest was', () => {
  const iv = Array(1400).fill(20); iv[300] = 2500;
  assert.equal(bench.summarizeFrames(fromIntervals(iv)).worst2sFps, 0);
});

test('the pass rule is ">= 30 fps average", exactly at the boundary', () => {
  // 33, 33, 34 ms repeating: 900 intervals over exactly 30,000 ms = 30.000 fps, in integers
  const at = []; for (let k = 0; k < 300; k++) at.push(33, 33, 34);
  const s = bench.summarizeFrames(fromIntervals(at));
  assert.ok(close(s.meanFps, 30), `mean ${s.meanFps}`);
  assert.equal(s.pass, true, '30.0 fps average passes');
  const below = []; for (let k = 0; k < 300; k++) below.push(33, 34, 34);   // 30,300 ms: 29.70 fps
  assert.equal(bench.summarizeFrames(fromIntervals(below)).pass, false);
});

test('the card never prints a failing average as the target: 29.96 reads 29.96, not 30.0 beside FAIL', () => {
  assert.equal(bench.formatFps(29.96), '29.96');
  assert.equal(bench.formatFps(29.999), '29.99');     // floored, so it cannot round up to 30.00 either
  assert.equal(bench.formatFps(29.94), '29.9');       // rounds to 29.9 already - no second decimal needed
  assert.equal(bench.formatFps(30), '30');
  assert.equal(bench.formatFps(102.63), '102.6');
  assert.equal(bench.formatFps(NaN), '-');
  // and the rule it sits beside stays exact: 29.96 fps fails
  const iv = Array(900).fill(1000 / 29.96);
  const s = bench.summarizeFrames(fromIntervals(iv));
  assert.ok(close(s.meanFps, 29.96, 1e-6));
  assert.equal(s.pass, false);
});

test('a result within 10% of the browser\'s own frame limit is flagged: the device may be faster than it', () => {
  assert.equal(bench.atBrowserLimit(29.5, 30), true);     // a battery saver's 30 fps cap
  assert.equal(bench.atBrowserLimit(54, 60), true);       // exactly 90% of a 60 Hz screen
  assert.equal(bench.atBrowserLimit(53.9, 60), false);
  assert.equal(bench.atBrowserLimit(102.6, 120), false);  // 85.5% of a 120 Hz limit
  assert.equal(bench.atBrowserLimit(63, 60), true);       // 105% exactly: still the limit, timing jitter
  assert.equal(bench.atBrowserLimit(110, 60), false);     // 183%: the at-rest reading was not the limit (adaptive refresh)
  assert.equal(bench.atBrowserLimit(50, null), false);    // unmeasured limit: never claim one
  assert.equal(bench.atBrowserLimit(NaN, 60), false);
});

test('the median is the mean of the two middle values for an even count, not the upper one', () => {
  assert.equal(bench.median([1, 100]), 50.5);             // review 01a0a37b's case
  assert.equal(bench.median([3, 1, 2]), 2);
  assert.equal(bench.median([4, 1, 3, 2]), 2.5);
  assert.equal(bench.median([]), null);
});

/* judgeRun on frame sequences built by hand: which runs count, and what the card says beside them */
const judge = (iv, extra = {}) => bench.judgeRun({ stats: bench.summarizeFrames(fromIntervals(iv)), browserHz: 120, browserHzAfter: 120, ...extra });
test('a clean run counts and carries no notes', () => {
  const j = judge(Array(1200).fill(25));
  assert.deepEqual([j.valid, j.invalidReason, j.kind, j.limited, j.notes], [true, null, null, false, []]);
});
test('a pause of half a second voids the run, and says the numbers are kept in case the pauses are the device', () => {
  const iv = Array(1452).fill(20); iv[700] = 600;                   // one 600 ms interval on a 20 ms device
  const j = judge(iv);
  assert.equal(j.valid, false);
  assert.equal(j.kind, 'pauses');
  assert.equal(j.invalidReason, '1 pause of half a second or more during the run');
  assert.equal(j.notes.length, 1);
  assert.match(j.notes[0], /untouched, the pauses are this device's own/);
  const two = Array(1452).fill(20); two[100] = 500; two[900] = 800; // exactly 500 counts
  assert.equal(judge(two).invalidReason, '2 pauses of half a second or more during the run');
  const under = Array(1452).fill(20); under[700] = 499.9;           // just under does not
  assert.equal(judge(under).valid, true);
});
test('a device whose every frame takes half a second is not voided for pauses - it fails on its average instead', () => {
  const s = bench.summarizeFrames(fromIntervals(Array(60).fill(600)));   // 1.67 fps for 36 s
  const j = bench.judgeRun({ stats: s, browserHz: 60, browserHzAfter: 60 });
  assert.equal(s.pass, false);
  assert.equal(j.valid, true);
  assert.equal(j.notes.length, 1);
  assert.match(j.notes[0], /median 600 ms.*60 long intervals are this device's ordinary frames/);
});
test('the browser\'s own frame rate may move by 10% between the readings before and after the run, no more', () => {
  const iv = Array(1200).fill(25);
  assert.equal(judge(iv, { browserHz: 104.2, browserHzAfter: 106.4 }).valid, true);   // p33's spread on one laptop
  const saver = judge(iv, { browserHz: 60, browserHzAfter: 30 });                     // a battery saver mid-run
  assert.equal(saver.valid, false);
  assert.equal(saver.invalidReason, "the browser's own frame rate changed during the run (60 to 30 frames a second)");
  assert.equal(judge(iv, { browserHz: 60, browserHzAfter: 66.1 }).valid, false);
  assert.equal(judge(iv, { browserHz: 60, browserHzAfter: null }).valid, true, 'an unread second value cannot void a run');
});
test('the first reason found wins, and every earlier signal is kept ahead of the statistics', () => {
  const paused = Array(1452).fill(20); paused[700] = 600;
  const s = bench.summarizeFrames(fromIntervals(paused));
  const j = (extra) => bench.judgeRun({ stats: s, browserHz: 60, browserHzAfter: 30, ...extra });
  assert.equal(j({ spoiled: 'the tab was hidden during the run' }).invalidReason, 'the tab was hidden during the run');
  assert.equal(j({ tierCount: 2 }).invalidReason, 'the quality tier changed during the run');
  assert.equal(j({ pixelRatioCount: 2 }).invalidReason, 'the pixel ratio changed during the run');
  assert.equal(j({ bufferSizeCount: 2 }).invalidReason, 'the window was resized during the run');
  assert.equal(j({}).kind, 'pauses', 'a pause is reported ahead of the frame-rate change');
  assert.equal(bench.judgeRun({ stats: bench.summarizeFrames([1, 2]) }).invalidReason, 'too few frames to measure');
  // a hidden tab that left too few frames reports the cause, not its consequence
  assert.equal(bench.judgeRun({ stats: bench.summarizeFrames([1, 2]), spoiled: 'the tab was hidden during the run' }).invalidReason,
    'the tab was hidden during the run');
});
test('the limit note appears on a valid run at the limit, and only there', () => {
  const at = judge(Array(900).fill(1000 / 58), { browserHz: 60, browserHzAfter: 60 });   // 58 fps on a 60 fps limit
  assert.equal(at.limited, true);
  assert.match(at.notes.at(-1), /own limit of 60 frames a second/);
  const over = judge(Array(3300).fill(1000 / 110), { browserHz: 60, browserHzAfter: 60 }); // adaptive refresh read low at rest
  assert.deepEqual([over.limited, over.notes], [false, []]);
});

test('it refuses to report numbers it cannot have', () => {
  assert.ok(bench.summarizeFrames([]).error);
  assert.ok(bench.summarizeFrames([1000, 1020]).error, 'one interval is not a measurement');
  assert.ok(bench.summarizeFrames([1000, 1020, 1010, 1040]).error, 'timestamps out of order');
  assert.ok(bench.summarizeFrames([5, 5, 5]).error, 'no time elapsed');
});

test('the orbit is a function of time and keeps the whole build in view at any aspect', () => {
  const r = 500;
  const a0 = bench.orbitPose(0, { radius: r, aspect: 16 / 9 });
  const a1 = bench.orbitPose(bench.ORBIT_PERIOD_S, { radius: r, aspect: 16 / 9 });
  assert.equal(a0.azimuth, 0);
  assert.ok(close(a1.azimuth, 2 * Math.PI), 'one full turn per period');
  assert.ok(close(a0.polar, (bench.ORBIT_POLAR_DEG * Math.PI) / 180));
  // landscape: the vertical field is the narrower one
  assert.ok(close(a0.distance, (bench.ORBIT_FIT * r) / Math.sin(((bench.BENCH_FOV / 2) * Math.PI) / 180)));
  // portrait: the horizontal field is narrower, so the camera must stand further back to keep every part in frame
  const portrait = bench.orbitPose(0, { radius: r, aspect: 0.5 });
  const hFov = 2 * Math.atan(Math.tan(((bench.BENCH_FOV / 2) * Math.PI) / 180) * 0.5);
  assert.ok(close(portrait.distance, (bench.ORBIT_FIT * r) / Math.sin(hFov / 2)));
  assert.ok(portrait.distance > a0.distance);
});

/* THE SERIES (Joey relaying Astra, 2026-09-15): "3 valid runs per device/tier, reload between runs, all 3 must meet the
   30 fps floor; report mean and worst run". A run enters by its own verdict; the numbers below are worked by hand. */
const entry = (meanFps, pass = meanFps >= 30, extra = {}) => ({ when: 't', pass, meanFps, onePercentLowFps: 10, worst2sFps: 20, avgFrameMs: 1000 / meanFps, canvasCssPx: [800, 600], bufferPx: [1200, 900], ...extra });

test('a device result is three valid runs that ALL reach the floor, reported with their mean and the worst run', () => {
  assert.equal(bench.SERIES_RUNS, 3);
  const s = bench.judgeSeries([entry(40), entry(35), entry(50)]);
  assert.deepEqual([s.complete, s.count, s.need, s.runsAtTarget, s.pass], [true, 3, 3, 3, true]);
  assert.ok(close(s.meanFps, 125 / 3), `mean ${s.meanFps}`);                    // (40 + 35 + 50) / 3 = 41.667
  assert.equal(s.worstRun.meanFps, 35);
  // one run under the floor fails the device, however high the mean: 70, 70 and 29 average 56.3
  const f = bench.judgeSeries([entry(70), entry(29), entry(70)]);
  assert.deepEqual([f.complete, f.runsAtTarget, f.pass], [true, 2, false]);
  assert.ok(close(f.meanFps, 169 / 3));
  assert.equal(f.worstRun.meanFps, 29);
});

test('a run counts by its own verdict: a 29.996 average the card prints as 29.99 does not reach the floor in the series', () => {
  const s = bench.judgeSeries([entry(40), entry(29.996, false), entry(40)]);
  assert.deepEqual([s.runsAtTarget, s.pass], [2, false]);
});

test('an unfinished series has no verdict - until one of its runs misses the floor, and then it cannot pass', () => {
  assert.deepEqual((({ count, complete, pass, meanFps, worstRun }) => [count, complete, pass, meanFps, worstRun])(bench.judgeSeries([])), [0, false, null, null, null]);
  assert.deepEqual((({ count, complete, pass }) => [count, complete, pass])(bench.judgeSeries([entry(40)])), [1, false, null]);
  assert.deepEqual((({ count, complete, pass }) => [count, complete, pass])(bench.judgeSeries([entry(40), entry(20)])), [2, false, false]);
});

test('a complete series is final: the next valid run opens a new series instead of sliding the window', () => {
  const done = { runs: [entry(40), entry(20), entry(40)], voided: [] };
  assert.deepEqual(bench.addToSeries(done, entry(60)), { runs: [entry(60)], voided: [], superseded: [], restarted: 'complete' }, 'a failed run cannot be re-run out of a finished series');
  assert.deepEqual(bench.addToSeries({ runs: [entry(40)], voided: [{ when: 'v', reason: 'r' }] }, entry(50)), { runs: [entry(40), entry(50)], voided: [{ when: 'v', reason: 'r' }], superseded: [], restarted: null });
  assert.deepEqual(bench.addToSeries(undefined, entry(50)), { runs: [entry(50)], voided: [], superseded: [], restarted: null });
  // only the first three of a longer list are ever judged
  assert.equal(bench.judgeSeries([entry(40), entry(40), entry(40), entry(10)]).pass, true);
});

test('a run on a different pixel workload starts a new series: the drawing buffer must be within 10% in pixels and aspect (review 01a0a567)', () => {
  assert.equal(bench.SERIES_SIZE_TOLERANCE, 0.1);
  const at = (w, h) => entry(40, true, { bufferPx: [w, h] });
  // 1200 x 900 = 1,080,000 px, aspect 1.333: 1200 x 820 is 91.1% of the pixels (aspect 1.463, +9.8%) - still the same workload
  assert.deepEqual(bench.addToSeries({ runs: [at(1200, 900)] }, at(1200, 820)).restarted, null);
  // 1200 x 800 is 88.9% of the pixels - another workload (the series it replaces is kept: the next test)
  assert.deepEqual(bench.addToSeries({ runs: [at(1200, 900)] }, at(1200, 800)).runs, [at(1200, 800)]);
  assert.equal(bench.addToSeries({ runs: [at(1200, 900)] }, at(1200, 800)).restarted, 'canvas');
  // the same pixels in another shape (1039 x 1039 = 1,079,521 px, aspect 1.0, -25%) - another workload
  assert.equal(bench.sameCanvas([1200, 900], [1039, 1039]), false);
  assert.equal(bench.sameCanvas([1200, 900], [1200, 900]), true);
  assert.equal(bench.sameCanvas(undefined, [1200, 900]), false, 'an unknown size never matches');
});

test('a not-valid run is listed in the open series whatever its page size, not counted - and after a complete series it opens the next one (review 01a0a567)', () => {
  // 1200 x 800 on a 1200 x 900 series: voided is the record of what happened while the series was open, so it is listed there
  const v = { when: 'x', reason: '1 pause of half a second or more during the run', bufferPx: [1200, 800] };
  assert.deepEqual(bench.addVoided({ runs: [entry(40)], voided: [] }, v), { runs: [entry(40)], voided: [v], superseded: [], restarted: null });
  assert.equal(bench.judgeSeries(bench.addVoided({ runs: [entry(40)] }, v).runs).count, 1);
  // after a complete series the not-valid run is the first thing in the next one, not dropped
  const done = { runs: [entry(40), entry(40), entry(40)], voided: [] };
  assert.deepEqual(bench.addVoided(done, v), { runs: [], voided: [v], superseded: [], restarted: 'complete' });
  // ...and a valid run then joins it, the not-valid run still listed
  assert.deepEqual(bench.addToSeries(bench.addVoided(done, v), entry(50)), { runs: [entry(50)], voided: [v], superseded: [], restarted: null });
  // what storage hands back that is not a series is an empty one
  for (const junk of [undefined, null, 'x', 7, [entry(40)], { runs: 'no' }]) assert.deepEqual(bench.normalizeSeries(junk), { runs: [], voided: [], superseded: [] });
});

test('an unfinished series a valid run on another page size replaces stays in the record: its runs, a failed one included, and its not-valid runs (review 01a0a567, second turn)', () => {
  const at = (w, h, fps) => entry(fps, fps >= 30, { bufferPx: [w, h], when: `${w}x${h}@${fps}` });
  const v = { when: 'v', reason: 'the tab was hidden during the run', bufferPx: [1200, 900] };
  // 1200 x 900: a run below the floor and a not-valid run; then the window is widened and a run passes
  let s = bench.addToSeries(undefined, at(1200, 900, 25));
  s = bench.addVoided(s, v);
  s = bench.addToSeries(s, at(1600, 900, 60));              // 1,440,000 px against 1,080,000: +33%
  assert.equal(s.restarted, 'canvas');
  assert.deepEqual([s.runs, s.voided], [[at(1600, 900, 60)], []]);
  assert.deepEqual(s.superseded, [{ bufferPx: [1200, 900], runs: [{ when: '1200x900@25', pass: false, meanFps: 25 }], voided: [v] }]);
  // back to 1200 x 900: both series left behind are listed, oldest first
  s = bench.addToSeries(s, at(1200, 900, 61));
  assert.deepEqual(s.superseded.map((x) => [x.bufferPx, x.runs.map((r) => r.meanFps)]), [[[1200, 900], [25]], [[1600, 900], [60]]]);
  // the series that completes carries them to its report; the one after it starts clean
  s = bench.addToSeries(s, at(1200, 900, 62));
  s = bench.addToSeries(s, at(1200, 900, 63));
  assert.deepEqual([bench.judgeSeries(s.runs).complete, bench.judgeSeries(s.runs).pass, s.superseded.length], [true, true, 2]);
  const next = bench.addToSeries(s, at(1200, 900, 64));
  assert.deepEqual([next.restarted, next.superseded, next.voided], ['complete', [], []]);
});

test('a run is judged on the frame times it keeps: at the target, the stored list decides (review 01a0a567, second turn)', () => {
  // two intervals totalling 66.66664 ms average 30.0000012 fps - a PASS on the raw timestamps. Kept to 0.01 ms they are
  // 0, 33.33 and 66.67: 66.67 ms, 29.9985 fps - a FAIL. The run is judged FAIL, the verdict its stored list gives back.
  const raw = [1000, 1033.3312, 1066.66664];
  assert.equal(bench.summarizeFrames(raw).pass, true, 'the raw timestamps would pass');
  const m = bench.measureRun(raw);
  assert.deepEqual(m.frameTimesMs, [0, 33.33, 66.67]);
  assert.equal(m.stats.pass, false);
  assert.deepEqual(m.stats, bench.summarizeFrames(JSON.parse(JSON.stringify(m.frameTimesMs))), 'what a result stores re-derives to exactly what it was judged on');
});

test('a series belongs to one series policy, protocol, viewer, tier, stage, orientation and pixel ratio', () => {
  const res = { protocol: 1, viewer: 'abc12345', tier: 'balanced', stage: 'dark', viewport: { orientation: 'landscape' },
    resolution: { pixelRatio: [1.5], canvasCssPx: [1587, 907], drawingBufferPx: [2380, 1360] }, when: 'w', browserFrameRateHz: 120.5, browserFrameRateHzAfter: 120.5,
    verdict: { pass: true, meanFpsExact: 98.142 }, timing: { onePercentLowFps: 43.3, worst2sFps: 74, avgFrameMs: 10.2, pauses: 0 }, frameTimesMs: [0, 10, 20] };
  const key = bench.seriesKey(res);
  // the whole key, part for part (the policy and the protocol are both 1 today, so checking one position alone proves nothing)
  assert.deepEqual(key.split('|'), [String(bench.SERIES_POLICY), '1', 'abc12345', 'balanced', 'dark', 'landscape', '1.5'], 'the series policy leads the key');
  const change = (patch) => bench.seriesKey({ ...res, ...patch });
  for (const [what, patch] of [['protocol', { protocol: 2 }], ['viewer', { viewer: 'dev' }], ['tier', { tier: 'high' }], ['stage', { stage: 'light' }],
    ['orientation', { viewport: { orientation: 'portrait' } }], ['pixel ratio', { resolution: { ...res.resolution, pixelRatio: [2] } }]]) {
    assert.notEqual(change(patch), key, `a different ${what} must start its own series`);
  }
  // what the series keeps: the verdict, the headline numbers, what judged the run valid, and the frame times to re-derive it
  assert.deepEqual(bench.seriesEntry(res), { when: 'w', pass: true, meanFps: 98.142, onePercentLowFps: 43.3, worst2sFps: 74, avgFrameMs: 10.2, pauses: 0,
    canvasCssPx: [1587, 907], bufferPx: [2380, 1360], browserFrameRateHz: 120.5, browserFrameRateHzAfter: 120.5, frameTimesMs: [0, 10, 20] });
});

test('a stored run can be re-derived: its frame times reproduce the average it was judged on', () => {
  // 900 intervals of 33, 33, 34 ms: 30,000 ms, 30.000 fps, worked by hand in the pass-rule test above
  const iv = []; for (let i = 0; i < 300; i++) iv.push(33, 33, 34);
  const t = fromIntervals(iv), s = bench.summarizeFrames(t);
  const frameTimesMs = t.map((x) => Math.round((x - t[0]) * 100) / 100);
  const e = bench.seriesEntry({ when: 'w', verdict: { pass: s.pass, meanFpsExact: Math.round(s.meanFps * 1000) / 1000 }, timing: { onePercentLowFps: 29.4, worst2sFps: 30, avgFrameMs: 33.3, pauses: 0 },
    resolution: { canvasCssPx: [1, 1], drawingBufferPx: [1, 1] }, browserFrameRateHz: 60, browserFrameRateHzAfter: 60, frameTimesMs });
  assert.ok(close(bench.summarizeFrames(e.frameTimesMs).meanFps, e.meanFps, 1e-9), `${bench.summarizeFrames(e.frameTimesMs).meanFps} vs ${e.meanFps}`);
});
