import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { persistDraftArtifact } from '../lib/persist-artifact.mjs';
import { getCurrentVersion, slugDir } from '../lib/xdg-store.mjs';

function tempStoreRoot() {
  return mkdtempSync(join(tmpdir(), 'caa-persist-test-store-'));
}

function tempConfigDirWithMifDocs() {
  const configDir = mkdtempSync(join(tmpdir(), 'caa-persist-test-config-'));
  const dir = join(configDir, 'plugins', 'cache', 'modeled-information-format', 'mif-docs', '0.4.1');
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  writeFileSync(join(dir, 'scripts', 'mif-validate.mjs'), '// fake\n');
  return configDir;
}

function tempConfigDirWithoutMifDocs() {
  return mkdtempSync(join(tmpdir(), 'caa-persist-test-config-empty-'));
}

const VALID_FRONTMATTER = {
  citations: [
    {
      citationType: 'documentation',
      citationRole: 'source',
      title: 'architecture-design-blueprint',
      url: 'https://github.com/modeled-information-format/claude-code-plugins/issues/40',
      accessed: '2026-07-13',
    },
  ],
  provenance: { sourceType: 'system_generated' },
  temporal: { validFrom: '2026-07-13T00:00:00Z', recordedAt: '2026-07-13T00:00:00Z', ttl: 'P90D' },
  relationships: [
    { type: 'derived-from', target: 'urn:mif:concept:finding' },
    { type: 'relates-to', target: 'urn:mif:activity:claude-code-session:abc' },
    { type: 'harness:generated-for', target: 'urn:mif:topic:claude-artifact-authoring' },
  ],
};

test('persistDraftArtifact writes an unpromoted draft version when both preconditions hold', () => {
  const root = tempStoreRoot();
  const configDir = tempConfigDirWithMifDocs();
  try {
    const result = persistDraftArtifact({
      type: 'prompts',
      slug: 'code-review-subagent',
      filename: 'artifact.md',
      fullMarkdownContent: '---\nid: x\n---\n# content',
      parsedFrontmatter: VALID_FRONTMATTER,
      root,
      env: { CLAUDE_CONFIG_DIR: configDir },
    });
    assert.equal(result.version, 1);
    assert.ok(existsSync(result.path));
    assert.ok(result.mifDocsDir.includes('mif-docs'));
    // Not promoted: getCurrentVersion must still be null.
    assert.equal(getCurrentVersion('prompts', 'code-review-subagent', root), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(configDir, { recursive: true, force: true });
  }
});

test('persistDraftArtifact rejects an invalid frontmatter before writing anything', () => {
  const root = tempStoreRoot();
  const configDir = tempConfigDirWithMifDocs();
  try {
    assert.throws(
      () =>
        persistDraftArtifact({
          type: 'goals',
          slug: 'ship-feature-x',
          filename: 'artifact.md',
          fullMarkdownContent: '---\nid: x\n---\n# content',
          parsedFrontmatter: { ...VALID_FRONTMATTER, citations: [] },
          root,
          env: { CLAUDE_CONFIG_DIR: configDir },
        }),
      /citations\[\]/,
    );
    assert.ok(!existsSync(slugDir('goals', 'ship-feature-x', root)));
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(configDir, { recursive: true, force: true });
  }
});

test('persistDraftArtifact fails loud when mif-docs is not installed, even with valid frontmatter', () => {
  const root = tempStoreRoot();
  const configDir = tempConfigDirWithoutMifDocs();
  try {
    assert.throws(
      () =>
        persistDraftArtifact({
          type: 'loops',
          slug: 'daily-digest',
          filename: 'artifact.md',
          fullMarkdownContent: '---\nid: x\n---\n# content',
          parsedFrontmatter: VALID_FRONTMATTER,
          root,
          env: { CLAUDE_CONFIG_DIR: configDir },
        }),
      /mif-docs plugin not found/,
    );
    assert.ok(!existsSync(slugDir('loops', 'daily-digest', root)));
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(configDir, { recursive: true, force: true });
  }
});
