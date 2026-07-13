---
id: claude-code-plugins-claude-artifact-authoring-readme
type: semantic
created: '2026-07-13T00:00:00Z'
namespace: claude-code-plugins/claude-artifact-authoring
modified: '2026-07-13T20:00:17.668Z'
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

This plugin is specified by
[`claude-artifact-authoring-plugin.ai-architecture-doc.md`](https://github.com/modeled-information-format/claude-code-plugins/issues/40)
and is being built out via [Epic #40](https://github.com/modeled-information-format/claude-code-plugins/issues/40)
and its 14 Stories. This README will grow generator-by-generator as each Story
lands; as of this Story (S0), only the plugin scaffold exists — no generator is
implemented yet.

## Install

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
