// The four required frontmatter elements every generated artifact's MIF L3
// document must carry, per the source architecture doc's prompt-persistence
// blueprint. This module is a deterministic *validator*, not a drafter —
// drafting the actual content is mif-frontmatter's job (an LLM-judgment
// skill step this plugin's generators invoke directly, not something a
// plain function can do). What's checked here is the *shape* a draft must
// satisfy before this plugin's persistence pipeline treats it as complete
// enough to write, stamp, and validate.
//
// The four elements, and what "present" means for each:
//   1. citations[]      — at least one Citation naming the origin finding
//   2. provenance       — sourceType: "system_generated" (machine-generated
//                          artifact), asserted before mif-provenance's
//                          witnessed stamp narrows it further
//   3. temporal          — validFrom, recordedAt, and a ttl (freshness
//                          horizon; shorter than a research finding's, since
//                          generated-artifact guidance moves faster)
//   4. relationships[]   — derived-from (origin finding), relates-to
//                          (generating session), and a namespaced
//                          harness:generated-for (topic namespace root)

export const REQUIRED_RELATIONSHIP_TYPES = Object.freeze([
  'derived-from',
  'relates-to',
  'harness:generated-for',
]);

// A full RFC3339 date-TIME, with a mandatory time component and offset
// ("Z" or "+HH:MM"/"-HH:MM") — a date-only string like "2026-07-13" is
// deliberately rejected even though Date.parse() would accept it.
const RFC3339_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Per-artifact-type ttl horizons (F: prompt-persistence-design-blueprint —
 * P90D for a prompt vs. a finding's typical P1Y, since prompt/loop guidance
 * and the target model move faster than the research underneath them).
 * goal/eval-suite lean semantic (spec-shaped, slower-moving); prompt/loop/
 * subagent/tool-schema lean procedural (executable, faster-moving).
 */
export const ARTIFACT_TYPE_METADATA = Object.freeze({
  prompts: { conceptType: 'procedural', ttl: 'P90D' },
  goals: { conceptType: 'semantic', ttl: 'P90D' },
  loops: { conceptType: 'procedural', ttl: 'P90D' },
  'eval-suites': { conceptType: 'semantic', ttl: 'P90D' },
  subagents: { conceptType: 'procedural', ttl: 'P90D' },
  'tool-schemas': { conceptType: 'procedural', ttl: 'P90D' },
});

/**
 * Validate a drafted frontmatter object against the four required
 * elements. Returns `{ valid, errors }` rather than throwing, so a caller
 * can decide whether to feed the errors back into the generation checklist
 * (per the doc's generate → grade → retry loop) or fail outright.
 */
export function validateFrontmatterContract(frontmatter) {
  const errors = [];

  if (!Array.isArray(frontmatter?.citations) || frontmatter.citations.length === 0) {
    errors.push('citations[] must contain at least one Citation naming the origin finding.');
  } else {
    for (const [i, citation] of frontmatter.citations.entries()) {
      if (!citation?.url || !/^https?:\/\//.test(citation.url)) {
        errors.push(
          `citations[${i}] must carry a resolvable http(s) url ` +
            '(an internal urn:mif:concept: finding resolves to its lookup form, not an invented link).',
        );
      }
      if (!citation?.citationType || !citation?.citationRole || !citation?.title) {
        errors.push(`citations[${i}] must set citationType, citationRole, and title.`);
      }
    }
  }

  if (frontmatter?.provenance?.sourceType !== 'system_generated') {
    errors.push('provenance.sourceType must be "system_generated" for a plugin-generated artifact.');
  }
  if (frontmatter?.provenance?.confidence !== undefined) {
    errors.push('provenance.confidence must never be written — a witness proves presence, not extent.');
  }

  const temporal = frontmatter?.temporal;
  for (const field of ['validFrom', 'recordedAt']) {
    const value = temporal?.[field];
    if (!value) {
      errors.push(`temporal.${field} is required.`);
    } else if (!RFC3339_DATE_TIME.test(value) || Number.isNaN(Date.parse(value))) {
      // Date.parse() alone is too permissive — it accepts date-only strings
      // like "2026-07-13" even though the contract requires a full
      // date-TIME. The regex enforces the shape; Date.parse() still catches
      // shape-valid-but-semantically-invalid values (e.g. month 13).
      errors.push(`temporal.${field} "${value}" is not a valid RFC3339 date-time (e.g. "2026-07-13T00:00:00Z").`);
    }
  }
  if (!temporal?.ttl) {
    errors.push('temporal.ttl is required.');
  } else if (!/^P\d+[DMY]$/.test(temporal.ttl)) {
    errors.push(`temporal.ttl "${temporal.ttl}" must be a simple ISO-8601 duration like "P90D".`);
  }

  const relationships = Array.isArray(frontmatter?.relationships) ? frontmatter.relationships : [];
  for (const requiredType of REQUIRED_RELATIONSHIP_TYPES) {
    // Check every matching entry, not just the first: with duplicate
    // entries of the same type, .find() alone could report a false failure
    // (an earlier malformed entry masking a later valid one) or a false
    // pass (a later malformed duplicate never reached).
    const matches = relationships.filter((r) => r?.type === requiredType);
    if (matches.length === 0) {
      errors.push(`relationships[] must include at least one entry with type "${requiredType}".`);
    } else if (!matches.some((r) => typeof r.target === 'string' && r.target.length > 0)) {
      errors.push(`relationships[] entry with type "${requiredType}" must set a non-empty target.`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Throws with every error joined, rather than returning a result — for call sites that want fail-fast. */
export function assertFrontmatterContract(frontmatter) {
  const { valid, errors } = validateFrontmatterContract(frontmatter);
  if (!valid) {
    throw new Error(`Frontmatter fails the four-required-elements contract:\n- ${errors.join('\n- ')}`);
  }
}
