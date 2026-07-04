---
title: MIF Plugin Marketplace
description: The modeled-information-format Claude Code plugin marketplace — every plugin SHA-pinned, attested, and admitted only when its attestation verifies fail-closed.
template: splash
hero:
  tagline: Every plugin SHA-pinned, attested, and admitted only when it verifies — fail-closed.
  image:
    html: |
      <svg viewBox="0 0 560 440" width="560" height="440" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="claude-code-plugins — a Claude Code plugin marketplace. mif-docs and modeled-information-format are listed, each verified fail-closed before admission; the catalog keeps growing.">
        <title>The Claude Code plugin marketplace, verified before it's listed</title>
        <desc>A marketplace.json catalog panel lists plugins by name — mif-docs and modeled-information-format — each carrying a green attested check. A small fail-closed badge marks the admission gate as a feature of the catalog, not its subject. A dashed row shows the catalog still growing.</desc>
        <defs>
          <linearGradient id="mif-field" x1="0" y1="0" x2="560" y2="440" gradientUnits="userSpaceOnUse">
            <stop offset="0" stop-color="#0A0D13"/>
            <stop offset="1" stop-color="#0E121B"/>
          </linearGradient>
        </defs>
        <rect width="560" height="440" rx="20" fill="url(#mif-field)"/>
        <rect x="12" y="12" width="536" height="416" rx="14" fill="none" stroke="#222C3C" stroke-width="1.5"/>

        <g transform="translate(238 30) scale(1.55)" fill="none" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">
          <path d="M6 42 L6 6 L24 29" stroke="#34D3E8"/>
          <path d="M24 29 L42 6 L42 42" stroke="#F5B642"/>
          <path d="M24 25.6 L27.4 29 L24 32.4 L20.6 29 Z" fill="#E8EEF6" stroke="none"/>
        </g>
        <text x="356" y="68" font-family="ui-monospace, 'SF Mono', Menlo, monospace" font-size="26" font-weight="700" letter-spacing="0.04em" fill="#E8EEF6">MIF</text>
        <text x="280" y="130" text-anchor="middle" font-family="ui-monospace, 'SF Mono', Menlo, monospace" font-size="12" letter-spacing="0.1em" fill="#7C8AA0">CLAUDE CODE PLUGIN MARKETPLACE</text>

        <!-- Catalog panel: the product -->
        <rect x="70" y="182" width="420" height="158" rx="12" fill="#0E121B" stroke="#2E3A4D" stroke-width="1.5"/>

        <!-- window chrome + file label -->
        <circle cx="90" cy="200" r="3" fill="#3C4B63"/>
        <circle cx="100" cy="200" r="3" fill="#3C4B63"/>
        <circle cx="110" cy="200" r="3" fill="#3C4B63"/>
        <text x="124" y="204" font-family="ui-monospace, 'SF Mono', Menlo, monospace" font-size="12" fill="#7C8AA0">marketplace.json</text>

        <!-- fail-closed badge: a supporting feature, not the subject -->
        <circle cx="370" cy="202" r="8.5" fill="none" stroke="#34C77B" stroke-width="1.5"/>
        <path d="M366 202 L369 205.5 L375 197.5" stroke="#34C77B" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        <text x="386" y="206" font-family="ui-monospace, 'SF Mono', Menlo, monospace" font-size="10.5" fill="#34C77B">fail-closed</text>

        <line x1="86" y1="214" x2="474" y2="214" stroke="#222C3C" stroke-width="1"/>

        <!-- Row 1: mif-docs (real, flagship) -->
        <circle cx="100" cy="240" r="5" fill="#F5B642"/>
        <text x="116" y="245" font-family="ui-monospace, 'SF Mono', Menlo, monospace" font-size="16" font-weight="700" fill="#E8EEF6">mif-docs</text>
        <path d="M234 240 L241 247 L256 228" stroke="#34C77B" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        <text x="264" y="245" font-family="ui-monospace, 'SF Mono', Menlo, monospace" font-size="12" fill="#34C77B">attested</text>
        <text x="454" y="245" text-anchor="end" font-family="ui-monospace, 'SF Mono', Menlo, monospace" font-size="11" fill="#7C8AA0">docs</text>

        <!-- Row 2: modeled-information-format (real, second entry) -->
        <circle cx="100" cy="272" r="5" fill="#34D3E8"/>
        <text x="116" y="277" font-family="ui-monospace, 'SF Mono', Menlo, monospace" font-size="13.5" fill="#AEBCCF">modeled-information-format</text>
        <path d="M374 272 L381 279 L396 260" stroke="#34C77B" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        <text x="404" y="277" font-family="ui-monospace, 'SF Mono', Menlo, monospace" font-size="12" fill="#34C77B">attested</text>

        <!-- Row 3: still growing (dashed, matches the +new convention) -->
        <circle cx="100" cy="304" r="5" fill="none" stroke="#F5B642" stroke-width="2" stroke-dasharray="2.5 2.5"/>
        <text x="116" y="309" font-family="ui-monospace, 'SF Mono', Menlo, monospace" font-size="12.5" letter-spacing="0.02em" fill="#7C8AA0">+ admitted on next verify</text>

        <rect x="85" y="362" width="391" height="30" rx="15" fill="#151B27" stroke="#2E3A4D"/>
        <circle cx="105" cy="377" r="4.5" fill="#F5B642"/>
        <text x="121" y="381" font-family="ui-monospace, 'SF Mono', Menlo, monospace" font-size="12.5" letter-spacing="0.02em" xml:space="preserve"><tspan fill="#F5B642">Claude Code plugins</tspan><tspan fill="#AEBCCF">  ·  verified before listing</tspan></text>
      </svg>
  actions:
    - text: Add a plugin
      link: how-to/add-a-plugin/
      icon: right-arrow
    - text: Registered plugins
      link: reference/registered-plugins/
      variant: minimal
    - text: Verify a release
      link: security/verify/
      variant: minimal
    - text: MIF home
      link: https://modeled-information-format.github.io/
      icon: external
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
