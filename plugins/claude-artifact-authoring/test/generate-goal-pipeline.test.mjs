// Story S7 Task #78's explicit deliverable, automated rather than left as
// prose: verify a generated goal's frontmatter satisfies the four-required-
// elements contract (with the goal-specific `conceptType: 'semantic'` /
// `ttl` from ARTIFACT_TYPE_METADATA.goals), using golden-sets/goals.json's
// "good-auth-tests-goal" entry as the worked example — plus, per Task #75,
// an actual executed reference-solution smoke test proving achievability is
// a real execution, not a shape check. The LLM-judgment steps (checklist
// judgment items, G-Eval grading) are documented in
// skills/generate-goal/SKILL.md for a live agent session, not unit-testable
// here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  scoreDeterministicChecklist,
  DETERMINISTIC_CHECKLIST_KEYS,
  assertChecksGrounded,
  lintChecksBalance,
} from '../lib/goal-checklist.mjs';
import { runReferenceSolutionSmokeTest } from '../lib/verify-command-runner.mjs';
import { validateFrontmatterContract, ARTIFACT_TYPE_METADATA } from '../lib/frontmatter-contract.mjs';
import { persistDraftArtifact } from '../lib/persist-artifact.mjs';
import { getCurrentVersion, promoteVersion } from '../lib/xdg-store.mjs';
import goldenSet from '../golden-sets/goals.json' with { type: 'json' };

// Same fixture pattern test/generate-prompt-pipeline.test.mjs already
// established — copied rather than imported, matching this plugin's
// per-test-file temp-dir setup convention.
function tempStoreRoot() {
  return mkdtempSync(join(tmpdir(), 'caa-generate-goal-test-store-'));
}

function tempConfigDirWithMifDocs() {
  const configDir = mkdtempSync(join(tmpdir(), 'caa-generate-goal-test-config-'));
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

const WORKED_EXAMPLE = goldenSet.entries.find((e) => e.id === 'good-auth-tests-goal');

/** The internal checks[] record this worked example's prose would have been drafted from. */
function workedExampleChecks() {
  return [
    {
      id: 'auth-tests-pass',
      assertion: 'all tests in test/auth pass',
      verify: 'pytest test/auth -q',
      groundedIn: 'acceptance pattern: exit-code discipline for test suites',
      negativeCaseApplicable: false,
    },
    {
      id: 'auth-lint-clean',
      assertion: 'ruff reports no violations in src/auth',
      verify: 'ruff check src/auth',
      groundedIn: 'acceptance pattern: lint-clean-on-merge convention',
      negativeCaseApplicable: false,
    },
  ];
}

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
        title: 'Task: Goal generator — generation (SMART + executable-verify discipline)',
        url: 'https://github.com/modeled-information-format/claude-code-plugins/issues/70',
        accessed: '2026-07-14',
      },
    ],
    provenance: { sourceType: 'system_generated' },
    temporal: {
      validFrom: '2026-07-14T00:00:00Z',
      recordedAt: '2026-07-14T00:00:00Z',
      ttl: ARTIFACT_TYPE_METADATA.goals.ttl,
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
        target: 'urn:mif:topic:claude-artifact-authoring:goals',
      },
    ],
    extensions: {
      claudeArtifactAuthoring: {
        generatorType: 'goals',
        checklist: {
          twoExpertsAgreeVerdict: 'pass',
          specific: 'pass',
          measurableVerifyCommand: 'pass',
          achievable: 'pass',
          relevant: 'pass',
          timeBound: 'pass',
          boundedConstraints: 'pass',
        },
        checks: workedExampleChecks(),
        revision: 1,
      },
    },
  };
}

function composeMarkdown(frontmatter, body) {
  return `---\n${JSON.stringify(frontmatter, null, 2)}\n---\n\n${body}\n`;
}

test('the worked example (good-auth-tests-goal) exists in the golden set', () => {
  assert.ok(WORKED_EXAMPLE, 'golden-sets/goals.json must carry the "good-auth-tests-goal" entry');
  assert.equal(WORKED_EXAMPLE.label, 'good');
});

test('the worked example passes every deterministic checklist item', () => {
  const scores = scoreDeterministicChecklist(WORKED_EXAMPLE.content);
  for (const key of DETERMINISTIC_CHECKLIST_KEYS) {
    assert.equal(scores[key], true, `expected the worked example to pass "${key}", got ${JSON.stringify(scores)}`);
  }
});

test('the worked example checks[] record satisfies Task #72 grounding and Task #75 balance', () => {
  const checks = workedExampleChecks();
  assert.doesNotThrow(() => assertChecksGrounded(checks));
  const { balanced, violations } = lintChecksBalance(checks);
  assert.equal(balanced, true, JSON.stringify(violations));
});

test('Task #75: a real reference-solution smoke test actually executes and passes for the primary check', () => {
  // This repo has no test/auth Python fixture to run the golden-set entry's
  // own `pytest test/auth -q` against — what's under test here is that the
  // smoke-test mechanism genuinely executes a reference solution and
  // observes a real pass, not that this specific tool string is runnable in
  // this repo. A safe, self-contained `node -e` stand-in plays that role.
  const result = runReferenceSolutionSmokeTest({
    command: process.execPath,
    args: ['-e', 'process.exit(0)'],
  });
  assert.equal(result.ran, true);
  assert.equal(result.passed, true, 'the reference solution must be shown to actually pass, not merely referenced');
});

test('Task #75: a broken reference solution is caught, not rubber-stamped as achievable', () => {
  const result = runReferenceSolutionSmokeTest({
    command: process.execPath,
    args: ['-e', 'process.exit(1)'],
  });
  assert.equal(result.ran, true);
  assert.equal(result.passed, false, 'a genuinely failing reference solution must not be reported as achievable');
});

test('Task #78: drafted frontmatter for the worked example satisfies the four-required-elements contract with zero errors', () => {
  const frontmatter = draftWorkedExampleFrontmatter();
  const { valid, errors } = validateFrontmatterContract(frontmatter);
  assert.deepEqual(errors, []);
  assert.equal(valid, true);
});

test('Task #78: the worked example frontmatter uses conceptType "semantic" and the goals ttl, not a hardcoded literal', () => {
  assert.equal(ARTIFACT_TYPE_METADATA.goals.conceptType, 'semantic');
  const frontmatter = draftWorkedExampleFrontmatter();
  assert.equal(frontmatter.temporal.ttl, ARTIFACT_TYPE_METADATA.goals.ttl);
});

test('a checklist item failing the contract is actually caught (contract is not vacuously true)', () => {
  const broken = draftWorkedExampleFrontmatter();
  broken.relationships = broken.relationships.filter((r) => r.type !== 'harness:generated-for');
  const { valid, errors } = validateFrontmatterContract(broken);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('harness:generated-for')));
});

test('full persistDraftArtifact round-trip for the worked example, promoted after a passing gate simulation', () => {
  const root = tempStoreRoot();
  const configDir = tempConfigDirWithMifDocs();
  try {
    const frontmatter = draftWorkedExampleFrontmatter();
    const fullMarkdownContent = composeMarkdown(frontmatter, WORKED_EXAMPLE.content);

    const result = persistDraftArtifact({
      type: 'goals',
      slug: 'auth-tests-worked-example',
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
    assert.equal(getCurrentVersion('goals', 'auth-tests-worked-example', root), null);

    promoteVersion('goals', 'auth-tests-worked-example', result.version, root);
    assert.equal(getCurrentVersion('goals', 'auth-tests-worked-example', root), 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(configDir, { recursive: true, force: true });
  }
});

test('persistDraftArtifact rejects the worked example when a required element is dropped, even with a well-formed extensions block present', () => {
  const root = tempStoreRoot();
  const configDir = tempConfigDirWithMifDocs();
  try {
    const frontmatter = draftWorkedExampleFrontmatter();
    delete frontmatter.provenance.sourceType;
    assert.throws(
      () =>
        persistDraftArtifact({
          type: 'goals',
          slug: 'auth-tests-worked-example-broken',
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
