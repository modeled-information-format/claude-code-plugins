import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveMifDocsDir, assertMifDocsAvailable } from '../lib/mif-docs-dependency.mjs';

function fakeConfigDir() {
  return mkdtempSync(join(tmpdir(), 'caa-mifdocs-test-'));
}

function installFakeMifDocs(configDir, version) {
  const dir = join(
    configDir,
    'plugins',
    'cache',
    'modeled-information-format',
    'mif-docs',
    version,
  );
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  writeFileSync(join(dir, 'scripts', 'mif-validate.mjs'), '// fake\n');
  return dir;
}

test('resolveMifDocsDir returns null when nothing is installed', () => {
  const configDir = fakeConfigDir();
  try {
    assert.equal(resolveMifDocsDir({ CLAUDE_CONFIG_DIR: configDir }), null);
  } finally {
    rmSync(configDir, { recursive: true, force: true });
  }
});

test('resolveMifDocsDir returns null for a version dir missing the required script', () => {
  const configDir = fakeConfigDir();
  try {
    mkdirSync(
      join(configDir, 'plugins', 'cache', 'modeled-information-format', 'mif-docs', '0.1.0'),
      { recursive: true },
    );
    assert.equal(resolveMifDocsDir({ CLAUDE_CONFIG_DIR: configDir }), null);
  } finally {
    rmSync(configDir, { recursive: true, force: true });
  }
});

test('resolveMifDocsDir finds a single installed version', () => {
  const configDir = fakeConfigDir();
  try {
    const expected = installFakeMifDocs(configDir, '0.4.1');
    assert.equal(resolveMifDocsDir({ CLAUDE_CONFIG_DIR: configDir }), expected);
  } finally {
    rmSync(configDir, { recursive: true, force: true });
  }
});

test('resolveMifDocsDir picks the highest version when several are installed', () => {
  const configDir = fakeConfigDir();
  try {
    installFakeMifDocs(configDir, '0.3.1');
    installFakeMifDocs(configDir, '0.4.1');
    const newest = installFakeMifDocs(configDir, '0.4.3-ade02650fa36');
    assert.equal(resolveMifDocsDir({ CLAUDE_CONFIG_DIR: configDir }), newest);
  } finally {
    rmSync(configDir, { recursive: true, force: true });
  }
});

test('assertMifDocsAvailable throws an actionable error when not installed', () => {
  const configDir = fakeConfigDir();
  try {
    assert.throws(
      () => assertMifDocsAvailable({ CLAUDE_CONFIG_DIR: configDir }),
      /plugin install mif-docs@modeled-information-format/,
    );
  } finally {
    rmSync(configDir, { recursive: true, force: true });
  }
});

test('assertMifDocsAvailable returns the resolved dir when installed', () => {
  const configDir = fakeConfigDir();
  try {
    const expected = installFakeMifDocs(configDir, '0.4.1');
    assert.equal(assertMifDocsAvailable({ CLAUDE_CONFIG_DIR: configDir }), expected);
  } finally {
    rmSync(configDir, { recursive: true, force: true });
  }
});

test('falls back to ~/.claude when CLAUDE_CONFIG_DIR is unset (does not throw resolving the path itself)', () => {
  // Just proves the no-CLAUDE_CONFIG_DIR code path executes without error;
  // whether it finds a real install depends on the machine running this test.
  assert.doesNotThrow(() => resolveMifDocsDir({}));
});
