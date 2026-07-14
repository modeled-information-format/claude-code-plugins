---
name: generate-loop
description: Generate an agent loop/agent-config classified against Anthropic's six named agent patterns, with a mandatory explicit stop condition, a real sandboxed dry-run proving the stop condition fires, and calibrated grading before persisting it as a MIF Level-3 document. Use this skill whenever a request asks for a new autonomous or semi-autonomous loop/agent-config to be authored, not hand-drafted ad hoc.
argument-hint: "<loop purpose/request> <grounding source(s)>"
---

# generate-loop

Story S8's implementation of Epic #40's generator template
(`REQ[Request + sources] → CK[Scored checklist] → DRAFT → META → VER → JUDGE
→ SHIP`), specialized for the loop artifact type. Runs the same four phases
every generator in this plugin runs — generation, provenance, eval,
persistence — in this exact order. Only the checklist, the pattern
classification, and the dry-run harness are loop-specific; the
provenance/eval/persistence phases below are thin wrappers around
`skills/grade-artifact/SKILL.md` and `skills/persist-artifact/SKILL.md`.

## 1. Generation

1. **Classify against Anthropic's six named agent patterns** (Building
   Effective Agents): prompt chaining, routing, parallelization,
   orchestrator-workers, evaluator-optimizer, fully autonomous
   (`SIX_AGENT_PATTERNS`, `lib/loop-checklist.mjs`). State the choice as an
   explicit `Pattern: <name>.` declaration in the drafted prose.
2. **Refuse to default to "fully autonomous."** Before selecting it, check
   whether prompt chaining, routing, parallelization, orchestrator-workers,
   or evaluator-optimizer would genuinely suffice for the underlying task —
   `golden-sets/loops.json`'s own bad examples are exactly this failure:
   declaring (or not even declaring) "fully autonomous" as a default without
   ever asking whether a bounded pattern would have worked. Only choose
   "fully autonomous" with real justification for why every bounded pattern
   falls short.
3. **Declare an explicit stop condition** — a numeric max-iteration cap, a
   goal/score check, or a time bound — as a `Stop condition: <content>.`
   line with concrete, non-vague content. "Until it feels done" or "try not
   to run too long" is the absence of a stop condition, not one.
4. **For a time-based loop specifically**, declare an interval/jitter/
   expiration policy. Treat the source architecture doc's own specific
   self-pacing numbers as a documentation-derived default to re-verify
   against Claude Code's *current* docs at build time — that finding is
   explicitly flagged weakened in Epic #40, not a hard contract to copy
   verbatim.
5. Score the composed prose against every item in
   `lib/loop-checklist.mjs`'s `LOOP_CHECKLIST` — **all five**, not just the
   two a function can check:
   - Call `scoreDeterministicChecklist(composedProse)` for `patternNamed`
     and `explicitStopCondition`.
   - Score `patternAppropriate`, `notDefaultAutonomous`,
     `timeBasedPolicyDeclared` (`'n/a'` if the loop has no time-based
     component at all) yourself, using G-Eval two-stage ordering.
   - Record every one of the five items' verdict explicitly.
6. **Sandboxed dry-run (Task #85) — prove the stop condition actually
   fires, don't just check the text names one.** Translate the drafted
   loop's step logic and stop condition into a `step(state, iteration)` /
   `isDone(state, iteration)` pair against a scripted mock environment (no
   real side effects — no shell exec, no network, no filesystem writes),
   and run `dryRunLoop({ step, isDone, maxIterations })`
   (`lib/loop-dry-run.mjs`). Inspect the result:
   - `stoppedBy: 'condition'` or `'iteration-cap'` — the declared stop
     condition genuinely works against this scripted scenario. Proceed.
   - `ranAway: true` — the declared stop condition does NOT actually fire
     within a generous hard ceiling. **Do not ship this loop.** Return to
     step 3 and fix the stop condition, then re-run the dry run.
7. **Feedback loop.** If any applicable checklist item fails, or the dry
   run reports `ranAway: true`, revise and re-score/re-run from step 1 —
   never patch around a failing dry run by simply raising the ceiling.

## 2. Provenance

1. **Draft L3 frontmatter — `mif-docs:mif-frontmatter` skill.** Cite the
   origin finding(s) — normally
   [Epic #40](https://github.com/modeled-information-format/claude-code-plugins/issues/40)
   plus the specific Building-Effective-Agents/ReAct evidence the source
   doc names, if a resolvable URL exists in this generation's context.
   `provenance.sourceType: system_generated`, `temporal` from
   `ARTIFACT_TYPE_METADATA.loops` (`conceptType: 'procedural'`, Task #87),
   `relationships[]` (`derived-from`, `relates-to`, and `harness:generated-for`
   targeting `urn:mif:topic:artifact-authoring:loops`).
2. **Record the pattern selection and checklist scoring in `extensions`**
   (Task #82: "record which of the six named patterns was selected and
   why"). Validate with `assertPatternSelectionGrounded({ pattern,
   rationale })` (`lib/loop-checklist.mjs`) before writing — it throws if
   the pattern isn't one of the six or the rationale is empty. Also record
   the dry-run result (`stoppedBy`, `iterations`, `ranAway: false`) as proof
   the stop condition was actually exercised, e.g.:
   ```yaml
   extensions:
     artifactAuthoring:
       generatorType: loops
       checklist:
         patternNamed: pass
         patternAppropriate: pass
         notDefaultAutonomous: n/a
         explicitStopCondition: pass
         timeBasedPolicyDeclared: n/a
       patternSelection:
         pattern: evaluator-optimizer
         rationale: "iterative quality improvement against a scorable rubric (Building Effective Agents)"
       dryRun:
         stoppedBy: condition
         iterations: 3
         ranAway: false
       revision: 1
   ```
3. **Write the draft — `persistDraftArtifact()`.** Start a
   `"generation-request"` span and pass its `traceId` down, exactly as
   Story S6/S7's generators do.

## 3. Eval

Run `skills/grade-artifact/SKILL.md`'s sequence against the drafted loop,
using `golden-sets/loops.json`'s stated criteria: `assertCalibrated('loops')`
first (stop if it throws), judge with G-Eval two-stage ordering, record the
eval span as a child of the persist span, and return to Generation step 7's
feedback loop on a failing verdict.

## 4. Persistence

Once eval passes, finish `skills/persist-artifact/SKILL.md`'s stamp → gate →
promote → index sequence, exactly as every other generator in this plugin.

## 5. Worked-example verification (Task #87)

`test/generate-loop-pipeline.test.mjs` exercises the pipeline end to end
against `golden-sets/loops.json`'s `good-evaluator-optimizer-loop` entry:
drafts frontmatter with `conceptType: 'procedural'` from
`ARTIFACT_TYPE_METADATA.loops`, asserts `validateFrontmatterContract` returns
zero errors, runs a full `persistDraftArtifact` round-trip, and actually
runs `dryRunLoop` against a scripted mock mirroring the worked example's own
score-improves-each-iteration logic to prove Task #85's dry-run bar is a
real execution.
