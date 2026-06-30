import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightLlmsTxt from "starlight-llms-txt";
import astroMermaid from "astro-mermaid";

// MIF Claude Code plugin marketplace documentation site — Astro + Starlight,
// modeled on the org's doc-site (same versions, same llms.txt + Mermaid +
// mif-brand wiring). Deployed to project Pages at /claude-code-plugins; the
// docs/ tree is sourced via the src/content/docs symlink.
export default defineConfig({
  site: "https://modeled-information-format.github.io",
  base: "/claude-code-plugins",
  integrations: [
    astroMermaid(),
    starlight({
      plugins: [starlightLlmsTxt()],
      title: "MIF Plugin Marketplace",
      customCss: ["./src/styles/mif-brand.css"],
      logo: {
        light: "./src/assets/logo-light.svg",
        dark: "./src/assets/logo-dark.svg",
        replacesTitle: true,
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/modeled-information-format/claude-code-plugins",
        },
      ],
      sidebar: [
        { label: "How-to guides", items: [{ autogenerate: { directory: "how-to" } }] },
        { label: "Reference", items: [{ autogenerate: { directory: "reference" } }] },
        { label: "Explanation", items: [{ autogenerate: { directory: "explanation" } }] },
        { label: "Security", items: [{ autogenerate: { directory: "security" } }] },
        {
          label: "MIF ecosystem",
          items: [
            { label: "MIF home", link: "https://modeled-information-format.github.io/" },
            { label: "Ecosystem docs", link: "https://modeled-information-format.github.io/docs/" },
            { label: "Ontology corpus", link: "https://modeled-information-format.github.io/ontologies/" },
            { label: "mif-docs plugin", link: "https://github.com/modeled-information-format/mif-docs-plugin" },
            { label: "Specification (mif-spec.dev)", link: "https://mif-spec.dev" },
          ],
        },
      ],
    }),
  ],
});
