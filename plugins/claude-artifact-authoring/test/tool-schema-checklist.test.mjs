import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TOOL_SCHEMA_CHECKLIST,
  DETERMINISTIC_CHECKLIST_KEYS,
  scoreDeterministicChecklist,
  hasRecursiveSchema,
  hasNumericalBoundConstraints,
  hasComplexRegex,
  DERIVATION_STRATEGIES,
  OUTPUT_LOGIC_FORKS,
  assertDerivationChoiceRecorded,
} from '../lib/tool-schema-checklist.mjs';
import goldenSet from '../golden-sets/tool-schemas.json' with { type: 'json' };

test('TOOL_SCHEMA_CHECKLIST names all 5 items with exactly 4 marked deterministic', () => {
  const keys = TOOL_SCHEMA_CHECKLIST.map((item) => item.key);
  assert.deepEqual(
    keys.sort(),
    [
      'isValidJSON',
      'noRecursiveSchema',
      'noNumericalBoundConstraints',
      'noComplexRegex',
      'parameterDescriptionsClear',
    ].sort(),
  );
  assert.deepEqual(DETERMINISTIC_CHECKLIST_KEYS.slice().sort(), [
    'isValidJSON',
    'noComplexRegex',
    'noNumericalBoundConstraints',
    'noRecursiveSchema',
  ]);
  for (const item of TOOL_SCHEMA_CHECKLIST) {
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
  // Not a blanket "every bad entry fails every item" loop:
  // bad-recursive-tree-schema is valid JSON with no min/max/pattern, only
  // failing noRecursiveSchema; bad-min-max-and-regex-schema is valid JSON
  // with no recursion, only failing the other two. Checked explicitly, by id.
  const byId = Object.fromEntries(goldenSet.entries.map((e) => [e.id, e]));

  const recursive = scoreDeterministicChecklist(byId['bad-recursive-tree-schema'].content);
  assert.equal(recursive.isValidJSON, true);
  assert.equal(recursive.noRecursiveSchema, false);
  assert.equal(recursive.noNumericalBoundConstraints, true);
  assert.equal(recursive.noComplexRegex, true);

  const minMaxRegex = scoreDeterministicChecklist(byId['bad-min-max-and-regex-schema'].content);
  assert.equal(minMaxRegex.isValidJSON, true);
  assert.equal(minMaxRegex.noRecursiveSchema, true);
  assert.equal(minMaxRegex.noNumericalBoundConstraints, false);
  assert.equal(minMaxRegex.noComplexRegex, false);
});

test('scoreDeterministicChecklist returns only the deterministic subset', () => {
  const scores = scoreDeterministicChecklist('{"name":"x","parameters":{"type":"object"}}');
  assert.deepEqual(Object.keys(scores).sort(), DETERMINISTIC_CHECKLIST_KEYS.slice().sort());
});

test('scoreDeterministicChecklist tolerates non-string and unparseable input without throwing', () => {
  const expectedAllFalse = {
    isValidJSON: false,
    noRecursiveSchema: false,
    noNumericalBoundConstraints: false,
    noComplexRegex: false,
  };
  assert.deepEqual(scoreDeterministicChecklist(undefined), expectedAllFalse);
  assert.deepEqual(scoreDeterministicChecklist('not json at all'), expectedAllFalse);
  assert.deepEqual(scoreDeterministicChecklist('{"name":"x"}'), expectedAllFalse, 'missing parameters.type');
});

// --- hasRecursiveSchema: real structural walk, not a literal string search ---

test('hasRecursiveSchema detects a $ref pointing at the schema root', () => {
  assert.equal(
    hasRecursiveSchema({
      type: 'object',
      properties: { children: { type: 'array', items: { $ref: '#' } } },
    }),
    true,
  );
});

test('hasRecursiveSchema detects a $ref pointing at a genuine ancestor path, not just the literal root marker', () => {
  assert.equal(
    hasRecursiveSchema({
      type: 'object',
      properties: {
        node: {
          type: 'object',
          properties: { child: { $ref: '#/properties/node' } },
        },
      },
    }),
    true,
  );
});

test('hasRecursiveSchema does not flag non-recursive nesting (an array of objects with no $ref)', () => {
  assert.equal(
    hasRecursiveSchema({
      type: 'object',
      properties: {
        assets: {
          type: 'array',
          items: { type: 'object', properties: { path: { type: 'string' } } },
        },
      },
    }),
    false,
  );
});

test('hasNumericalBoundConstraints detects minimum/maximum/exclusiveMinimum/exclusiveMaximum/multipleOf anywhere', () => {
  assert.equal(hasNumericalBoundConstraints({ type: 'integer', minimum: 1 }), true);
  assert.equal(hasNumericalBoundConstraints({ type: 'integer', maximum: 5 }), true);
  assert.equal(hasNumericalBoundConstraints({ type: 'number', exclusiveMinimum: 0 }), true);
  assert.equal(hasNumericalBoundConstraints({ type: 'number', multipleOf: 2 }), true);
  assert.equal(
    hasNumericalBoundConstraints({
      type: 'object',
      properties: { level: { type: 'integer', minimum: 1 } },
    }),
    true,
    'nested detection, not just top-level',
  );
  assert.equal(hasNumericalBoundConstraints({ type: 'integer', description: 'no bounds here' }), false);
});

test('hasComplexRegex detects a pattern keyword anywhere', () => {
  assert.equal(hasComplexRegex({ type: 'string', pattern: '^[A-Z]+$' }), true);
  assert.equal(
    hasComplexRegex({ type: 'object', properties: { id: { type: 'string', pattern: '^x' } } }),
    true,
  );
  assert.equal(hasComplexRegex({ type: 'string' }), false);
});

// --- Task #89: explicit derivation-strategy and output-logic choice ---

test('DERIVATION_STRATEGIES and OUTPUT_LOGIC_FORKS name the prior-art strategies and the Instructor/Outlines fork', () => {
  assert.deepEqual(DERIVATION_STRATEGIES.slice().sort(), [
    'annotated-method-derived',
    'docstring-derived',
    'separate-yaml-derived',
  ].sort());
  assert.deepEqual(OUTPUT_LOGIC_FORKS.slice().sort(), ['constrained-decoding', 'validate-and-retry'].sort());
});

test('assertDerivationChoiceRecorded accepts a valid strategy and output-logic pair', () => {
  for (const derivationStrategy of DERIVATION_STRATEGIES) {
    for (const outputLogic of OUTPUT_LOGIC_FORKS) {
      assert.doesNotThrow(() => assertDerivationChoiceRecorded({ derivationStrategy, outputLogic }));
    }
  }
});

test('assertDerivationChoiceRecorded rejects an unrecognized or missing strategy/output-logic', () => {
  assert.throws(
    () => assertDerivationChoiceRecorded({ derivationStrategy: 'made-up', outputLogic: 'validate-and-retry' }),
    /derivationStrategy must be one of/,
  );
  assert.throws(
    () => assertDerivationChoiceRecorded({ derivationStrategy: 'docstring-derived', outputLogic: 'made-up' }),
    /outputLogic must be one of/,
  );
  assert.throws(() => assertDerivationChoiceRecorded({}), /derivationStrategy must be one of/);
});
