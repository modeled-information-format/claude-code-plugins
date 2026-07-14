import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { resolveCorpusDbPath } from '../lib/corpus-index.mjs';
import { ARTIFACT_TYPES } from '../lib/xdg-store.mjs';

test('resolveCorpusDbPath uses XDG_DATA_HOME when set, same root as the artifact store', () => {
  const path = resolveCorpusDbPath({ XDG_DATA_HOME: join('/custom', 'data') });
  assert.equal(path, join('/custom', 'data', 'artifact-authoring', 'corpus', 'vectors.db'));
});

test('resolveCorpusDbPath falls back to ~/.local/share when XDG_DATA_HOME is unset', () => {
  const path = resolveCorpusDbPath({});
  assert.equal(path, join(homedir(), '.local', 'share', 'artifact-authoring', 'corpus', 'vectors.db'));
});

test('resolveCorpusDbPath ignores an empty-string XDG_DATA_HOME', () => {
  const path = resolveCorpusDbPath({ XDG_DATA_HOME: '' });
  assert.equal(path, join(homedir(), '.local', 'share', 'artifact-authoring', 'corpus', 'vectors.db'));
});

test("resolveCorpusDbPath's corpus/ subdirectory never collides with an artifact type directory", () => {
  assert.ok(!ARTIFACT_TYPES.includes('corpus'), '"corpus" must never become a declared artifact type');
});
