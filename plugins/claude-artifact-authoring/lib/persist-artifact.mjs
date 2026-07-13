// The deterministic half of the generate -> provenance -> eval -> persist
// pipeline (Epic #40's Story S2). What's deterministic and lives here:
// validating a drafted frontmatter against the four-required-elements
// contract, checking the mif-docs dependency is actually installed, and
// writing the artifact into the XDG store as an unpromoted draft version.
//
// What's NOT here, because it isn't deterministic: drafting the frontmatter
// itself (mif-frontmatter is an LLM-judgment skill step), running
// mif-provenance `stamp` / mif-validate, and indexing the promoted artifact
// into the central corpus via mif-corpus `ingest` (the calling generator
// skill invokes all three directly — each needs something only a live agent
// session has: judgment, the session's own hook-observed ledger, or the
// MCP-tool-vs-CLI-fallback resolution mif-corpus documents). See
// skills/persist-artifact/SKILL.md for the full sequence this module is one
// deterministic piece of; lib/corpus-index.mjs is the deterministic path
// resolution for the indexing step.

import { assertFrontmatterContract } from './frontmatter-contract.mjs';
import { assertMifDocsAvailable } from './mif-docs-dependency.mjs';
import { writeArtifactVersion, resolveStoreRoot } from './xdg-store.mjs';
import { startSpan, endSpan, writeSpan, resolveTraceLogPath } from './trace.mjs';

/**
 * Write a drafted artifact into the XDG store as an unpromoted draft
 * version (`promote: false` — becomes current only after mif-provenance
 * stamps it and mif-validate passes, per the fixed pipeline order).
 *
 * Fails loud, before writing anything, if either precondition isn't met:
 * the frontmatter doesn't satisfy the four-required-elements contract, or
 * mif-docs (which the next two pipeline steps depend on) isn't installed.
 *
 * @param {object} args
 * @param {string} args.type - one of xdg-store's ARTIFACT_TYPES
 * @param {string} args.slug - safe path segment identifying this artifact
 * @param {string} args.filename - safe path segment, e.g. "artifact.md"
 * @param {string} args.fullMarkdownContent - the complete file content
 *   (frontmatter + body), already composed by mif-frontmatter
 * @param {object} args.parsedFrontmatter - the same frontmatter, parsed to
 *   an object, for contract validation before writing
 * @param {string} [args.root] - override the XDG store root (tests only)
 * @param {object} [args.env] - override process.env (tests only)
 * @param {string} [args.traceId] - if provided (from a "generation-request"
 *   span the calling generator started), this write is recorded as a
 *   child "persist-draft-artifact" span under the same trace — the
 *   request -> artifact link the trace substrate (Story S3) exists for.
 *   Omit to persist without tracing (e.g. in isolated tests).
 * @param {string} [args.parentSpanId] - the request span to nest under.
 *   REQUIRED whenever `traceId` is set (see below) — there is no such thing
 *   as an intentionally-unlinked persist span in this pipeline.
 * @param {string} [args.traceLogPath] - override the trace log path (tests only)
 * @returns {{version:number, path:string, versionDir:string, mifDocsDir:string, spanId:(string|null)}}
 */
export function persistDraftArtifact({
  type,
  slug,
  filename,
  fullMarkdownContent,
  parsedFrontmatter,
  env = process.env,
  // Must default from `env`, not a bare resolveStoreRoot() call — otherwise
  // a caller (e.g. a test) that overrides `env` to redirect XDG_DATA_HOME
  // silently gets the real process.env's root instead, since object
  // destructuring defaults can only see earlier-listed bindings.
  root = resolveStoreRoot(env),
  traceId,
  parentSpanId = null,
  traceLogPath = resolveTraceLogPath(env),
}) {
  // A persist span with no parent silently breaks the request -> artifact
  // linkage this whole feature exists for — it would look like a root span,
  // not a child of the generator's own request span. Fail fast instead of
  // producing a trace that looks connected but isn't.
  if (traceId && !parentSpanId) {
    throw new Error(
      'persistDraftArtifact: traceId was provided without parentSpanId. A persist span with no ' +
        "parent breaks the request -> artifact link the trace substrate exists for — pass the " +
        'generator\'s own "generation-request" span ID as parentSpanId, or omit traceId entirely ' +
        'to persist without tracing.',
    );
  }

  assertFrontmatterContract(parsedFrontmatter);
  const mifDocsDir = assertMifDocsAvailable(env);

  const span = traceId
    ? startSpan({ traceId, parentSpanId, name: 'persist-draft-artifact', attributes: { type, slug } })
    : null;

  const { version, path, versionDir } = writeArtifactVersion(
    type,
    slug,
    filename,
    fullMarkdownContent,
    { root, promote: false },
  );

  // Tracing is best-effort: the artifact version above is already written
  // to disk by this point, so a tracing failure (e.g. an unwritable
  // XDG_STATE_HOME) must never surface as this call throwing — a caller
  // seeing an exception here would reasonably treat persistence itself as
  // failed and retry, producing a duplicate version on top of the one that
  // actually succeeded.
  if (span) {
    try {
      writeSpan(endSpan(span, { attributes: { version, path } }), { path: traceLogPath });
    } catch {
      // Swallow: the artifact is safely persisted regardless of whether
      // its trace span could be recorded.
    }
  }

  return { version, path, versionDir, mifDocsDir, spanId: span?.spanId ?? null };
}
