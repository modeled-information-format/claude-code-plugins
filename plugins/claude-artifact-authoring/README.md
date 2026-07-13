---
id: claude-code-plugins-claude-artifact-authoring-readme
type: semantic
created: '2026-07-13T00:00:00Z'
namespace: claude-code-plugins/claude-artifact-authoring
modified: '2026-07-13T20:47:19.929Z'
temporal:
  '@type': TemporalMetadata
  validFrom: '2026-07-13T00:00:00Z'
  recordedAt: '2026-07-13T00:00:00Z'
  ttl: P90D
provenance:
  '@type': Provenance
  agent: claude-code/claude-sonnet-5
  wasGeneratedBy:
    '@id': urn:mif:activity:claude-code-session:59776443-e228-4bd8-a2bd-e6be3c2a7f34
    '@type': prov:Activity
  trustLevel: user_stated
  agentVersion: 2.1.207
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
generator-by-generator as each Story lands; as of this Story (S2), the plugin
scaffold, the central `XDG_DATA_HOME` artifact store, and the cross-cutting
persistence pipeline exist — no generator is implemented yet.

## Internals

- `lib/xdg-store.mjs` — the central artifact store: resolves
  `${XDG_DATA_HOME:-~/.local/share}/claude-artifact-authoring/<type>/<slug>/`,
  validates `type`/`slug`/`filename` as safe single path segments (no path
  traversal), writes collision-safe version directories (`v1/`, `v2/`, ...),
  and promotes one version to `current.json` via an atomic write-then-rename.
- `lib/frontmatter-contract.mjs` — validates a drafted frontmatter against
  the four elements every persisted artifact must carry: `citations[]`,
  a `provenance` block (`sourceType: system_generated`), `temporal`
  (`validFrom`/`recordedAt`/`ttl`), and `relationships[]` (`derived-from`,
  `relates-to`, `harness:generated-for`).
- `lib/mif-docs-dependency.mjs` — resolves the installed `mif-docs` plugin's
  directory under `${CLAUDE_CONFIG_DIR:-~/.claude}/plugins/cache/...`, or
  throws a clear, actionable error naming exactly what's missing — never a
  silent no-op.
- `lib/persist-artifact.mjs` — the deterministic half of the persistence
  pipeline: validates the contract, confirms the dependency, and writes an
  **unpromoted** draft version. `skills/persist-artifact/SKILL.md` documents
  the full four-step sequence (draft via `mif-frontmatter` → write via this
  module → stamp via `mif-provenance` → gate via `mif-validate`, only then
  promote) that every generator Story (S6-S11) runs at the end of its own
  pipeline.
- `npm test` (Node's built-in test runner, 36 tests) covers all of the
  above, including a **real cross-process** concurrency test for the store
  (separate OS processes, not same-thread async calls, so it actually
  exercises the `EEXIST`-retry path under real contention).

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
| Prompt | S6 (#59) | Not started |
| Goal | S7 (#62) | Not started |
| Loop | S8 (#64) | Not started |
| Eval-suite | S9 (#68) | Not started |
| Subagent-definition | S10 (#73) | Not started |
| Tool-schema | S11 (#77) | Not started |
