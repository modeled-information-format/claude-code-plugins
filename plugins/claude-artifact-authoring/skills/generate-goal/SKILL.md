---
name: generate-goal
description: Generate a Claude Code /goal-shaped session goal against the SMART criteria + executable-verify-command discipline, grade it with a calibrated judge, and persist it as a MIF Level-3 document. Use this skill whenever a request asks for a new session goal (a completion condition a coding session should be run toward) to be authored, not hand-drafted ad hoc.
argument-hint: "<goal purpose/request> <grounding source(s)>"
---

# generate-goal

Story S7's implementation of Epic #40's generator template
(`REQ[Request + sources] → CK[Scored checklist] → DRAFT → META → VER → JUDGE
→ SHIP`), specialized for the goal artifact type. Runs the same four phases
every generator in this plugin runs — generation, provenance, eval,
persistence — in this exact order. Only the checklist and the internal
checks[] record are goal-specific; the provenance/eval/persistence phases
below are thin wrappers around `skills/grade-artifact/SKILL.md` and
`skills/persist-artifact/SKILL.md`, not a reimplementation of either.

The generated artifact is **prose** — a `/goal`-shaped free-text paragraph,
exactly like `golden-sets/goals.json`'s entries (the same form
`research-harness-template`'s own `goal-writer` command produces as its
"`/goal` prose" alongside a structured `goal.schema.json` document this
plugin does not itself author). The `checks[]` record described below is
internal drafting scaffolding recorded into frontmatter `extensions`
(Provenance step 2), never a second persisted artifact.

## 1. Generation

Draft the goal's internal `checks[]` record first — one entry per
completion condition, each `{ id, assertion, verify, groundedIn,
negativeCaseApplicable, negativeCase? }` (see `lib/goal-checklist.mjs`'s
header comment for the full shape) — then compose the final prose from it.
Drafting the structured record first, prose second, is what makes Task
#72's per-check grounding and Task #75's balance linting checkable at all;
composing prose directly and trying to reverse-engineer checks from it
afterward is not an acceptable substitute.

1. For each completion condition, write `assertion` (what must be true) and
   `verify` (the exact executable command a human or agent would run to
   confirm it — e.g. `pytest test/auth -q`, `ruff check src/auth`). Reject
   any condition where `verify` would be prose rather than a runnable
   command — this is Task #70's core discipline, the same
   `completion_condition.checks[].verify` shape
   `research-harness-template`'s `goal.schema.json` enforces structurally,
   applied here to this plugin's prose goal form.
2. Set `groundedIn` on every check (Task #72): the specific source failure
   mode or acceptance-criteria pattern that justified it — e.g. "recurring
   flaky-retry bug reported in issue #12" or "acceptance pattern: exit-code
   discipline from the org's CI gates" — never a placeholder, and never one
   shared justification copy-pasted across every check (each check's own
   `groundedIn` should name what specifically justified *that* check).
   Validate with `assertChecksGrounded(checks)` (`lib/goal-checklist.mjs`) —
   it throws naming every check missing one.
3. For each check, decide `negativeCaseApplicable` and, if true, write
   `negativeCase` (Task #75's balanced-criteria requirement — e.g. a "no
   secrets in diff" check's negative case is "a diff containing a fake API
   key is flagged", while a "build succeeds" check has no meaningful
   negative case and is `negativeCaseApplicable: false`, never forced to
   invent one). Validate with `lintChecksBalance(checks)` — if `balanced` is
   `false`, revise the flagged checks before proceeding.
4. **Reference-solution smoke test (Task #75, second half): prove the goal
   is actually achievable, not just well-shaped.** For at least one check
   (ideally the primary one), construct or identify a real reference
   solution and actually execute its `verify` command via
   `runReferenceSolutionSmokeTest` (`lib/verify-command-runner.mjs`) —
   splitting a plain `verify` string with `splitVerifyCommand` first (it
   refuses shell metacharacters; route anything it can't safely split to
   human review rather than working around the refusal). A goal whose
   verify command cannot be shown passing against some real solution before
   it ships is not yet provably achievable — do not skip this step by
   reasoning that the command "should" pass.
5. Compose the goal's final prose from the validated `checks[]` record:
   state each `assertion`, inline each `verify` command as backticked text
   (this plugin's prose form, matching `golden-sets/goals.json`), any
   constraints bounding scope, and an explicit stop condition (a numeric
   turn/time bound).
6. Score the composed prose against every item in
   `lib/goal-checklist.mjs`'s `GOAL_CHECKLIST` — **all seven**, not just the
   three a function can check:
   - Call `scoreDeterministicChecklist(composedProse)` for
     `measurableVerifyCommand`, `timeBound`, `boundedConstraints`.
   - Score `twoExpertsAgreeVerdict`, `specific`, `achievable`, `relevant`
     yourself, using G-Eval two-stage ordering (reason step by step against
     the item's stated bar first, only then emit pass/fail) — same ordering
     `skills/grade-artifact/SKILL.md` uses for the eval phase, applied here
     to checklist self-scoring.
   - Record every one of the seven items' verdict explicitly as
     `'pass' | 'fail' | 'n/a'`.
7. **Feedback loop.** If any applicable checklist item fails, or
   `lintChecksBalance` flagged a violation, or the smoke test in step 4
   failed, revise the `checks[]` record and re-derive the prose from step 1
   — never patch the prose text directly without updating the checks[]
   record it was derived from, or the two drift apart. Only proceed to
   Provenance once every applicable item passes.

## 2. Provenance

1. **Draft L3 frontmatter — `mif-docs:mif-frontmatter` skill.** Cite the
   origin finding(s) that justified the goal's design — normally
   [Epic #40](https://github.com/modeled-information-format/claude-code-plugins/issues/40)
   plus the specific request/source this goal was generated from. Set
   `provenance.sourceType: system_generated`, `temporal` from
   `ARTIFACT_TYPE_METADATA.goals` (`lib/frontmatter-contract.mjs`) — note
   `conceptType: 'semantic'` (Task #78 — a goal is spec-shaped, not
   executable, unlike a prompt/loop) — `ttl: 'P90D'` — and `relationships[]`:
   `derived-from` the origin finding, `relates-to` the generating session's
   activity URN, and a namespaced `harness:generated-for` targeting
   `urn:mif:topic:claude-artifact-authoring:goals`.
2. **Record the checks[] record and checklist scoring in the frontmatter's
   `extensions` block** — the sanctioned additive location
   `lib/frontmatter-contract.mjs` never validates against, e.g.:
   ```yaml
   extensions:
     claudeArtifactAuthoring:
       generatorType: goals
       checklist:
         twoExpertsAgreeVerdict: pass
         specific: pass
         measurableVerifyCommand: pass
         achievable: pass
         relevant: pass
         timeBound: pass
         boundedConstraints: pass
       checks:
         - id: auth-tests-pass
           assertion: all tests in test/auth pass
           verify: "pytest test/auth -q"
           groundedIn: "acceptance pattern: exit-code discipline"
           negativeCaseApplicable: false
       smokeTest:
         checkId: auth-tests-pass
         ran: true
         passed: true
         exitCode: 0
       revision: 1
   ```
   `revision` mirrors the version `persistDraftArtifact` assigns (step 3
   below) — the same number, not a second counter. This block is additive
   and never substitutes for the four required elements.
3. **Write the draft — `persistDraftArtifact()`.** Start a
   `"generation-request"` span (`lib/trace.mjs`'s `startSpan`, root span) and
   pass its `traceId` down as `traceId` to
   `persistDraftArtifact({ type: 'goals', slug, filename,
   fullMarkdownContent, parsedFrontmatter, traceId, parentSpanId:
   requestSpan.spanId })`. End and write the request span once the whole
   pipeline (including step 4's eval span) completes.

## 3. Eval

Run `skills/grade-artifact/SKILL.md`'s sequence against the drafted goal,
using `golden-sets/goals.json`'s stated `criteria`:

1. `assertCalibrated('goals')` first. **Stop** if it throws — do not grade
   unsupervised, per AD-4.
2. Judge the drafted goal using G-Eval two-stage ordering against
   `golden-sets/goals.json`'s criteria — reason step by step, then emit a
   single pass/fail verdict.
3. Record the eval span as a child of the same `traceId`, `parentSpanId` set
   to the `persist-draft-artifact` span's `spanId` from step 2.3 above.
4. If the verdict is `fail`, return to Generation step 7's feedback loop
   rather than persisting a failing artifact.

## 4. Persistence

Once eval passes, finish `skills/persist-artifact/SKILL.md`'s sequence
starting from its step 3 (step 1 was done in Provenance above; step 2's
write already happened in Provenance step 3):

1. **Stamp — `mif-docs:mif-provenance` skill, `stamp` verb.**
2. **Gate — `mif-docs:mif-validate` skill, `--level 3`.** Only if it passes,
   call `promoteVersion('goals', slug, version, root)`. If it fails, the
   draft stays on disk unpromoted.
3. **Index — `mif-docs:mif-corpus` skill, `ingest` verb**, with
   `--db-path resolveCorpusDbPath()`. Best-effort.

## 5. Worked-example verification (Task #78)

The generation → provenance pipeline is exercised end to end against
`golden-sets/goals.json`'s `good-auth-tests-goal` entry in
`test/generate-goal-pipeline.test.mjs`: it drafts frontmatter (citations
naming Epic #40, `provenance.sourceType: system_generated`,
`temporal.ttl` from `ARTIFACT_TYPE_METADATA.goals` with
`conceptType: 'semantic'`, all three required `relationships[]` types),
asserts `validateFrontmatterContract` returns zero errors, runs a full
`persistDraftArtifact` round-trip, and actually executes a real (safe,
self-contained) reference-solution smoke test via
`runReferenceSolutionSmokeTest` to prove Task #75's achievability bar is a
real execution, not merely a shape check. A live generation session should
treat that test as the mechanical check this step's prose describes, not
repeat the check by hand.
