import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PROMPT_CHECKLIST,
  DETERMINISTIC_CHECKLIST_KEYS,
  scoreDeterministicChecklist,
} from '../lib/prompt-checklist.mjs';
import goldenSet from '../golden-sets/prompts.json' with { type: 'json' };

function exampleBlocks(n) {
  return Array.from(
    { length: n },
    (_, i) => `<example>\n<diff>+ line ${i}</diff>\n<review>finding ${i}</review>\n</example>`,
  ).join('\n');
}

test('PROMPT_CHECKLIST names all 8 structured-prompting items with exactly 3 marked deterministic', () => {
  const keys = PROMPT_CHECKLIST.map((item) => item.key);
  assert.deepEqual(
    keys.sort(),
    [
      'clarityGoldenRule',
      'contextualJustification',
      'documentGrounding',
      'fewShotExamples',
      'rightAltitude',
      'roleSetting',
      'tieredChainOfThought',
      'xmlDelimiting',
    ].sort(),
  );
  assert.deepEqual(DETERMINISTIC_CHECKLIST_KEYS.slice().sort(), [
    'fewShotExamples',
    'tieredChainOfThought',
    'xmlDelimiting',
  ]);
  for (const item of PROMPT_CHECKLIST) {
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

test('golden set bad entries fail the applicable deterministic checklist items', () => {
  for (const entry of goldenSet.entries.filter((e) => e.label === 'bad')) {
    const scores = scoreDeterministicChecklist(entry.content);
    // Neither bad entry uses any XML tags at all, so fewShotExamples and
    // xmlDelimiting are directly applicable and must fail. tieredChainOfThought
    // is a genuinely N/A check for a prompt with no <thinking>/<answer> tags at
    // all (see the module's own comment on why absence-of-both passes) — it
    // is not one of the "applicable" checks a content-free prompt can fail.
    assert.equal(scores.fewShotExamples, false, `expected "${entry.id}" to fail fewShotExamples`);
    assert.equal(scores.xmlDelimiting, false, `expected "${entry.id}" to fail xmlDelimiting`);
  }
});

test('scoreDeterministicChecklist returns only the deterministic subset', () => {
  const scores = scoreDeterministicChecklist('<context>x</context>');
  assert.deepEqual(Object.keys(scores).sort(), DETERMINISTIC_CHECKLIST_KEYS.slice().sort());
});

test('fewShotExamples: example-count boundary — 2 fails, 3 passes, 5 passes, 6 fails', () => {
  assert.equal(scoreDeterministicChecklist(exampleBlocks(2)).fewShotExamples, false);
  assert.equal(scoreDeterministicChecklist(exampleBlocks(3)).fewShotExamples, true);
  assert.equal(scoreDeterministicChecklist(exampleBlocks(5)).fewShotExamples, true);
  assert.equal(scoreDeterministicChecklist(exampleBlocks(6)).fewShotExamples, false);
  assert.equal(scoreDeterministicChecklist(exampleBlocks(0)).fewShotExamples, false);
});

test('xmlDelimiting: needs at least 2 distinct properly-paired tag names beyond <example>', () => {
  assert.equal(scoreDeterministicChecklist('no tags here at all').xmlDelimiting, false);
  assert.equal(
    scoreDeterministicChecklist('<example>only one distinct tag</example>').xmlDelimiting,
    false,
    'a lone <example> block does not count toward xmlDelimiting on its own',
  );
  assert.equal(
    scoreDeterministicChecklist('<context>a</context>').xmlDelimiting,
    false,
    'only one distinct non-example tag is not enough',
  );
  assert.equal(
    scoreDeterministicChecklist('<context>a</context><role>b</role>').xmlDelimiting,
    true,
  );
  assert.equal(
    scoreDeterministicChecklist('<context>unclosed').xmlDelimiting,
    false,
    'an unmatched opening tag must not count as properly paired',
  );
});

test('xmlDelimiting is case-insensitive when pairing tag names', () => {
  assert.equal(
    scoreDeterministicChecklist('<Context>a</Context><Role>b</Role>').xmlDelimiting,
    true,
  );
});

test('tieredChainOfThought: both tags pass, neither tag passes (N/A), exactly one tag fails', () => {
  assert.equal(
    scoreDeterministicChecklist('<thinking>reason</thinking><answer>verdict</answer>').tieredChainOfThought,
    true,
  );
  assert.equal(
    scoreDeterministicChecklist('no reasoning tags at all').tieredChainOfThought,
    true,
    'a prompt with no reasoning step at all is not faulted for omitting tiering',
  );
  assert.equal(
    scoreDeterministicChecklist('<thinking>reason</thinking>').tieredChainOfThought,
    false,
    'thinking without a matching answer is a broken tiering, not a passing one',
  );
  assert.equal(
    scoreDeterministicChecklist('<answer>verdict</answer>').tieredChainOfThought,
    false,
    'answer without a matching thinking step is a broken tiering, not a passing one',
  );
});

test('scoreDeterministicChecklist tolerates non-string input without throwing', () => {
  assert.deepEqual(scoreDeterministicChecklist(undefined), {
    fewShotExamples: false,
    xmlDelimiting: false,
    tieredChainOfThought: true,
  });
});
