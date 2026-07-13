---
name: persist-artifact
description: The shared persistence sequence every claude-artifact-authoring generator (prompt, goal, loop, eval-suite, subagent, tool-schema) runs at the end of its pipeline — draft frontmatter, write to the central XDG store, stamp witnessed provenance, gate with mif-validate, then best-effort index for discovery. Use this skill whenever a generator has produced a scored, evaluated artifact and needs to persist it as a durable MIF Level-3 document.
argument-hint: "<artifact type> <slug> <filename>"
---

# persist-artifact

The deterministic backbone of Epic #40's generate → provenance → eval →
persist pipeline (Story S2). Every generator skill (prompt, goal, loop,
eval-suite, subagent-definition, tool-schema) ends its run with this exact
sequence, in this exact order. Only the `type`, the `ttl`, and the cited
origin findings vary per artifact family — the sequence itself does not.

## The steps

1. **Draft frontmatter — `mif-docs:mif-frontmatter` skill.** Invoke the
   `mif-docs:mif-frontmatter` skill against the artifact's origin findings to
   draft the full L3 frontmatter block: `citations[]` naming the finding(s)
   that grounded the generation, `provenance` with `sourceType:
   system_generated`, `temporal` (`validFrom`/`recordedAt`/`ttl` — see
   `lib/frontmatter-contract.mjs`'s `ARTIFACT_TYPE_METADATA` for the
   per-type `ttl`), and `relationships[]` (`derived-from` the origin
   finding, `relates-to` the generating session, `harness:generated-for`
   the topic namespace). This step needs LLM judgment — it is not something
   a plain script can do — so it happens here, not inside
   `lib/persist-artifact.mjs`.

2. **Write the draft — `lib/persist-artifact.mjs`'s `persistDraftArtifact()`.**
   Call this with the drafted frontmatter (both as the composed markdown
   string and as a parsed object) and the artifact's `type`/`slug`/
   `filename`. It validates the frontmatter against the four-required-
   elements contract and confirms the `mif-docs` dependency is actually
   installed — **before** writing anything — then writes the artifact into
   the central XDG store (`lib/xdg-store.mjs`) as an **unpromoted** version
   (`promote: false`). Unpromoted means `getCurrentVersion` still returns
   whatever it returned before this call; the new version isn't "current"
   yet. Returns `{ version, path, versionDir, mifDocsDir, spanId }`.
   Pass `traceId` (and `parentSpanId`, from the generator's own
   "generation-request" span — see `lib/trace.mjs`, Story S3) to record this
   write as a linked span in the trace substrate; the NFR this satisfies is
   "emit a trace linking the request, the artifact, and its evaluation," so
   the generator's own eval step should likewise pass this call's returned
   `spanId` as ITS `parentSpanId` when it records the evaluation span.

3. **Stamp witnessed provenance — `mif-docs:mif-provenance` skill, `stamp` verb.**
   Run `mif-provenance stamp <path>` (the `path` from step 2) against the
   current session. This overwrites the witnessed subset of the
   `provenance` block (`agent`, `agentVersion`, `wasGeneratedBy`,
   `trustLevel: user_stated`) with hook-observed facts from the session
   ledger, narrowing what step 1 asserted to what's actually witnessed.
   This must happen against a live session — it cannot be done by a plain
   script, which is why it isn't part of `persistDraftArtifact()`.

4. **Gate — `mif-docs:mif-validate` skill, `--level 3`.** Run
   `mif-validate <path> --level 3` as the no-LLM-judgment conformance gate:
   schema-conformant against the canonical schema, the L3 floor satisfied,
   and the markdown-to-JSON-LD round-trip lossless. **Only if this passes**,
   call `promoteVersion(type, slug, version, root)` (also exported from
   `lib/xdg-store.mjs`) to make the version current. If it fails, the draft
   stays on disk, un-promoted, for inspection — never promote a version
   that hasn't passed this gate, and skip step 5 too (there's nothing
   conformant yet to index).

5. **Index for discovery — `mif-docs:mif-corpus` skill, `ingest` verb
   (Story S5 Task #66).** Only after step 4 promotes the version, ingest the
   now-current artifact into the central corpus index so it's discoverable
   via `search_documents`/`find_similar_documents` instead of being an
   unindexed island: invoke `mif-docs:mif-corpus ingest <path>` with
   `--db-path`/`db_path` set to `resolveCorpusDbPath()`'s value (from
   `lib/corpus-index.mjs`) — **not** the tool's project-local
   `.mif/vectors.db` default, since the whole point is a store that outlives
   any one project's working directory. This step is **best-effort**: per
   `mif-corpus`'s own framing ("an enhancement layer: nothing in this
   suite's conformance path depends on it"), a failure here (mif-rs tools
   not installed, first-run embedding-model download unavailable, etc.)
   must never fail the persist pipeline as a whole — the artifact is
   already durably persisted and conformant as of step 4. Follow
   `mif-corpus`'s own tool-resolution order (MCP tool, then CLI fallback,
   then say so plainly and stop) and its documented `description:`-key ADR
   exclusion; note the failure to the user rather than silently skipping it.

## Why steps 2 and 4's promote are scripted, and 1/3/5 are skill invocations

`lib/persist-artifact.mjs` and `lib/xdg-store.mjs`'s `promoteVersion` only do
what's genuinely deterministic: contract validation, dependency resolution,
and filesystem writes. Drafting frontmatter (step 1), stamping witnessed
provenance (step 3), and indexing into the corpus (step 5) all need
something only a live agent session has — judgment for the first, the
session's own hook-observed ledger for the second, and the MCP-tool-vs-CLI-
fallback-vs-say-so-and-stop resolution for the third — so those three steps
stay as direct skill invocations by whichever generator skill is running
this sequence, not calls into `lib/`. `lib/corpus-index.mjs`'s
`resolveCorpusDbPath()` is the one deterministic piece of step 5: computing
*where* the central index lives, not performing the ingest itself.
