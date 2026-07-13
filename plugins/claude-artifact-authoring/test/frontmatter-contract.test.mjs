import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateFrontmatterContract,
  assertFrontmatterContract,
  REQUIRED_RELATIONSHIP_TYPES,
  ARTIFACT_TYPE_METADATA,
} from '../lib/frontmatter-contract.mjs';

function validFrontmatter(overrides = {}) {
  return {
    citations: [
      {
        citationType: 'documentation',
        citationRole: 'source',
        title: 'architecture-design-blueprint',
        url: 'https://github.com/modeled-information-format/claude-code-plugins/issues/40',
        accessed: '2026-07-13',
      },
    ],
    provenance: { sourceType: 'system_generated' },
    temporal: { validFrom: '2026-07-13T00:00:00Z', recordedAt: '2026-07-13T00:00:00Z', ttl: 'P90D' },
    relationships: [
      { type: 'derived-from', target: 'urn:mif:concept:finding' },
      { type: 'relates-to', target: 'urn:mif:activity:claude-code-session:abc' },
      { type: 'harness:generated-for', target: 'urn:mif:topic:claude-artifact-authoring' },
    ],
    ...overrides,
  };
}

test('a fully-populated frontmatter satisfies the contract', () => {
  const { valid, errors } = validateFrontmatterContract(validFrontmatter());
  assert.equal(valid, true);
  assert.deepEqual(errors, []);
});

test('missing citations[] fails', () => {
  const { valid, errors } = validateFrontmatterContract(validFrontmatter({ citations: [] }));
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('citations[]')));
});

test('a citation without a resolvable http(s) url fails', () => {
  const fm = validFrontmatter();
  fm.citations[0].url = 'urn:mif:concept:not-resolvable';
  const { valid, errors } = validateFrontmatterContract(fm);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('resolvable http(s) url')));
});

test('sourceType other than system_generated fails', () => {
  const fm = validFrontmatter();
  fm.provenance.sourceType = 'agent_inferred';
  const { valid, errors } = validateFrontmatterContract(fm);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('system_generated')));
});

test('a written confidence field on provenance fails (witness proves presence, not extent)', () => {
  const fm = validFrontmatter();
  fm.provenance.confidence = 0.9;
  const { valid, errors } = validateFrontmatterContract(fm);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('confidence must never be written')));
});

test('each missing temporal field is reported individually', () => {
  const fm = validFrontmatter({ temporal: {} });
  const { errors } = validateFrontmatterContract(fm);
  assert.ok(errors.some((e) => e.includes('validFrom')));
  assert.ok(errors.some((e) => e.includes('recordedAt')));
  assert.ok(errors.some((e) => e.includes('ttl')));
});

test('each missing relationship type is reported individually', () => {
  const fm = validFrontmatter({ relationships: [] });
  const { errors } = validateFrontmatterContract(fm);
  for (const type of REQUIRED_RELATIONSHIP_TYPES) {
    assert.ok(errors.some((e) => e.includes(`"${type}"`)), `expected an error mentioning ${type}`);
  }
});

test('malformed temporal.validFrom/recordedAt (not a real date) fails, not just presence', () => {
  const fm = validFrontmatter();
  fm.temporal.validFrom = 'not-a-date';
  const { valid, errors } = validateFrontmatterContract(fm);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('not a valid RFC3339 date-time')));
});

test('a date-only value (no time component) is rejected — the contract requires a date-TIME', () => {
  // Date.parse("2026-07-13") succeeds, so this must be checked by shape,
  // not just parseability, or an incomplete timestamp silently passes.
  const fm = validFrontmatter();
  fm.temporal.validFrom = '2026-07-13';
  const { valid, errors } = validateFrontmatterContract(fm);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('validFrom') && e.includes('not a valid RFC3339 date-time')));
});

test('malformed temporal.ttl (not a simple ISO-8601 duration) fails', () => {
  const fm = validFrontmatter();
  fm.temporal.ttl = '90 days';
  const { valid, errors } = validateFrontmatterContract(fm);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('ISO-8601 duration')));
});

test('a relationship entry with the right type but no target fails', () => {
  const fm = validFrontmatter();
  fm.relationships = fm.relationships.map((r) =>
    r.type === 'relates-to' ? { type: 'relates-to' } : r,
  );
  const { valid, errors } = validateFrontmatterContract(fm);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('relates-to') && e.includes('non-empty target')));
});

test('assertFrontmatterContract throws with every error joined', () => {
  assert.throws(
    () => assertFrontmatterContract(validFrontmatter({ citations: [] })),
    /citations\[\]/,
  );
});

test('assertFrontmatterContract does not throw on a valid frontmatter', () => {
  assert.doesNotThrow(() => assertFrontmatterContract(validFrontmatter()));
});

test('every artifact type has ttl + conceptType metadata, matching xdg-store ARTIFACT_TYPES', () => {
  for (const type of ['prompts', 'goals', 'loops', 'eval-suites', 'subagents', 'tool-schemas']) {
    assert.ok(ARTIFACT_TYPE_METADATA[type], `missing metadata for ${type}`);
    assert.match(ARTIFACT_TYPE_METADATA[type].ttl, /^P\d+[DMY]$/);
    assert.ok(['semantic', 'procedural'].includes(ARTIFACT_TYPE_METADATA[type].conceptType));
  }
});
