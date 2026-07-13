import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

import {
  resolveTraceLogPath,
  newTraceId,
  newSpanId,
  startSpan,
  endSpan,
  writeSpan,
  readTraceSpans,
} from '../lib/trace.mjs';

// A unique path directly under the OS temp dir (which already exists), not
// a directory created via mkdtempSync — writeSpan's own mkdirSync(dirname)
// call is a no-op against tmpdir() itself, so there's no extra directory
// for tests to remember to clean up (rmSync on just the file is enough).
function tempTraceLog() {
  return join(tmpdir(), `caa-trace-test-${randomBytes(8).toString('hex')}.jsonl`);
}

test('resolveTraceLogPath uses XDG_STATE_HOME when set, distinct from the XDG_DATA_HOME artifact store', () => {
  const path = resolveTraceLogPath({ XDG_STATE_HOME: join('/custom', 'state') });
  assert.equal(path, join('/custom', 'state', 'claude-artifact-authoring', 'traces.jsonl'));
});

test('resolveTraceLogPath falls back to ~/.local/state when XDG_STATE_HOME is unset', () => {
  const path = resolveTraceLogPath({});
  assert.ok(path.endsWith(join('.local', 'state', 'claude-artifact-authoring', 'traces.jsonl')));
});

test('newTraceId returns a 128-bit (32 hex char) ID; newSpanId a 64-bit (16 hex char) ID', () => {
  assert.match(newTraceId(), /^[0-9a-f]{32}$/);
  assert.match(newSpanId(), /^[0-9a-f]{16}$/);
});

test('newTraceId and newSpanId are not constants — 50 calls produce 50 unique values', () => {
  const traceIds = new Set(Array.from({ length: 50 }, newTraceId));
  const spanIds = new Set(Array.from({ length: 50 }, newSpanId));
  assert.equal(traceIds.size, 50);
  assert.equal(spanIds.size, 50);
});

test('startSpan produces an open span; endSpan closes it with endTimeUnixNano >= startTimeUnixNano', () => {
  const traceId = newTraceId();
  const span = startSpan({ traceId, name: 'generation-request', attributes: { type: 'prompts' } });
  assert.equal(span.traceId, traceId);
  assert.equal(span.parentSpanId, null);
  assert.equal(span.endTimeUnixNano, null);
  assert.match(span.startTimeUnixNano, /^\d+$/);

  const closed = endSpan(span, { attributes: { ok: true } });
  assert.match(closed.endTimeUnixNano, /^\d+$/);
  assert.ok(BigInt(closed.endTimeUnixNano) >= BigInt(closed.startTimeUnixNano));
  assert.equal(closed.status, 'OK');
  // Attributes merge, they don't replace.
  assert.deepEqual(closed.attributes, { type: 'prompts', ok: true });
});

test('endSpan accepts an explicit non-OK status', () => {
  const span = startSpan({ traceId: newTraceId(), name: 'x' });
  const closed = endSpan(span, { status: 'ERROR' });
  assert.equal(closed.status, 'ERROR');
});

test('writeSpan + readTraceSpans round-trip a single span losslessly', () => {
  const path = tempTraceLog();
  try {
    const span = endSpan(startSpan({ traceId: newTraceId(), name: 'x', attributes: { a: 1 } }));
    writeSpan(span, { path });
    const [readBack] = readTraceSpans(span.traceId, { path });
    assert.deepEqual(readBack, span);
  } finally {
    rmSync(path, { force: true });
  }
});

test('readTraceSpans filters by traceId when multiple traces share one log file', () => {
  const path = tempTraceLog();
  try {
    const traceA = newTraceId();
    const traceB = newTraceId();
    writeSpan(endSpan(startSpan({ traceId: traceA, name: 'a1' })), { path });
    writeSpan(endSpan(startSpan({ traceId: traceB, name: 'b1' })), { path });
    writeSpan(endSpan(startSpan({ traceId: traceA, name: 'a2' })), { path });

    const onlyA = readTraceSpans(traceA, { path });
    assert.equal(onlyA.length, 2);
    assert.ok(onlyA.every((s) => s.traceId === traceA));

    const all = readTraceSpans(undefined, { path });
    assert.equal(all.length, 3);
  } finally {
    rmSync(path, { force: true });
  }
});

test('readTraceSpans skips a corrupted/partial line instead of failing the whole read', () => {
  // A crash mid-appendFileSync, or two writers interleaving without any
  // coordination (this log has no equivalent of xdg-store's collision-safe
  // versioning), can leave a partial JSON line in the file. One bad entry
  // must not make every other span unreadable.
  const path = tempTraceLog();
  try {
    const traceId = newTraceId();
    writeSpan(endSpan(startSpan({ traceId, name: 'good-1' })), { path });
    appendFileSync(path, '{"traceId": "' + traceId + '", "spanId": "truncated-mid-wri\n');
    writeSpan(endSpan(startSpan({ traceId, name: 'good-2' })), { path });

    const spans = readTraceSpans(traceId, { path });
    assert.equal(spans.length, 2);
    assert.deepEqual(
      spans.map((s) => s.name).sort(),
      ['good-1', 'good-2'],
    );
  } finally {
    rmSync(path, { force: true });
  }
});

test('readTraceSpans returns [] for a log that does not exist yet, rather than throwing', () => {
  // Nothing on disk is created for this — the path just needs to not exist.
  const missingPath = join(tmpdir(), `caa-trace-test-nope-${randomBytes(8).toString('hex')}`, 'traces.jsonl');
  assert.deepEqual(readTraceSpans(undefined, { path: missingPath }), []);
});

test('REAL round-trip: request -> artifact -> evaluation spans link under one trace and read back linked', () => {
  // Proves the NFR this Story exists for: "emit a trace linking the
  // request, the artifact, and its evaluation" — not just that startSpan/
  // endSpan work in isolation.
  const path = tempTraceLog();
  try {
    const traceId = newTraceId();

    const requestSpan = endSpan(
      startSpan({
        traceId,
        name: 'generation-request',
        attributes: { type: 'prompts', slug: 'code-review-subagent' },
      }),
    );
    writeSpan(requestSpan, { path });

    const artifactSpan = endSpan(
      startSpan({
        traceId,
        parentSpanId: requestSpan.spanId,
        name: 'artifact-produced',
        attributes: { version: 1, path: '/fake/v1/artifact.md' },
      }),
    );
    writeSpan(artifactSpan, { path });

    const evalSpan = endSpan(
      startSpan({
        traceId,
        parentSpanId: artifactSpan.spanId,
        name: 'artifact-evaluated',
        attributes: { passed: true, score: 0.92 },
      }),
      { attributes: { calibrated: true } },
    );
    writeSpan(evalSpan, { path });

    const spans = readTraceSpans(traceId, { path });
    assert.equal(spans.length, 3);

    const bySpanId = Object.fromEntries(spans.map((s) => [s.spanId, s]));
    const readRequest = bySpanId[requestSpan.spanId];
    const readArtifact = bySpanId[artifactSpan.spanId];
    const readEval = bySpanId[evalSpan.spanId];

    assert.equal(readRequest.parentSpanId, null);
    assert.equal(readArtifact.parentSpanId, requestSpan.spanId);
    assert.equal(readEval.parentSpanId, artifactSpan.spanId);

    // The whole chain shares one trace ID — a real OTLP collector (or a
    // human reading the file) can reconstruct request -> artifact -> eval
    // from this alone.
    assert.ok(spans.every((s) => s.traceId === traceId));
    assert.equal(readEval.attributes.passed, true);
    assert.equal(readArtifact.attributes.path, '/fake/v1/artifact.md');
  } finally {
    rmSync(path, { force: true });
  }
});
