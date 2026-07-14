---
id: security-verify-a-release
type: procedural
created: '2026-07-14T00:00:00Z'
title: Verify a release
diataxis_type: how-to
provenance:
  '@type': Provenance
  agent: claude-code/claude-sonnet-5
  wasGeneratedBy:
    '@id': urn:mif:activity:claude-code-session:3921fa8c-0b9e-410e-b53c-6cf81b074757
    '@type': prov:Activity
  trustLevel: user_stated
  agentVersion: 2.1.208
modified: '2026-07-14T05:24:40.577Z'
---
# Verify a release

In-pipeline green is not the acceptance test. Before you trust a plugin or the
catalog that served it, re-verify the attestations yourself from a clean
workstation. There are no long-lived signing keys — everything is Sigstore
keyless (OIDC, Fulcio, Rekor), so anyone can re-check.

This walkthrough mirrors the commands in
[SECURITY.md](https://github.com/modeled-information-format/claude-code-plugins/blob/main/SECURITY.md#verify-a-plugin-release) with more narrative.
Keep SECURITY.md as the terse reference; read this when you want to understand
what each step asserts.

## Prerequisites

- [GitHub CLI](https://cli.github.com/) `gh` ≥ 2.49.0, authenticated
  (`gh auth login`)
- [`cosign`](https://github.com/sigstore/cosign) for the catalog signature

Set the variables once. **Substitute the real tarball filename** for the plugin
you downloaded.

```bash
TARBALL="artifact-authoring-0.2.0.tar.gz"   # the downloaded plugin tarball
REPO="modeled-information-format/claude-code-plugins"
SEAM="modeled-information-format/.github/.github/workflows/reusable-attest-scan.yml"
```

## 1. Provenance and SBOM — was it built here, from what?

These two attestations are produced by this repo's own release workflow, so they
verify against the repo with `--repo`. Provenance answers *who built this and
from which commit*; the SBOM answers *what is inside it*.

```bash
gh attestation verify "$TARBALL" --repo "$REPO" \
  --predicate-type https://slsa.dev/provenance/v1

gh attestation verify "$TARBALL" --repo "$REPO" \
  --predicate-type https://cyclonedx.org/bom
```

A passing run prints `✓ Verification succeeded!` and exits `0`. Provenance that
verifies means the tarball was built by this repo's workflow from a named commit
and has not been tampered with since signing.

## 2. Gate verdicts — what was scanned, and did it run?

The artifact-characterizing gate verdicts are signed by the **central
attestation seam** (`reusable-attest-scan.yml`), not by this repo's own workflow.
Under SLSA Build L3 the Fulcio signer identity is that central workflow, so
`--owner`/`--repo` alone is not enough — you must pin `--signer-workflow`, one
predicate per command:

```bash
for pt in shellcheck semgrep secrets manifest sast sca iac-license; do
  gh attestation verify "$TARBALL" --owner modeled-information-format \
    --signer-workflow "$SEAM" \
    --predicate-type "https://modeled-information-format.github.io/attestations/${pt}/v1"
done
```

Each command asserts that the named gate **ran and recorded a verdict** bound to
this tarball's digest. That is a different and stronger claim than "the gate was
green in a tab somewhere" — the verdict travels with the artifact.

> **Signed ≠ passed.** Verification proves the gate ran and recorded a verdict for
> this exact digest. It does not certify the plugin is benign — read the predicate
> body for the verdict itself, and remember every gate is risk-reducing, not
> risk-eliminating.

## 3. The catalog signature — is this the list this repo published?

The `marketplace.json` catalog is a blob, not an OCI image, so it is signed with
**cosign keyless** rather than the GitHub attestations API. Verify the catalog
you fetched against its detached bundle:

```bash
cosign verify-blob .claude-plugin/marketplace.json \
  --bundle marketplace.json.cosign.bundle \
  --certificate-identity-regexp '^https://github\.com/modeled-information-format/\.github/\.github/workflows/reusable-cosign-sign\.yml@' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

The two `--certificate-*` flags are what make this meaningful:
`--certificate-identity-regexp` pins the **signer workflow** — keyless signing binds
the cert to the central `reusable-cosign-sign.yml` in `modeled-information-format/.github`
that ran the signing job, not to this repo — and
`--certificate-oidc-issuer` pins the issuer to GitHub Actions. A signature that
only verifies under some other identity or issuer is not this catalog — treat it
as an impersonation.

## What a failure means

A failed verification exits non-zero. **Treat any verification failure as a
supply-chain integrity breach — do not install or use the artifact.** Do not work
around it, re-download blindly, or assume a flake; a real failure here means the
artifact is not what it claims to be.

## A note on install-time verification

These commands are how a consumer verifies *today*, because Claude Code does not
verify plugin signatures or attestations at install time yet (tracked upstream:
[anthropics/claude-code#30727](https://github.com/anthropics/claude-code/issues/30727)).
The marketplace's fail-closed guarantee therefore lives at **catalog admission**
(a plugin SHA enters the catalog only if its attestations verify in CI), backed
by a SHA-pinned and cosign-signed catalog. Running the steps above is how you
extend that guarantee to your own machine until native install-blocking lands.
See [how the marketplace attests plugins](https://modeled-information-format.github.io/claude-code-plugins/explanation/attested-marketplace/)
for the reasoning.
