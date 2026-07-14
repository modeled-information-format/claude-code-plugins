import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  GOAL_CHECKLIST,
  DETERMINISTIC_CHECKLIST_KEYS,
  scoreDeterministicChecklist,
  extractVerifyCommands,
  assertChecksGrounded,
  lintChecksBalance,
} from '../lib/goal-checklist.mjs';
import goldenSet from '../golden-sets/goals.json' with { type: 'json' };

test('GOAL_CHECKLIST names all 7 items with exactly 3 marked deterministic', () => {
  const keys = GOAL_CHECKLIST.map((item) => item.key);
  assert.deepEqual(
    keys.sort(),
    [
      'achievable',
      'boundedConstraints',
      'measurableVerifyCommand',
      'relevant',
      'specific',
      'timeBound',
      'twoExpertsAgreeVerdict',
    ].sort(),
  );
  assert.deepEqual(DETERMINISTIC_CHECKLIST_KEYS.slice().sort(), [
    'boundedConstraints',
    'measurableVerifyCommand',
    'timeBound',
  ]);
  for (const item of GOAL_CHECKLIST) {
    assert.equal(typeof item.description, 'string');
    assert.ok(item.description.length > 0);
    assert.equal(typeof item.deterministic, 'boolean');
  }
});

test('golden set good entries pass every deterministic checklist item', () => {
  for (const entry of goldenSet.entries.filter((e) => e.label === 'good')) {
    const scores = scoreDeterministicChecklist(entry.content);
    for (const key of DETERMINISTIC_CHECKLIST_KEYS) {
      assert.equal(scores[key], true, `expected "${entry.id}" to pass "${key}", got ${JSON.stringify(scores)}`);
    }
  }
});

test('golden set bad entries fail every deterministic checklist item', () => {
  for (const entry of goldenSet.entries.filter((e) => e.label === 'bad')) {
    const scores = scoreDeterministicChecklist(entry.content);
    for (const key of DETERMINISTIC_CHECKLIST_KEYS) {
      assert.equal(scores[key], false, `expected "${entry.id}" to fail "${key}", got ${JSON.stringify(scores)}`);
    }
  }
});

test('scoreDeterministicChecklist returns only the deterministic subset', () => {
  const scores = scoreDeterministicChecklist('stop after 5 turns. `npm test`. Constraints: none.');
  assert.deepEqual(Object.keys(scores).sort(), DETERMINISTIC_CHECKLIST_KEYS.slice().sort());
});

test('scoreDeterministicChecklist tolerates non-string input without throwing', () => {
  assert.deepEqual(scoreDeterministicChecklist(undefined), {
    measurableVerifyCommand: false,
    timeBound: false,
    boundedConstraints: false,
  });
});

test('extractVerifyCommands finds command-shaped backticked spans and skips prose', () => {
  assert.deepEqual(extractVerifyCommands('run `pytest test/auth -q` and `ruff check src/auth`'), [
    'pytest test/auth -q',
    'ruff check src/auth',
  ]);
  assert.deepEqual(extractVerifyCommands('make it `better` in a `nice way`'), []);
  assert.deepEqual(extractVerifyCommands('no backticks at all'), []);
});

test('extractVerifyCommands excludes triple-backtick fenced blocks', () => {
  assert.deepEqual(extractVerifyCommands('```\nnpm test\n```'), []);
});

test('extractVerifyCommands is order-preserving and returns [] for non-string input', () => {
  assert.deepEqual(extractVerifyCommands('`git status` then `npm run build`'), [
    'git status',
    'npm run build',
  ]);
  assert.deepEqual(extractVerifyCommands(undefined), []);
});

test('timeBound: matches "stop after/within N" but not a bare mention of "stop"', () => {
  assert.equal(scoreDeterministicChecklist('Stop after 15 turns and report.').timeBound, true);
  assert.equal(scoreDeterministicChecklist('Stop within 30 minutes and report.').timeBound, true);
  assert.equal(scoreDeterministicChecklist('Do not stop working on this.').timeBound, false);
  assert.equal(scoreDeterministicChecklist('Stop once tests are green.').timeBound, false, 'no numeric bound present');
  assert.equal(scoreDeterministicChecklist('no time bound mentioned here').timeBound, false);
});

test('boundedConstraints: matches an explicit "Constraints:" section', () => {
  assert.equal(scoreDeterministicChecklist('Constraints: only touch src/.').boundedConstraints, true);
  assert.equal(scoreDeterministicChecklist('Constraint: no new deps.').boundedConstraints, true);
  assert.equal(scoreDeterministicChecklist('no scope limits stated').boundedConstraints, false);
});

// --- Task #72: per-check grounding ---

test('assertChecksGrounded passes when every check has a non-empty groundedIn', () => {
  assert.doesNotThrow(() =>
    assertChecksGrounded([
      { id: 'a', groundedIn: 'observed flaky retry bug in issue #12' },
      { id: 'b', groundedIn: 'acceptance criteria pattern: exit-code discipline' },
    ]),
  );
});

test('assertChecksGrounded throws naming every check missing groundedIn', () => {
  assert.throws(
    () =>
      assertChecksGrounded([
        { id: 'a', groundedIn: 'fine' },
        { id: 'b', groundedIn: '' },
        { id: 'c' },
      ]),
    /checks\[1\].*"b"[\s\S]*checks\[2\].*"c"/,
  );
});

test('assertChecksGrounded rejects an empty checks[] array', () => {
  assert.throws(() => assertChecksGrounded([]), /non-empty array/);
  assert.throws(() => assertChecksGrounded(null), /non-empty array/);
});

// --- Task #75: balanced-criteria structural linter ---

test('lintChecksBalance passes when negativeCaseApplicable checks carry a negativeCase', () => {
  const { balanced, violations } = lintChecksBalance([
    { id: 'a', assertion: 'tests pass', negativeCaseApplicable: false },
    {
      id: 'b',
      assertion: 'no secrets in diff',
      negativeCaseApplicable: true,
      negativeCase: 'a diff containing a fake API key is flagged',
    },
  ]);
  assert.equal(balanced, true);
  assert.deepEqual(violations, []);
});

test('lintChecksBalance flags a check missing its required negativeCase', () => {
  const { balanced, violations } = lintChecksBalance([
    { id: 'b', assertion: 'no secrets in diff', negativeCaseApplicable: true },
  ]);
  assert.equal(balanced, false);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].id, 'b');
});

test('lintChecksBalance never flags a check with negativeCaseApplicable: false for lacking one', () => {
  const { balanced } = lintChecksBalance([
    { id: 'a', assertion: 'build succeeds', negativeCaseApplicable: false },
  ]);
  assert.equal(balanced, true);
});

test('lintChecksBalance flags a check missing its positive assertion', () => {
  const { balanced, violations } = lintChecksBalance([{ id: 'a', assertion: '' }]);
  assert.equal(balanced, false);
  assert.equal(violations[0].reason, 'missing a positive assertion');
});

test('lintChecksBalance throws on non-array input', () => {
  assert.throws(() => lintChecksBalance('not an array'), /must be an array/);
});
