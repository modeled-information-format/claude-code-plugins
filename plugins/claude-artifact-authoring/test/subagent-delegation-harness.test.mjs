import { test } from 'node:test';
import assert from 'node:assert/strict';

import { scoreDelegationCases, assertTestsBoundary } from '../lib/subagent-delegation-harness.mjs';

test('a perfect decision function scores 100% accuracy', () => {
  const cases = [
    { taskDescription: 'review this diff for bugs', shouldDelegate: true },
    { taskDescription: 'run the test suite', shouldDelegate: false },
  ];
  const decide = (task) => task.includes('review');
  const result = scoreDelegationCases(cases, decide);
  assert.equal(result.accuracy, 1);
  assert.equal(result.correct, 2);
  assert.equal(result.total, 2);
});

test('a genuinely wrong decision function is caught, not silently accepted', () => {
  const cases = [
    { taskDescription: 'review this diff for bugs', shouldDelegate: true },
    { taskDescription: 'fix the failing lint errors', shouldDelegate: false },
  ];
  const decide = () => true; // a broken "always delegate" decision function
  const result = scoreDelegationCases(cases, decide);
  assert.equal(result.accuracy, 0.5);
  assert.equal(result.correct, 1);
  assert.equal(result.results.find((r) => r.taskDescription.includes('lint')).correct, false);
});

test('scoreDelegationCases records per-case decided/correct fields', () => {
  const result = scoreDelegationCases(
    [{ taskDescription: 'x', shouldDelegate: true, label: 'hit-1' }],
    () => true,
  );
  assert.deepEqual(result.results, [
    { taskDescription: 'x', shouldDelegate: true, label: 'hit-1', decided: true, correct: true },
  ]);
});

test('scoreDelegationCases rejects an empty cases array or non-function decide', () => {
  assert.throws(() => scoreDelegationCases([], () => true), /non-empty array/);
  assert.throws(() => scoreDelegationCases([{ taskDescription: 'x', shouldDelegate: true }], 'nope'), /decide must be a function/);
});

test('scoreDelegationCases rejects a malformed case', () => {
  assert.throws(
    () => scoreDelegationCases([{ taskDescription: 'x' }], () => true),
    /each case needs a string taskDescription and boolean shouldDelegate/,
  );
});

// --- Task #92: hit AND miss, not just one side ---

test('assertTestsBoundary passes when both a hit and a miss case are present', () => {
  assert.doesNotThrow(() =>
    assertTestsBoundary([
      { taskDescription: 'a', shouldDelegate: true },
      { taskDescription: 'b', shouldDelegate: false },
    ]),
  );
});

test('assertTestsBoundary rejects a suite testing only hits or only misses', () => {
  assert.throws(
    () => assertTestsBoundary([{ taskDescription: 'a', shouldDelegate: true }]),
    /at least one hit.*AND one miss/,
  );
  assert.throws(
    () => assertTestsBoundary([{ taskDescription: 'a', shouldDelegate: false }]),
    /at least one hit.*AND one miss/,
  );
});

test('assertTestsBoundary rejects an empty array', () => {
  assert.throws(() => assertTestsBoundary([]), /non-empty array/);
});
