// Real exercises against lib/xdg-store.mjs's actual file-backed store
// (redirected to a temp root per test) — proving Task #91's "single source
// of typed truth" pin resolution genuinely reads the store's real current
// version, not a documented assumption.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveToolSchemaPin } from '../lib/tool-schema-pin.mjs';
import { writeArtifactVersion, promoteVersion } from '../lib/xdg-store.mjs';

function tempStoreRoot() {
  return mkdtempSync(join(tmpdir(), 'caa-tool-schema-pin-test-'));
}

test('resolveToolSchemaPin throws when the schema has never been promoted', () => {
  const root = tempStoreRoot();
  try {
    assert.throws(() => resolveToolSchemaPin('search-issues', root), /has no promoted \(current\) version/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('resolveToolSchemaPin resolves the real current version once one is promoted', () => {
  const root = tempStoreRoot();
  try {
    const result = writeArtifactVersion('tool-schemas', 'search-issues', 'schema.json', '{}', {
      root,
      promote: false,
    });
    promoteVersion('tool-schemas', 'search-issues', result.version, root);
    assert.deepEqual(resolveToolSchemaPin('search-issues', root), { slug: 'search-issues', version: 1 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('resolveToolSchemaPin pins to the LATEST promoted version, not the first one written', () => {
  const root = tempStoreRoot();
  try {
    const v1 = writeArtifactVersion('tool-schemas', 'search-issues', 'schema.json', '{}', {
      root,
      promote: true,
    });
    const v2 = writeArtifactVersion('tool-schemas', 'search-issues', 'schema.json', '{}', {
      root,
      promote: true,
    });
    assert.equal(v1.version, 1);
    assert.equal(v2.version, 2);
    assert.deepEqual(resolveToolSchemaPin('search-issues', root), { slug: 'search-issues', version: 2 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
