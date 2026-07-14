import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SIX_AGENT_PATTERNS,
  LOOP_CHECKLIST,
  DETERMINISTIC_CHECKLIST_KEYS,
  scoreDeterministicChecklist,
  extractDeclaredPattern,
  assertPatternSelectionGrounded,
} from '../lib/loop-checklist.mjs';
import goldenSet from '../golden-sets/loops.json' with { type: 'json' };

test('SIX_AGENT_PATTERNS names exactly Anthropic\'s six patterns', () => {
  assert.deepEqual(SIX_AGENT_PATTERNS.slice().sort(), [
    'evaluator-optimizer',
    'fully autonomous',
    'orchestrator-workers',
    'parallelization',
    'prompt chaining',
    'routing',
  ].sort());
});

test('LOOP_CHECKLIST names all 5 items with exactly 2 marked deterministic', () => {
  const keys = LOOP_CHECKLIST.map((item) => item.key);
  assert.deepEqual(
    keys.sort(),
    [
      'patternNamed',
      'patternAppropriate',
      'notDefaultAutonomous',
      'explicitStopCondition',
      'timeBasedPolicyDeclared',
    ].sort(),
  );
  assert.deepEqual(DETERMINISTIC_CHECKLIST_KEYS.slice().sort(), [
    'explicitStopCondition',
    'patternNamed',
  ]);
  for (const item of LOOP_CHECKLIST) {
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
  // (see lib/goal-checklist.mjs's own history — Copilot flagged that exact
  // pattern as brittle on Story S7's PR): "bad-loop-with-soft-stop" DOES
  // explicitly declare "Pattern: fully autonomous." — it's bad because
  // autonomy was never justified and it has no stop condition, not because
  // it omits a pattern declaration. Checked explicitly, by id.
  const byId = Object.fromEntries(goldenSet.entries.map((e) => [e.id, e]));

  const unbounded = scoreDeterministicChecklist(byId['bad-unbounded-keep-going-loop'].content);
  assert.equal(unbounded.patternNamed, false, 'expected no pattern declaration at all');
  assert.equal(unbounded.explicitStopCondition, false);

  const softStop = scoreDeterministicChecklist(byId['bad-loop-with-soft-stop'].content);
  assert.equal(softStop.patternNamed, true, 'this entry does declare a pattern — it is bad for other reasons');
  assert.equal(softStop.explicitStopCondition, false);
});

test('a loop naming "fully autonomous" but with no explicit stop condition passes patternNamed yet fails explicitStopCondition', () => {
  // A declared pattern alone must not be conflated with a passing stop
  // condition — golden-sets/loops.json's own "bad-loop-with-soft-stop"
  // entry names a pattern but has no "Stop condition:" header at all.
  const scores = scoreDeterministicChecklist(
    'Pattern: fully autonomous. Run until the task feels complete, using your best judgment.',
  );
  assert.equal(scores.patternNamed, true);
  assert.equal(scores.explicitStopCondition, false);
});

test('scoreDeterministicChecklist returns only the deterministic subset', () => {
  const scores = scoreDeterministicChecklist('Pattern: routing. Stop condition: after routing completes.');
  assert.deepEqual(Object.keys(scores).sort(), DETERMINISTIC_CHECKLIST_KEYS.slice().sort());
});

test('scoreDeterministicChecklist tolerates non-string input without throwing', () => {
  assert.deepEqual(scoreDeterministicChecklist(undefined), {
    patternNamed: false,
    explicitStopCondition: false,
  });
});

test('extractDeclaredPattern recognizes all six patterns case-insensitively', () => {
  for (const pattern of SIX_AGENT_PATTERNS) {
    assert.equal(extractDeclaredPattern(`Pattern: ${pattern}. more text.`), pattern);
    assert.equal(extractDeclaredPattern(`PATTERN: ${pattern.toUpperCase()}. more text.`), pattern);
  }
});

test('extractDeclaredPattern returns null when no recognized pattern is declared', () => {
  assert.equal(extractDeclaredPattern('Pattern: some made up thing.'), null);
  assert.equal(extractDeclaredPattern('no pattern declaration at all'), null);
  assert.equal(extractDeclaredPattern(undefined), null);
});

test('explicitStopCondition rejects an empty "Stop condition:" header or one that bleeds into the next sentence', () => {
  assert.equal(scoreDeterministicChecklist('Stop condition:\nPattern: routing.').explicitStopCondition, false);
  assert.equal(scoreDeterministicChecklist('Stop condition: .').explicitStopCondition, false);
  assert.equal(
    scoreDeterministicChecklist('Stop condition: max 3 iterations.').explicitStopCondition,
    true,
  );
});

test('explicitStopCondition rejects an unbounded marker, mirroring goal-checklist.mjs\'s boundedConstraints fix', () => {
  // Same false positive Copilot flagged on lib/goal-checklist.mjs's
  // "Constraints: none" — a "Stop condition:" header explicitly stating
  // there IS no real condition must not score as if a real one were
  // declared.
  assert.equal(scoreDeterministicChecklist('Stop condition: none.').explicitStopCondition, false);
  assert.equal(scoreDeterministicChecklist('Stop condition: n/a.').explicitStopCondition, false);
  assert.equal(
    scoreDeterministicChecklist('Stop condition: no stop condition.').explicitStopCondition,
    false,
  );
});

// --- Task #82: pattern-selection grounding ---

test('assertPatternSelectionGrounded passes for a valid pattern with a non-empty rationale', () => {
  assert.doesNotThrow(() =>
    assertPatternSelectionGrounded({
      pattern: 'evaluator-optimizer',
      rationale: 'iterative quality improvement against a scorable rubric (Building Effective Agents)',
    }),
  );
});

test('assertPatternSelectionGrounded rejects an unrecognized pattern', () => {
  assert.throws(
    () => assertPatternSelectionGrounded({ pattern: 'made-up-pattern', rationale: 'because' }),
    /must name one of the six agent patterns/,
  );
});

test('assertPatternSelectionGrounded rejects a missing or empty rationale', () => {
  assert.throws(
    () => assertPatternSelectionGrounded({ pattern: 'routing', rationale: '' }),
    /missing a non-empty rationale/,
  );
  assert.throws(
    () => assertPatternSelectionGrounded({ pattern: 'routing' }),
    /missing a non-empty rationale/,
  );
});
