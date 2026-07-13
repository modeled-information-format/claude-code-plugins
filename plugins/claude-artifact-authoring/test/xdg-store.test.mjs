import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  resolveStoreRoot,
  claimNextVersionDir,
  writeArtifactVersion,
  getCurrentVersion,
  promoteVersion,
  latestVersion,
  ARTIFACT_TYPES,
} from '../lib/xdg-store.mjs';

function tempHome() {
  return mkdtempSync(join(tmpdir(), 'caa-xdg-test-'));
}

test('resolveStoreRoot uses XDG_DATA_HOME when set', () => {
  const root = resolveStoreRoot({ XDG_DATA_HOME: '/custom/data' });
  assert.equal(root, '/custom/data/claude-artifact-authoring');
});

test('resolveStoreRoot falls back to ~/.local/share when XDG_DATA_HOME is unset', () => {
  const root = resolveStoreRoot({});
  assert.match(root, /\.local\/share\/claude-artifact-authoring$/);
});

test('resolveStoreRoot ignores an empty-string XDG_DATA_HOME (matches gdlc xdg.ts convention)', () => {
  const root = resolveStoreRoot({ XDG_DATA_HOME: '' });
  assert.match(root, /\.local\/share\/claude-artifact-authoring$/);
});

test('every declared artifact type is a plain lowercase-hyphen slug', () => {
  for (const type of ARTIFACT_TYPES) {
    assert.match(type, /^[a-z-]+$/);
  }
});

test('writeArtifactVersion writes content, claims v1 first, and promotes by default', () => {
  const root = tempHome();
  try {
    const result = writeArtifactVersion('prompts', 'code-review-subagent', 'artifact.md', '# v1', {
      root,
    });
    assert.equal(result.version, 1);
    assert.equal(readFileSync(result.path, 'utf8'), '# v1');
    assert.equal(getCurrentVersion('prompts', 'code-review-subagent', root), 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a second write claims v2 without touching v1, and rollback repromotes v1', () => {
  const root = tempHome();
  try {
    writeArtifactVersion('prompts', 'code-review-subagent', 'artifact.md', '# v1', { root });
    const v2 = writeArtifactVersion('prompts', 'code-review-subagent', 'artifact.md', '# v2', {
      root,
    });
    assert.equal(v2.version, 2);
    assert.equal(getCurrentVersion('prompts', 'code-review-subagent', root), 2);

    // Rollback: promote v1 again: v2's file must still exist on disk untouched.
    promoteVersion('prompts', 'code-review-subagent', 1, root);
    assert.equal(getCurrentVersion('prompts', 'code-review-subagent', root), 1);
    assert.equal(latestVersion('prompts', 'code-review-subagent', root), 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('promote: false lets a caller validate a draft before it becomes current', () => {
  const root = tempHome();
  try {
    const draft = writeArtifactVersion('goals', 'ship-feature-x', 'artifact.md', '# draft', {
      root,
      promote: false,
    });
    assert.equal(getCurrentVersion('goals', 'ship-feature-x', root), null);
    promoteVersion('goals', 'ship-feature-x', draft.version, root);
    assert.equal(getCurrentVersion('goals', 'ship-feature-x', root), draft.version);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('concurrent claimNextVersionDir calls never collide on the same version', async () => {
  const root = tempHome();
  try {
    const claims = await Promise.all(
      Array.from({ length: 12 }, () =>
        Promise.resolve().then(() => claimNextVersionDir('loops', 'daily-digest', root)),
      ),
    );
    const versions = claims.map((c) => c.version).sort((a, b) => a - b);
    const unique = new Set(versions);
    assert.equal(unique.size, 12, `expected 12 unique versions, got ${[...unique].length}`);
    assert.deepEqual(versions, Array.from({ length: 12 }, (_, i) => i + 1));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('promoteVersion rejects a version that was never written', () => {
  const root = tempHome();
  try {
    assert.throws(() => promoteVersion('tool-schemas', 'never-written', 7, root), /does not exist/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
