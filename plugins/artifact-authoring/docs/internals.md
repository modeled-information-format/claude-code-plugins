---
id: claude-code-plugins-artifact-authoring-internals
type: semantic
created: '2026-07-14T00:00:00Z'
namespace: claude-code-plugins/artifact-authoring
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
provenance:
  '@type': Provenance
  agent: claude-code/claude-sonnet-5
  wasGeneratedBy:
    '@id': urn:mif:activity:claude-code-session:3921fa8c-0b9e-410e-b53c-6cf81b074757
    '@type': prov:Activity
  trustLevel: user_stated
  agentVersion: 2.1.208
modified: '2026-07-14T09:47:01.200Z'
---

# artifact-authoring internals

Module-by-module reference for this plugin's implementation. Read this if
you're modifying the plugin or want to know exactly how a piece works — if
you just want to use it, see [README.md](../README.md) instead.

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
  API; no hosted platform.
- `lib/persist-artifact.mjs` — the deterministic half of the persistence
  pipeline: validates the contract, confirms the dependency, writes an
  **unpromoted** draft version, and — when a generator passes `traceId` from
  its own "generation-request" span — records the write as a linked child
  span, so a trace can be walked from request → artifact → (eventually)
  evaluation. `skills/persist-artifact/SKILL.md` documents the full
  sequence (draft via `mif-frontmatter` → write via this module → stamp via
  `mif-provenance` → gate via `mif-validate`, only then promote → best-effort
  index via `mif-corpus`) that every generator runs at the end of its own
  pipeline.
- `lib/corpus-index.mjs` — `resolveCorpusDbPath()`, the one deterministic
  piece of the persistence sequence's discovery-indexing step: computes
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
  and enforces a hard gate (`assertCalibrated` throws unless the latest run
  meets the 75%+ target) plus a re-calibration cadence
  (`needsRecalibration`, default 90-day staleness).
- `skills/grade-artifact/SKILL.md` — documents the LLM-judgment half of
  grading (the gate check, G-Eval two-stage judging, grade-the-artifact-
  not-the-path) that pairs with the deterministic modules above. **Real
  initial calibration performed**: all 6 golden sets were judged against
  their own stated criteria (not by echoing the labels) and reached 100%
  agreement — recorded, gate-tested, and explicitly flagged
  (`aboveTargetRange`) as a same-session calibration that a real
  independent human spot-audit should strengthen, not hidden as if it were
  a completed, permanent calibration.
- `lib/prompt-checklist.mjs` — the deterministic third of the prompt
  generator's structured-prompting checklist: a frozen `PROMPT_CHECKLIST`
  naming all 8 items (clarity/golden rule, contextual justification,
  few-shot examples, XML delimiting, role-setting, tiered chain-of-thought,
  right altitude, document grounding) and `scoreDeterministicChecklist(content)`,
  which mechanically scores exactly the 3 items a plain function can
  honestly check — `<example>` block count in `[3, 5]`, at least 2 distinct
  properly-paired XML-style tags beyond `<example>`, and
  `<thinking>`/`<answer>` tiering consistency (present-and-paired or
  absent-and-N/A, never one without the other). The remaining 5 items need
  real judgment and are scored by the invoking agent per
  `skills/generate-prompt/SKILL.md`, never faked as if a regex could grade
  prose quality.
- `skills/generate-prompt/SKILL.md` — the prompt generator: scores the
  full checklist (deterministic subset via `lib/prompt-checklist.mjs`,
  judgment items via G-Eval-style reasoning-before-verdict) with a feedback
  loop back into generation on any failing item, drafts L3 frontmatter
  recording the checklist scoring in the schema's own `extensions` block,
  runs `skills/grade-artifact/SKILL.md`'s calibrated-eval sequence, and
  finishes `skills/persist-artifact/SKILL.md`'s stamp → gate → promote →
  index sequence — linked end to end by one `traceId`. The worked-example
  verification (the architecture doc's own code-review subagent example,
  `golden-sets/prompts.json`'s `good-code-review-subagent` entry) is
  automated in `test/generate-prompt-pipeline.test.mjs`, not left as prose.
- `lib/goal-checklist.mjs` — the deterministic subset of the goal
  generator's authoring checklist: a frozen `GOAL_CHECKLIST` naming all 7
  SMART-plus-two-experts items, with `scoreDeterministicChecklist(content)`
  mechanically scoring the 3 a plain function can check
  (`measurableVerifyCommand` via `extractVerifyCommands` — an
  inline-code-span-shaped command parser — `timeBound`, an explicit numeric
  turn/time bound, and `boundedConstraints`, an explicit `Constraints:`
  section). Also exports `assertChecksGrounded` (every check in the
  generator's internal `checks[]` record carries its own non-empty
  `groundedIn`, not one shared citation) and `lintChecksBalance` (every
  check with `negativeCaseApplicable: true` must carry a `negativeCase`,
  never forced on checks where none applies).
- `lib/verify-command-runner.mjs` — a "reference-solution smoke test" made
  real rather than a shape check: `runReferenceSolutionSmokeTest` actually
  `spawnSync`s a vetted `{command, args}` pair (`shell: false`, never a
  concatenated shell string) and reports whether it genuinely exited 0,
  distinguishing "ran and passed" / "ran and failed" / "did not run" (e.g.
  `ENOENT`) / "timed out" — never conflating a failing reference solution
  with a merely-unattempted one. `splitVerifyCommand` turns a plain
  verify-command string into that vetted pair, refusing (not silently
  mis-splitting) any shell metacharacters it can't safely handle.
- `skills/generate-goal/SKILL.md` — the goal generator: drafts an internal
  `checks[]` record first (assertion + executable `verify` command +
  per-check `groundedIn` + balanced positive/negative cases) and composes
  the final `/goal`-shaped prose from it — never the reverse — then scores
  the full checklist, actually executes a reference-solution smoke test
  before shipping, drafts L3 frontmatter with `conceptType: 'semantic'`
  (via `ARTIFACT_TYPE_METADATA.goals`), and finishes the same grade →
  persist sequence every generator shares.
- `lib/loop-checklist.mjs` — the deterministic subset of the loop
  generator's authoring checklist: a frozen `LOOP_CHECKLIST` naming all 5
  items, with `scoreDeterministicChecklist(content)` mechanically scoring
  the 2 a plain function can check (`patternNamed` via
  `extractDeclaredPattern` — recognizing an explicit `Pattern: <name>.`
  declaration against `SIX_AGENT_PATTERNS`, Anthropic's six named agent
  patterns — and `explicitStopCondition`, an explicit `Stop condition:`
  section with real content, not an empty or newline-severed header). Also
  exports `assertPatternSelectionGrounded` (the pattern selection record
  carries a non-empty rationale, traceable to the
  Building-Effective-Agents/ReAct evidence the source doc cites).
- `lib/loop-dry-run.mjs` — a "sandboxed dry-run harness" made real:
  `dryRunLoop` actually runs a caller-supplied `step`/`isDone` pair against
  a scripted mock environment (no real side effects) and reports whether
  the declared stop condition genuinely fires (`stoppedBy: 'condition'` or
  `'iteration-cap'`) or never does (`ranAway: true`, caught by a hard
  ceiling independent of anything the loop itself declares) — proving
  achievability the same way `lib/verify-command-runner.mjs` does for a
  goal's verify command, not a simulation of a simulation.
- `skills/generate-loop/SKILL.md` — the loop generator: classifies the
  requested behavior against Anthropic's six named agent patterns, refuses
  to default to "fully autonomous" without real justification, requires an
  explicit stop condition, actually dry-runs it via `dryRunLoop` before
  shipping, drafts L3 frontmatter with `conceptType: 'procedural'` (via
  `ARTIFACT_TYPE_METADATA.loops`), and finishes the same grade → persist
  sequence every generator shares.
- `lib/eval-suite-checklist.mjs` — the deterministic subset of the
  eval-suite generator's authoring checklist: a frozen
  `EVAL_SUITE_CHECKLIST` naming all 5 items, with
  `scoreDeterministicChecklist(content)` mechanically scoring the 3 a plain
  function can check (`graderTypeNamed` via `extractGraderType` against
  `GRADER_TYPES` — Anthropic's three documented grader types —
  `hasGoldenSetReference`, and `calibrationRequiredForLLMGraders`,
  vacuously true for a non-LLM-based grader and requiring actual
  calibration language otherwise).
- `lib/eval-suite-calibration-wiring.mjs` — a calibration cadence made
  real: `assertEvalSuiteCalibrationWired` wires a generated eval suite
  into `lib/calibration.mjs`'s EXISTING `isCalibrated`/`needsRecalibration`
  machinery for the artifact type the suite grades, rather than
  reinventing calibration tracking — an LLM-based suite with no recorded
  run, or a stale one, is rejected before it ships; a code-based or human
  grader is exempt (no LLM-judge drift to calibrate against).
- `skills/generate-eval-suite/SKILL.md` — the eval-suite generator: unlike
  the other five, its own product IS a grader for some other target
  artifact type. Names the grader type, grades the target artifact rather
  than the path taken to reach it, names a concrete golden set, wires an
  LLM-based suite into the real calibration cadence before shipping,
  drafts L3 frontmatter with `conceptType: 'semantic'` (via
  `ARTIFACT_TYPE_METADATA['eval-suites']`), and finishes the same
  grade → persist sequence every generator shares.
- `lib/subagent-checklist.mjs` — the deterministic subset of the subagent
  generator's authoring checklist: a frozen `SUBAGENT_CHECKLIST` naming
  all 5 items, with `scoreDeterministicChecklist(content)` mechanically
  scoring the 3 a plain function can check by parsing the frontmatter
  block (`hasFrontmatterFields` — name/description/tools all present —
  `descriptionStatesBoundary`, and `descriptionStatesTrigger`). Also
  exports `assertSubagentProvenanceRecorded` (names the parent
  skill/command and, optionally, the tool-schema artifacts depended on —
  `dependsOnToolSchemas: []` is valid, a soft dependency).
- `lib/subagent-delegation-harness.mjs` — "prove correct delegation, not
  just correct output" made real: `scoreDelegationCases` scores a real
  decision function (the invoking agent's own delegation judgment) against
  hit-and-miss test cases, and `assertTestsBoundary` rejects a suite that
  only tests hits or only misses — a description's BOUNDARY is what
  actually prevents mis-delegation, so a one-sided suite never really
  tests it.
- `skills/generate-subagent/SKILL.md` — the subagent generator: applies the
  full structured-prompting checklist to the system prompt, separately
  validates the frontmatter contract (sharply scoped tools, a description
  stating both a trigger and a boundary), constructs a real hit-and-miss
  delegation suite before shipping, drafts L3 frontmatter with
  `conceptType: 'procedural'` (via `ARTIFACT_TYPE_METADATA.subagents`), and
  finishes the same grade → persist sequence every generator shares.
- `lib/tool-schema-checklist.mjs` — the deterministic subset of the
  tool-schema generator's authoring checklist, with a HIGHER deterministic
  ratio (4 of 5 items) than the other five generators — this artifact
  type's own criteria (recursion, numerical bounds, regex) is genuinely
  mechanical, unlike the others' prose judgment. A frozen
  `TOOL_SCHEMA_CHECKLIST`, `scoreDeterministicChecklist(content)` (parses
  the schema JSON and walks it for `isValidJSON`, `noRecursiveSchema` via
  `hasRecursiveSchema` — a real structural walk tracking JSON-Pointer
  ancestor paths, not a literal `"$ref": "#"` string search —
  `noNumericalBoundConstraints`, `noComplexRegex`), and
  `assertDerivationChoiceRecorded` (an explicit derivation strategy from
  the three prior-art strategies AutoGen/Semantic Kernel/CrewAI use, and an
  explicit Instructor-vs-Outlines output-logic fork — never left
  implicit).
- `lib/tool-schema-pin.mjs` — a "single source of typed truth" made real:
  `resolveToolSchemaPin` resolves a dependent artifact's pin (e.g. a
  subagent's `dependsOnToolSchemas[]`) against `lib/xdg-store.mjs`'s
  EXISTING `current.json` pointer, rather than a second, separately-tracked
  version number — and throws if the schema has no promoted version yet,
  so nothing can pin against an ungated draft.
- `skills/generate-tool-schema/SKILL.md` — the tool-schema generator: picks
  a derivation strategy and an output-logic fork explicitly, authors real
  JSON Schema within the Structured Outputs supported subset, runs a
  schema-conformance round-trip proving a real model call never falls back
  to an unstructured response, drafts L3 frontmatter with
  `conceptType: 'procedural'` (via `ARTIFACT_TYPE_METADATA['tool-schemas']`),
  and finishes the same grade → persist sequence every generator shares —
  plus the pin-resolution step other generators depend on.
- `lib/artifact-manifest.mjs` — a cross-cutting SHOULD-level "signed
  manifest": `buildArtifactManifest` reassembles a C2PA-style manifest from
  fields a generator's own frontmatter ALREADY declared (motivation from
  the `derived-from` entries in `relationships[]`, source grounding from
  `citations[]`, generation steps from `extensions.artifactAuthoring`, when
  they were declared from `temporal.recordedAt`) — it does not
  independently verify, sign, or attest to any of it, and every manifest
  it builds carries its own `disclaimer` field saying so explicitly.
  `formatManifestForInspection` renders one as human-readable text and
  `assertManifestReadyToSurface` is a **structural** completeness check
  only — passing it means a manifest with the required fields exists to
  show, never that the artifact's declarations are true. Wired into
  `skills/persist-artifact/SKILL.md` as its final step, run once per
  artifact right after promotion, so every artifact leaving the authoring
  session gets one: artifacts are **untrusted until a human or downstream
  system inspects this manifest and the artifact's own content directly**.

`npm test` (Node's built-in test runner) covers all of the above,
including a **real cross-process** concurrency test for the store
(separate OS processes, not same-thread async calls, so it actually
exercises the `EEXIST`-retry path under real contention), a real
request → artifact → evaluation trace round-trip, the real initial
calibration pass across all 6 golden sets, full `persistDraftArtifact`
round-trips for every generator's worked examples, real subprocess
executions proving the goal generator's achievability smoke test is a
real execution, real dry-run executions proving the loop generator's
dry-run harness is likewise real, real calibration-log exercises proving
the eval-suite generator's calibration-cadence wiring checks an actual
recorded run, real delegation-scoring exercises proving the subagent
generator's delegation eval is a real scored execution, and real
schema-tree walks and store round-trips proving the tool-schema
generator's checklist and pin mechanism are not documented assumptions
either.
