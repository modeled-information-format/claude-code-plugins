---
id: claude-code-plugins-artifact-authoring-readme
type: semantic
created: '2026-07-13T00:00:00Z'
namespace: claude-code-plugins/artifact-authoring
modified: '2026-07-14T05:06:19.544Z'
temporal:
  '@type': TemporalMetadata
  validFrom: '2026-07-13T00:00:00Z'
  recordedAt: '2026-07-13T00:00:00Z'
  ttl: P90D
provenance:
  '@type': Provenance
  agent: claude-code/claude-sonnet-5
  wasGeneratedBy:
    '@id': urn:mif:activity:claude-code-session:3921fa8c-0b9e-410e-b53c-6cf81b074757
    '@type': prov:Activity
  trustLevel: user_stated
  agentVersion: 2.1.208
citations:
  - '@type': Citation
    citationType: documentation
    citationRole: source
    title: 'Epic: Claude Artifact Authoring plugin — build, onboard, and admit to the marketplace'
    url: https://github.com/modeled-information-format/claude-code-plugins/issues/40
    accessed: '2026-07-13'
relationships:
  - type: derived-from
    target: https://github.com/modeled-information-format/claude-code-plugins/issues/40
  - type: derived-from
    target: https://github.com/modeled-information-format/claude-code-plugins/issues/41
---

# artifact-authoring

Generates high-quality AI-interaction artifacts — prompts, goals, loops,
eval-suites, subagent definitions, and tool schemas — from a natural-language
request plus grounding sources. Every generator shares one pipeline: a scored
authoring checklist, a calibrated eval, and MIF Level-3 provenance persisted to
a central `XDG_DATA_HOME` artifact store, so generated artifacts are versioned,
graded, and discoverable across projects rather than one-off files.

This plugin's design is specified in the architecture doc referenced by
[Epic #40](https://github.com/modeled-information-format/claude-code-plugins/issues/40),
which tracks its build via 14 Stories. This README will grow
generator-by-generator as each Story lands; as of this Story (S13), the
plugin scaffold, the central `XDG_DATA_HOME` artifact store, the
cross-cutting persistence pipeline, the OTel-compatible trace substrate,
the calibrated-grading framework (with real golden sets for all 6 artifact
types), central-corpus discovery indexing, all six generators
(**prompt**, **goal**, **loop**, **eval-suite**, **subagent-definition**,
**tool-schema**), and a cross-cutting best-effort provenance manifest
surfaced for inspection on every artifact leaving the authoring session
exist.

## Internals

- `lib/xdg-store.mjs` — the central artifact store: resolves
  `${XDG_DATA_HOME:-~/.local/share}/artifact-authoring/<type>/<slug>/`,
  validates `type`/`slug`/`filename` as safe single path segments (no path
  traversal), writes collision-safe version directories (`v1/`, `v2/`, ...),
  and promotes one version to `current.json` via an atomic write-then-rename.
- `lib/frontmatter-contract.mjs` — validates a drafted frontmatter against
  the four elements every persisted artifact must carry: `citations[]`,
  a `provenance` block (`sourceType: system_generated`), `temporal`
  (`validFrom`/`recordedAt`/`ttl`, checked as a real RFC3339 date-time and a
  simple ISO-8601 duration, not just presence), and `relationships[]`
  (`derived-from`, `relates-to`, `harness:generated-for`, each requiring a
  non-empty `target`).
- `lib/mif-docs-dependency.mjs` — resolves the installed `mif-docs` plugin's
  directory under `${CLAUDE_CONFIG_DIR:-~/.claude}/plugins/cache/...`
  (requiring all three entry points the persistence sequence depends on:
  `mif-frontmatter`, `mif-provenance`, `mif-validate`), or throws a clear,
  actionable error naming exactly what's missing — never a silent no-op.
- `lib/trace.mjs` — a minimal, portable OTel-compatible trace substrate: no
  SDK dependency, spans in a simplified JSON representation (OTel-spec ID
  shapes and timestamp semantics, but not the OTLP/proto JSON encoding — a
  transform step would be needed for a real OTLP collector) appended as
  JSON Lines under
  `${XDG_STATE_HOME:-~/.local/state}/artifact-authoring/traces.jsonl`
  (a different XDG category from the artifact store — telemetry, not durable
  content). `startSpan`/`endSpan`/`writeSpan`/`readTraceSpans` are the whole
  API; no hosted platform, per AD-7.
- `lib/persist-artifact.mjs` — the deterministic half of the persistence
  pipeline: validates the contract, confirms the dependency, writes an
  **unpromoted** draft version, and — when a generator passes `traceId` from
  its own "generation-request" span — records the write as a linked child
  span, so a trace can be walked from request → artifact → (eventually)
  evaluation. `skills/persist-artifact/SKILL.md` documents the full
  sequence (draft via `mif-frontmatter` → write via this module → stamp via
  `mif-provenance` → gate via `mif-validate`, only then promote → best-effort
  index via `mif-corpus`) that every generator Story (S6-S11) runs at the
  end of its own pipeline.
- `lib/corpus-index.mjs` — `resolveCorpusDbPath()`, the one deterministic
  piece of the persistence sequence's discovery-indexing step (Story S5 Task
  #66): computes
  `${XDG_DATA_HOME:-~/.local/share}/artifact-authoring/corpus/vectors.db`,
  the central `--db-path`/`db_path` every generator's `mif-corpus ingest`
  call targets instead of a project-local `.mif/vectors.db`, so generated
  artifacts become discoverable via `search_documents`/
  `find_similar_documents` across every project, not just the one that
  generated them.
- `golden-sets/*.json` — real, hand-authored golden sets (2 good + 2 bad
  examples each) for all 6 artifact types, grounded directly in the
  architecture doc's own per-type criteria (structured-prompting checklist,
  SMART/executable-verify goals, named-pattern loops, grader-typed
  eval-suites, delegation-safe subagents, Structured-Outputs-safe tool
  schemas).
- `lib/golden-set.mjs` — loads and validates a golden set, and computes
  agreement between a judge's verdicts and the golden set's recorded labels
  (label provenance — human vs. self-labeled — is out of this module's
  scope; see `skills/grade-artifact/SKILL.md`'s "Known limitation")
  (`computeAgreement`).
- `lib/calibration.mjs` — records calibration runs (`recordCalibrationRun`)
  under
  `${XDG_STATE_HOME:-~/.local/state}/artifact-authoring/calibration-runs.jsonl`,
  and enforces AD-4's hard gate (`assertCalibrated` throws unless the latest
  run meets the 75%+ target) plus Task #63's re-calibration cadence
  (`needsRecalibration`, default 90-day staleness).
- `skills/grade-artifact/SKILL.md` — documents the LLM-judgment half of
  grading (the gate check, G-Eval two-stage judging, grade-the-artifact-
  not-the-path) that pairs with the deterministic modules above. **Real
  initial calibration performed**: all 6 golden sets were judged by this
  authoring session against their own stated criteria (not by echoing the
  labels) and reached 100% agreement — recorded, gate-tested, and
  explicitly flagged (`aboveTargetRange`) as a same-session calibration
  that a real independent human spot-audit should strengthen, not hidden as
  if it were a completed, permanent calibration.
- `lib/prompt-checklist.mjs` — the deterministic third of the prompt
  generator's structured-prompting checklist (Story S6 Task #67): a frozen
  `PROMPT_CHECKLIST` naming all 8 items (clarity/golden rule, contextual
  justification, few-shot examples, XML delimiting, role-setting, tiered
  chain-of-thought, right altitude, document grounding) and
  `scoreDeterministicChecklist(content)`, which mechanically scores exactly
  the 3 items a plain function can honestly check — `<example>` block count
  in `[3, 5]`, at least 2 distinct properly-paired XML-style tags beyond
  `<example>`, and `<thinking>`/`<answer>` tiering consistency (present-and-
  paired or absent-and-N/A, never one without the other). The remaining 5
  items need real judgment and are scored by the invoking agent per
  `skills/generate-prompt/SKILL.md`, never faked as if a regex could grade
  prose quality.
- `skills/generate-prompt/SKILL.md` — Story S6's generator: scores the full
  checklist (deterministic subset via `lib/prompt-checklist.mjs`, judgment
  items via G-Eval-style reasoning-before-verdict) with a feedback loop back
  into generation on any failing item, drafts L3 frontmatter recording the
  checklist scoring in the schema's own `extensions` block, runs
  `skills/grade-artifact/SKILL.md`'s calibrated-eval sequence, and finishes
  `skills/persist-artifact/SKILL.md`'s stamp → gate → promote → index
  sequence — linked end to end by one `traceId` (Story S3). Task #74's
  worked-example verification (the architecture doc's own code-review
  subagent example, `golden-sets/prompts.json`'s
  `good-code-review-subagent` entry) is automated in
  `test/generate-prompt-pipeline.test.mjs`, not left as prose.
- `lib/goal-checklist.mjs` — the deterministic subset of the goal
  generator's authoring checklist (Story S7 Tasks #70/#72/#75): a frozen
  `GOAL_CHECKLIST` naming all 7 SMART-plus-two-experts items, with
  `scoreDeterministicChecklist(content)` mechanically scoring the 3 a plain
  function can check (`measurableVerifyCommand` via `extractVerifyCommands`
  — an inline-code-span-shaped command parser — `timeBound`, an explicit
  numeric turn/time bound, and `boundedConstraints`, an explicit
  `Constraints:` section). Also exports `assertChecksGrounded` (Task #72:
  every check in the generator's internal `checks[]` record carries its own
  non-empty `groundedIn`, not one shared citation) and `lintChecksBalance`
  (Task #75: every check with `negativeCaseApplicable: true` must carry a
  `negativeCase`, never forced on checks where none applies).
- `lib/verify-command-runner.mjs` — Task #75's "reference-solution smoke
  test" made real rather than a shape check:
  `runReferenceSolutionSmokeTest` actually `spawnSync`s a vetted
  `{command, args}` pair (`shell: false`, never a concatenated shell
  string) and reports whether it genuinely exited 0, distinguishing "ran and
  passed" / "ran and failed" / "did not run" (e.g. `ENOENT`) / "timed out" —
  never conflating a failing reference solution with a merely-unattempted
  one. `splitVerifyCommand` turns a plain verify-command string into that
  vetted pair, refusing (not silently mis-splitting) any shell
  metacharacters it can't safely handle.
- `skills/generate-goal/SKILL.md` — Story S7's generator: drafts an
  internal `checks[]` record first (assertion + executable `verify` command
  + per-check `groundedIn` + balanced positive/negative cases) and composes
  the final `/goal`-shaped prose from it — never the reverse — then scores
  the full checklist, actually executes a reference-solution smoke test
  before shipping (Task #75), drafts L3 frontmatter with
  `conceptType: 'semantic'` (Task #78, via
  `ARTIFACT_TYPE_METADATA.goals`), and finishes the same
  grade → persist sequence Story S6 established.
- `lib/loop-checklist.mjs` — the deterministic subset of the loop
  generator's authoring checklist (Story S8 Tasks #80/#82): a frozen
  `LOOP_CHECKLIST` naming all 5 items, with `scoreDeterministicChecklist(content)`
  mechanically scoring the 2 a plain function can check (`patternNamed` via
  `extractDeclaredPattern` — recognizing an explicit `Pattern: <name>.`
  declaration against `SIX_AGENT_PATTERNS`, Anthropic's six named agent
  patterns — and `explicitStopCondition`, an explicit `Stop condition:`
  section with real content, not an empty or newline-severed header). Also
  exports `assertPatternSelectionGrounded` (Task #82: the pattern selection
  record carries a non-empty rationale, traceable to the
  Building-Effective-Agents/ReAct evidence the source doc cites).
- `lib/loop-dry-run.mjs` — Task #85's "sandboxed dry-run harness" made
  real: `dryRunLoop` actually runs a caller-supplied `step`/`isDone` pair
  against a scripted mock environment (no real side effects) and reports
  whether the declared stop condition genuinely fires (`stoppedBy:
  'condition'` or `'iteration-cap'`) or never does (`ranAway: true`,
  caught by a hard ceiling independent of anything the loop itself
  declares) — proving achievability the same way
  `lib/verify-command-runner.mjs` does for a goal's verify command, not a
  simulation of a simulation.
- `skills/generate-loop/SKILL.md` — Story S8's generator: classifies the
  requested behavior against Anthropic's six named agent patterns, refuses
  to default to "fully autonomous" without real justification, requires an
  explicit stop condition, actually dry-runs it via `dryRunLoop` before
  shipping (Task #85), drafts L3 frontmatter with `conceptType: 'procedural'`
  (Task #87, via `ARTIFACT_TYPE_METADATA.loops`), and finishes the same
  grade → persist sequence Stories S6/S7 established.
- `lib/eval-suite-checklist.mjs` — the deterministic subset of the
  eval-suite generator's authoring checklist (Story S9 Task #76): a frozen
  `EVAL_SUITE_CHECKLIST` naming all 5 items, with
  `scoreDeterministicChecklist(content)` mechanically scoring the 3 a plain
  function can check (`graderTypeNamed` via `extractGraderType` against
  `GRADER_TYPES` — Anthropic's three documented grader types —
  `hasGoldenSetReference`, and `calibrationRequiredForLLMGraders`, vacuously
  true for a non-LLM-based grader and requiring actual calibration language
  otherwise).
- `lib/eval-suite-calibration-wiring.mjs` — Tasks #79/#81's calibration
  cadence made real: `assertEvalSuiteCalibrationWired` wires a generated
  eval suite into `lib/calibration.mjs`'s EXISTING
  `isCalibrated`/`needsRecalibration` machinery for the artifact type the
  suite grades, rather than reinventing calibration tracking — an
  LLM-based suite with no recorded run, or a stale one, is rejected before
  it ships; a code-based or human grader is exempt (no LLM-judge drift to
  calibrate against).
- `skills/generate-eval-suite/SKILL.md` — Story S9's generator: unlike the
  other five, its own product IS a grader for some other target artifact
  type. Names the grader type, grades the target artifact rather than the
  path taken to reach it, names a concrete golden set, wires an LLM-based
  suite into the real calibration cadence before shipping (Tasks #79/#81),
  drafts L3 frontmatter with `conceptType: 'semantic'` (Task #84, via
  `ARTIFACT_TYPE_METADATA['eval-suites']`), and finishes the same
  grade → persist sequence Stories S6-S8 established.
- `lib/subagent-checklist.mjs` — the deterministic subset of the subagent
  generator's authoring checklist (Story S10 Tasks #88/#90): a frozen
  `SUBAGENT_CHECKLIST` naming all 5 items, with
  `scoreDeterministicChecklist(content)` mechanically scoring the 3 a
  plain function can check by parsing the frontmatter block
  (`hasFrontmatterFields` — name/description/tools all present —
  `descriptionStatesBoundary`, and `descriptionStatesTrigger`). Also
  exports `assertSubagentProvenanceRecorded` (Task #90: names the parent
  skill/command and, optionally, the tool-schema artifacts depended on —
  `dependsOnToolSchemas: []` is valid, Story S11 is a soft dependency).
- `lib/subagent-delegation-harness.mjs` — Task #92's "prove correct
  delegation, not just correct output" made real: `scoreDelegationCases`
  scores a real decision function (the invoking agent's own delegation
  judgment) against hit-and-miss test cases, and `assertTestsBoundary`
  rejects a suite that only tests hits or only misses — a description's
  BOUNDARY is what actually prevents mis-delegation, so a one-sided suite
  never really tests it.
- `skills/generate-subagent/SKILL.md` — Story S10's generator: applies
  Story S6's full structured-prompting checklist to the system prompt,
  separately validates the frontmatter contract (sharply scoped tools,
  a description stating both a trigger and a boundary), constructs a real
  hit-and-miss delegation suite before shipping (Task #92), drafts L3
  frontmatter with `conceptType: 'procedural'` (Task #94, via
  `ARTIFACT_TYPE_METADATA.subagents`), and finishes the same grade →
  persist sequence Stories S6-S9 established.
- `npm test` (Node's built-in test runner) covers all of the
  above, including a **real cross-process** concurrency test for the store
  (separate OS processes, not same-thread async calls, so it actually
  exercises the `EEXIST`-retry path under real contention), a real
  request → artifact → evaluation trace round-trip, the real initial
  calibration pass across all 6 golden sets, full `persistDraftArtifact`
  round-trips for the prompt, goal, loop, eval-suite, and subagent
  generators' worked examples, **real subprocess executions** (a
  genuinely passing, a genuinely failing, and a genuinely timed-out
  reference solution) proving the goal generator's achievability smoke
  test is a real execution, **real dry-run executions** (a condition that
  fires, an iteration cap that fires, and a broken stop condition caught
  by the hard ceiling) proving the loop generator's dry-run harness is
  likewise real, **real calibration-log exercises** (no run recorded, a
  below-target run, a stale run, and a genuinely passing fresh run)
  proving the eval-suite generator's calibration-cadence wiring checks an
  actual recorded run, **real delegation-scoring exercises** (a
  perfect decision function, and a genuinely broken "always delegate" one
  caught by the harness) proving the subagent generator's delegation eval
  is a real scored execution, and **real schema-tree walks and store
  round-trips** (recursive-$ref detection across a root reference and a
  genuine ancestor-path reference, numerical-bound/regex-keyword detection
  nested arbitrarily deep, and a pin resolution that fails before a schema
  is promoted and succeeds against its real current version afterward)
  proving the tool-schema generator's checklist and pin mechanism are not
  documented assumptions either.
- `lib/tool-schema-checklist.mjs` — the deterministic subset of the
  tool-schema generator's authoring checklist (Story S11 Task #89), with a
  HIGHER deterministic ratio (4 of 5 items) than the other five generators
  — this artifact type's own criteria (recursion, numerical bounds, regex)
  is genuinely mechanical, unlike the others' prose judgment. A frozen
  `TOOL_SCHEMA_CHECKLIST`, `scoreDeterministicChecklist(content)` (parses
  the schema JSON and walks it for `isValidJSON`, `noRecursiveSchema` via
  `hasRecursiveSchema` — a real structural walk tracking JSON-Pointer
  ancestor paths, not a literal `"$ref": "#"` string search —
  `noNumericalBoundConstraints`, `noComplexRegex`), and
  `assertDerivationChoiceRecorded` (Task #89: an explicit derivation
  strategy from the three prior-art strategies AutoGen/Semantic
  Kernel/CrewAI use, and an explicit Instructor-vs-Outlines output-logic
  fork — never left implicit).
- `lib/tool-schema-pin.mjs` — Task #91's "single source of typed truth"
  made real: `resolveToolSchemaPin` resolves a dependent artifact's pin
  (e.g. a subagent's `dependsOnToolSchemas[]`, Story S10) against
  `lib/xdg-store.mjs`'s EXISTING `current.json` pointer, rather than a
  second, separately-tracked version number — and throws if the schema has
  no promoted version yet, so nothing can pin against an ungated draft.
- `skills/generate-tool-schema/SKILL.md` — Story S11's generator: picks a
  derivation strategy and an output-logic fork explicitly, authors real
  JSON Schema within the Structured Outputs supported subset, runs a
  schema-conformance round-trip proving a real model call never falls back
  to an unstructured response (Task #93), drafts L3 frontmatter with
  `conceptType: 'procedural'` (via `ARTIFACT_TYPE_METADATA['tool-schemas']`),
  and finishes the same grade → persist sequence Stories S6-S10
  established — plus the pin-resolution step other generators depend on.
- `lib/artifact-manifest.mjs` — Story S13's cross-cutting SHOULD-level
  "signed manifest" (Task #97's design, AD-6): `buildArtifactManifest`
  reassembles a C2PA-style manifest from fields a generator's own
  frontmatter ALREADY declared (motivation from the `derived-from`
  entries in `relationships[]`, source grounding from `citations[]`,
  generation steps from `extensions.artifactAuthoring`, when they
  were declared from `temporal.recordedAt`) — it does not independently
  verify, sign, or attest to any of it, and every manifest it builds
  carries its own `disclaimer` field saying so explicitly.
  `formatManifestForInspection` renders one as human-readable text (Task
  #99's "surface it for inspection" requirement) and
  `assertManifestReadyToSurface` is a **structural** completeness check
  only — passing it means a manifest with the required fields exists to
  show, never that the artifact's declarations are true. Wired into
  `skills/persist-artifact/SKILL.md` as its final step, run once per
  artifact right after promotion, so every artifact leaving the authoring
  session gets one — the Security NFR (Task #101) this satisfies:
  artifacts are **untrusted until a human or downstream system inspects
  this manifest and the artifact's own content directly**.

## Install

**Not yet installable** — this plugin isn't registered in
`.claude-plugin/marketplace.json` yet (that's Story S12 — despite its number,
it's built LAST in Epic #40's build order, after every generator and
cross-cutting Story including S13, since marketplace admission is the final
step once everything else is done). Once it is:

```
/plugin marketplace add modeled-information-format/claude-code-plugins
/plugin install artifact-authoring@modeled-information-format
```

## Depends on

`mif-docs@modeled-information-format` — every generator's persistence pipeline
(Story S2) authors its output via `mif-frontmatter`, stamps it via
`mif-provenance`, and gates it via `mif-validate`.

## Generators (planned; see Epic #40 for build order and status)

| Generator | Story | Status |
| --- | --- | --- |
| Prompt | S6 (#59) | Done |
| Goal | S7 (#62) | Done |
| Loop | S8 (#64) | Done |
| Eval-suite | S9 (#68) | Done |
| Subagent-definition | S10 (#73) | Done |
| Tool-schema | S11 (#77) | Done |
| Provenance manifest (cross-cutting) | S13 (#86) | Done |
