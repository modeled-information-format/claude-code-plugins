---
name: persist-artifact
description: The shared four-step persistence sequence every claude-artifact-authoring generator (prompt, goal, loop, eval-suite, subagent, tool-schema) runs at the end of its pipeline — draft frontmatter, write to the central XDG store, stamp witnessed provenance, gate with mif-validate. Use this skill whenever a generator has produced a scored, evaluated artifact and needs to persist it as a durable MIF Level-3 document.
argument-hint: "<artifact type> <slug> <filename>"
---

# persist-artifact

The deterministic backbone of Epic #40's generate → provenance → eval →
persist pipeline (Story S2). Every generator skill (prompt, goal, loop,
eval-suite, subagent-definition, tool-schema) ends its run with this exact
four-step sequence, in this exact order. Only the `type`, the `ttl`, and the
cited origin findings vary per artifact family — the sequence itself does
not.

## The four steps

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
   `mif-validate <path> --level 3` as the final, no-LLM-judgment gate:
   schema-conformant against the canonical schema, the L3 floor satisfied,
   and the markdown-to-JSON-LD round-trip lossless. **Only if this passes**,
   call `promoteVersion(type, slug, version, root)` (also exported from
   `lib/xdg-store.mjs`) to make the version current. If it fails, the draft
   stays on disk, un-promoted, for inspection — never promote a version
   that hasn't passed this gate.

## Why steps 2 and 4 are split across a script and a skill invocation

`lib/persist-artifact.mjs` only does what's genuinely deterministic:
contract validation, dependency resolution, and a filesystem write. Drafting
frontmatter (step 1) and stamping witnessed provenance (step 3) both need
something only a live agent session has — judgment for the former, the
session's own hook-observed ledger for the latter — so those two steps stay
as direct skill invocations by whichever generator skill is running this
sequence, not calls into this module.
