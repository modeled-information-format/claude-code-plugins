import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  GRADER_TYPES,
  EVAL_SUITE_CHECKLIST,
  DETERMINISTIC_CHECKLIST_KEYS,
  scoreDeterministicChecklist,
  extractGraderType,
} from '../lib/eval-suite-checklist.mjs';
import goldenSet from '../golden-sets/eval-suites.json' with { type: 'json' };

test('GRADER_TYPES names Anthropic\'s three documented grader types', () => {
  assert.deepEqual(GRADER_TYPES.slice().sort(), ['code-based', 'human', 'llm-based'].sort());
});

test('EVAL_SUITE_CHECKLIST names all 5 items with exactly 3 marked deterministic', () => {
  const keys = EVAL_SUITE_CHECKLIST.map((item) => item.key);
  assert.deepEqual(
    keys.sort(),
    [
      'graderTypeNamed',
      'gradesArtifactNotPath',
      'hasGoldenSetReference',
      'calibrationRequiredForLLMGraders',
      'gEvalTwoStageOrdering',
    ].sort(),
  );
  assert.deepEqual(DETERMINISTIC_CHECKLIST_KEYS.slice().sort(), [
    'calibrationRequiredForLLMGraders',
    'graderTypeNamed',
    'hasGoldenSetReference',
  ]);
  for (const item of EVAL_SUITE_CHECKLIST) {
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
  // Per Story S7/S8's established lesson: not a blanket "every bad entry
  // fails every item" loop. "bad-no-calibration-eval" DOES name a grader
  // type — it's bad because it lacks a golden set and calibration, not
  // because it omits the grader-type declaration. Checked explicitly, by id.
  const byId = Object.fromEntries(goldenSet.entries.map((e) => [e.id, e]));

  const vague = scoreDeterministicChecklist(byId['bad-vague-quality-check'].content);
  assert.equal(vague.graderTypeNamed, false, 'no grader type is named at all');
  assert.equal(vague.hasGoldenSetReference, false);

  const noCalibration = scoreDeterministicChecklist(byId['bad-no-calibration-eval'].content);
  assert.equal(noCalibration.graderTypeNamed, true, 'this entry does name a grader type — it is bad for other reasons');
  assert.equal(noCalibration.hasGoldenSetReference, false);
  assert.equal(noCalibration.calibrationRequiredForLLMGraders, false, 'llm-based grader with no calibration mention must fail');
});

test('scoreDeterministicChecklist returns only the deterministic subset', () => {
  const scores = scoreDeterministicChecklist('Grader type: human. Golden set: golden-sets/x.json.');
  assert.deepEqual(Object.keys(scores).sort(), DETERMINISTIC_CHECKLIST_KEYS.slice().sort());
});

test('scoreDeterministicChecklist tolerates non-string input without throwing', () => {
  assert.deepEqual(scoreDeterministicChecklist(undefined), {
    graderTypeNamed: false,
    hasGoldenSetReference: false,
    calibrationRequiredForLLMGraders: true, // vacuously true: no grader type declared at all means "llm-based" doesn't apply
  });
});

test('extractGraderType recognizes all three types case-insensitively', () => {
  for (const type of GRADER_TYPES) {
    assert.equal(extractGraderType(`Grader type: ${type}. more text.`), type);
    assert.equal(extractGraderType(`GRADER TYPE: ${type.toUpperCase()}. more text.`), type);
  }
});

test('extractGraderType returns null when no recognized type is declared', () => {
  assert.equal(extractGraderType('Grader type: some made up thing.'), null);
  assert.equal(extractGraderType('no grader type declaration at all'), null);
  assert.equal(extractGraderType(undefined), null);
});

test('calibrationRequiredForLLMGraders is vacuously true for code-based and human graders regardless of calibration mentions', () => {
  assert.equal(
    scoreDeterministicChecklist('Grader type: code-based. Golden set: golden-sets/x.json.')
      .calibrationRequiredForLLMGraders,
    true,
  );
  assert.equal(
    scoreDeterministicChecklist('Grader type: human. Golden set: golden-sets/x.json.')
      .calibrationRequiredForLLMGraders,
    true,
  );
});

test('calibrationRequiredForLLMGraders requires actual calibration language for an llm-based grader', () => {
  assert.equal(
    scoreDeterministicChecklist('Grader type: llm-based. Rate it 1-10.').calibrationRequiredForLLMGraders,
    false,
  );
  assert.equal(
    scoreDeterministicChecklist('Grader type: llm-based. Calibrated against golden-sets/x.json first.')
      .calibrationRequiredForLLMGraders,
    true,
  );
});

test('hasGoldenSetReference matches both "golden set" prose and a "golden-sets/" path', () => {
  assert.equal(scoreDeterministicChecklist('Golden set: 10 examples.').hasGoldenSetReference, true);
  assert.equal(scoreDeterministicChecklist('See golden-sets/prompts.json.').hasGoldenSetReference, true);
  assert.equal(scoreDeterministicChecklist('No reference set at all.').hasGoldenSetReference, false);
});
