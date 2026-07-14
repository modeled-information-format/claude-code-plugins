// The deterministic subset of the loop generator's authoring checklist
// (Epic #40 Story S8 Task #80), mirroring lib/goal-checklist.mjs's and
// lib/prompt-checklist.mjs's split: what a plain function can actually
// verify lives here; what needs real judgment (is this pattern *genuinely*
// the right fit, is "fully autonomous" *actually* justified rather than a
// rubber-stamped default) is documented as explicit steps in
// skills/generate-loop/SKILL.md for the invoking agent to score itself.
//
// golden-sets/loops.json's own stated criteria (verbatim): "Classification
// against Anthropic's six named agent patterns (prompt chaining, routing,
// parallelization, orchestrator-workers, evaluator-optimizer, fully
// autonomous), refusing to default to a fully autonomous loop when a
// bounded pattern suffices, and a mandatory explicit stop condition."

/** Anthropic's six named agent patterns (Building Effective Agents), verbatim. */
export const SIX_AGENT_PATTERNS = Object.freeze([
  'prompt chaining',
  'routing',
  'parallelization',
  'orchestrator-workers',
  'evaluator-optimizer',
  'fully autonomous',
]);

export const LOOP_CHECKLIST = Object.freeze([
  {
    key: 'patternNamed',
    description:
      'Explicitly declares which of the six named agent patterns (prompt chaining, routing, ' +
      'parallelization, orchestrator-workers, evaluator-optimizer, fully autonomous) this loop uses.',
    deterministic: true,
  },
  {
    key: 'patternAppropriate',
    description:
      'The named pattern is genuinely the right fit for the underlying task — not a pattern ' +
      'declared for form\'s sake while the loop\'s actual logic does something else.',
    deterministic: false,
  },
  {
    key: 'notDefaultAutonomous',
    description:
      'If "fully autonomous" was chosen, there is real justification that a bounded pattern ' +
      '(prompt chaining, routing, parallelization, orchestrator-workers, evaluator-optimizer) ' +
      'genuinely does not suffice — never a rubber-stamped default to autonomy.',
    deterministic: false,
  },
  {
    key: 'explicitStopCondition',
    description:
      'Declares an explicit stop condition (a numeric max-iteration cap, a goal/score check, or ' +
      'a time bound) with concrete content — never vague prose like "until it feels done" or ' +
      '"try not to run too long", which is the absence of a stop condition, not one.',
    deterministic: true,
  },
  {
    key: 'timeBasedPolicyDeclared',
    description:
      'For a time-based loop specifically, declares an interval/jitter/expiration policy, with ' +
      'any specific self-pacing numbers re-verified against current Claude Code docs at build ' +
      'time rather than trusted as a permanent hard contract. Not applicable to a loop with no ' +
      'time-based component at all.',
    deterministic: false,
  },
]);

export const DETERMINISTIC_CHECKLIST_KEYS = Object.freeze(
  LOOP_CHECKLIST.filter((item) => item.deterministic).map((item) => item.key),
);

const PATTERN_ALTERNATION = SIX_AGENT_PATTERNS.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const PATTERN_DECLARATION = new RegExp(`\\bpattern\\s*:\\s*(${PATTERN_ALTERNATION})\\b`, 'i');

/** The declared pattern name (lowercased, one of SIX_AGENT_PATTERNS), or null if none is declared. */
export function extractDeclaredPattern(content) {
  const text = typeof content === 'string' ? content : '';
  const match = text.match(PATTERN_DECLARATION);
  return match ? match[1].toLowerCase() : null;
}

// Same "header + non-empty, non-newline-crossing content" shape as
// lib/goal-checklist.mjs's hasBoundedConstraints — a "Stop condition:"
// header alone (or one immediately followed by an unrelated new sentence
// on the next line) is not itself a declared condition.
const STOP_CONDITION_HEADER = /\bstop\s+condition\s*:[ \t]*([^.\n]*)/i;

function hasExplicitStopCondition(text) {
  const match = text.match(STOP_CONDITION_HEADER);
  if (!match) return false;
  return match[1].trim().length > 0;
}

/**
 * Score the deterministic subset of `LOOP_CHECKLIST` against a drafted
 * loop's full prose text. Returns `{ [key]: boolean }` for exactly the two
 * `deterministic: true` items — the caller (skills/generate-loop/SKILL.md)
 * scores the remaining three judgment items itself.
 *
 * @param {string} [content] - non-string input is treated as an empty string.
 */
export function scoreDeterministicChecklist(content) {
  const text = typeof content === 'string' ? content : '';
  return {
    patternNamed: extractDeclaredPattern(text) !== null,
    explicitStopCondition: hasExplicitStopCondition(text),
  };
}

/**
 * Task #82: assert a loop's pattern-selection record is actually grounded —
 * a non-empty rationale, traceable to the Building-Effective-Agents/ReAct
 * evidence the source doc cites. Mirrors the per-artifact citation
 * convention lib/frontmatter-contract.mjs's citations[] already covers at
 * the whole-artifact level (unlike goal's per-CHECK grounding, a loop has
 * exactly one pattern selection to ground, not an array of checks).
 */
export function assertPatternSelectionGrounded({ pattern, rationale }) {
  if (!pattern || !SIX_AGENT_PATTERNS.includes(pattern)) {
    throw new Error(
      `Pattern selection must name one of the six agent patterns: ${SIX_AGENT_PATTERNS.join(', ')}. Got: ${JSON.stringify(pattern)}`,
    );
  }
  if (!rationale || typeof rationale !== 'string' || rationale.trim() === '') {
    throw new Error(
      'Pattern selection is missing a non-empty rationale — record why this pattern was selected, ' +
        'traceable to the Building-Effective-Agents/ReAct evidence cited in the source doc.',
    );
  }
}
