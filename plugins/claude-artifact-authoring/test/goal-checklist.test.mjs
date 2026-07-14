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

test('golden set bad entries fail the deterministic checklist items applicable to their own content', () => {
  // Not a blanket "every bad entry must fail every deterministic item" loop
  // — an entry can be overall "bad" on the judgment-based items (two-experts,
  // specific/achievable/relevant) while still legitimately satisfying a
  // deterministic shape check, so asserting all-fail-always would make this
  // test brittle against future, more varied bad fixtures (mirrors
  // prompt-checklist.test.mjs's own pattern of only asserting the checks
  // actually applicable to its specific bad fixtures). Both current bad
  // entries happen to have zero backticks, zero stop conditions, and zero
  // constraints, so all three deterministic items are legitimately
  // applicable and checked here explicitly, by id.
  const byId = Object.fromEntries(goldenSet.entries.map((e) => [e.id, e]));
  for (const id of ['bad-make-it-better-goal', 'bad-vague-feature-goal']) {
    const scores = scoreDeterministicChecklist(byId[id].content);
    assert.equal(scores.measurableVerifyCommand, false, `expected "${id}" to fail measurableVerifyCommand`);
    assert.equal(scores.timeBound, false, `expected "${id}" to fail timeBound`);
    assert.equal(scores.boundedConstraints, false, `expected "${id}" to fail boundedConstraints`);
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

test('extractVerifyCommands rejects two-word prose that shape-matches but has no real CLI signal', () => {
  // Regression: an earlier version used a shape-only regex plus a small
  // fixed exclusion list of non-command first words, which a phrase like
  // `looks nice` or `works well` slipped past (neither "looks" nor "works"
  // was on the exclusion list) — scoring plain prose as a valid executable
  // verify command, exactly the false pass Task #70's bar exists to catch.
  assert.deepEqual(extractVerifyCommands('the plan `looks nice` overall'), []);
  assert.deepEqual(extractVerifyCommands('the code `works well` here'), []);
});

test('extractVerifyCommands does not count a bare single-token path reference as a command', () => {
  // Regression: a lone `test/auth` mentioned in prose (e.g. inside a
  // Constraints clause) is a path being referenced, not a command being
  // invoked — it must not inflate the extracted-commands count.
  assert.deepEqual(extractVerifyCommands('only touch files under `test/auth`'), []);
});

test('extractVerifyCommands recognizes flag tokens, path tokens, and known tool names as real CLI signals', () => {
  assert.deepEqual(extractVerifyCommands('`npm test`'), ['npm test']);
  assert.deepEqual(extractVerifyCommands('`ruff check src/auth`'), ['ruff check src/auth']);
  assert.deepEqual(extractVerifyCommands('`somebinary --strict`'), ['somebinary --strict']);
  assert.deepEqual(extractVerifyCommands('`unknownthing README.md`'), ['unknownthing README.md']);
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

test('boundedConstraints rejects a header that explicitly states there are no constraints', () => {
  // Regression: Copilot flagged that a bare "Constraints:" header matched
  // regardless of content, so "Constraints: none" (explicitly UNbounded)
  // was wrongly scored as a passing bounding constraint.
  assert.equal(scoreDeterministicChecklist('Constraints: none.').boundedConstraints, false);
  assert.equal(scoreDeterministicChecklist('Constraints: n/a.').boundedConstraints, false);
  assert.equal(scoreDeterministicChecklist('Constraints: no constraints.').boundedConstraints, false);
});

test('boundedConstraints rejects an empty "Constraints:" header with nothing after it', () => {
  assert.equal(scoreDeterministicChecklist('Constraints:\nStop after 5 turns.').boundedConstraints, false);
  assert.equal(scoreDeterministicChecklist('Constraints: .').boundedConstraints, false);
});

test('boundedConstraints does not truncate a decimal value in the constraint', () => {
  // Regression: Copilot flagged the identical truncation bug on
  // lib/loop-checklist.mjs's analogous STOP_CONDITION_HEADER (Story S8,
  // PR #110) — stopping the capture at the first "." cut a decimal
  // constraint like "under 0.5GB" down to "under 0". Fixed here the same
  // way: capture to end-of-line, reject punctuation-only bodies instead.
  assert.equal(
    scoreDeterministicChecklist('Constraints: keep memory under 0.5GB.').boundedConstraints,
    true,
  );
  assert.equal(scoreDeterministicChecklist('Constraints: 0.5.').boundedConstraints, true);
});

test('boundedConstraints rejects a punctuation-only body', () => {
  assert.equal(scoreDeterministicChecklist('Constraints: ,;.').boundedConstraints, false);
});

test('boundedConstraints still rejects an unbounded marker followed by unrelated trailing text on the same line', () => {
  // Regression found while reviewing this fix: widening the capture to
  // end-of-line (to preserve decimals) means the full body no longer
  // exactly equals "none" once trailing text is appended, so the
  // unbounded-marker check must be scoped to just the leading clause
  // rather than the whole widened capture.
  assert.equal(
    scoreDeterministicChecklist('Constraints: none. Stop after 5 minutes.').boundedConstraints,
    false,
  );
  assert.equal(
    scoreDeterministicChecklist('Constraints: n/a. Nothing else to add.').boundedConstraints,
    false,
  );
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
