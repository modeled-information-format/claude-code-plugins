---
title: Registered plugins
diataxis_type: reference
---
# Registered plugins

Every plugin listed here is SHA-pinned in [`marketplace.json`](https://github.com/modeled-information-format/claude-code-plugins/blob/main/.claude-plugin/marketplace.json) and passed the [attested admission gates](/claude-code-plugins/explanation/attested-marketplace/) before being added to the catalog.

## mif-docs

MIF-first documentation skill suite: one skill per document genre (Diataxis, ADR, RFC/PEP, runbook, PRD, Kiro, arc42/C4, changelog) over a MIF L1-L3 floor.

| Field | Value |
| --- | --- |
| Source | [modeled-information-format/mif-docs-plugin](https://github.com/modeled-information-format/mif-docs-plugin) |
| Ref | `v0.1.2` |
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

## Adding a plugin

See [Add a plugin to the catalog](/claude-code-plugins/how-to/add-a-plugin/).
