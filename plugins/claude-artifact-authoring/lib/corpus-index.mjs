// Deterministic path resolution for the central mif-corpus vector-store
// index (Epic #40 Story S5 Task #66). What's here: computing where that
// index lives. What's NOT here: actually calling mif-mcp's
// ingest_mif_document tool (or the mif-cli `ingest` fallback) — that's a
// live-session action requiring the same tool-resolution judgment call
// documented in mif-docs-plugin's skills/mif-corpus/SKILL.md (MCP tool, then
// CLI fallback, then say so plainly and stop — never simulate a result), so
// it stays a skill-invocation step in skills/persist-artifact/SKILL.md, the
// same reason mif-provenance stamping and mif-validate gating aren't plain
// functions in lib/persist-artifact.mjs either.
//
// Location: the corpus index is a durable artifact-discovery index over the
// content in the XDG_DATA_HOME artifact store (lib/xdg-store.mjs), not
// operational telemetry — so it lives under the same XDG_DATA_HOME root as
// that store, in a `corpus/` subdirectory that can never collide with an
// artifact type directory (`corpus` is not, and per xdg-store.mjs's closed
// ARTIFACT_TYPES enum can never become, a valid artifact type).

import { join } from 'node:path';

import { resolveStoreRoot } from './xdg-store.mjs';

const CORPUS_DIRNAME = 'corpus';
const CORPUS_DB_FILENAME = 'vectors.db';

/**
 * `${XDG_DATA_HOME:-~/.local/share}/claude-artifact-authoring/corpus/vectors.db`
 * — the `--db-path`/`db_path` value the persist-artifact sequence's indexing
 * step passes to mif-corpus's `ingest`/`search`/`find-similar` operations to
 * target the central, cross-project index rather than the invoking
 * project's own project-local `.mif/vectors.db`.
 *
 * @param {NodeJS.ProcessEnv} [env] - override `process.env` (tests only)
 * @returns {string} the absolute path to the central corpus vector store
 */
export function resolveCorpusDbPath(env = process.env) {
  return join(resolveStoreRoot(env), CORPUS_DIRNAME, CORPUS_DB_FILENAME);
}
