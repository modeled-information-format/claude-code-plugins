// Story S6 Task #74's explicit deliverable, automated rather than left as
// prose: verify a generated prompt's frontmatter satisfies the four-
// required-elements contract, using the architecture doc's own worked
// example (a code-review subagent system prompt) — golden-sets/prompts.json's
// "good-code-review-subagent" entry IS that worked example's content. This
// file only exercises what's genuinely deterministic (checklist scoring,
// contract validation, a real persistDraftArtifact round-trip); the
// LLM-judgment steps (checklist quality items, G-Eval grading) are
// documented in skills/generate-prompt/SKILL.md for a live agent session,
// not unit-testable here — see that file's "Known limitation"-style framing
// in skills/grade-artifact/SKILL.md for why.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { scoreDeterministicChecklist, DETERMINISTIC_CHECKLIST_KEYS } from '../lib/prompt-checklist.mjs';
import { validateFrontmatterContract, ARTIFACT_TYPE_METADATA } from '../lib/frontmatter-contract.mjs';
import { persistDraftArtifact } from '../lib/persist-artifact.mjs';
import { getCurrentVersion, promoteVersion } from '../lib/xdg-store.mjs';
import goldenSet from '../golden-sets/prompts.json' with { type: 'json' };

// Same fixture pattern test/persist-artifact.test.mjs already established —
// copied here rather than imported, since that file doesn't export these
// helpers and this plugin's convention (see that file) is per-test-file
// temp-dir setup, not a shared test-utils module.
function tempStoreRoot() {
  return mkdtempSync(join(tmpdir(), 'caa-generate-prompt-test-store-'));
}

function tempConfigDirWithMifDocs() {
  const configDir = mkdtempSync(join(tmpdir(), 'caa-generate-prompt-test-config-'));
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

const WORKED_EXAMPLE = goldenSet.entries.find((e) => e.id === 'good-code-review-subagent');

/** Draft frontmatter for the worked example — what step 2 of the generate-prompt skill's "Provenance" phase would produce. */
function draftWorkedExampleFrontmatter() {
  return {
    citations: [
      {
        citationType: 'documentation',
        citationRole: 'source',
        title: 'Epic: Claude Artifact Authoring plugin — build, onboard, and admit to the marketplace',
        url: 'https://github.com/modeled-information-format/claude-code-plugins/issues/40',
        accessed: '2026-07-13',
      },
      {
        citationType: 'documentation',
        citationRole: 'methodology',
        title: 'Task: Prompt generator — generation (structured-prompting checklist)',
        url: 'https://github.com/modeled-information-format/claude-code-plugins/issues/67',
        accessed: '2026-07-13',
      },
    ],
    provenance: { sourceType: 'system_generated' },
    temporal: {
      validFrom: '2026-07-13T00:00:00Z',
      recordedAt: '2026-07-13T00:00:00Z',
      ttl: ARTIFACT_TYPE_METADATA.prompts.ttl,
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
        target: 'urn:mif:topic:claude-artifact-authoring:prompts',
      },
    ],
    extensions: {
      claudeArtifactAuthoring: {
        generatorType: 'prompts',
        checklist: {
          clarityGoldenRule: 'pass',
          contextualJustification: 'pass',
          fewShotExamples: 'pass',
          xmlDelimiting: 'pass',
          roleSetting: 'pass',
          tieredChainOfThought: 'pass',
          rightAltitude: 'pass',
          documentGrounding: 'n/a',
        },
        revision: 1,
      },
    },
  };
}

function composeMarkdown(frontmatter, body) {
  // A hand-rolled minimal YAML-ish dump is deliberately avoided here — this
  // test only needs a byte string containing recognizable frontmatter
  // markers plus the body, since persistDraftArtifact's contract validation
  // reads `parsedFrontmatter` (a real object), not this string. JSON is
  // valid YAML, so this round-trips cleanly if ever parsed for real.
  return `---\n${JSON.stringify(frontmatter, null, 2)}\n---\n\n${body}\n`;
}

test('the worked example (good-code-review-subagent) exists in the golden set', () => {
  assert.ok(WORKED_EXAMPLE, 'golden-sets/prompts.json must carry the "good-code-review-subagent" entry');
  assert.equal(WORKED_EXAMPLE.label, 'good');
});

test('the worked example passes every deterministic checklist item', () => {
  const scores = scoreDeterministicChecklist(WORKED_EXAMPLE.content);
  for (const key of DETERMINISTIC_CHECKLIST_KEYS) {
    assert.equal(scores[key], true, `expected the worked example to pass "${key}", got ${JSON.stringify(scores)}`);
  }
});

test('Task #74: drafted frontmatter for the worked example satisfies the four-required-elements contract with zero errors', () => {
  const frontmatter = draftWorkedExampleFrontmatter();
  const { valid, errors } = validateFrontmatterContract(frontmatter);
  assert.deepEqual(errors, []);
  assert.equal(valid, true);
});

test('the worked example frontmatter uses the prompts ttl from ARTIFACT_TYPE_METADATA, not a hardcoded literal', () => {
  const frontmatter = draftWorkedExampleFrontmatter();
  assert.equal(frontmatter.temporal.ttl, 'P90D');
  assert.equal(frontmatter.temporal.ttl, ARTIFACT_TYPE_METADATA.prompts.ttl);
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
      type: 'prompts',
      slug: 'code-review-subagent-worked-example',
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

    // Unpromoted until the mif-validate gate (a live skill invocation this
    // unit test cannot run) passes — mirrors skills/persist-artifact/
    // SKILL.md step 4's "only if it passes" rule.
    assert.equal(getCurrentVersion('prompts', 'code-review-subagent-worked-example', root), null);

    // Simulate step 4's gate passing, then promote — proving the version
    // this pipeline wrote really is promotable, not just written.
    promoteVersion('prompts', 'code-review-subagent-worked-example', result.version, root);
    assert.equal(getCurrentVersion('prompts', 'code-review-subagent-worked-example', root), 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(configDir, { recursive: true, force: true });
  }
});

test('persistDraftArtifact rejects the worked example if the checklist extensions block is malformed but a required element is dropped', () => {
  // extensions is additive and never validated by the contract itself
  // (mif's schema treats it as open provider-specific data) — this proves
  // that dropping a REQUIRED element still fails even with a fully-formed
  // extensions block sitting right next to it, i.e. extensions can never
  // paper over a missing required element.
  const root = tempStoreRoot();
  const configDir = tempConfigDirWithMifDocs();
  try {
    const frontmatter = draftWorkedExampleFrontmatter();
    delete frontmatter.provenance.sourceType;
    assert.throws(
      () =>
        persistDraftArtifact({
          type: 'prompts',
          slug: 'code-review-subagent-worked-example-broken',
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
