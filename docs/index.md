---
title: MIF Plugin Marketplace
description: The modeled-information-format Claude Code plugin marketplace — every plugin SHA-pinned, attested, and admitted only when its attestation verifies fail-closed.
template: splash
hero:
  tagline: Every plugin SHA-pinned, attested, and admitted only when it verifies — fail-closed.
  actions:
    - text: Add a plugin
      link: how-to/add-a-plugin/
      icon: right-arrow
    - text: Verify a release
      link: security/verify/
      variant: minimal
---

## How admission works

A plugin is listed only after its pinned release resolves to a real plugin and
its SLSA attestation verifies fail-closed — no attestation, no listing.

```mermaid
graph LR
  rel["Tagged release<br/>(SHA-pinned)"] --> att["SLSA build<br/>provenance"]
  att --> adm{"catalog-admission<br/>verify"}
  adm -->|resolves + verifies| ok["Admitted to catalog"]
  adm -->|fails| no["Rejected (fail-closed)"]
```

Each catalog entry pins a plugin to a `ref` + full-length commit `sha`; the
`catalog-admission` workflow re-resolves the pin and verifies the release
attestation before the plugin appears. Read
[how to add a plugin](how-to/add-a-plugin/) to submit one, or
[verify a release](security/verify/) to check an artifact yourself.
