---
name: generate-eval-suite
description: Generate a companion eval suite for any other generated artifact (prompt, goal, loop, subagent, or tool schema), naming its grader type per Anthropic's three documented types, grading the artifact rather than the path taken to reach it, and requiring a calibrated golden set before an LLM-based grader may auto-grade unsupervised. Use this skill whenever a request asks for a new eval suite/grader to be authored for a generated artifact.
argument-hint: "<target artifact type> <grading criteria/rubric> <grounding source(s)>"
---

# generate-eval-suite

Story S9's implementation of Epic #40's generator template
(`REQ[Request + sources] → CK[Scored checklist] → DRAFT → META → VER → JUDGE
→ SHIP`), specialized for the eval-suite artifact type. Unlike the other
five generators, this one's own PRODUCT is itself a grader — a suite
that grades some OTHER target artifact type. Runs the same four phases
every generator in this plugin runs — generation, provenance, eval,
persistence — in this exact order.

## 1. Generation

1. **Name the grader type explicitly** (Task #76) — one of Anthropic's
   three documented types: `code-based`, `llm-based`, or `human`. State it
   as a `Grader type: <type>.` declaration in the drafted prose.
2. **Grade the artifact, not the path.** The suite must evaluate the
   target artifact's final content against a checklist/rubric — never how
   many iterations its own generator took, what was corrected along the
   way, or how confident generation felt.
3. **Name a concrete golden/reference set** — a specific
   `golden-sets/<type>.json` path and its composition (size, good/bad
   split), never a vague "check against some examples."
4. **For an LLM-based grader specifically**:
   - State the calibration precondition explicitly: a run against the
     golden set with a documented human-agreement target (AD-4), before
     this grader may auto-grade unsupervised.
   - Use G-Eval two-stage judging (reason step by step first, only then
     emit a verdict) — TruLens-style reasoning-before-score ordering, never
     a bare numeric score with no shown reasoning
     (`golden-sets/eval-suites.json`'s own `bad-no-calibration-eval` entry
     — "rate it 1-10... anything above 7 passes" — is exactly this
     anti-pattern).
5. **Emit the suite in the portable, pytest-shaped, config-driven form**
   the field has converged on — a runnable test file (or config) naming
   the grader type, the golden set path, and the pass/fail criteria as
   data, not prose the target generator's own agent has to re-interpret.
6. Score the composed prose against every item in
   `lib/eval-suite-checklist.mjs`'s `EVAL_SUITE_CHECKLIST` — **all five**:
   - Call `scoreDeterministicChecklist(composedProse)` for
     `graderTypeNamed`, `hasGoldenSetReference`,
     `calibrationRequiredForLLMGraders` (vacuously true for a non-LLM-based
     grader).
   - Score `gradesArtifactNotPath` and `gEvalTwoStageOrdering` (n/a for a
     non-LLM-based grader) yourself, using G-Eval two-stage ordering.
7. **Feedback loop.** If any applicable item fails, revise and re-score —
   never ship an eval suite with an unnamed grader type or a missing
   golden-set reference.

## 2. Provenance

1. **Draft L3 frontmatter — `mif-docs:mif-frontmatter` skill.** Cite
   [Epic #40](https://github.com/modeled-information-format/claude-code-plugins/issues/40)
   plus the specific request/target this suite was generated for.
   `provenance.sourceType: system_generated`, `temporal` from
   `ARTIFACT_TYPE_METADATA['eval-suites']` (`conceptType: 'semantic'` — a
   suite is spec-shaped, like a goal), `relationships[]` (`derived-from`,
   `relates-to`, `harness:generated-for` targeting
   `urn:mif:topic:artifact-authoring:eval-suites`).
2. **Record the grader-type selection and checklist scoring in
   `extensions`** — Task #79's "the eval suite is itself versioned... and
   its calibration run is logged" is satisfied two ways: versioning is
   already automatic (every persisted artifact gets a version directory via
   `persistDraftArtifact`), and the calibration run is checked/logged via
   step 3 below, e.g.:
   ```yaml
   extensions:
     artifactAuthoring:
       generatorType: eval-suites
       checklist:
         graderTypeNamed: pass
         gradesArtifactNotPath: pass
         hasGoldenSetReference: pass
         calibrationRequiredForLLMGraders: pass
         gEvalTwoStageOrdering: pass
       graderType: llm-based
       targetArtifactType: prompts
       revision: 1
   ```
3. **Wire into the existing calibration cadence (Tasks #79/#81) — before
   persisting an LLM-based suite.** Call
   `assertEvalSuiteCalibrationWired({ graderType, targetArtifactType })`
   (`lib/eval-suite-calibration-wiring.mjs`) — it throws unless a real,
   non-stale calibration run is on record (via `lib/calibration.mjs`'s
   existing `isCalibrated`/`needsRecalibration`, Story S4's cadence) for
   the artifact type this suite grades. A code-based or human grader is
   exempt (no LLM-judge drift to calibrate against). If it throws, run
   calibration for `targetArtifactType` first (per
   `skills/grade-artifact/SKILL.md`'s step 4) — never ship an uncalibrated
   or stale-calibrated LLM-based suite.
4. **Write the draft — `persistDraftArtifact()`.** Start a
   `"generation-request"` span and pass its `traceId` down, exactly as
   Stories S6-S8's generators do.

## 3. Eval

Run `skills/grade-artifact/SKILL.md`'s sequence against the drafted eval
suite itself, using `golden-sets/eval-suites.json`'s stated criteria:
`assertCalibrated('eval-suites')` first (stop if it throws — this is the
eval-suite GENERATOR's own meta-grader being calibrated, distinct from step
3's per-target-artifact-type check above), judge with G-Eval two-stage
ordering, record the eval span, and return to Generation step 7's feedback
loop on a failing verdict.

## 4. Persistence

Once eval passes, finish `skills/persist-artifact/SKILL.md`'s stamp → gate
→ promote → index sequence, exactly as every other generator in this
plugin.

## 5. Worked-example verification (Task #84)

`test/generate-eval-suite-pipeline.test.mjs` exercises the pipeline end to
end against `golden-sets/eval-suites.json`'s `good-llm-judge-prompt-eval`
entry: drafts frontmatter with `conceptType: 'semantic'` from
`ARTIFACT_TYPE_METADATA['eval-suites']`, asserts
`validateFrontmatterContract` returns zero errors, runs a full
`persistDraftArtifact` round-trip, and actually exercises
`assertEvalSuiteCalibrationWired` against a real (temp-path) calibration
log to prove Tasks #79/#81's cadence wiring is real, not merely documented.
