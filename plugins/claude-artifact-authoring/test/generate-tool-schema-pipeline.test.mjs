// Story S11 Task #93's explicit deliverable, automated rather than left as
// prose: verify a generated tool schema's frontmatter satisfies the four-
// required-elements contract (with conceptType: 'procedural' from
// ARTIFACT_TYPE_METADATA['tool-schemas']), using golden-sets/tool-schemas.json's
// "good-flat-search-tool-schema" entry as the worked example — plus, per
// Task #91, a real pin-resolution exercise against the promoted version.
// Every test that dereferences WORKED_EXAMPLE carries its own local
// assert.ok guard from the start.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  scoreDeterministicChecklist,
  DETERMINISTIC_CHECKLIST_KEYS,
  assertDerivationChoiceRecorded,
} from '../lib/tool-schema-checklist.mjs';
import { resolveToolSchemaPin } from '../lib/tool-schema-pin.mjs';
import { validateFrontmatterContract, ARTIFACT_TYPE_METADATA } from '../lib/frontmatter-contract.mjs';
import { persistDraftArtifact } from '../lib/persist-artifact.mjs';
import { getCurrentVersion, promoteVersion } from '../lib/xdg-store.mjs';
import goldenSet from '../golden-sets/tool-schemas.json' with { type: 'json' };

function tempStoreRoot() {
  return mkdtempSync(join(tmpdir(), 'caa-generate-tool-schema-test-store-'));
}

function tempConfigDirWithMifDocs() {
  const configDir = mkdtempSync(join(tmpdir(), 'caa-generate-tool-schema-test-config-'));
  const dir = join(configDir, 'plugins', 'cache', 'modeled-information-format', 'mif-docs', '0.4.1');
  for (const segments of [
    ['skills', 'mif-frontmatter', 'SKILL.md'],
    ['scripts', 'mif-provenance.mjs'],
    ['scripts', 'mif-validate.mjs'],
  ]) {
    mkdirSync(join(dir, ...segments.slice(0, -1)), { recursive: true });
    writeFileSync(join(dir, ...segments), '// fake\n');
  }
  return configDir;
}

const WORKED_EXAMPLE = goldenSet.entries.find((e) => e.id === 'good-flat-search-tool-schema');
const SLUG = 'search-issues-worked-example';

function draftWorkedExampleFrontmatter() {
  return {
    citations: [
      {
        citationType: 'documentation',
        citationRole: 'source',
        title: 'Epic: Claude Artifact Authoring plugin — build, onboard, and admit to the marketplace',
        url: 'https://github.com/modeled-information-format/claude-code-plugins/issues/40',
        accessed: '2026-07-14',
      },
      {
        citationType: 'documentation',
        citationRole: 'methodology',
        title: 'Task: Tool-schema generator — generation (Structured Outputs supported subset)',
        url: 'https://github.com/modeled-information-format/claude-code-plugins/issues/89',
        accessed: '2026-07-14',
      },
    ],
    provenance: { sourceType: 'system_generated' },
    temporal: {
      validFrom: '2026-07-14T00:00:00Z',
      recordedAt: '2026-07-14T00:00:00Z',
      ttl: ARTIFACT_TYPE_METADATA['tool-schemas'].ttl,
    },
    relationships: [
      {
        type: 'derived-from',
        target: 'https://github.com/modeled-information-format/claude-code-plugins/issues/40',
      },
      {
        type: 'relates-to',
        target: 'urn:mif:activity:claude-code-session:59776443-e228-4bd8-a2bd-e6be3c2a7f34',
      },
      {
        type: 'harness:generated-for',
        target: 'urn:mif:topic:claude-artifact-authoring:tool-schemas',
      },
    ],
    extensions: {
      claudeArtifactAuthoring: {
        generatorType: 'tool-schemas',
        checklist: {
          isValidJSON: 'pass',
          noRecursiveSchema: 'pass',
          noNumericalBoundConstraints: 'pass',
          noComplexRegex: 'pass',
          parameterDescriptionsClear: 'pass',
        },
        derivationStrategy: 'annotated-method-derived',
        outputLogic: 'constrained-decoding',
        revision: 1,
      },
    },
  };
}

function composeMarkdown(frontmatter, body) {
  return `---\n${JSON.stringify(frontmatter, null, 2)}\n---\n\n${body}\n`;
}

test('the worked example (good-flat-search-tool-schema) exists in the golden set', () => {
  assert.ok(WORKED_EXAMPLE, 'golden-sets/tool-schemas.json must carry the "good-flat-search-tool-schema" entry');
  assert.equal(WORKED_EXAMPLE.label, 'good');
});

test('the worked example passes every deterministic checklist item', () => {
  assert.ok(WORKED_EXAMPLE, 'golden-sets/tool-schemas.json must carry the "good-flat-search-tool-schema" entry');
  const scores = scoreDeterministicChecklist(WORKED_EXAMPLE.content);
  for (const key of DETERMINISTIC_CHECKLIST_KEYS) {
    assert.equal(scores[key], true, `expected the worked example to pass "${key}", got ${JSON.stringify(scores)}`);
  }
});

test('Task #89: the worked example draft\'s actual derivation choice is accepted', () => {
  const frontmatter = draftWorkedExampleFrontmatter();
  const { derivationStrategy, outputLogic } = frontmatter.extensions.claudeArtifactAuthoring;
  assert.doesNotThrow(() => assertDerivationChoiceRecorded({ derivationStrategy, outputLogic }));
});

test('Task #89: an unrecorded derivation choice is actually caught (not vacuously true)', () => {
  assert.throws(
    () => assertDerivationChoiceRecorded({ derivationStrategy: undefined, outputLogic: 'constrained-decoding' }),
    /derivationStrategy must be one of/,
  );
});

test('Task #93: drafted frontmatter for the worked example satisfies the four-required-elements contract with zero errors', () => {
  const frontmatter = draftWorkedExampleFrontmatter();
  const { valid, errors } = validateFrontmatterContract(frontmatter);
  assert.deepEqual(errors, []);
  assert.equal(valid, true);
});

test('Task #93: the worked example frontmatter uses conceptType "procedural" and the tool-schemas ttl, not a hardcoded literal', () => {
  assert.equal(ARTIFACT_TYPE_METADATA['tool-schemas'].conceptType, 'procedural');
  const frontmatter = draftWorkedExampleFrontmatter();
  assert.equal(frontmatter.temporal.ttl, ARTIFACT_TYPE_METADATA['tool-schemas'].ttl);
});

test('a checklist item failing the contract is actually caught (contract is not vacuously true)', () => {
  const broken = draftWorkedExampleFrontmatter();
  broken.relationships = broken.relationships.filter((r) => r.type !== 'harness:generated-for');
  const { valid, errors } = validateFrontmatterContract(broken);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('harness:generated-for')));
});

test('full persistDraftArtifact round-trip for the worked example, promoted after a passing gate simulation', () => {
  assert.ok(WORKED_EXAMPLE, 'golden-sets/tool-schemas.json must carry the "good-flat-search-tool-schema" entry');
  const root = tempStoreRoot();
  const configDir = tempConfigDirWithMifDocs();
  try {
    const frontmatter = draftWorkedExampleFrontmatter();
    const fullMarkdownContent = composeMarkdown(frontmatter, WORKED_EXAMPLE.content);

    const result = persistDraftArtifact({
      type: 'tool-schemas',
      slug: SLUG,
      filename: 'artifact.md',
      fullMarkdownContent,
      parsedFrontmatter: frontmatter,
      root,
      env: { CLAUDE_CONFIG_DIR: configDir },
    });

    assert.equal(result.version, 1);
    assert.ok(existsSync(result.path));
    assert.equal(
      readFileSync(result.path, 'utf8'),
      fullMarkdownContent,
      'the persisted file must be byte-identical to what was drafted',
    );
    assert.equal(getCurrentVersion('tool-schemas', SLUG, root), null);

    promoteVersion('tool-schemas', SLUG, result.version, root);
    assert.equal(getCurrentVersion('tool-schemas', SLUG, root), 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(configDir, { recursive: true, force: true });
  }
});

test('Task #91: a dependent artifact resolves a real pin against the worked example once it is promoted', () => {
  const root = tempStoreRoot();
  const configDir = tempConfigDirWithMifDocs();
  try {
    const frontmatter = draftWorkedExampleFrontmatter();
    const fullMarkdownContent = composeMarkdown(frontmatter, WORKED_EXAMPLE.content);

    assert.throws(
      () => resolveToolSchemaPin(SLUG, root),
      /has no promoted \(current\) version/,
      'no dependent artifact should be able to pin against a draft that has never passed the gate',
    );

    const result = persistDraftArtifact({
      type: 'tool-schemas',
      slug: SLUG,
      filename: 'artifact.md',
      fullMarkdownContent,
      parsedFrontmatter: frontmatter,
      root,
      env: { CLAUDE_CONFIG_DIR: configDir },
    });
    promoteVersion('tool-schemas', SLUG, result.version, root);

    assert.deepEqual(resolveToolSchemaPin(SLUG, root), { slug: SLUG, version: 1 });
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(configDir, { recursive: true, force: true });
  }
});

test('persistDraftArtifact rejects the worked example when a required element is dropped, even with a well-formed extensions block present', () => {
  assert.ok(WORKED_EXAMPLE, 'golden-sets/tool-schemas.json must carry the "good-flat-search-tool-schema" entry');
  const root = tempStoreRoot();
  const configDir = tempConfigDirWithMifDocs();
  try {
    const frontmatter = draftWorkedExampleFrontmatter();
    delete frontmatter.provenance.sourceType;
    assert.throws(
      () =>
        persistDraftArtifact({
          type: 'tool-schemas',
          slug: `${SLUG}-broken`,
          filename: 'artifact.md',
          fullMarkdownContent: composeMarkdown(frontmatter, WORKED_EXAMPLE.content),
          parsedFrontmatter: frontmatter,
          root,
          env: { CLAUDE_CONFIG_DIR: configDir },
        }),
      /provenance\.sourceType/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(configDir, { recursive: true, force: true });
  }
});
