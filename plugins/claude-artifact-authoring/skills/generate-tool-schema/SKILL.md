---
name: generate-tool-schema
description: Generate a JSON Schema tool/parameter definition within Anthropic's Structured Outputs / Strict Tool Use supported subset — no recursive schemas, no numerical min/max constraints, no complex regex — rejecting rather than silently emitting anything unsupported. Use this skill whenever a request asks for a new tool schema to be authored, not hand-drafted ad hoc.
argument-hint: "<tool purpose/signature> <derivation source (docstring/annotated method/YAML spec)>"
---

# generate-tool-schema

Story S11's implementation of Epic #40's generator template
(`REQ[Request + sources] → CK[Scored checklist] → DRAFT → META → VER → JUDGE
→ SHIP`), specialized for the tool-schema artifact type. Its output (a
schema's promoted version) is what Story S10's subagent generator pins
against via `dependsOnToolSchemas[]` — this Story is a real dependency of
S10, not just a documented one.

## 1. Generation

1. **Pick a derivation strategy explicitly** — one of the three prior-art
   strategies Task #89 names: `docstring-derived` (AutoGen), `annotated-
   method-derived` (Semantic Kernel), or `separate-yaml-derived` (CrewAI).
2. **Pick the output-logic fork explicitly** — `validate-and-retry`
   (Instructor's approach: call, validate the response against the schema,
   retry on failure) or `constrained-decoding` (Outlines' approach: the
   model literally cannot emit a non-conforming token). Never leave this
   implicit or default silently to one.
3. **Author real JSON Schema within the supported subset.** Reject —
   never silently emit — a schema relying on:
   - **Recursive schemas** (a `$ref` resolving back to an ancestor,
     including the root: `"$ref": "#"`). `golden-sets/tool-schemas.json`'s
     `bad-recursive-tree-schema` entry is this exact anti-pattern.
   - **Numerical bound constraints** (`minimum`/`maximum`/
     `exclusiveMinimum`/`exclusiveMaximum`/`multipleOf`). Bound-checking
     belongs in application code after generation.
   - **Regex constraints** (`pattern`). Format validation belongs in
     application code, same reasoning.
   Nested-but-non-recursive schemas (an array of objects, none of which
   `$ref` an ancestor) ARE supported —
   `golden-sets/tool-schemas.json`'s `good-nested-but-non-recursive-schema`
   entry is the shape AutoGen/Semantic Kernel actually produce from typed
   signatures.
4. Score the drafted schema against every item in
   `lib/tool-schema-checklist.mjs`'s `TOOL_SCHEMA_CHECKLIST` — **all
   five**:
   - Call `scoreDeterministicChecklist(schemaJsonText)` for `isValidJSON`,
     `noRecursiveSchema`, `noNumericalBoundConstraints`, `noComplexRegex`.
   - Score `parameterDescriptionsClear` yourself, using G-Eval two-stage
     ordering — every parameter's description must be sufficient for a
     model to use it correctly with no external docs.
5. **Feedback loop.** If any item fails, revise and re-score — never ship
   a schema relying on an unsupported keyword by reasoning "the compiler
   will probably ignore it"; it must be rejected outright.

## 2. Provenance

1. **Draft L3 frontmatter — `mif-docs:mif-frontmatter` skill.** Cite
   [Epic #40](https://github.com/modeled-information-format/claude-code-plugins/issues/40)
   plus the specific tool/function this schema was derived from.
   `provenance.sourceType: system_generated`, `temporal` from
   `ARTIFACT_TYPE_METADATA['tool-schemas']` (`conceptType: 'procedural'`),
   `relationships[]` (`derived-from`, `relates-to`,
   `harness:generated-for` targeting
   `urn:mif:topic:claude-artifact-authoring:tool-schemas`).
2. **Record the derivation choice explicitly (Task #89)** — validate with
   `assertDerivationChoiceRecorded({ derivationStrategy, outputLogic })`
   (`lib/tool-schema-checklist.mjs`) before writing; it throws on an
   unrecognized or missing value for either. E.g.:
   ```yaml
   extensions:
     claudeArtifactAuthoring:
       generatorType: tool-schemas
       checklist:
         isValidJSON: pass
         noRecursiveSchema: pass
         noNumericalBoundConstraints: pass
         noComplexRegex: pass
         parameterDescriptionsClear: pass
       derivationStrategy: annotated-method-derived
       outputLogic: constrained-decoding
       revision: 1
   ```
3. **Write the draft — `persistDraftArtifact()`.** Start a
   `"generation-request"` span and pass its `traceId` down, exactly as
   Stories S6-S10's generators do.

## 3. Eval (Task #93)

1. Run `skills/grade-artifact/SKILL.md`'s sequence:
   `assertCalibrated('tool-schemas')` first (stop if it throws), judge with
   G-Eval two-stage ordering against `golden-sets/tool-schemas.json`'s
   stated criteria, record the eval span.
2. **Schema-conformance round-trip test.** Construct a real sample payload
   matching the drafted schema and validate it (via whatever JSON Schema
   validator the invoking environment provides — this plugin stays
   zero-runtime-dep, so this step uses an external validator, not a
   bundled one). Confirm the payload validates AND that a real model call
   against this schema never falls back to an unstructured, refusal-shaped
   response — if it does, the schema itself is the likely cause (an
   overlooked unsupported keyword the deterministic checklist somehow
   missed) and must be revised, not worked around downstream.
3. If either the checklist or the round-trip test fails, return to
   Generation step 5's feedback loop rather than persisting a failing schema.

## 4. Persistence (Task #91)

Once eval passes, finish `skills/persist-artifact/SKILL.md`'s stamp → gate
→ promote → index sequence. Then, **because this schema's promoted
version is what other artifacts pin against** (subagents from Story S10,
evals from Story S9 — Task #91's "single source of typed truth"), any
generator recording a dependency on this schema resolves the pin via
`resolveToolSchemaPin(slug, root)` (`lib/tool-schema-pin.mjs`) — which
reads `lib/xdg-store.mjs`'s own `current.json` pointer, not a second,
separately-tracked version number. It throws if the schema has no promoted
version yet: a dependent artifact cannot pin against a draft that never
passed the gate.

## 5. Worked-example verification (Task #93)

`test/generate-tool-schema-pipeline.test.mjs` exercises the pipeline end
to end against `golden-sets/tool-schemas.json`'s `good-flat-search-tool-
schema` entry: drafts frontmatter with `conceptType: 'procedural'` from
`ARTIFACT_TYPE_METADATA['tool-schemas']`, asserts
`validateFrontmatterContract` returns zero errors, runs a full
`persistDraftArtifact` round-trip, and actually resolves a real pin via
`resolveToolSchemaPin` against the promoted version to prove Task #91's
"single source of truth" is a real, checkable mechanism.
