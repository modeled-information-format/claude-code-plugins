// Cross-cutting concept 3 / AD-6's SHOULD-level "signed manifest" (Epic
// #40 Story S13): a C2PA-style manifest recording only what THIS PLUGIN'S
// OWN generation pipeline declares about an artifact — its motivation (the
// `derived-from` relationship(s) naming what originally prompted its
// generation), its source grounding (citations), its generation steps (the
// checklist scoring and generator-specific fields every Story S6-S11
// generator already writes into frontmatter
// `extensions.claudeArtifactAuthoring`), and when it was declared. The
// Security NFR this satisfies: "artifacts leaving the authoring session are
// treated as untrusted-until-verified, with their provenance manifest
// surfaced for inspection."
//
// The manifest's honesty depends ENTIRELY on the pipeline populating it
// faithfully (Task #97's own framing) — this module assembles what was
// already declared during generation/provenance (Story S2's persistence
// pipeline, every generator's own frontmatter), it does not independently
// verify, sign, or attest to any of it. This is SHOULD-level and
// best-effort (AD-6), explicitly NOT a hard tamper-evidence guarantee —
// see this module's own `disclaimer` field, always present in every
// manifest it builds, and Task #101's documentation requirement.

export const MANIFEST_VERSION = '1.0';

const DISCLAIMER =
  "This manifest records only what claude-artifact-authoring's own generation pipeline declared " +
  'about itself (motivation, source grounding, generation steps, when they were declared). It is a SHOULD-level, ' +
  "best-effort record (AD-6) — not an externally-verifiable tamper-evidence guarantee. An artifact " +
  'leaving this authoring session is untrusted until a human or downstream system reviews this ' +
  "manifest and the artifact's own content directly; nothing here proves the pipeline's claims are true.";

/**
 * Assemble a C2PA-style manifest for an artifact that has already been
 * drafted with L3 frontmatter (Story S2's persistence pipeline) — every
 * generator Story S6-S11 already writes `citations[]` (source grounding)
 * and `extensions.claudeArtifactAuthoring` (checklist scores, generator-
 * specific fields, revision) into that frontmatter; this reads those
 * EXISTING declarations rather than requiring a second, separately-
 * maintained data source.
 *
 * @param {object} args
 * @param {string} args.type - the artifact type (e.g. 'prompts', 'goals').
 * @param {string} args.slug - the artifact's slug in the central store.
 * @param {number} args.version - the artifact's version (Story S1's layout).
 * @param {object} args.frontmatter - the artifact's drafted/stamped L3 frontmatter.
 * @returns {object} the manifest.
 */
export function buildArtifactManifest({ type, slug, version, frontmatter }) {
  if (!frontmatter || typeof frontmatter !== 'object') {
    throw new Error('buildArtifactManifest: frontmatter is required to build a manifest.');
  }

  const citations = Array.isArray(frontmatter.citations) ? frontmatter.citations : [];
  const relationships = Array.isArray(frontmatter.relationships) ? frontmatter.relationships : [];
  const generatorExtensions = frontmatter.extensions?.claudeArtifactAuthoring ?? null;

  return {
    manifestVersion: MANIFEST_VERSION,
    artifact: { type, slug, version },
    declaredAt: frontmatter.temporal?.recordedAt ?? null,
    motivation: relationships.filter((r) => r?.type === 'derived-from').map((r) => r.target ?? null),
    sourceGrounding: citations.map((citation) => ({
      title: citation?.title ?? null,
      url: citation?.url ?? null,
      citationRole: citation?.citationRole ?? null,
    })),
    generationSteps: generatorExtensions
      ? {
          generatorType: generatorExtensions.generatorType ?? null,
          checklist: generatorExtensions.checklist ?? null,
          revision: generatorExtensions.revision ?? null,
        }
      : null,
    disclaimer: DISCLAIMER,
  };
}

/**
 * Render a manifest as a human-readable summary — Task #99's "a way to
 * surface it for inspection before [the artifact leaves the authoring
 * session]." Deliberately plain text, not a UI: the surfacing mechanism
 * this Story is responsible for is the CONTENT being genuinely available
 * to read, not a particular rendering surface.
 */
export function formatManifestForInspection(manifest) {
  const lines = [];
  lines.push(`Artifact: ${manifest.artifact.type}/${manifest.artifact.slug} v${manifest.artifact.version}`);
  lines.push(`Declared at: ${manifest.declaredAt ?? 'unknown'}`);
  if (manifest.motivation.length === 0) {
    lines.push('Motivation: (no derived-from relationship declared)');
  } else {
    lines.push(`Motivation: ${manifest.motivation.join(', ')}`);
  }
  lines.push('Source grounding:');
  if (manifest.sourceGrounding.length === 0) {
    lines.push('  (none declared)');
  } else {
    for (const citation of manifest.sourceGrounding) {
      const roleTag = citation.citationRole ? `[${citation.citationRole}] ` : '';
      const urlSuffix = citation.url ? ` (${citation.url})` : '';
      lines.push(`  - ${roleTag}${citation.title ?? '(untitled)'}${urlSuffix}`);
    }
  }
  if (manifest.generationSteps) {
    lines.push(
      `Generator: ${manifest.generationSteps.generatorType ?? 'unknown'} (revision ${manifest.generationSteps.revision ?? '?'})`,
    );
    if (manifest.generationSteps.checklist) {
      lines.push('Checklist:');
      for (const [key, verdict] of Object.entries(manifest.generationSteps.checklist)) {
        lines.push(`  - ${key}: ${verdict}`);
      }
    }
  } else {
    lines.push('Generator: (no generation-step record found in this artifact\'s frontmatter)');
  }
  lines.push('');
  lines.push(manifest.disclaimer);
  return lines.join('\n');
}

/**
 * Assert a manifest has the shape Task #97 designed before it is treated
 * as ready to surface — a STRUCTURAL completeness check, never a trust or
 * verification gate. This function's name is deliberately literal about
 * that distinction: passing this assertion means "a manifest with the
 * required fields exists to be surfaced," not "this artifact's claims are
 * true" — nothing in this module can prove the latter, per the module's
 * own disclaimer.
 */
export function assertManifestReadyToSurface(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('No manifest was produced for this artifact — it cannot be surfaced for inspection before use.');
  }
  const requiredFields = ['manifestVersion', 'artifact', 'motivation', 'sourceGrounding', 'disclaimer'];
  const missing = requiredFields.filter((field) => !(field in manifest));
  if (missing.length > 0) {
    throw new Error(
      `Manifest is missing required field(s): ${missing.join(', ')} — an incomplete manifest must not be surfaced as if it were complete.`,
    );
  }
}
