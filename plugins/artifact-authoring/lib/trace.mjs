// Minimal, portable OTel-compatible trace substrate (Epic #40 Story S3).
// No hosted platform, no SDK dependency (this plugin stays zero-runtime-dep,
// per AD-7's portability decision). Spans are a SIMPLIFIED JSON
// representation appended as JSON Lines to a local file — readable directly
// via `readTraceSpans` for local inspection/testing, but this is NOT the
// OTLP/proto JSON mapping (that encodes `attributes` as a
// key/typed-value array and `status` as a `{code, message}` object, plus
// resource/scope wrapping this format omits). A real OTLP collector would
// need a transform step, not direct ingestion, despite the shared
// vocabulary — see the field-level notes below for exactly what does and
// doesn't match the OTel spec.
//
// Location: trace data is operational telemetry (logs/history), not durable
// generated content, so it belongs under XDG_STATE_HOME — a different XDG
// category from the XDG_DATA_HOME artifact store in lib/xdg-store.mjs, and
// a category no existing tool in this org uses correctly yet (gdlc puts
// everything, including its cache, under XDG_CONFIG_HOME).
//
// What DOES match the OpenTelemetry spec: ID shapes (128-bit hex trace ID,
// 64-bit hex span ID) and timestamp semantics (Unix-epoch nanoseconds, as a
// BigInt-safe decimal string). What doesn't: the JSON encoding of
// `attributes` (plain object here, not OTLP's typed key/value array) and
// `status` (a bare string here, not OTLP's `{code, message}` object).

import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { mkdirSync, appendFileSync, readFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const STORE_NAMESPACE = 'artifact-authoring';
const TRACE_LOG_FILENAME = 'traces.jsonl';

/** `${XDG_STATE_HOME:-~/.local/state}/artifact-authoring/traces.jsonl`. */
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
 * Returns `[]` if the log doesn't exist yet, rather than throwing. A single
 * corrupted/partial line (e.g. from a crash mid-`appendFileSync`, or two
 * writers interleaving without coordination — this log has no equivalent of
 * xdg-store's collision-safe versioning) is skipped rather than making the
 * entire log unreadable; this is operational telemetry, not a durability
 * guarantee.
 */
export function readTraceSpans(traceId, { path = resolveTraceLogPath() } = {}) {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
  const spans = [];
  for (const line of lines) {
    try {
      spans.push(JSON.parse(line));
    } catch {
      // Skip a corrupted/partial line rather than failing the whole read.
    }
  }
  return traceId ? spans.filter((s) => s.traceId === traceId) : spans;
}
