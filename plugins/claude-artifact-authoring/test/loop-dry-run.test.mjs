// Task #85's mechanism made real: these tests actually run dryRunLoop
// against scripted mock step/isDone functions and observe the real
// iteration counts and stop reasons, proving the harness genuinely detects
// whether a declared stop condition fires — not a simulation of a
// simulation.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dryRunLoop } from '../lib/loop-dry-run.mjs';

test('a goal-check stop condition that becomes true partway through actually stops the dry run there', () => {
  // Mirrors golden-sets/loops.json's "good-evaluator-optimizer-loop":
  // score improves each iteration until it crosses 0.9. Integer arithmetic
  // (score out of 10) deliberately avoids floating-point accumulation
  // error — 0.3 + 0.3 + 0.3 is 0.8999999999999999 in JS, not exactly 0.9,
  // which would silently shift this test's expected iteration count by one.
  const result = dryRunLoop({
    step: (state = { score: 0 }) => ({ score: state.score + 3 }),
    isDone: (state) => (state ? state.score >= 9 : false),
    maxIterations: 5,
  });
  assert.equal(result.stoppedBy, 'condition');
  assert.equal(result.iterations, 3); // 0 -> 3 -> 6 -> 9 (done check runs before the 4th step)
  assert.equal(result.ranAway, false);
  assert.equal(result.finalState.score, 9);
});

test('an iteration cap fires when the goal check never becomes true', () => {
  const result = dryRunLoop({
    step: (state = { score: 0 }) => ({ score: state.score + 0.01 }),
    isDone: (state) => (state ? state.score >= 0.9 : false),
    maxIterations: 5,
  });
  assert.equal(result.stoppedBy, 'iteration-cap');
  assert.equal(result.iterations, 5);
  assert.equal(result.ranAway, false);
});

test('a condition already satisfied at iteration 0 stops immediately without running step', () => {
  let stepCalled = false;
  const result = dryRunLoop({
    step: () => {
      stepCalled = true;
      return {};
    },
    isDone: () => true,
    maxIterations: 5,
  });
  assert.equal(result.iterations, 0);
  assert.equal(result.stoppedBy, 'condition');
  assert.equal(stepCalled, false);
});

test('Task #85: a broken stop condition that never fires is caught as ranAway, not silently accepted', () => {
  // Regression proof the harness is real: a loop with no maxIterations and
  // an isDone that never returns true must be caught by the hard ceiling,
  // not run forever.
  const result = dryRunLoop({
    step: (state = { n: 0 }) => ({ n: state.n + 1 }),
    isDone: () => false,
  });
  assert.equal(result.stoppedBy, null);
  assert.equal(result.ranAway, true);
  assert.ok(result.iterations >= 20, 'hard ceiling default minimum should have been applied');
});

test('a caller-supplied hardCeiling is honored even when maxIterations is much larger', () => {
  const result = dryRunLoop({
    step: (state = { n: 0 }) => ({ n: state.n + 1 }),
    isDone: () => false,
    maxIterations: 1000,
    hardCeiling: 7,
  });
  assert.equal(result.iterations, 7);
  assert.equal(result.ranAway, true);
});

test('a loop with no declared maxIterations relies purely on its own condition', () => {
  const result = dryRunLoop({
    step: (state = { n: 0 }) => ({ n: state.n + 1 }),
    isDone: (state) => (state ? state.n >= 4 : false),
  });
  assert.equal(result.stoppedBy, 'condition');
  assert.equal(result.iterations, 4);
});

test('dryRunLoop rejects non-function step/isDone', () => {
  assert.throws(() => dryRunLoop({ step: 'nope', isDone: () => true }), /step must be a function/);
  assert.throws(() => dryRunLoop({ step: () => {}, isDone: 'nope' }), /isDone must be a function/);
});

test('dryRunLoop rejects a negative, NaN, or non-integer maxIterations rather than silently misbehaving', () => {
  // Regression: Copilot flagged that a negative maxIterations previously
  // stopped "by cap" at iteration 0, and NaN/non-integer values were
  // accepted silently instead of being caught as misconfiguration.
  const step = () => ({});
  const isDone = () => false;
  assert.throws(() => dryRunLoop({ step, isDone, maxIterations: -1 }), /maxIterations must be a non-negative integer/);
  assert.throws(() => dryRunLoop({ step, isDone, maxIterations: NaN }), /maxIterations must be a non-negative integer/);
  assert.throws(() => dryRunLoop({ step, isDone, maxIterations: 2.5 }), /maxIterations must be a non-negative integer/);
});

test('dryRunLoop rejects a non-positive or non-integer hardCeiling', () => {
  // Regression: a hardCeiling <= 0 previously reported ranAway: true
  // without the loop ever running, masking a misconfiguration as a real
  // stop-condition failure.
  const step = () => ({});
  const isDone = () => false;
  assert.throws(() => dryRunLoop({ step, isDone, hardCeiling: 0 }), /hardCeiling must be a positive integer/);
  assert.throws(() => dryRunLoop({ step, isDone, hardCeiling: -5 }), /hardCeiling must be a positive integer/);
  assert.throws(() => dryRunLoop({ step, isDone, hardCeiling: 3.5 }), /hardCeiling must be a positive integer/);
});

test('dryRunLoop accepts maxIterations: 0 as a legitimate "never step" declaration', () => {
  let stepCalled = false;
  const result = dryRunLoop({
    step: () => {
      stepCalled = true;
      return {};
    },
    isDone: () => false,
    maxIterations: 0,
  });
  assert.equal(result.stoppedBy, 'iteration-cap');
  assert.equal(result.iterations, 0);
  assert.equal(stepCalled, false);
});
