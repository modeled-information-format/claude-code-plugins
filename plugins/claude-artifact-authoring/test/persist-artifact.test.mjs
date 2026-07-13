import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

import { persistDraftArtifact } from '../lib/persist-artifact.mjs';
import { getCurrentVersion, slugDir } from '../lib/xdg-store.mjs';
import { newTraceId, newSpanId, readTraceSpans } from '../lib/trace.mjs';

function tempStoreRoot() {
  return mkdtempSync(join(tmpdir(), 'caa-persist-test-store-'));
}

function tempConfigDirWithMifDocs() {
  const configDir = mkdtempSync(join(tmpdir(), 'caa-persist-test-config-'));
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
    // No traceId was passed — no span should have been recorded.
    assert.equal(result.spanId, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(configDir, { recursive: true, force: true });
  }
});

test('persistDraftArtifact records a persist-draft-artifact span as a child of the caller-supplied request span', () => {
  const root = tempStoreRoot();
  const configDir = tempConfigDirWithMifDocs();
  // A unique path directly under tmpdir(), not a directory created via
  // mkdtempSync — persistDraftArtifact's own mkdirSync(dirname) call is a
  // no-op against tmpdir() itself, so there's no directory left behind.
  const traceLogPath = join(tmpdir(), `caa-persist-trace-test-${randomBytes(8).toString('hex')}.jsonl`);
  try {
    const traceId = newTraceId();
    const requestSpanId = newSpanId(); // simulates the generator's own "generation-request" span

    const result = persistDraftArtifact({
      type: 'goals',
      slug: 'ship-feature-x',
      filename: 'artifact.md',
      fullMarkdownContent: '---\nid: x\n---\n# content',
      parsedFrontmatter: VALID_FRONTMATTER,
      root,
      env: { CLAUDE_CONFIG_DIR: configDir },
      traceId,
      parentSpanId: requestSpanId,
      traceLogPath,
    });

    assert.ok(result.spanId);
    const [span] = readTraceSpans(traceId, { path: traceLogPath });
    assert.equal(span.name, 'persist-draft-artifact');
    assert.equal(span.spanId, result.spanId);
    assert.equal(span.parentSpanId, requestSpanId);
    assert.equal(span.attributes.type, 'goals');
    assert.equal(span.attributes.slug, 'ship-feature-x');
    assert.equal(span.attributes.version, result.version);
    assert.equal(span.attributes.path, result.path);
    assert.ok(span.endTimeUnixNano, 'span must be closed, not left open');
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(configDir, { recursive: true, force: true });
    rmSync(traceLogPath, { force: true });
  }
});

test('persistDraftArtifact rejects traceId without parentSpanId before writing anything (would silently produce an unlinked span)', () => {
  const root = tempStoreRoot();
  const configDir = tempConfigDirWithMifDocs();
  try {
    assert.throws(
      () =>
        persistDraftArtifact({
          type: 'goals',
          slug: 'orphan-span-check',
          filename: 'artifact.md',
          fullMarkdownContent: '---\nid: x\n---\n# content',
          parsedFrontmatter: VALID_FRONTMATTER,
          root,
          env: { CLAUDE_CONFIG_DIR: configDir },
          traceId: newTraceId(),
          // parentSpanId deliberately omitted
        }),
      /traceId was provided without parentSpanId/,
    );
    assert.ok(!existsSync(slugDir('goals', 'orphan-span-check', root)));
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(configDir, { recursive: true, force: true });
  }
});

test('persistDraftArtifact succeeds even when writing the trace span fails (tracing is best-effort)', () => {
  // The artifact is already durably written by the time the span is
  // recorded — a tracing failure (here: writeSpan's mkdirSync(dirname)
  // failing because a path SEGMENT is a plain file, not a directory) must
  // not make this call throw, or a caller would reasonably treat
  // persistence itself as failed and retry, producing a duplicate version.
  const root = tempStoreRoot();
  const configDir = tempConfigDirWithMifDocs();
  const blockerFile = join(tmpdir(), `caa-persist-trace-blocker-${randomBytes(8).toString('hex')}`);
  writeFileSync(blockerFile, 'not a directory');
  const unwritableTraceLogPath = join(blockerFile, 'traces.jsonl'); // parent segment is a file
  try {
    const result = persistDraftArtifact({
      type: 'goals',
      slug: 'tracing-failure-is-non-fatal',
      filename: 'artifact.md',
      fullMarkdownContent: '---\nid: x\n---\n# content',
      parsedFrontmatter: VALID_FRONTMATTER,
      root,
      env: { CLAUDE_CONFIG_DIR: configDir },
      traceId: newTraceId(),
      parentSpanId: newSpanId(),
      traceLogPath: unwritableTraceLogPath,
    });
    assert.equal(result.version, 1);
    assert.ok(existsSync(result.path), 'the artifact itself must still be written');
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(configDir, { recursive: true, force: true });
    rmSync(blockerFile, { force: true });
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

test('persistDraftArtifact derives the default XDG root from the SAME env it was given, not real process.env', () => {
  // Regression: root used to default via a bare resolveStoreRoot() call
  // that ignored the `env` override entirely, so a caller redirecting
  // XDG_DATA_HOME via `env` (without also passing `root` explicitly) would
  // silently write into the real process.env's store instead.
  const configDir = tempConfigDirWithMifDocs();
  const fakeDataHome = mkdtempSync(join(tmpdir(), 'caa-persist-test-xdg-'));
  try {
    const result = persistDraftArtifact({
      type: 'prompts',
      slug: 'env-derived-root',
      filename: 'artifact.md',
      fullMarkdownContent: '---\nid: x\n---\n# content',
      parsedFrontmatter: VALID_FRONTMATTER,
      env: { CLAUDE_CONFIG_DIR: configDir, XDG_DATA_HOME: fakeDataHome },
      // deliberately NOT passing `root` — it must derive from `env` above
    });
    assert.ok(
      result.path.startsWith(join(fakeDataHome, 'claude-artifact-authoring')),
      `expected path under ${fakeDataHome}, got ${result.path}`,
    );
  } finally {
    rmSync(configDir, { recursive: true, force: true });
    rmSync(fakeDataHome, { recursive: true, force: true });
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
