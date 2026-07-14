---
name: generate-prompt
description: Generate a system/task prompt against Anthropic's structured-prompting checklist, grade it with a calibrated judge, and persist it as a MIF Level-3 document. Use this skill whenever a request asks for a new prompt (a subagent system prompt, a task-classification prompt, a tool-use prompt, etc.) to be authored, not hand-drafted ad hoc.
argument-hint: "<prompt purpose/request> <grounding source(s)>"
---

# generate-prompt

Story S6's implementation of Epic #40's generator template
(`REQ[Request + sources] → CK[Scored checklist] → DRAFT → META → VER → JUDGE
→ SHIP`, per the architecture doc's component view), specialized for the
prompt artifact type. Runs the same four phases every generator in this
plugin runs — generation, provenance, eval, persistence — in this exact
order. Only the checklist and the grounding sources are prompt-specific; the
provenance/eval/persistence phases below are thin wrappers around
`skills/grade-artifact/SKILL.md` and `skills/persist-artifact/SKILL.md`,
not a reimplementation of either.

## 1. Generation

Draft the prompt, then score it against every item in
`lib/prompt-checklist.mjs`'s `PROMPT_CHECKLIST` — **all eight**, not just the
three a function can check. Never silently skip an item.

1. Call `scoreDeterministicChecklist(draftContent)` for the three
   `deterministic: true` items (`fewShotExamples`, `xmlDelimiting`,
   `tieredChainOfThought`). These are mechanical: example-block counting and
   XML-tag pairing, not prose judgment — see the module's own comments for
   exactly what each one checks and why (in particular, why
   `tieredChainOfThought` treats a prompt with *no* reasoning tags as passing
   rather than penalizing a design choice a plain function has no basis to
   judge, while a prompt with only one of `<thinking>`/`<answer>` fails as a
   broken tiering).
2. Score the remaining five items yourself, using G-Eval two-stage ordering
   (reason step by step against the item's stated bar first, only then emit
   pass/fail — same ordering `skills/grade-artifact/SKILL.md` uses for the
   eval phase, applied here to checklist self-scoring instead of final
   grading):
   - `clarityGoldenRule` — could a domain expert reading only the prompt
     predict the exact output? An ungradable ask ("tell me if it's good or
     bad" with no stated criteria) fails outright.
   - `contextualJustification` — does the prompt explain *why* the agent is
     invoked and what context it does/doesn't have, not just *what* to do?
   - `roleSetting` — is the named role/persona specific and scope-bounding
     ("senior code reviewer subagent [that reviews diffs for correctness
     bugs, security issues, and reuse — not style nits]"), not generic
     ("a helpful AI assistant")?
   - `rightAltitude` — is every sentence load-bearing? Filler phrases
     ("try your best", "think carefully", "be thorough") and unbounded scope
     ("anything else the user needs") both fail this item — per the
     architecture doc's "minimal high-signal tokens" framing
     (F: anthropic-context-engineering-right-altitude).
   - `documentGrounding` — for a long-context prompt (one that will be given
     source documents to reason over), does it instruct quoting from the
     provided documents rather than paraphrasing from memory? For a prompt
     with no long-context document input at all, this item is not
     applicable — record it as such explicitly (see step 3), never as a
     silent omission.
3. Record every one of the eight items' verdict explicitly — e.g.
   `{ clarityGoldenRule: 'pass', contextualJustification: 'pass',
   fewShotExamples: true, xmlDelimiting: true, roleSetting: 'pass',
   tieredChainOfThought: true, rightAltitude: 'pass', documentGrounding:
   'n/a' }`. This record is what Provenance step 2 below persists — Task
   #69's "record each checklist item as an explicit pass or fail" is not
   satisfied by scoring silently and only shipping the final artifact.
4. **Feedback loop.** If any applicable item fails, revise the draft and
   re-score from step 1 — this is the architecture doc's own
   `JUDGE -->|fail| CK` loop, applied at the checklist stage rather than
   waiting for the eval phase to catch it. Only proceed to Provenance once
   every applicable item passes.

The Anthropic Console Prompt Improver's five mechanisms (CoT injection,
example standardization/enrichment, rewriting, prefill) are the direct
methodology template for how to revise a failing draft, per the architecture
doc's "Building block 1: Prompt generator" section.

## 2. Provenance

1. **Draft L3 frontmatter — `mif-docs:mif-frontmatter` skill.** Cite the
   origin finding(s) that justified the prompt's design — normally
   [Epic #40](https://github.com/modeled-information-format/claude-code-plugins/issues/40)
   (the architecture doc) plus the specific Anthropic finding(s) it names
   (`anthropic-structured-prompting-techniques`,
   `anthropic-context-engineering-right-altitude`,
   `anthropic-console-prompt-generator-improver`) if a resolvable URL for
   those exists in this generation's context, otherwise the architecture
   doc's own citation is sufficient. Set `provenance.sourceType:
   system_generated`, `temporal` from
   `ARTIFACT_TYPE_METADATA.prompts` (`lib/frontmatter-contract.mjs`) —
   `ttl: 'P90D'` — and `relationships[]`: `derived-from` the origin finding,
   `relates-to` the generating session's activity URN, and a namespaced
   `harness:generated-for` targeting the topic namespace the prompt serves
   (e.g. `urn:mif:topic:claude-artifact-authoring:prompts`).
2. **Record the checklist scoring in the frontmatter's `extensions` block.**
   MIF's schema reserves `extensions` (`additionalProperties: true`,
   "Provider-specific extensions") as exactly the sanctioned place for
   generator-specific metadata that isn't one of the four required
   elements. Write the step-1 scoring record there, e.g.:
   ```yaml
   extensions:
     claudeArtifactAuthoring:
       generatorType: prompts
       checklist:
         clarityGoldenRule: pass
         contextualJustification: pass
         fewShotExamples: pass
         xmlDelimiting: pass
         roleSetting: pass
         tieredChainOfThought: pass
         rightAltitude: pass
         documentGrounding: n/a
       revision: 1
   ```
   `revision` mirrors the version `persistDraftArtifact` assigns (step 3
   below) — Task #69's "a revision number" is the same number, not a
   second, separately-tracked counter. This block is additive: it never
   substitutes for the four required elements `lib/frontmatter-contract.mjs`
   validates, and `assertFrontmatterContract` does not read it.
3. **Write the draft — `persistDraftArtifact()`.** Start a
   `"generation-request"` span (`lib/trace.mjs`'s `startSpan`, root span —
   no `parentSpanId`) before calling this, and pass its `traceId` down as
   `traceId` to `persistDraftArtifact({ type: 'prompts', slug, filename,
   fullMarkdownContent, parsedFrontmatter, traceId, parentSpanId:
   requestSpan.spanId })`, so the persisted artifact is linked back to the
   request that produced it (Story S3's request → artifact → evaluation
   trace). End and write the request span once the whole pipeline
   (including step 4's eval span) completes.

See `skills/persist-artifact/SKILL.md` for why steps 1 and 3's provenance
stamp (below, step 4) stay skill invocations rather than `lib/` calls: they
need either LLM judgment or a live session's hook-observed ledger, neither
of which a plain function has.

## 3. Eval

Run `skills/grade-artifact/SKILL.md`'s sequence against the drafted prompt,
using `golden-sets/prompts.json`'s stated `criteria`:

1. `assertCalibrated('prompts')` first (from `lib/calibration.mjs`). **Stop**
   if it throws — do not grade unsupervised, per AD-4. Story S4's 100%-
   agreement calibration pass for `prompts` is real, but it was only ever
   recorded to `test/initial-calibration.test.mjs`'s own throwaway temp
   path, not the real
   `${XDG_STATE_HOME:-~/.local/state}/claude-artifact-authoring/calibration-runs.jsonl`
   this assertion actually reads — nothing in this plugin persists a
   calibration run to that real path automatically. **Expect this to throw
   on a genuinely first real invocation**, and treat that as the normal,
   required "run calibration for real before auto-grading" path, not a
   bug: follow `skills/grade-artifact/SKILL.md`'s step 1 framing exactly
   (either run its step 4 calibration sequence for `prompts` first, or
   route this artifact to human review instead of auto-grading). Once a
   real calibration run has been recorded once, subsequent invocations
   only re-hit this path when `needsRecalibration('prompts')` returns true
   (its own step 4).
2. Judge the drafted prompt using G-Eval two-stage ordering against
   `golden-sets/prompts.json`'s criteria — reason step by step, then emit a
   single pass/fail verdict. Grade the final drafted prompt, not the
   revision history from step 1's feedback loop.
3. Record the eval span as a child of the same `traceId`, with
   `parentSpanId` set to the `persist-draft-artifact` span's `spanId` from
   step 2.3 above — completing the request → artifact → evaluation chain
   Story S3's trace substrate exists for.
4. If the verdict is `fail`, return to Generation step 4's feedback loop
   (revise, re-score, re-draft frontmatter as needed) rather than persisting
   a failing artifact.

## 4. Persistence

Once eval passes, finish `skills/persist-artifact/SKILL.md`'s sequence
starting from its step 3 (step 1 was done in Provenance above; step 2's
write already happened in Provenance step 3):

1. **Stamp — `mif-docs:mif-provenance` skill, `stamp` verb.** Run against
   the live session on the path `persistDraftArtifact` returned.
2. **Gate — `mif-docs:mif-validate` skill, `--level 3`.** Only if it passes,
   call `promoteVersion('prompts', slug, version, root)`
   (`lib/xdg-store.mjs`). If it fails, the draft stays on disk unpromoted —
   do not skip to step 3.
3. **Index — `mif-docs:mif-corpus` skill, `ingest` verb**, with
   `--db-path resolveCorpusDbPath()` (`lib/corpus-index.mjs`). Best-effort:
   a failure here never fails the pipeline as a whole.

## 5. Worked-example verification (Task #74)

The architecture doc's own worked example for the four-required-elements
frontmatter shape is a code-review subagent system prompt — the exact
content already committed as `golden-sets/prompts.json`'s
`good-code-review-subagent` entry. `test/generate-prompt-pipeline.test.mjs`
automates this Task's explicit deliverable rather than leaving it as prose:
it drafts frontmatter for that entry's `content` (citations naming Epic #40,
`provenance.sourceType: system_generated`, `temporal.ttl: 'P90D'` from
`ARTIFACT_TYPE_METADATA.prompts`, and all three required `relationships[]`
types), asserts `validateFrontmatterContract` returns zero errors, and runs
a full `persistDraftArtifact` round-trip for it against a temporary store —
the same `tempStoreRoot`/`tempConfigDirWithMifDocs` fixture pattern
`test/persist-artifact.test.mjs` already uses. A live generation session
should treat that test as the mechanical check this step's prose describes,
not repeat the check by hand.
