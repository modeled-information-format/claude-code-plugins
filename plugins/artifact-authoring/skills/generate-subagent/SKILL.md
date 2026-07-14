---
name: generate-subagent
description: Generate a subagent definition — frontmatter (name/description/tools/model) plus a system prompt scored against the structured-prompting checklist — with a sharply scoped tool allow-list and a description precise enough that an orchestrator reliably delegates to it and not another subagent. Use this skill whenever a request asks for a new subagent definition to be authored, not hand-drafted ad hoc.
argument-hint: "<subagent purpose/role> <sibling subagents to avoid overlapping with> <grounding source(s)>"
---

# generate-subagent

Story S10's implementation of Epic #40's generator template
(`REQ[Request + sources] → CK[Scored checklist] → DRAFT → META → VER → JUDGE
→ SHIP`), specialized for the subagent artifact type. A subagent is
distinct from a plain prompt (Story S6) because it carries its own
frontmatter contract on top of a system prompt — both are validated,
separately.

## 1. Generation

1. **Draft the system prompt** and score it against
   `lib/prompt-checklist.mjs`'s full `PROMPT_CHECKLIST` (all 8 items) —
   Story S6's structured-prompting discipline applies here unchanged.
2. **Draft the frontmatter contract** — `name`, `description`, `tools`
   (`model` optional):
   - **Tool allow-list**: sharply scoped to the role. Read-only review
     roles get no `Write`/`Edit`; mechanical roles get exactly what they
     need and no more (`golden-sets/subagents.json`'s
     `good-test-runner-subagent-def` — `tools: Bash` only). Never default
     to a broad "everything" list
     (`bad-do-everything-subagent-def`'s `Read, Write, Edit, Bash, Grep,
     Glob, WebFetch, WebSearch` is the anti-pattern this checks against).
   - **Description precision (Task #88's core bar)**: a bad description
     causes mis-delegation, not just weak output. State an explicit
     trigger condition ("Use when...", "Use PROACTIVELY after...") AND an
     explicit non-goal/boundary (what this subagent does NOT do, ideally
     naming the sibling subagent that owns that instead).
3. Score the composed definition against every item in
   `lib/subagent-checklist.mjs`'s `SUBAGENT_CHECKLIST` — **all five**:
   - Call `scoreDeterministicChecklist(composedMarkdown)` for
     `hasFrontmatterFields`, `descriptionStatesBoundary`,
     `descriptionStatesTrigger`.
   - Score `toolAllowListScoped` and `minimalOverlapWithSiblings`
     (`'n/a'` if no sibling-subagent context is available) yourself,
     using G-Eval two-stage ordering — the latter specifically checking the
     drafted description against every named sibling subagent's own
     description for overlapping claimed responsibility.
4. **Feedback loop.** If any applicable item fails, revise and re-score.

## 2. Provenance

1. **Draft L3 frontmatter — `mif-docs:mif-frontmatter` skill.** Cite
   [Epic #40](https://github.com/modeled-information-format/claude-code-plugins/issues/40)
   plus the specific request this subagent was generated for.
   `provenance.sourceType: system_generated`, `temporal` from
   `ARTIFACT_TYPE_METADATA.subagents` (`conceptType: 'procedural'`),
   `relationships[]` (`derived-from`, `relates-to`,
   `harness:generated-for` targeting
   `urn:mif:topic:artifact-authoring:subagents`).
2. **Record which parent skill/command this subagent supports, and which
   tool-schema artifacts it depends on (Task #90)** — validate with
   `assertSubagentProvenanceRecorded({ parentSkillOrCommand,
   dependsOnToolSchemas })` (`lib/subagent-checklist.mjs`) before writing.
   `dependsOnToolSchemas` may legitimately be `[]` — Story S11 (tool-schema
   generator) is this Story's own documented soft dependency; record the
   link once S11's artifacts exist, don't block on it existing yet. E.g.:
   ```yaml
   extensions:
     artifactAuthoring:
       generatorType: subagents
       checklist:
         hasFrontmatterFields: pass
         toolAllowListScoped: pass
         descriptionStatesBoundary: pass
         descriptionStatesTrigger: pass
         minimalOverlapWithSiblings: pass
       parentSkillOrCommand: generate-subagent
       dependsOnToolSchemas: []
       revision: 1
   ```
3. **Write the draft — `persistDraftArtifact()`.** Start a
   `"generation-request"` span and pass its `traceId` down, exactly as
   Stories S6-S9's generators do.

## 3. Eval

1. Run `skills/grade-artifact/SKILL.md`'s sequence against the drafted
   subagent, using `golden-sets/subagents.json`'s stated criteria:
   `assertCalibrated('subagents')` first (stop if it throws), judge with
   G-Eval two-stage ordering, record the eval span.
2. **Task #92: prove correct delegation, not just correct output.**
   Construct hit-and-miss test cases — task descriptions squarely inside
   this subagent's stated scope (hits) AND task descriptions that sound
   similar but belong to a sibling subagent or no subagent at all (misses,
   testing the description's BOUNDARY). Validate the suite itself with
   `assertTestsBoundary(cases)` (`lib/subagent-delegation-harness.mjs`) —
   it throws if the suite tests only hits or only misses. Then judge each
   case yourself (would the orchestrator actually delegate here, given
   only this description?) and score real accuracy with
   `scoreDelegationCases(cases, decide)`. A suite scoring low accuracy on
   miss cases means the description needs a sharper boundary — return to
   Generation step 4's feedback loop, don't ship it as-is.
3. If either the checklist or delegation eval fails, return to Generation
   step 4's feedback loop rather than persisting a failing artifact.

## 4. Persistence

Once eval passes, finish `skills/persist-artifact/SKILL.md`'s stamp → gate
→ promote → index sequence, exactly as every other generator in this
plugin.

## 5. Worked-example verification (Task #94)

`test/generate-subagent-pipeline.test.mjs` exercises the pipeline end to
end against `golden-sets/subagents.json`'s `good-code-review-subagent-def`
entry: drafts frontmatter with `conceptType: 'procedural'` from
`ARTIFACT_TYPE_METADATA.subagents`, asserts `validateFrontmatterContract`
returns zero errors, runs a full `persistDraftArtifact` round-trip, and
actually runs `scoreDelegationCases` against a real hit-and-miss test suite
to prove Task #92's delegation-boundary eval is a real scored execution.
