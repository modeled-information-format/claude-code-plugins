import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SUBAGENT_CHECKLIST,
  DETERMINISTIC_CHECKLIST_KEYS,
  scoreDeterministicChecklist,
  extractDescriptionValue,
  assertSubagentProvenanceRecorded,
} from '../lib/subagent-checklist.mjs';
import goldenSet from '../golden-sets/subagents.json' with { type: 'json' };

test('SUBAGENT_CHECKLIST names all 5 items with exactly 3 marked deterministic', () => {
  const keys = SUBAGENT_CHECKLIST.map((item) => item.key);
  assert.deepEqual(
    keys.sort(),
    [
      'hasFrontmatterFields',
      'toolAllowListScoped',
      'descriptionStatesBoundary',
      'descriptionStatesTrigger',
      'minimalOverlapWithSiblings',
    ].sort(),
  );
  assert.deepEqual(DETERMINISTIC_CHECKLIST_KEYS.slice().sort(), [
    'descriptionStatesBoundary',
    'descriptionStatesTrigger',
    'hasFrontmatterFields',
  ]);
  for (const item of SUBAGENT_CHECKLIST) {
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
  // Both current bad entries still declare name/description/tools (they're
  // bad for scope/overlap reasons, not missing frontmatter fields) but
  // neither description states a boundary or a trigger condition. Checked
  // explicitly, by id — not a blanket "every bad entry fails every item" loop.
  const byId = Object.fromEntries(goldenSet.entries.map((e) => [e.id, e]));

  for (const id of ['bad-do-everything-subagent-def', 'bad-overlapping-subagent-def']) {
    const scores = scoreDeterministicChecklist(byId[id].content);
    assert.equal(scores.hasFrontmatterFields, true, `expected "${id}" to still declare name/description/tools`);
    assert.equal(scores.descriptionStatesBoundary, false, `expected "${id}" to fail descriptionStatesBoundary`);
    assert.equal(scores.descriptionStatesTrigger, false, `expected "${id}" to fail descriptionStatesTrigger`);
  }
});

test('scoreDeterministicChecklist returns only the deterministic subset', () => {
  const scores = scoreDeterministicChecklist('---\nname: x\ndescription: does not do y. Use when z.\ntools: Read\n---\nbody');
  assert.deepEqual(Object.keys(scores).sort(), DETERMINISTIC_CHECKLIST_KEYS.slice().sort());
});

test('scoreDeterministicChecklist tolerates non-string input without throwing', () => {
  assert.deepEqual(scoreDeterministicChecklist(undefined), {
    hasFrontmatterFields: false,
    descriptionStatesBoundary: false,
    descriptionStatesTrigger: false,
  });
});

test('hasFrontmatterFields requires name, description, AND tools all present', () => {
  assert.equal(
    scoreDeterministicChecklist('---\nname: x\ndescription: y\ntools: Read\n---\nbody').hasFrontmatterFields,
    true,
  );
  assert.equal(
    scoreDeterministicChecklist('---\nname: x\ndescription: y\n---\nbody').hasFrontmatterFields,
    false,
    'missing tools',
  );
  assert.equal(
    scoreDeterministicChecklist('---\ndescription: y\ntools: Read\n---\nbody').hasFrontmatterFields,
    false,
    'missing name',
  );
  assert.equal(scoreDeterministicChecklist('no frontmatter at all').hasFrontmatterFields, false);
});

test('hasFrontmatterFields recognizes a CRLF-line-ended frontmatter block', () => {
  // Regression: an earlier version's frontmatter regex only matched bare
  // \n, so a CRLF-authored file (e.g. edited on Windows) would never match
  // the frontmatter block at all.
  const crlf = '---\r\nname: x\r\ndescription: y\r\ntools: Read\r\n---\r\nbody';
  assert.equal(scoreDeterministicChecklist(crlf).hasFrontmatterFields, true);
});

test('the closing frontmatter delimiter must actually end its own line, not just appear as a substring', () => {
  // Regression: an earlier version matched the first literal "\n---"
  // regardless of what followed it on the same line, so a description
  // containing "---" followed directly by more text (no line break) could
  // be mistaken for the real closing fence.
  const notARealFence = '---\nname: x\ndescription: something ---abc more text\ntools: Read\n---\n';
  assert.equal(scoreDeterministicChecklist(notARealFence).hasFrontmatterFields, true);
});

test('extractDescriptionValue pulls the single-line description field out of the frontmatter block', () => {
  assert.equal(
    extractDescriptionValue('---\nname: x\ndescription: Reviews things. Use when asked.\ntools: Read\n---\nbody'),
    'Reviews things. Use when asked.',
  );
  assert.equal(extractDescriptionValue('no frontmatter'), '');
});

test('descriptionStatesBoundary recognizes "does not"/"not for"/"not the"', () => {
  const withBoundary = (phrase) =>
    scoreDeterministicChecklist(`---\nname: x\ndescription: Does the thing. ${phrase}.\ntools: Read\n---\n`)
      .descriptionStatesBoundary;
  assert.equal(withBoundary('Does not fix bugs'), true);
  assert.equal(withBoundary('Not for style review'), true);
  assert.equal(withBoundary('Not the right tool for design'), true);
  assert.equal(
    scoreDeterministicChecklist('---\nname: x\ndescription: Does the thing.\ntools: Read\n---\n')
      .descriptionStatesBoundary,
    false,
  );
});

test('descriptionStatesBoundary does not treat an unrelated "never" reliability claim as a stated boundary', () => {
  // Regression: a bare `\bnever\b` alternative (an earlier version had one)
  // wrongly counted "never crashes even on huge files" — a reliability
  // claim, not a scope/non-goal statement — as boundary language. Removed;
  // no real golden-set good entry relies on bare "never" either.
  assert.equal(
    scoreDeterministicChecklist(
      '---\nname: x\ndescription: Handles huge files and never crashes.\ntools: Read\n---\n',
    ).descriptionStatesBoundary,
    false,
  );
});

test('descriptionStatesTrigger recognizes "Use when/proactively/after/for" phrasing', () => {
  const withTrigger = (phrase) =>
    scoreDeterministicChecklist(`---\nname: x\ndescription: ${phrase}\ntools: Read\n---\n`).descriptionStatesTrigger;
  assert.equal(withTrigger('Use PROACTIVELY after any change.'), true);
  assert.equal(withTrigger('Use when asked to run tests.'), true);
  assert.equal(withTrigger('Use this for reviewing diffs.'), true);
  assert.equal(
    scoreDeterministicChecklist('---\nname: x\ndescription: Helps with various tasks.\ntools: Read\n---\n')
      .descriptionStatesTrigger,
    false,
  );
});

test('descriptionStatesTrigger does not treat a negated "use" as a real trigger declaration', () => {
  // Regression: "Do not use this when the input is malformed" wrongly
  // scored as stating a trigger — it's an instruction about when NOT to
  // delegate, not a trigger condition. Same negation-lookback discipline
  // already applied to lib/goal-checklist.mjs and lib/loop-checklist.mjs.
  assert.equal(
    scoreDeterministicChecklist(
      '---\nname: x\ndescription: Do not use this when the input is malformed.\ntools: Read\n---\n',
    ).descriptionStatesTrigger,
    false,
  );
  assert.equal(
    scoreDeterministicChecklist(
      "---\nname: x\ndescription: Never use this for architecture review.\ntools: Read\n---\n",
    ).descriptionStatesTrigger,
    false,
  );
});

test('descriptionStatesTrigger still recognizes a real trigger elsewhere in a description that also contains an unrelated negated "use"', () => {
  assert.equal(
    scoreDeterministicChecklist(
      '---\nname: x\ndescription: Do not use this for architecture review. Use when reviewing a diff.\ntools: Read\n---\n',
    ).descriptionStatesTrigger,
    true,
  );
});

test('extractDescriptionValue reconstructs a multi-line YAML block-scalar description', () => {
  // Regression: an earlier version's same-line-only regex captured just
  // the block-scalar indicator ("|" or ">"), silently truncating the real
  // multi-line description text to nothing useful.
  const content = [
    '---',
    'name: reviewer',
    'description: >',
    '  Reviews pull request diffs for bugs. Use PROACTIVELY after any change.',
    '  Does not handle style or lint issues.',
    'tools: Read, Grep',
    '---',
  ].join('\n');
  assert.equal(
    extractDescriptionValue(content),
    'Reviews pull request diffs for bugs. Use PROACTIVELY after any change. Does not handle style or lint issues.',
  );
  const scores = scoreDeterministicChecklist(content);
  assert.equal(scores.descriptionStatesTrigger, true);
  assert.equal(scores.descriptionStatesBoundary, true);
});

// --- Task #90: provenance ---

test('assertSubagentProvenanceRecorded passes with a parent skill/command and an empty dependsOnToolSchemas', () => {
  assert.doesNotThrow(() =>
    assertSubagentProvenanceRecorded({ parentSkillOrCommand: 'generate-subagent', dependsOnToolSchemas: [] }),
  );
  assert.doesNotThrow(() =>
    assertSubagentProvenanceRecorded({
      parentSkillOrCommand: 'generate-subagent',
      dependsOnToolSchemas: ['some-tool-schema-slug'],
    }),
  );
});

test('assertSubagentProvenanceRecorded rejects a missing or empty parentSkillOrCommand', () => {
  assert.throws(
    () => assertSubagentProvenanceRecorded({ dependsOnToolSchemas: [] }),
    /must name its parentSkillOrCommand/,
  );
  assert.throws(
    () => assertSubagentProvenanceRecorded({ parentSkillOrCommand: '  ', dependsOnToolSchemas: [] }),
    /must name its parentSkillOrCommand/,
  );
});

test('assertSubagentProvenanceRecorded rejects a non-array dependsOnToolSchemas', () => {
  assert.throws(
    () => assertSubagentProvenanceRecorded({ parentSkillOrCommand: 'x', dependsOnToolSchemas: 'not-an-array' }),
    /must be an array/,
  );
});
