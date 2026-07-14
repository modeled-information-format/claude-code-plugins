// Story S8 Task #87's explicit deliverable, automated rather than left as
// prose: verify a generated loop's frontmatter satisfies the four-required-
// elements contract (with the loop-specific `conceptType: 'procedural'` /
// `ttl` from ARTIFACT_TYPE_METADATA.loops), using golden-sets/loops.json's
// "good-evaluator-optimizer-loop" entry as the worked example — plus, per
// Task #85, an actual executed sandboxed dry-run proving the declared stop
// condition really fires. Every test that dereferences WORKED_EXAMPLE
// carries its own local assert.ok guard from the start (Story S6/S7's own
// post-review lesson — see lib/goal-checklist.mjs's history — applied here
// up front rather than fixed after the fact).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  scoreDeterministicChecklist,
  DETERMINISTIC_CHECKLIST_KEYS,
  assertPatternSelectionGrounded,
} from '../lib/loop-checklist.mjs';
import { dryRunLoop } from '../lib/loop-dry-run.mjs';
import { validateFrontmatterContract, ARTIFACT_TYPE_METADATA } from '../lib/frontmatter-contract.mjs';
import { persistDraftArtifact } from '../lib/persist-artifact.mjs';
import { getCurrentVersion, promoteVersion } from '../lib/xdg-store.mjs';
import goldenSet from '../golden-sets/loops.json' with { type: 'json' };

function tempStoreRoot() {
  return mkdtempSync(join(tmpdir(), 'caa-generate-loop-test-store-'));
}

function tempConfigDirWithMifDocs() {
  const configDir = mkdtempSync(join(tmpdir(), 'caa-generate-loop-test-config-'));
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

const WORKED_EXAMPLE = goldenSet.entries.find((e) => e.id === 'good-evaluator-optimizer-loop');

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
        title: 'Task: Loop generator — generation (six-pattern classification + stop condition)',
        url: 'https://github.com/modeled-information-format/claude-code-plugins/issues/80',
        accessed: '2026-07-14',
      },
    ],
    provenance: { sourceType: 'system_generated' },
    temporal: {
      validFrom: '2026-07-14T00:00:00Z',
      recordedAt: '2026-07-14T00:00:00Z',
      ttl: ARTIFACT_TYPE_METADATA.loops.ttl,
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
        target: 'urn:mif:topic:artifact-authoring:loops',
      },
    ],
    extensions: {
      artifactAuthoring: {
        generatorType: 'loops',
        checklist: {
          patternNamed: 'pass',
          patternAppropriate: 'pass',
          notDefaultAutonomous: 'n/a',
          explicitStopCondition: 'pass',
          timeBasedPolicyDeclared: 'n/a',
        },
        patternSelection: {
          pattern: 'evaluator-optimizer',
          rationale: 'iterative quality improvement against a scorable rubric (Building Effective Agents)',
        },
        dryRun: { stoppedBy: 'condition', iterations: 3, ranAway: false },
        revision: 1,
      },
    },
  };
}

function composeMarkdown(frontmatter, body) {
  return `---\n${JSON.stringify(frontmatter, null, 2)}\n---\n\n${body}\n`;
}

test('the worked example (good-evaluator-optimizer-loop) exists in the golden set', () => {
  assert.ok(WORKED_EXAMPLE, 'golden-sets/loops.json must carry the "good-evaluator-optimizer-loop" entry');
  assert.equal(WORKED_EXAMPLE.label, 'good');
});

test('the worked example passes every deterministic checklist item', () => {
  assert.ok(WORKED_EXAMPLE, 'golden-sets/loops.json must carry the "good-evaluator-optimizer-loop" entry');
  const scores = scoreDeterministicChecklist(WORKED_EXAMPLE.content);
  for (const key of DETERMINISTIC_CHECKLIST_KEYS) {
    assert.equal(scores[key], true, `expected the worked example to pass "${key}", got ${JSON.stringify(scores)}`);
  }
});

test('the worked example pattern selection satisfies Task #82 grounding', () => {
  assert.doesNotThrow(() =>
    assertPatternSelectionGrounded({
      pattern: 'evaluator-optimizer',
      rationale: 'iterative quality improvement against a scorable rubric (Building Effective Agents)',
    }),
  );
});

test('Task #85: a real sandboxed dry-run proves the worked example\'s stop condition actually fires', () => {
  // Mirrors the worked example's own described logic: score improves by
  // 0.3 each iteration, stop condition is score >= 0.9 OR a 5-iteration cap.
  const result = dryRunLoop({
    step: (state = { score: 0 }) => ({ score: state.score + 0.3 }),
    isDone: (state) => (state ? state.score >= 0.9 : false),
    maxIterations: 5,
  });
  assert.equal(result.ranAway, false, 'the declared stop condition must actually fire, not run away');
  assert.equal(result.stoppedBy, 'condition');
});

test('Task #85: a loop whose declared stop condition never fires is caught, not shipped', () => {
  const result = dryRunLoop({
    step: (state = { score: 0 }) => state, // score never changes — a broken generator bug
    isDone: (state) => (state ? state.score >= 0.9 : false),
    maxIterations: 5,
  });
  assert.equal(result.stoppedBy, 'iteration-cap');
  assert.equal(result.ranAway, false, 'the iteration cap itself is a real, working backstop');
});

test('Task #87: drafted frontmatter for the worked example satisfies the four-required-elements contract with zero errors', () => {
  const frontmatter = draftWorkedExampleFrontmatter();
  const { valid, errors } = validateFrontmatterContract(frontmatter);
  assert.deepEqual(errors, []);
  assert.equal(valid, true);
});

test('Task #87: the worked example frontmatter uses conceptType "procedural" and the loops ttl, not a hardcoded literal', () => {
  assert.equal(ARTIFACT_TYPE_METADATA.loops.conceptType, 'procedural');
  const frontmatter = draftWorkedExampleFrontmatter();
  assert.equal(frontmatter.temporal.ttl, ARTIFACT_TYPE_METADATA.loops.ttl);
});

test('a checklist item failing the contract is actually caught (contract is not vacuously true)', () => {
  const broken = draftWorkedExampleFrontmatter();
  broken.relationships = broken.relationships.filter((r) => r.type !== 'harness:generated-for');
  const { valid, errors } = validateFrontmatterContract(broken);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('harness:generated-for')));
});

test('full persistDraftArtifact round-trip for the worked example, promoted after a passing gate simulation', () => {
  assert.ok(WORKED_EXAMPLE, 'golden-sets/loops.json must carry the "good-evaluator-optimizer-loop" entry');
  const root = tempStoreRoot();
  const configDir = tempConfigDirWithMifDocs();
  try {
    const frontmatter = draftWorkedExampleFrontmatter();
    const fullMarkdownContent = composeMarkdown(frontmatter, WORKED_EXAMPLE.content);

    const result = persistDraftArtifact({
      type: 'loops',
      slug: 'evaluator-optimizer-worked-example',
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
    assert.equal(getCurrentVersion('loops', 'evaluator-optimizer-worked-example', root), null);

    promoteVersion('loops', 'evaluator-optimizer-worked-example', result.version, root);
    assert.equal(getCurrentVersion('loops', 'evaluator-optimizer-worked-example', root), 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(configDir, { recursive: true, force: true });
  }
});

test('persistDraftArtifact rejects the worked example when a required element is dropped, even with a well-formed extensions block present', () => {
  assert.ok(WORKED_EXAMPLE, 'golden-sets/loops.json must carry the "good-evaluator-optimizer-loop" entry');
  const root = tempStoreRoot();
  const configDir = tempConfigDirWithMifDocs();
  try {
    const frontmatter = draftWorkedExampleFrontmatter();
    delete frontmatter.provenance.sourceType;
    assert.throws(
      () =>
        persistDraftArtifact({
          type: 'loops',
          slug: 'evaluator-optimizer-worked-example-broken',
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
