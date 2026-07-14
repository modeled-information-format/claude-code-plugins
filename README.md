<p align="center">
  <img src=".github/social-preview.png" width="860"
       alt="claude-code-plugins — an attested Claude Code plugin marketplace. A machine-cyan plugin and its constituents (commands, agents, skills, hooks, MCP) pass through a stack of quality gates to a green attestation seal — SLSA provenance, a CycloneDX SBOM, and cosign — converge on a single light node, and are admitted into the human-amber marketplace.json catalog; an unverified artifact is refused at a red fail-closed branch. Three pillars: signed and attested, admission is the gate, verify it yourself.">
</p>

# claude-code-plugins

An **attested Claude Code plugin marketplace**. Every plugin in this catalog —
and every constituent it ships (commands, agents, skills, hooks, bundled MCP
servers) — is SHA-pinned, scanned across the org's quality gates, signed, and
attested. A plugin's SHA enters the catalog only when its attestations verify
fail-closed in CI.

> The repository is named `claude-code-plugins`, but the marketplace `name` field
> in `.claude-plugin/marketplace.json` is **`modeled-information-format`**.
> `claude-code-plugins` is an Anthropic-**reserved** marketplace name — a repo may
> be named it, a manifest may not. Consumers add the marketplace by repo slug and
> install plugins from the `modeled-information-format` marketplace (below).

## What this is

A plugin marketplace is a `marketplace.json` catalog plus the plugins it lists.
Claude Code resolves it when a user runs `/plugin marketplace add` and installs
plugins from it on demand. The supply-chain problem is the same one the org
solves for binaries and IaC modules: *the thing you verified must be the thing
that runs*. A plugin is executable trust — its commands, hooks, and MCP servers
run inside your environment — so the catalog that hands it to you should carry
proof of what was scanned and signed.

This repo turns the plugin distribution path into an attested one:

- Each plugin tarball gets **SLSA build provenance** and a **CycloneDX SBOM**.
- Each deploy-gating **gate verdict** (SAST, SCA, license/misconfig, ShellCheck,
  Semgrep, secrets, manifest-review) becomes a signed, digest-bound attestation.
- The `marketplace.json` catalog itself is **cosign-signed (keyless)**.
- A plugin SHA is admitted to the catalog **only when all of its attestations
  verify** — admission, not convention, is the gate.

It is built on a three-pillar research synthesis — attestation & signing,
layered scanning, and marketplace integrity — described in
[docs/explanation/attested-marketplace.md](docs/explanation/attested-marketplace.md).

> **Every gate is risk-reducing, not risk-eliminating.** A scanner finds the
> classes of problem it knows about; a signature proves origin and integrity, not
> safety. Attestation narrows the trust surface — it does not vouch that a plugin
> is benign.

## What this catalog ships

Two externally-sourced plugins (`mif-docs`, pinned `github`; `modeled-information-format`,
pinned `git-subdir`) plus one plugin vendored **inside** this repo:

```
.claude-plugin/marketplace.json   # the catalog (name: "modeled-information-format")
plugins/
  claude-artifact-authoring/      # vendored plugin: local-path source, no sha pin
    .claude-plugin/plugin.json
    commands/
    skills/                       # one skill per artifact-authoring pipeline stage
    lib/                          # deterministic checklist/store/provenance modules
external_plugins/                 # empty placeholder for future git-subdir + sha plugins
docs/                             # Diátaxis docs (this README links into them)
```

`plugins/claude-artifact-authoring/` exercises attest → scan → verify on real
content so the pipeline is proven on a vendored plugin, not only external ones.
`external_plugins/` is reserved for future plugins referenced by `git-subdir`
plus a 40-char `sha` pin. See [Registered plugins](docs/reference/registered-plugins.md)
for the full current catalog.

## Quick start

Add this marketplace, then install a plugin from it:

```bash
# in Claude Code
/plugin marketplace add modeled-information-format/claude-code-plugins
/plugin install claude-artifact-authoring@modeled-information-format
```

`claude-artifact-authoring@modeled-information-format` reads as *plugin
`claude-artifact-authoring` from the `modeled-information-format` marketplace* —
the marketplace name, not the repo name.

Before trusting a release, verify it yourself: see
[SECURITY.md](SECURITY.md) and [docs/security/verify.md](docs/security/verify.md).

## Layout (canonical)

The repository follows Anthropic's documented plugin layout.

| Path | Required | Purpose |
| --- | --- | --- |
| `.claude-plugin/marketplace.json` | yes | The catalog: marketplace `name`, `owner`, and the `plugins` list |
| `<plugin>/.claude-plugin/plugin.json` | yes | Per-plugin manifest — required: `name`, `description`, `author.name` |
| `<plugin>/commands/` | optional | Slash commands |
| `<plugin>/agents/` | optional | Subagents |
| `<plugin>/skills/` | optional | Skills |
| `<plugin>/hooks/` | optional | Event hooks (e.g. `hooks.json` + scripts) |
| `<plugin>/.mcp.json` | optional | Bundled MCP server definitions |

Plugin sources support a native **40-char `sha`** pin. When both `ref` and `sha`
are set, the `sha` is the effective pin — the ref is a label, the digest is the
identity.

## Gates and attestations

Each gate is a thin SHA-pinned caller of an `modeled-information-format/.github` central
reusable. The scanning gates normalize on SARIF and surface in the **Security**
tab; deploy-gating verdicts become attestations.

| Gate | Tool | Scans | Fail mode | Release predicate |
| --- | --- | --- | --- | --- |
| SAST | CodeQL (`languages: actions`) | This repo's **own workflows** | soft (Security tab) | `sast/v1` |
| SCA | OSV-Scanner | MCP-server dependencies | soft (Security tab) | `sca/v1` |
| License / misconfig | Trivy | Repo + bundled assets | soft (Security tab) | `iac-license/v1` |
| ShellCheck | ShellCheck | Hook scripts | soft (Security tab) | `shellcheck/v1` |
| Semgrep | Semgrep | MCP / source | soft (Security tab) | `semgrep/v1` |
| Secrets | Gitleaks + TruffleHog | Repo history + tree | **hard** on verified live secrets (TruffleHog) | `secrets/v1` |
| Manifest review | manifest-review | `marketplace.json` + plugin manifests | **hard** | `manifest/v1` |
| Scorecard | OpenSSF Scorecard | Repo posture | soft (Security tab) | — (repo-level signal) |
| Manifest validation | `claude plugin validate` | Catalog + plugin manifests (canonical) | **hard** | — |

> **CodeQL has no HCL or plugin extractor.** SAST therefore analyzes only this
> repo's own GitHub Actions workflow YAML — itself a real supply-chain attack
> surface — *not* the plugin payloads. Plugin shell, source, and manifests are
> covered by ShellCheck, Semgrep, secret scanning, and manifest-review.

**Manifest-review** asserts the marketplace-integrity invariants: every external
plugin source is SHA-pinned, the marketplace `name` is not a reserved name, and
required manifest fields are present.

**Attestation model.** Each plugin tarball carries SLSA build provenance
(`actions/attest-build-provenance`) and a CycloneDX SBOM (Syft +
`actions/attest-sbom`). Each gate verdict is seam-signed by the central
`reusable-attest-scan.yml` under the predicate namespace
`https://modeled-information-format.github.io/attestations/<gate>/v1`. The
`marketplace.json` catalog (a blob, not an OCI image) is signed with **cosign
keyless** (Sigstore Fulcio/Rekor) and verified with `cosign verify-blob`. The
release is fail-closed: nothing publishes unless every attestation verifies.

The full gate table is in [docs/reference/gates.md](docs/reference/gates.md).

## Where "fail-closed" actually lives

Claude Code does **not** verify plugin signatures or attestations at install time
yet (tracked upstream:
[anthropics/claude-code#30727](https://github.com/anthropics/claude-code/issues/30727)).
So this marketplace cannot rely on the installer to refuse an unverified plugin.
Enforcement instead lives at four points:

1. **Catalog admission.** A plugin SHA enters `marketplace.json` only after its
   attestations verify in CI. The unit of trust is the admitted entry, gated at
   merge. Automated re-pins from the central
   [attested catalog-updater](https://github.com/modeled-information-format/.github/tree/main/catalog-update)
   — which fetches each external plugin's latest release, **verifies its
   attestations fail-closed before proposing the bump**, and auto-merges only on
   green — flow through this same admission gate.
2. **SHA-pinned catalog.** External plugin sources are pinned to a 40-char `sha`
   (native), so the cataloged content is immutable — a moved tag cannot swap it.
3. **Cosign-signed catalog.** The catalog blob itself is keyless-signed, so a
   consumer can prove the catalog they fetched is the one this repo published.
4. **Documented consumer verification.** Every release ships copy-pasteable
   `gh attestation verify` and `cosign verify-blob` commands (SECURITY.md) so a
   consumer can re-check before trusting.

Native, install-time, install-blocking verification is the missing piece. It is a
flagged upstream gap, not a property this marketplace can yet enforce. See
[docs/explanation/attested-marketplace.md](docs/explanation/attested-marketplace.md)
for why admission-time enforcement is the right seam regardless.

## Central gate pins

Every gate is a thin caller of the central
[`modeled-information-format/.github`](https://github.com/modeled-information-format/.github)
reusables, pinned to a released commit SHA and kept fresh by Dependabot's
`github-actions` updater.

## Documentation

Docs follow the [Diátaxis](https://diataxis.fr/) framework. Start at
[docs/README.md](docs/README.md).

| Mode | Document |
| --- | --- |
| How-to | [Add a plugin](docs/how-to/add-a-plugin.md) |
| Reference | [Gates](docs/reference/gates.md) |
| Explanation | [Why an attested marketplace](docs/explanation/attested-marketplace.md) |
| Security | [Verify a release](docs/security/verify.md) |

See also [SECURITY.md](SECURITY.md) for vulnerability reporting and the full
verification reference.
