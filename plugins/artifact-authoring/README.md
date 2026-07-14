---
id: claude-code-plugins-artifact-authoring-readme
type: semantic
created: '2026-07-13T00:00:00Z'
namespace: claude-code-plugins/artifact-authoring
temporal:
  '@type': TemporalMetadata
  validFrom: '2026-07-13T00:00:00Z'
  recordedAt: '2026-07-13T00:00:00Z'
  ttl: P90D
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
modified: '2026-07-14T09:47:22.906Z'
---

# artifact-authoring

Generates AI-interaction artifacts — prompts, goals, loops, eval-suites,
subagent definitions, and tool schemas — from a request plus grounding
sources. Each one is scored against a type-specific checklist, graded by a
calibrated judge, and persisted as a versioned document so it's discoverable
across projects instead of a one-off file.

## Install

```
/plugin marketplace add modeled-information-format/claude-code-plugins
/plugin install artifact-authoring@modeled-information-format
```

## Use

Just ask for what you want generated — Claude picks the matching skill:

- "Generate a prompt for reviewing pull requests" → `generate-prompt`
- "Generate a goal for fixing this flaky test" → `generate-goal`
- "Generate a loop that retries deploys until healthy" → `generate-loop`
- "Generate an eval suite for the goal generator" → `generate-eval-suite`
- "Generate a subagent for triaging bug reports" → `generate-subagent`
- "Generate a tool schema for a search function" → `generate-tool-schema`

Each generator drafts the artifact, scores it, grades it, and persists it
under `$XDG_DATA_HOME/artifact-authoring/` — you get back a versioned file
with full provenance, not scratch output.

## Depends on

`mif-docs@modeled-information-format` — for frontmatter authoring, provenance
stamping, and validation.

## More

See [docs/internals.md](docs/internals.md) for module-by-module internals
documentation.

## License

MIT
