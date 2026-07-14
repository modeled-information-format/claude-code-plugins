---
id: claude-code-plugins-claude-artifact-authoring-readme
type: semantic
created: '2026-07-13T00:00:00Z'
namespace: claude-code-plugins/claude-artifact-authoring
modified: '2026-07-14T02:22:19.460Z'
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

# claude-artifact-authoring

Generates high-quality AI-interaction artifacts — prompts, goals, loops,
eval-suites, subagent definitions, and tool schemas — from a natural-language
request plus grounding sources. Every generator shares one pipeline: a scored
authoring checklist, a calibrated eval, and MIF Level-3 provenance persisted to
a central `XDG_DATA_HOME` artifact store, so generated artifacts are versioned,
graded, and discoverable across projects rather than one-off files.

This plugin's design is specified in the architecture doc referenced by
[Epic #40](https://github.com/modeled-information-format/claude-code-plugins/issues/40),
which tracks its build via 14 Stories. This README will grow
generator-by-generator as each Story lands; as of this Story (S8), the plugin
scaffold, the central `XDG_DATA_HOME` artifact store, the cross-cutting
persistence pipeline, the OTel-compatible trace substrate, the
calibrated-grading framework (with real golden sets for all 6 artifact
types), central-corpus discovery indexing, and the first three generators
(**prompt**, **goal**, **loop**) exist.

## Internals

- `lib/xdg-store.mjs` — the central artifact store: resolves
  `${XDG_DATA_HOME:-~/.local/share}/claude-artifact-authoring/<type>/<slug>/`,
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
  `${XDG_STATE_HOME:-~/.local/state}/claude-artifact-authoring/traces.jsonl`
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
  `${XDG_DATA_HOME:-~/.local/share}/claude-artifact-authoring/corpus/vectors.db`,
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
  `${XDG_STATE_HOME:-~/.local/state}/claude-artifact-authoring/calibration-runs.jsonl`,
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
- `npm test` (Node's built-in test runner) covers all of the
  above, including a **real cross-process** concurrency test for the store
  (separate OS processes, not same-thread async calls, so it actually
  exercises the `EEXIST`-retry path under real contention), a real
  request → artifact → evaluation trace round-trip, the real initial
  calibration pass across all 6 golden sets, full `persistDraftArtifact`
  round-trips for the prompt, goal, and loop generators' worked examples,
  **real subprocess executions** (a genuinely passing, a genuinely failing,
  and a genuinely timed-out reference solution) proving the goal
  generator's achievability smoke test is a real execution, and **real
  dry-run executions** (a condition that fires, an iteration cap that
  fires, and a broken stop condition caught by the hard ceiling) proving
  the loop generator's dry-run harness is likewise real, not simulated.

## Install

**Not yet installable** — this plugin isn't registered in
`.claude-plugin/marketplace.json` yet (that's Story S12, the last Story in
Epic #40's build order). Once it is:

```
/plugin marketplace add modeled-information-format/claude-code-plugins
/plugin install claude-artifact-authoring@modeled-information-format
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
| Eval-suite | S9 (#68) | Not started |
| Subagent-definition | S10 (#73) | Not started |
| Tool-schema | S11 (#77) | Not started |
