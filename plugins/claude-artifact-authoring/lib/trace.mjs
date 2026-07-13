// Minimal, portable OTel-compatible trace substrate (Epic #40 Story S3).
// No hosted platform, no SDK dependency (this plugin stays zero-runtime-dep,
// per AD-7's portability decision) — spans are OTLP-JSON-shaped objects
// appended as JSON Lines to a local file, which any OTLP-JSON-aware
// collector can ingest, or which can be read back directly (see
// `readTraceSpans`) for local inspection/testing.
//
// Location: trace data is operational telemetry (logs/history), not durable
// generated content, so it belongs under XDG_STATE_HOME — a different XDG
// category from the XDG_DATA_HOME artifact store in lib/xdg-store.mjs, and
// a category no existing tool in this org uses correctly yet (gdlc puts
// everything, including its cache, under XDG_CONFIG_HOME).
//
// IDs and timestamps follow the OpenTelemetry spec's shapes (128-bit hex
// trace ID, 64-bit hex span ID, Unix-epoch nanoseconds as a BigInt-safe
// string) so a real OTLP collector can ingest this file's lines directly,
// even though nothing here links against the (heavy) OTel SDK.

import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { mkdirSync, appendFileSync, readFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const STORE_NAMESPACE = 'claude-artifact-authoring';
const TRACE_LOG_FILENAME = 'traces.jsonl';

/** `${XDG_STATE_HOME:-~/.local/state}/claude-artifact-authoring/traces.jsonl`. */
export function resolveTraceLogPath(env = process.env) {
  const stateHome =
    env.XDG_STATE_HOME && env.XDG_STATE_HOME !== ''
      ? env.XDG_STATE_HOME
      : join(homedir(), '.local', 'state');
  return join(stateHome, STORE_NAMESPACE, TRACE_LOG_FILENAME);
}

/** 128-bit trace ID, 32 hex chars — per the OTel spec's TraceId shape. */
export function newTraceId() {
  return randomBytes(16).toString('hex');
}

/** 64-bit span ID, 16 hex chars — per the OTel spec's SpanId shape. */
export function newSpanId() {
  return randomBytes(8).toString('hex');
}

// Unix-epoch nanoseconds as a decimal string (BigInt-safe: a plain JS number
// loses precision past 2^53 ns, which Unix-epoch-nanoseconds already
// exceeds). Millisecond-resolution promoted to nanoseconds — Node has no
// built-in nanosecond-resolution *epoch* clock (process.hrtime is
// monotonic, not epoch-anchored), so this is the honest precision a
// dependency-free implementation can offer.
function nowUnixNano() {
  return (BigInt(Date.now()) * 1_000_000n).toString();
}

/**
 * Start a span. `parentSpanId` links it under another span in the same
 * trace (e.g. an "artifact" span as a child of a "request" span); omit for
 * a root span.
 */
export function startSpan({ traceId, parentSpanId = null, name, attributes = {} }) {
  return {
    traceId,
    spanId: newSpanId(),
    parentSpanId,
    name,
    attributes: { ...attributes },
    startTimeUnixNano: nowUnixNano(),
    endTimeUnixNano: null,
    status: null,
  };
}

/** Finalize a span started with `startSpan`, merging in any closing attributes. */
export function endSpan(span, { attributes = {}, status = 'OK' } = {}) {
  return {
    ...span,
    attributes: { ...span.attributes, ...attributes },
    endTimeUnixNano: nowUnixNano(),
    status,
  };
}

/** Append one finalized span to the trace log as a single JSON line. */
export function writeSpan(span, { path = resolveTraceLogPath() } = {}) {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(span) + '\n');
  return path;
}

/**
 * Read back every span for a given trace ID (or all spans, if `traceId` is
 * omitted) — for local inspection or for a test to verify a round-trip.
 * Returns `[]` if the log doesn't exist yet, rather than throwing.
 */
export function readTraceSpans(traceId, { path = resolveTraceLogPath() } = {}) {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
  const spans = lines.map((line) => JSON.parse(line));
  return traceId ? spans.filter((s) => s.traceId === traceId) : spans;
}
