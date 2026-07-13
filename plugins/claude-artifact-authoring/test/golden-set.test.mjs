import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadGoldenSet, computeAgreement, DEFAULT_GOLDEN_SETS_DIR } from '../lib/golden-set.mjs';
import { ARTIFACT_TYPES } from '../lib/xdg-store.mjs';

function tempGoldenSetsDir() {
  return mkdtempSync(join(tmpdir(), 'caa-golden-set-test-'));
}

function writeGoldenSet(dir, artifactType, entries) {
  writeFileSync(join(dir, `${artifactType}.json`), JSON.stringify({ artifactType, entries }));
}

test('every one of the 6 declared artifact types has a real, valid, committed golden set', () => {
  for (const type of ARTIFACT_TYPES) {
    const goldenSet = loadGoldenSet(type, { goldenSetsDir: DEFAULT_GOLDEN_SETS_DIR });
    assert.equal(goldenSet.artifactType, type);
    assert.ok(goldenSet.entries.length >= 4, `expected >=4 entries for ${type}, got ${goldenSet.entries.length}`);
    assert.ok(
      goldenSet.entries.some((e) => e.label === 'good') && goldenSet.entries.some((e) => e.label === 'bad'),
      `${type}'s golden set must have both good and bad examples`,
    );
    for (const entry of goldenSet.entries) {
      assert.ok(entry.rationale.length > 20, `${type}/${entry.id} rationale is too short to be real`);
    }
  }
});

test('loadGoldenSet rejects a missing golden set file', () => {
  const dir = tempGoldenSetsDir();
  try {
    assert.throws(() => loadGoldenSet('prompts', { goldenSetsDir: dir }), /No golden set found/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadGoldenSet rejects an entry with an invalid label', () => {
  const dir = tempGoldenSetsDir();
  try {
    writeGoldenSet(dir, 'prompts', [{ id: 'x', label: 'excellent', content: 'c', rationale: 'r' }]);
    assert.throws(() => loadGoldenSet('prompts', { goldenSetsDir: dir }), /expected one of good\/bad/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadGoldenSet rejects duplicate entry ids', () => {
  const dir = tempGoldenSetsDir();
  try {
    writeGoldenSet(dir, 'prompts', [
      { id: 'x', label: 'good', content: 'c1', rationale: 'r1' },
      { id: 'x', label: 'bad', content: 'c2', rationale: 'r2' },
    ]);
    assert.throws(() => loadGoldenSet('prompts', { goldenSetsDir: dir }), /duplicate entry id/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadGoldenSet rejects a file whose artifactType field disagrees with the requested type', () => {
  const dir = tempGoldenSetsDir();
  try {
    writeGoldenSet(dir, 'goals', [{ id: 'x', label: 'good', content: 'c', rationale: 'r' }]);
    // Renamed on disk to look like "prompts.json" but the field inside still says "goals".
    writeFileSync(
      join(dir, 'prompts.json'),
      JSON.stringify({ artifactType: 'goals', entries: [{ id: 'x', label: 'good', content: 'c', rationale: 'r' }] }),
    );
    assert.throws(() => loadGoldenSet('prompts', { goldenSetsDir: dir }), /was loaded as "prompts"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('computeAgreement scores 100% when every verdict matches the human label', () => {
  const goldenSet = { entries: [{ id: 'a', label: 'good' }, { id: 'b', label: 'bad' }] };
  const result = computeAgreement(goldenSet, { a: 'good', b: 'bad' });
  assert.equal(result.agreementPct, 1);
  assert.equal(result.matched, 2);
  assert.deepEqual(result.mismatches, []);
});

test('computeAgreement reports each specific mismatch, not just the aggregate', () => {
  const goldenSet = {
    entries: [
      { id: 'a', label: 'good' },
      { id: 'b', label: 'bad' },
      { id: 'c', label: 'good' },
      { id: 'd', label: 'bad' },
    ],
  };
  const result = computeAgreement(goldenSet, { a: 'good', b: 'good', c: 'good', d: 'good' });
  assert.equal(result.agreementPct, 0.5);
  assert.equal(result.mismatches.length, 2);
  assert.deepEqual(
    result.mismatches.map((m) => m.id).sort(),
    ['b', 'd'],
  );
});

test('computeAgreement throws if a verdict is missing for any entry (a partial run is not a real one)', () => {
  const goldenSet = { entries: [{ id: 'a', label: 'good' }, { id: 'b', label: 'bad' }] };
  assert.throws(() => computeAgreement(goldenSet, { a: 'good' }), /No judge verdict provided for.*"b"/);
});

test('computeAgreement throws on an invalid verdict value', () => {
  const goldenSet = { entries: [{ id: 'a', label: 'good' }] };
  assert.throws(() => computeAgreement(goldenSet, { a: 'excellent' }), /Invalid judge verdict/);
});
