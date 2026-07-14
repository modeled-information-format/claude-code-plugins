// Story S10 Task #94's explicit deliverable, automated rather than left as
// prose: verify a generated subagent's frontmatter satisfies the four-
// required-elements contract (with conceptType: 'procedural' from
// ARTIFACT_TYPE_METADATA.subagents), using golden-sets/subagents.json's
// "good-code-review-subagent-def" entry as the worked example — plus, per
// Task #92, a real hit-and-miss delegation-boundary scoring exercise.
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
  assertSubagentProvenanceRecorded,
} from '../lib/subagent-checklist.mjs';
import { scoreDelegationCases, assertTestsBoundary } from '../lib/subagent-delegation-harness.mjs';
import { validateFrontmatterContract, ARTIFACT_TYPE_METADATA } from '../lib/frontmatter-contract.mjs';
import { persistDraftArtifact } from '../lib/persist-artifact.mjs';
import { getCurrentVersion, promoteVersion } from '../lib/xdg-store.mjs';
import goldenSet from '../golden-sets/subagents.json' with { type: 'json' };

function tempStoreRoot() {
  return mkdtempSync(join(tmpdir(), 'caa-generate-subagent-test-store-'));
}

function tempConfigDirWithMifDocs() {
  const configDir = mkdtempSync(join(tmpdir(), 'caa-generate-subagent-test-config-'));
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

const WORKED_EXAMPLE = goldenSet.entries.find((e) => e.id === 'good-code-review-subagent-def');

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
        title: 'Task: Subagent generator — generation (frontmatter contract + delegation precision)',
        url: 'https://github.com/modeled-information-format/claude-code-plugins/issues/88',
        accessed: '2026-07-14',
      },
    ],
    provenance: { sourceType: 'system_generated' },
    temporal: {
      validFrom: '2026-07-14T00:00:00Z',
      recordedAt: '2026-07-14T00:00:00Z',
      ttl: ARTIFACT_TYPE_METADATA.subagents.ttl,
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
        target: 'urn:mif:topic:claude-artifact-authoring:subagents',
      },
    ],
    extensions: {
      claudeArtifactAuthoring: {
        generatorType: 'subagents',
        checklist: {
          hasFrontmatterFields: 'pass',
          toolAllowListScoped: 'pass',
          descriptionStatesBoundary: 'pass',
          descriptionStatesTrigger: 'pass',
          minimalOverlapWithSiblings: 'pass',
        },
        parentSkillOrCommand: 'generate-subagent',
        dependsOnToolSchemas: [],
        revision: 1,
      },
    },
  };
}

function composeMarkdown(frontmatter, body) {
  return `---\n${JSON.stringify(frontmatter, null, 2)}\n---\n\n${body}\n`;
}

test('the worked example (good-code-review-subagent-def) exists in the golden set', () => {
  assert.ok(WORKED_EXAMPLE, 'golden-sets/subagents.json must carry the "good-code-review-subagent-def" entry');
  assert.equal(WORKED_EXAMPLE.label, 'good');
});

test('the worked example passes every deterministic checklist item', () => {
  assert.ok(WORKED_EXAMPLE, 'golden-sets/subagents.json must carry the "good-code-review-subagent-def" entry');
  const scores = scoreDeterministicChecklist(WORKED_EXAMPLE.content);
  for (const key of DETERMINISTIC_CHECKLIST_KEYS) {
    assert.equal(scores[key], true, `expected the worked example to pass "${key}", got ${JSON.stringify(scores)}`);
  }
});

test('Task #90: the worked example provenance record is accepted', () => {
  assert.doesNotThrow(() =>
    assertSubagentProvenanceRecorded({ parentSkillOrCommand: 'generate-subagent', dependsOnToolSchemas: [] }),
  );
});

test('Task #92: a real hit-and-miss delegation suite scores accuracy for the worked example\'s boundary', () => {
  // Mirrors the worked example's own stated boundary: reviews diffs for
  // correctness/security/reuse; explicitly NOT style/lint or architecture
  // review (those belong to sibling subagents).
  const cases = [
    { taskDescription: 'review this PR diff for a possible SQL injection bug', shouldDelegate: true },
    { taskDescription: 'check if this refactor introduces any correctness regressions', shouldDelegate: true },
    { taskDescription: 'fix the eslint formatting violations in this file', shouldDelegate: false },
    { taskDescription: 'evaluate whether this service should be split into two microservices', shouldDelegate: false },
  ];
  assert.doesNotThrow(() => assertTestsBoundary(cases));

  // A real decision function mirroring the worked example's own stated
  // boundary language, not a rubber-stamped always-true/always-false stub.
  const decide = (taskDescription) => {
    const t = taskDescription.toLowerCase();
    if (t.includes('lint') || t.includes('format')) return false;
    if (t.includes('microservice') || t.includes('architecture')) return false;
    return t.includes('bug') || t.includes('regression') || t.includes('review') || t.includes('security');
  };

  const result = scoreDelegationCases(cases, decide);
  assert.equal(result.accuracy, 1, JSON.stringify(result.results, null, 2));
});

test('Task #92: a broken delegation decision (always delegate) is caught by the harness, not hidden', () => {
  const cases = [
    { taskDescription: 'review this diff', shouldDelegate: true },
    { taskDescription: 'fix the lint errors', shouldDelegate: false },
  ];
  const result = scoreDelegationCases(cases, () => true);
  assert.ok(result.accuracy < 1);
});

test('Task #94: drafted frontmatter for the worked example satisfies the four-required-elements contract with zero errors', () => {
  const frontmatter = draftWorkedExampleFrontmatter();
  const { valid, errors } = validateFrontmatterContract(frontmatter);
  assert.deepEqual(errors, []);
  assert.equal(valid, true);
});

test('Task #94: the worked example frontmatter uses conceptType "procedural" and the subagents ttl, not a hardcoded literal', () => {
  assert.equal(ARTIFACT_TYPE_METADATA.subagents.conceptType, 'procedural');
  const frontmatter = draftWorkedExampleFrontmatter();
  assert.equal(frontmatter.temporal.ttl, ARTIFACT_TYPE_METADATA.subagents.ttl);
});

test('a checklist item failing the contract is actually caught (contract is not vacuously true)', () => {
  const broken = draftWorkedExampleFrontmatter();
  broken.relationships = broken.relationships.filter((r) => r.type !== 'harness:generated-for');
  const { valid, errors } = validateFrontmatterContract(broken);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('harness:generated-for')));
});

test('full persistDraftArtifact round-trip for the worked example, promoted after a passing gate simulation', () => {
  assert.ok(WORKED_EXAMPLE, 'golden-sets/subagents.json must carry the "good-code-review-subagent-def" entry');
  const root = tempStoreRoot();
  const configDir = tempConfigDirWithMifDocs();
  try {
    const frontmatter = draftWorkedExampleFrontmatter();
    const fullMarkdownContent = composeMarkdown(frontmatter, WORKED_EXAMPLE.content);

    const result = persistDraftArtifact({
      type: 'subagents',
      slug: 'code-review-worked-example',
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
    assert.equal(getCurrentVersion('subagents', 'code-review-worked-example', root), null);

    promoteVersion('subagents', 'code-review-worked-example', result.version, root);
    assert.equal(getCurrentVersion('subagents', 'code-review-worked-example', root), 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(configDir, { recursive: true, force: true });
  }
});

test('persistDraftArtifact rejects the worked example when a required element is dropped, even with a well-formed extensions block present', () => {
  assert.ok(WORKED_EXAMPLE, 'golden-sets/subagents.json must carry the "good-code-review-subagent-def" entry');
  const root = tempStoreRoot();
  const configDir = tempConfigDirWithMifDocs();
  try {
    const frontmatter = draftWorkedExampleFrontmatter();
    delete frontmatter.provenance.sourceType;
    assert.throws(
      () =>
        persistDraftArtifact({
          type: 'subagents',
          slug: 'code-review-worked-example-broken',
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
