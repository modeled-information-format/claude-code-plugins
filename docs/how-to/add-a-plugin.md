---
id: how-to-add-a-plugin-to-catalog
type: procedural
created: '2026-06-29T18:50:34-04:00'
title: Add a plugin to the catalog
diataxis_type: how-to
provenance:
  '@type': Provenance
  agent: claude-code/claude-sonnet-5
  wasGeneratedBy:
    '@id': urn:mif:activity:claude-code-session:3921fa8c-0b9e-410e-b53c-6cf81b074757
    '@type': prov:Activity
  trustLevel: user_stated
  agentVersion: 2.1.208
modified: '2026-07-14T05:17:55.543Z'
---
# Add a plugin to the catalog

A plugin joins this marketplace by being **cataloged**: its repo attests its own
tarball, you add a SHA-pinned entry to `marketplace.json`, and CI re-verifies
those attestations **fail-closed** before the entry can merge. A plugin SHA that
does not verify does not enter the catalog.

The flow:

```
author plugin → its repo attests its tarball (provenance + SBOM + gate verdicts)
  → add a git-subdir + sha entry to marketplace.json
  → catalog-admission re-verifies the attestations fail-closed
  → merge
```

## Before you start

- The plugin must follow the
  [canonical layout](https://github.com/modeled-information-format/claude-code-plugins/blob/main/README.md#layout-canonical): a
  `.claude-plugin/plugin.json` with required `name`, `description`, and
  `author.name`, plus any of `commands/ agents/ skills/ hooks/ .mcp.json`.
- The plugin's source repo must produce an **attested tarball** — SLSA build
  provenance, a CycloneDX SBOM, and the seam-signed gate verdicts — at a specific
  commit. Catalog admission verifies *those* attestations; it does not re-scan
  the plugin from scratch.

## 1. Resolve the source commit SHA

Pin to an immutable 40-char commit SHA, never a tag or branch. Resolve it at use
time:

```bash
gh api repos/<owner>/<plugin-repo>/git/ref/tags/<tag> \
  --jq '.object.sha'
```

## 2. Add a `git-subdir` + `sha` entry to `marketplace.json`

Append an entry to the `plugins` array. The `sha` is the effective pin — when
both `ref` and `sha` are present, the digest is the identity and the ref is only
a human-readable label.

```jsonc
{
  "name": "<plugin-name>",            // unique within this marketplace
  "description": "<one-line summary>",
  "author": { "name": "<author>" },
  "source": {
    "source": "git-subdir",                          // plugin lives in a subdirectory of a repo
    "url": "https://github.com/<owner>/<repo>.git",  // the external plugin's source repo (full git URL)
    "path": "plugins/<plugin-name>",                 // subdirectory holding the plugin's .claude-plugin/
    "ref": "v1.2.3",                                 // human-readable label (mutable)
    "sha": "<40-char-commit-sha>"                    // EFFECTIVE PIN — immutable identity
  },
  "license": "<SPDX-id>",
  "keywords": ["<...>"]
}
```

> The vendored `claude-artifact-authoring` plugin lives **inside** this repo, so
> its entry uses a local `"source": "./plugins/claude-artifact-authoring"` path
> (just the path string, no `git-subdir`/`ref`/`sha` — a local source isn't
> pinned, since there's no separate repo to pin) rather than the `git-subdir`
> form. External plugins use the `git-subdir` + `sha` form above; a vendored
> plugin doesn't need a source pin at all since it's version-controlled
> alongside this file. See [Registered plugins](/claude-code-plugins/reference/registered-plugins/)
> for its full catalog entry.

## 3. Open a PR — catalog admission runs fail-closed

The **catalog-admission** gate runs on every pull request (so it can be a hard
required status check) and fails closed unless **all** of these hold:

- every external plugin source is pinned to a full 40-char `sha` — a `ref`
  without a `sha` is mutable and rejected;
- the pinned `sha` **actually resolves to a plugin**: admission fetches the
  `.claude-plugin/plugin.json` at that commit and rejects the entry if it is not
  there (this is what stops a pin from pointing at a commit that lacks the
  plugin, or a placeholder SHA);
- the marketplace `name` is not an Anthropic-reserved name;
- `claude plugin validate` passes (canonical manifest check);
- each external entry's pinned release **attestations verify fail-closed** (SLSA
  provenance), using the same verify the central catalog-updater runs.

The soft-fail **manifest-review** (`manifest/v1`) gate reports the same SHA-pin
findings to the Security tab. Make `catalog-admission` a **required** check in
branch protection so the pin requirement is enforced at merge, not by convention.

## 4. Verify, then merge

In-pipeline green is not the acceptance test. Re-verify the pinned plugin's
attestations independently from a clean workstation before approving — the exact
commands are in [SECURITY.md](https://github.com/modeled-information-format/claude-code-plugins/blob/main/SECURITY.md#verify-a-plugin-release) and
[the verification guide](https://modeled-information-format.github.io/claude-code-plugins/security/verify/).

Once admission passes and the attestations re-verify, merge. The merged
`marketplace.json` is re-signed (cosign keyless) as part of the release so
consumers can prove they fetched the catalog this repo published.

## Updating a cataloged plugin

To move a plugin to a newer version, **re-pin its `sha`** to the new commit and
let catalog admission re-verify the new digest's attestations. Never edit a
plugin's content in place behind an unchanged SHA — a different content hash is a
different artifact, and the old attestations do not describe it.

### Automated re-pins (the attested catalog-updater)

You normally don't re-pin external plugins by hand. The central, **verify-first**
catalog-updater hub in
[`modeled-information-format/.github`](https://github.com/modeled-information-format/.github/tree/main/catalog-update)
does it for you: on a schedule it resolves each external entry's **latest
release**, **verifies that release's attestations fail-closed**, and — only if
every required predicate verifies — opens a re-pin PR whose body carries the full
attestation evidence. The PR runs through `catalog-admission` (which re-verifies
the same way) and **auto-merges once the gates are green**. A release whose
attestations don't verify is never proposed.

This catalog opts in by having the `catalog` GitHub App installed (ADR-011) —
there is no per-repo workflow to add. (Dependabot can't do this: no Dependabot
ecosystem parses the `git-subdir` + `sha` catalog pins; its `github-actions`
updater here only keeps the workflow `uses:` pins fresh.)

## If another plugin may depend on yours

A plugin's `plugin.json` can declare a dependency on another plugin by a
semver range instead of an exact SHA:

```jsonc
{"name": "mif-docs", "marketplace": "modeled-information-format", "version": "^0.3.1"}
```

The `marketplace` field is only needed when the dependency lives in a
*different* marketplace than the declaring plugin, and the declaring plugin's
own marketplace must allow-list `modeled-information-format` via
`allowCrossMarketplaceDependenciesOn` or the install is blocked with a
separate `cross-marketplace` error before it ever gets to tag resolution.
Claude Code resolves that range by running `git ls-remote --tags` against
**your** plugin's repo and only considers tags shaped
`{your-plugin-name}--v{version}` — not the bare `vX.Y.Z` tag most repos here
cut for their own releases. If that tag is missing, installing the dependent
plugin fails with `no git tag satisfying <range>`, even though the exact
release the catalog pins is correct.

If your plugin might ever be depended on this way, your release process must
also create that tag — `claude plugin tag --push` does this for you (it
validates `plugin.json` and any enclosing marketplace entry agree first). See
[the org's plugin dependency-tag reference](https://github.com/modeled-information-format/.github/blob/main/docs/reference/plugin-dependency-tags.md)
for the full mechanics and how to wire it into your own release workflow.
