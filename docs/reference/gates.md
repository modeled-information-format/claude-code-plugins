---
title: Gates reference
diataxis_type: reference
---
# Gates reference

Every gate is a **thin, SHA-pinned caller** of a central
`modeled-information-format/.github` reusable workflow. The scanning gates normalize on
SARIF and surface in the repository **Security** tab; the "Code scanning results"
check is the actual merge gate, so those gates **soft-fail** (report findings, do
not fail their own job). A few gates **hard-fail** by design — they block
directly.

> **Every gate is risk-reducing, not risk-eliminating.** A scanner reports the
> classes of problem it knows about; passing a gate is not a proof of safety.

## Scanning and validation gates

| Gate | Tool | Reusable | Fail mode | Release predicate |
| --- | --- | --- | --- | --- |
| SAST | CodeQL (`languages: actions`) | `reusable-sast-codeql.yml` | soft (Security tab) | `sast/v1` |
| SCA | OSV-Scanner + dependency review | `reusable-sca-osv.yml` | soft (Security tab) | `sca/v1` |
| License / misconfig | Trivy | `reusable-trivy.yml` | soft (Security tab) | `iac-license/v1` |
| ShellCheck | ShellCheck | `reusable-shellcheck.yml` | soft (Security tab) | `shellcheck/v1` |
| Semgrep | Semgrep | `reusable-semgrep.yml` | soft (Security tab) | `semgrep/v1` |
| Secrets | Gitleaks + TruffleHog | `reusable-secrets.yml` | **hard** — TruffleHog hard-fails on verified live secrets | `secrets/v1` |
| Manifest review | manifest-review | `reusable-manifest-review.yml` | **hard** | `manifest/v1` |
| Scorecard | OpenSSF Scorecard | `reusable-scorecard.yml` | soft (Security tab) | — (repo-level signal, not an artifact verdict) |
| pin-check | (assert every `uses:` is a 40-char SHA) | `pin-check.yml` | **hard** (required check) | — |
| Manifest validation | `claude plugin validate` | inline (canonical) | **hard** | — |

### What each gate scans

- **SAST (CodeQL).** This repo's **own GitHub Actions workflow YAML**, not the
  plugin payloads — see the CodeQL note below.
- **SCA (OSV).** Dependencies of bundled MCP servers.
- **License / misconfig (Trivy).** The repo and its bundled assets for license
  and misconfiguration findings.
- **ShellCheck.** Hook scripts (e.g. `plugins/*/hooks/*.sh`).
- **Semgrep.** MCP-server and other source for code-pattern findings.
- **Secrets.** Repo history and working tree. **TruffleHog hard-fails when it
  verifies a live secret** — a verified credential blocks, it does not merely
  report.
- **Manifest review.** `marketplace.json` and the plugin manifests, asserting the
  marketplace-integrity invariants: every external plugin source is SHA-pinned,
  the marketplace `name` is not a reserved name, and required fields are present.
- **Scorecard.** Repo-level supply-chain posture; informational, not an artifact
  verdict.
- **`claude plugin validate`.** The canonical structural check of the catalog and
  plugin manifests.

> **CodeQL has no HCL or plugin extractor.** CodeQL works by extracting a
> queryable database from source in a language it understands; there is no
> extractor for plugin manifests, hooks, or skills. So the SAST gate is
> configured `languages: actions` — it analyzes this repo's own workflow YAML,
> which *is* a supported CodeQL target and a real supply-chain attack surface.
> Plugin shell, source, and manifests are covered instead by ShellCheck, Semgrep,
> secret scanning, and manifest-review. "SAST is green" must not be misread as
> "the plugin payload was statically analyzed by CodeQL" — it was not.

## Release attestations

At release, each artifact-characterizing gate verdict is turned into a signed,
digest-bound attestation, then re-checked **fail-closed** before publish.

| Produces | Signer | Predicate |
| --- | --- | --- |
| SLSA build provenance (per plugin tarball) | this repo's release workflow (`actions/attest-build-provenance`) | `https://slsa.dev/provenance/v1` |
| CycloneDX SBOM (per plugin tarball) | this repo's release workflow (Syft + `actions/attest-sbom`) | `https://cyclonedx.org/bom` |
| SAST verdict | seam (`reusable-attest-scan.yml`) | `.../attestations/sast/v1` |
| SCA verdict | seam | `.../attestations/sca/v1` |
| License / misconfig verdict | seam | `.../attestations/iac-license/v1` |
| ShellCheck verdict | seam | `.../attestations/shellcheck/v1` |
| Semgrep verdict | seam | `.../attestations/semgrep/v1` |
| Secrets verdict | seam | `.../attestations/secrets/v1` |
| Manifest-review verdict | seam | `.../attestations/manifest/v1` |
| `marketplace.json` catalog signature | this repo's signing workflow (cosign keyless) | — (cosign blob bundle, not an in-toto predicate) |

The custom-predicate namespace is
`https://modeled-information-format.github.io/attestations/<gate>/v1`.

> **Signed ≠ passed.** A verified attestation proves a gate *ran and recorded a
> verdict* bound to the artifact digest. The verdict itself is in the predicate
> body.

## Bootstrap pin (gates pending #12)

The five plugin-specific gate reusables — `reusable-shellcheck.yml`,
`reusable-semgrep.yml`, `reusable-secrets.yml`, `reusable-manifest-review.yml`,
and the cosign-sign reusable — are proposed in
[modeled-information-format/.github#12](https://github.com/modeled-information-format/.github/pull/12)
and not yet merged. Their callers are pinned to the PR branch commit
**`d4467d5`** until #12 merges, then re-pinned to the merged `main` SHA.
Dependabot's `github-actions` updater keeps the pins fresh.
