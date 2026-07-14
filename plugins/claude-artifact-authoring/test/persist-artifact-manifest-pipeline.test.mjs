// Story S13's cross-cutting integration: unlike unit tests in
// artifact-manifest.test.mjs (hand-built frontmatter fixtures), this proves
// buildArtifactManifest/assertManifestReadyToSurface fire correctly against
// a REAL persisted-and-promoted artifact's stamped frontmatter — the same
// end-to-end shape every other Story's generate-*-pipeline.test.mjs uses,
// applied here to the shared persist-artifact/SKILL.md's new step 6 rather
// than to one generator. Reuses Story S11's worked-example fixture rather
// than inventing a new one just for this cross-cutting test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { persistDraftArtifact } from '../lib/persist-artifact.mjs';
import { promoteVersion } from '../lib/xdg-store.mjs';
import { ARTIFACT_TYPE_METADATA } from '../lib/frontmatter-contract.mjs';
import {
  buildArtifactManifest,
  formatManifestForInspection,
  assertManifestReadyToSurface,
} from '../lib/artifact-manifest.mjs';
import goldenSet from '../golden-sets/tool-schemas.json' with { type: 'json' };

function tempStoreRoot() {
  return mkdtempSync(join(tmpdir(), 'caa-manifest-pipeline-test-store-'));
}

function tempConfigDirWithMifDocs() {
  const configDir = mkdtempSync(join(tmpdir(), 'caa-manifest-pipeline-test-config-'));
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
const SLUG = 'search-issues-manifest-pipeline-worked-example';

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
    ],
    provenance: { sourceType: 'system_generated' },
    temporal: {
      validFrom: '2026-07-14T00:00:00Z',
      recordedAt: '2026-07-14T00:00:00Z',
      ttl: ARTIFACT_TYPE_METADATA['tool-schemas'].ttl,
    },
    relationships: [
      { type: 'derived-from', target: 'https://github.com/modeled-information-format/claude-code-plugins/issues/40' },
      {
        type: 'relates-to',
        target: 'urn:mif:activity:claude-code-session:59776443-e228-4bd8-a2bd-e6be3c2a7f34',
      },
      { type: 'harness:generated-for', target: 'urn:mif:topic:claude-artifact-authoring:tool-schemas' },
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

test('step 6 fires against a real promoted artifact: the manifest built from its stamped frontmatter is ready to surface', () => {
  assert.ok(WORKED_EXAMPLE, 'golden-sets/tool-schemas.json must carry the "good-flat-search-tool-schema" entry');
  const root = tempStoreRoot();
  const configDir = tempConfigDirWithMifDocs();
  try {
    const frontmatter = draftWorkedExampleFrontmatter();
    const fullMarkdownContent = composeMarkdown(frontmatter, WORKED_EXAMPLE.content);

    const persisted = persistDraftArtifact({
      type: 'tool-schemas',
      slug: SLUG,
      filename: 'artifact.md',
      fullMarkdownContent,
      parsedFrontmatter: frontmatter,
      root,
      env: { CLAUDE_CONFIG_DIR: configDir },
    });
    // step 4's gate simulation: only after this would step 6 ever run.
    promoteVersion('tool-schemas', SLUG, persisted.version, root);

    const manifest = buildArtifactManifest({
      type: 'tool-schemas',
      slug: SLUG,
      version: persisted.version,
      frontmatter,
    });
    assert.doesNotThrow(() => assertManifestReadyToSurface(manifest));

    assert.equal(manifest.sourceGrounding[0].title, frontmatter.citations[0].title);
    assert.equal(manifest.generationSteps.generatorType, 'tool-schemas');
    assert.equal(manifest.generationSteps.checklist.isValidJSON, 'pass');

    const rendered = formatManifestForInspection(manifest);
    assert.match(rendered, new RegExp(`tool-schemas/${SLUG} v${persisted.version}`));
    assert.match(rendered, /SHOULD-level/);

    assert.equal(
      readFileSync(persisted.path, 'utf8'),
      fullMarkdownContent,
      'the manifest must be built from the SAME frontmatter that was actually persisted, not a divergent copy',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(configDir, { recursive: true, force: true });
  }
});
