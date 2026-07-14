// Story S9 Task #84's explicit deliverable, automated rather than left as
// prose: verify a generated eval suite's frontmatter satisfies the four-
// required-elements contract (with conceptType: 'semantic' from
// ARTIFACT_TYPE_METADATA['eval-suites']), using golden-sets/eval-suites.json's
// "good-llm-judge-prompt-eval" entry as the worked example — plus, per
// Tasks #79/#81, a real exercise of the calibration-cadence wiring. Every
// test that dereferences WORKED_EXAMPLE carries its own local assert.ok
// guard from the start.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { scoreDeterministicChecklist, DETERMINISTIC_CHECKLIST_KEYS } from '../lib/eval-suite-checklist.mjs';
import { assertEvalSuiteCalibrationWired } from '../lib/eval-suite-calibration-wiring.mjs';
import { recordCalibrationRun } from '../lib/calibration.mjs';
import { validateFrontmatterContract, ARTIFACT_TYPE_METADATA } from '../lib/frontmatter-contract.mjs';
import { persistDraftArtifact } from '../lib/persist-artifact.mjs';
import { getCurrentVersion, promoteVersion } from '../lib/xdg-store.mjs';
import goldenSet from '../golden-sets/eval-suites.json' with { type: 'json' };

function tempStoreRoot() {
  return mkdtempSync(join(tmpdir(), 'caa-generate-eval-suite-test-store-'));
}

function tempConfigDirWithMifDocs() {
  const configDir = mkdtempSync(join(tmpdir(), 'caa-generate-eval-suite-test-config-'));
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

function tempCalibrationLogPath() {
  const dir = mkdtempSync(join(tmpdir(), 'caa-generate-eval-suite-test-calib-'));
  return join(dir, 'calibration-runs.jsonl');
}

const WORKED_EXAMPLE = goldenSet.entries.find((e) => e.id === 'good-llm-judge-prompt-eval');

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
        title: 'Task: Eval-suite generator — generation (grader type + calibration discipline)',
        url: 'https://github.com/modeled-information-format/claude-code-plugins/issues/76',
        accessed: '2026-07-14',
      },
    ],
    provenance: { sourceType: 'system_generated' },
    temporal: {
      validFrom: '2026-07-14T00:00:00Z',
      recordedAt: '2026-07-14T00:00:00Z',
      ttl: ARTIFACT_TYPE_METADATA['eval-suites'].ttl,
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
        target: 'urn:mif:topic:claude-artifact-authoring:eval-suites',
      },
    ],
    extensions: {
      claudeArtifactAuthoring: {
        generatorType: 'eval-suites',
        checklist: {
          graderTypeNamed: 'pass',
          gradesArtifactNotPath: 'pass',
          hasGoldenSetReference: 'pass',
          calibrationRequiredForLLMGraders: 'pass',
          gEvalTwoStageOrdering: 'pass',
        },
        graderType: 'llm-based',
        targetArtifactType: 'prompts',
        revision: 1,
      },
    },
  };
}

function composeMarkdown(frontmatter, body) {
  return `---\n${JSON.stringify(frontmatter, null, 2)}\n---\n\n${body}\n`;
}

test('the worked example (good-llm-judge-prompt-eval) exists in the golden set', () => {
  assert.ok(WORKED_EXAMPLE, 'golden-sets/eval-suites.json must carry the "good-llm-judge-prompt-eval" entry');
  assert.equal(WORKED_EXAMPLE.label, 'good');
});

test('the worked example passes every deterministic checklist item', () => {
  assert.ok(WORKED_EXAMPLE, 'golden-sets/eval-suites.json must carry the "good-llm-judge-prompt-eval" entry');
  const scores = scoreDeterministicChecklist(WORKED_EXAMPLE.content);
  for (const key of DETERMINISTIC_CHECKLIST_KEYS) {
    assert.equal(scores[key], true, `expected the worked example to pass "${key}", got ${JSON.stringify(scores)}`);
  }
});

test('Task #79/#81: the worked example calibration wiring is rejected with no run recorded, then accepted once one is', () => {
  const path = tempCalibrationLogPath();
  try {
    assert.throws(
      () =>
        assertEvalSuiteCalibrationWired({ graderType: 'llm-based', targetArtifactType: 'prompts' }, { path }),
      /no calibration run is on record/,
    );
    recordCalibrationRun(
      {
        artifactType: 'prompts',
        agreementPct: 1.0,
        sampleSize: 4,
        judgeModel: 'claude-test',
        timestamp: new Date(Date.now()).toISOString(),
      },
      { path },
    );
    assert.doesNotThrow(() =>
      assertEvalSuiteCalibrationWired({ graderType: 'llm-based', targetArtifactType: 'prompts' }, { path }),
    );
  } finally {
    rmSync(path, { force: true });
  }
});

test('Task #84: drafted frontmatter for the worked example satisfies the four-required-elements contract with zero errors', () => {
  const frontmatter = draftWorkedExampleFrontmatter();
  const { valid, errors } = validateFrontmatterContract(frontmatter);
  assert.deepEqual(errors, []);
  assert.equal(valid, true);
});

test('Task #84: the worked example frontmatter uses conceptType "semantic" and the eval-suites ttl, not a hardcoded literal', () => {
  assert.equal(ARTIFACT_TYPE_METADATA['eval-suites'].conceptType, 'semantic');
  const frontmatter = draftWorkedExampleFrontmatter();
  assert.equal(frontmatter.temporal.ttl, ARTIFACT_TYPE_METADATA['eval-suites'].ttl);
});

test('a checklist item failing the contract is actually caught (contract is not vacuously true)', () => {
  const broken = draftWorkedExampleFrontmatter();
  broken.relationships = broken.relationships.filter((r) => r.type !== 'harness:generated-for');
  const { valid, errors } = validateFrontmatterContract(broken);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('harness:generated-for')));
});

test('full persistDraftArtifact round-trip for the worked example, promoted after a passing gate simulation', () => {
  assert.ok(WORKED_EXAMPLE, 'golden-sets/eval-suites.json must carry the "good-llm-judge-prompt-eval" entry');
  const root = tempStoreRoot();
  const configDir = tempConfigDirWithMifDocs();
  try {
    const frontmatter = draftWorkedExampleFrontmatter();
    const fullMarkdownContent = composeMarkdown(frontmatter, WORKED_EXAMPLE.content);

    const result = persistDraftArtifact({
      type: 'eval-suites',
      slug: 'llm-judge-prompt-worked-example',
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
    assert.equal(getCurrentVersion('eval-suites', 'llm-judge-prompt-worked-example', root), null);

    promoteVersion('eval-suites', 'llm-judge-prompt-worked-example', result.version, root);
    assert.equal(getCurrentVersion('eval-suites', 'llm-judge-prompt-worked-example', root), 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(configDir, { recursive: true, force: true });
  }
});

test('persistDraftArtifact rejects the worked example when a required element is dropped, even with a well-formed extensions block present', () => {
  assert.ok(WORKED_EXAMPLE, 'golden-sets/eval-suites.json must carry the "good-llm-judge-prompt-eval" entry');
  const root = tempStoreRoot();
  const configDir = tempConfigDirWithMifDocs();
  try {
    const frontmatter = draftWorkedExampleFrontmatter();
    delete frontmatter.provenance.sourceType;
    assert.throws(
      () =>
        persistDraftArtifact({
          type: 'eval-suites',
          slug: 'llm-judge-prompt-worked-example-broken',
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
