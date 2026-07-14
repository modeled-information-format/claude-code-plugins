---
id: reference-registered-plugins
type: semantic
created: '2026-07-14T00:00:00Z'
title: Registered plugins
diataxis_type: reference
provenance:
  '@type': Provenance
  agent: claude-code/claude-sonnet-5
  wasGeneratedBy:
    '@id': urn:mif:activity:claude-code-session:3921fa8c-0b9e-410e-b53c-6cf81b074757
    '@type': prov:Activity
  trustLevel: user_stated
  agentVersion: 2.1.208
modified: '2026-07-14T05:17:40.439Z'
---
# Registered plugins

Every plugin listed here is SHA-pinned in [`marketplace.json`](https://github.com/modeled-information-format/claude-code-plugins/blob/main/.claude-plugin/marketplace.json) and passed the [attested admission gates](/claude-code-plugins/explanation/attested-marketplace/) before being added to the catalog.

## mif-docs

MIF-first documentation skill suite: one skill per document genre (Diataxis, ADR, RFC/PEP, runbook, PRD, Kiro, arc42/C4, changelog) over a MIF L1-L3 floor.

| Field | Value |
| --- | --- |
| Source | [modeled-information-format/mif-docs-plugin](https://github.com/modeled-information-format/mif-docs-plugin) |
| Ref | `v0.4.3` |
| Category | documentation |
| License | MIT |
| Keywords | documentation, mif, adr, diataxis, rfc, runbook, prd, spec |

## modeled-information-format

Signed, SLSA-attested, fail-closed-verified releases: central reusable signing/seam/verify workflows and independent `gh attestation verify`.

| Field | Value |
| --- | --- |
| Source | [modeled-information-format/.github](https://github.com/modeled-information-format/.github) (`.github` subdirectory) |
| Ref | `v0.1.0` |
| License | Apache-2.0 |
| Keywords | slsa, attestation, supply-chain, sigstore, sbom, ci-cd, release-signing |

## claude-artifact-authoring

Generates high-quality AI-interaction artifacts (prompts, goals, loops, eval-suites, subagent definitions, tool schemas) from a request plus grounding sources, each with a scored checklist, calibrated eval, and MIF Level-3 provenance.

| Field | Value |
| --- | --- |
| Source | [`./plugins/claude-artifact-authoring`](https://github.com/modeled-information-format/claude-code-plugins/tree/main/plugins/claude-artifact-authoring) (vendored inside this repo — no SHA pin, see [Add a plugin to the catalog](/claude-code-plugins/how-to/add-a-plugin/)) |
| Category | development |
| License | MIT |
| Keywords | prompt-engineering, eval, provenance, mif, agent-authoring, structured-outputs |

## Adding a plugin

See [Add a plugin to the catalog](/claude-code-plugins/how-to/add-a-plugin/).
