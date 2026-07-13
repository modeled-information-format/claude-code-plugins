import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { spawn } from 'node:child_process';

import { mkdirSync } from 'node:fs';

import {
  resolveStoreRoot,
  writeArtifactVersion,
  getCurrentVersion,
  promoteVersion,
  latestVersion,
  slugDir,
  ARTIFACT_TYPES,
} from '../lib/xdg-store.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_SCRIPT = join(__dirname, '..', 'test-fixtures', 'claim-version-worker.mjs');

function tempHome() {
  return mkdtempSync(join(tmpdir(), 'caa-xdg-test-'));
}

test('resolveStoreRoot uses XDG_DATA_HOME when set', () => {
  const root = resolveStoreRoot({ XDG_DATA_HOME: join('/custom', 'data') });
  assert.equal(root, join('/custom', 'data', 'claude-artifact-authoring'));
});

test('resolveStoreRoot falls back to ~/.local/share when XDG_DATA_HOME is unset', () => {
  const root = resolveStoreRoot({});
  assert.ok(root.endsWith(join('.local', 'share', 'claude-artifact-authoring')));
});

test('resolveStoreRoot ignores an empty-string XDG_DATA_HOME (matches gdlc xdg.ts convention)', () => {
  const root = resolveStoreRoot({ XDG_DATA_HOME: '' });
  assert.ok(root.endsWith(join('.local', 'share', 'claude-artifact-authoring')));
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

test('promoteVersion rejects a version that was never written', () => {
  const root = tempHome();
  try {
    assert.throws(() => promoteVersion('tool-schemas', 'never-written', 7, root), /does not exist/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('promoteVersion rejects a non-positive-integer version before it reaches path.join()', () => {
  const root = tempHome();
  try {
    writeArtifactVersion('prompts', 'safe-slug', 'artifact.md', 'ok', { root });
    for (const bad of ['../../escape', 0, -1, 1.5, 'abc', NaN, Infinity]) {
      assert.throws(
        () => promoteVersion('prompts', 'safe-slug', bad, root),
        /Invalid version/,
        `expected version ${JSON.stringify(bad)} to be rejected`,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('latestVersion scans a large number of version directories without throwing (no Math.max(...spread) argument-count risk)', () => {
  const root = tempHome();
  try {
    const dir = slugDir('prompts', 'many-versions', root);
    mkdirSync(dir, { recursive: true });
    const COUNT = 2000;
    for (let v = 1; v <= COUNT; v += 1) {
      mkdirSync(join(dir, `v${v}`));
    }
    assert.equal(latestVersion('prompts', 'many-versions', root), COUNT);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('slugDir rejects path-traversal and separator-bearing slugs', () => {
  const root = tempHome();
  try {
    for (const bad of ['../escape', 'a/b', 'a\\b', '..', '', '.', 'trailing.']) {
      assert.throws(
        () => writeArtifactVersion('prompts', bad, 'artifact.md', 'x', { root }),
        /Invalid slug/,
        `expected "${bad}" to be rejected`,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('writeArtifactVersion rejects path-traversal and separator-bearing filenames', () => {
  const root = tempHome();
  try {
    for (const bad of ['../../etc/passwd', 'a/b.md', '..']) {
      assert.throws(
        () => writeArtifactVersion('prompts', 'safe-slug', bad, 'x', { root }),
        /Invalid filename/,
        `expected "${bad}" to be rejected`,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a safe slug with internal hyphens/dots/digits is accepted', () => {
  const root = tempHome();
  try {
    const result = writeArtifactVersion('loops', 'daily-digest.v2-final', 'artifact.md', 'ok', {
      root,
    });
    assert.equal(result.version, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function runWorker(root, type, slug) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [WORKER_SCRIPT, root, type, slug]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`worker exited ${code}: ${stderr}`));
      resolve(Number(stdout));
    });
    child.on('error', reject);
  });
}

test(
  'claimNextVersionDir is collision-safe under REAL cross-process contention',
  { timeout: 30_000 },
  async () => {
    const root = tempHome();
    try {
      const WORKER_COUNT = 12;
      // Genuinely separate OS processes racing the same slug — unlike
      // same-process async callbacks, these can interleave their syscalls,
      // so this actually exercises claimNextVersionDir's EEXIST-retry path
      // rather than just re-testing sequential correctness.
      const versions = (
        await Promise.all(
          Array.from({ length: WORKER_COUNT }, () => runWorker(root, 'loops', 'daily-digest')),
        )
      ).sort((a, b) => a - b);

      const unique = new Set(versions);
      assert.equal(
        unique.size,
        WORKER_COUNT,
        `expected ${WORKER_COUNT} unique versions across ${WORKER_COUNT} processes, got ${[...unique].length}: ${versions}`,
      );
      assert.deepEqual(versions, Array.from({ length: WORKER_COUNT }, (_, i) => i + 1));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
