// Story S13 (Epic #40, cross-cutting): a C2PA-style manifest reassembling
// what a generator's own frontmatter already declared (source grounding,
// generation steps, when they were declared), surfaced for inspection
// before an artifact leaves the authoring session. Task #97 (design),
// Task #99 (implementation + surfacing), Task #101 (SHOULD-level
// disclaimer). Reuses the same worked-example frontmatter shape Story
// S11's pipeline test established (ARTIFACT_TYPE_METADATA['tool-schemas'])
// rather than inventing a new fixture just for this module.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MANIFEST_VERSION,
  buildArtifactManifest,
  formatManifestForInspection,
  assertManifestReadyToSurface,
} from '../lib/artifact-manifest.mjs';
import { ARTIFACT_TYPE_METADATA } from '../lib/frontmatter-contract.mjs';

function workedExampleFrontmatter() {
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
      { type: 'derived-from', target: 'https://github.com/modeled-information-format/claude-code-plugins/issues/40' },
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

test('buildArtifactManifest assembles source grounding and generation steps from an already-drafted frontmatter', () => {
  const manifest = buildArtifactManifest({
    type: 'tool-schemas',
    slug: 'search-issues-worked-example',
    version: 1,
    frontmatter: workedExampleFrontmatter(),
  });

  assert.equal(manifest.manifestVersion, MANIFEST_VERSION);
  assert.deepEqual(manifest.artifact, { type: 'tool-schemas', slug: 'search-issues-worked-example', version: 1 });
  assert.equal(manifest.declaredAt, '2026-07-14T00:00:00Z');
  assert.deepEqual(manifest.motivation, [
    'https://github.com/modeled-information-format/claude-code-plugins/issues/40',
  ]);
  assert.equal(manifest.sourceGrounding.length, 2);
  assert.equal(manifest.sourceGrounding[0].citationRole, 'source');
  assert.equal(manifest.generationSteps.generatorType, 'tool-schemas');
  assert.equal(manifest.generationSteps.checklist.isValidJSON, 'pass');
  assert.equal(manifest.generationSteps.revision, 1);
});

test('buildArtifactManifest always includes a disclaimer, on every manifest it builds', () => {
  const manifest = buildArtifactManifest({
    type: 'tool-schemas',
    slug: 'search-issues-worked-example',
    version: 1,
    frontmatter: workedExampleFrontmatter(),
  });
  assert.ok(manifest.disclaimer.length > 0);
  assert.match(manifest.disclaimer, /SHOULD-level/);
  assert.match(manifest.disclaimer, /untrusted/);
});

test('buildArtifactManifest handles frontmatter with no citations and no generator extensions gracefully, without pretending they exist', () => {
  const frontmatter = { temporal: { recordedAt: '2026-07-14T00:00:00Z' } };
  const manifest = buildArtifactManifest({ type: 'goals', slug: 'bare', version: 1, frontmatter });
  assert.deepEqual(manifest.motivation, []);
  assert.deepEqual(manifest.sourceGrounding, []);
  assert.equal(manifest.generationSteps, null);
});

test('buildArtifactManifest only counts relationships of type "derived-from" as motivation, ignoring other relationship types', () => {
  const frontmatter = workedExampleFrontmatter();
  frontmatter.relationships.push({ type: 'relates-to', target: 'urn:mif:activity:claude-code-session:example' });
  const manifest = buildArtifactManifest({ type: 'tool-schemas', slug: 'bare', version: 1, frontmatter });
  assert.deepEqual(manifest.motivation, [
    'https://github.com/modeled-information-format/claude-code-plugins/issues/40',
  ]);
});

test('buildArtifactManifest tolerates a malformed (non-object) citation entry rather than crashing', () => {
  const frontmatter = workedExampleFrontmatter();
  frontmatter.citations = [null, ...frontmatter.citations];
  const manifest = buildArtifactManifest({ type: 'tool-schemas', slug: 'bare', version: 1, frontmatter });
  assert.deepEqual(manifest.sourceGrounding[0], { title: null, url: null, citationRole: null });
  assert.equal(manifest.sourceGrounding.length, 3);
});

test('buildArtifactManifest throws without frontmatter — it cannot honestly report on what was never drafted', () => {
  assert.throws(
    () => buildArtifactManifest({ type: 'goals', slug: 'bare', version: 1, frontmatter: null }),
    /frontmatter is required/,
  );
});

test('formatManifestForInspection renders source grounding, generator info, and the disclaimer as readable text', () => {
  const manifest = buildArtifactManifest({
    type: 'tool-schemas',
    slug: 'search-issues-worked-example',
    version: 1,
    frontmatter: workedExampleFrontmatter(),
  });
  const rendered = formatManifestForInspection(manifest);
  assert.match(rendered, /tool-schemas\/search-issues-worked-example v1/);
  assert.match(rendered, /Motivation: https:\/\/github\.com\/modeled-information-format\/claude-code-plugins\/issues\/40/);
  assert.match(rendered, /Task: Tool-schema generator/);
  assert.match(rendered, /Generator: tool-schemas \(revision 1\)/);
  assert.match(rendered, /isValidJSON: pass/);
  assert.match(rendered, /SHOULD-level/);
});

test('formatManifestForInspection reports "(none declared)" rather than an empty section when there is no source grounding', () => {
  const manifest = buildArtifactManifest({
    type: 'goals',
    slug: 'bare',
    version: 1,
    frontmatter: { temporal: { recordedAt: '2026-07-14T00:00:00Z' } },
  });
  const rendered = formatManifestForInspection(manifest);
  assert.match(rendered, /Motivation: \(no derived-from relationship declared\)/);
  assert.match(rendered, /\(none declared\)/);
  assert.match(rendered, /no generation-step record found/);
});

test('assertManifestReadyToSurface accepts a manifest built by buildArtifactManifest', () => {
  const manifest = buildArtifactManifest({
    type: 'tool-schemas',
    slug: 'search-issues-worked-example',
    version: 1,
    frontmatter: workedExampleFrontmatter(),
  });
  assert.doesNotThrow(() => assertManifestReadyToSurface(manifest));
});

test('assertManifestReadyToSurface rejects a missing manifest — not vacuously true', () => {
  assert.throws(() => assertManifestReadyToSurface(null), /No manifest was produced/);
  assert.throws(() => assertManifestReadyToSurface(undefined), /No manifest was produced/);
});

test('assertManifestReadyToSurface rejects a manifest missing a required field, naming which one', () => {
  const manifest = buildArtifactManifest({
    type: 'tool-schemas',
    slug: 'search-issues-worked-example',
    version: 1,
    frontmatter: workedExampleFrontmatter(),
  });
  delete manifest.disclaimer;
  assert.throws(() => assertManifestReadyToSurface(manifest), /missing required field\(s\): disclaimer/);
});
