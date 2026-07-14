// The deterministic subset of the eval-suite generator's authoring
// checklist (Epic #40 Story S9 Tasks #76/#79/#81), mirroring
// lib/goal-checklist.mjs's and lib/loop-checklist.mjs's split. This
// generator produces a companion eval suite that GRADES another
// generated artifact — its own criteria (verbatim from
// golden-sets/eval-suites.json): "Names its grader type (code-based,
// LLM-based, or human, per Anthropic's three documented types), grades the
// produced artifact rather than the path taken to reach it, requires a
// golden/reference set with a documented calibration target before
// unsupervised auto-grading."

/** Anthropic's three documented grader types, verbatim. */
export const GRADER_TYPES = Object.freeze(['code-based', 'llm-based', 'human']);

export const EVAL_SUITE_CHECKLIST = Object.freeze([
  {
    key: 'graderTypeNamed',
    description:
      'Explicitly declares which of the three grader types (code-based, LLM-based, human) this ' +
      'suite uses — never left implicit or ambiguous.',
    deterministic: true,
  },
  {
    key: 'gradesArtifactNotPath',
    description:
      'Grades the produced artifact itself (its final content against a checklist/rubric) — ' +
      'never the generation process, iteration count, or how confident generation felt.',
    deterministic: false,
  },
  {
    key: 'hasGoldenSetReference',
    description:
      'References a concrete golden/reference set (e.g. a specific golden-sets/*.json path and ' +
      'composition) — not a vague "check against examples" with no named set.',
    deterministic: true,
  },
  {
    key: 'calibrationRequiredForLLMGraders',
    description:
      'For an LLM-based grader specifically, states a calibration precondition (a run against the ' +
      'golden set with a documented human-agreement target) before it may auto-grade unsupervised ' +
      '— AD-4\'s hard requirement. Not applicable to a code-based or human grader, which has no ' +
      'LLM-judge drift to calibrate against.',
    deterministic: true,
  },
  {
    key: 'gEvalTwoStageOrdering',
    description:
      'For an LLM-based grader specifically, uses G-Eval two-stage judging (reason step by step ' +
      'first, only then emit a verdict) — TruLens-style reasoning-before-score ordering, not a bare ' +
      'score with no shown reasoning. Not applicable to a code-based or human grader.',
    deterministic: false,
  },
]);

export const DETERMINISTIC_CHECKLIST_KEYS = Object.freeze(
  EVAL_SUITE_CHECKLIST.filter((item) => item.deterministic).map((item) => item.key),
);

const GRADER_TYPE_DECLARATION = /\bgrader\s*type\s*:\s*(code-based|llm-based|human)\b/i;

/** The declared grader type (lowercased, one of GRADER_TYPES), or null if none is declared. */
export function extractGraderType(content) {
  const text = typeof content === 'string' ? content : '';
  const match = text.match(GRADER_TYPE_DECLARATION);
  return match ? match[1].toLowerCase() : null;
}

// A simple substring presence check, not a structured header parse like
// goal/loop's "Constraints:"/"Stop condition:" — this suite's prose names a
// concrete golden set by mentioning "golden set" or a "golden-sets/" path,
// and that mention alone (regardless of surrounding punctuation/newlines)
// is the deterministic signal Task #76 asks for.
const GOLDEN_SET_MENTION = /\bgolden[- ]sets?\b/i;

function hasGoldenSetReference(text) {
  return GOLDEN_SET_MENTION.test(text);
}

// Presence of calibration language ("calibrate"/"calibration"/"calibrated")
// anywhere in the text — deliberately not requiring a specific percentage
// pattern, since the discipline being checked is "a calibration
// precondition is STATED at all", not parsing the exact target number
// (which lib/calibration.mjs's real `isCalibrated`/`assertCalibrated`
// already enforce mechanically against the recorded run, not the prose).
const CALIBRATION_MENTION = /\bcalibrat\w*/i;

/**
 * Score the deterministic subset of `EVAL_SUITE_CHECKLIST` against a
 * drafted eval suite's full prose text. Returns `{ [key]: boolean }` for
 * exactly the three `deterministic: true` items — the caller
 * (skills/generate-eval-suite/SKILL.md) scores the remaining two judgment
 * items itself.
 *
 * @param {string} [content] - non-string input is treated as an empty string.
 */
export function scoreDeterministicChecklist(content) {
  const text = typeof content === 'string' ? content : '';
  const graderType = extractGraderType(text);
  return {
    graderTypeNamed: graderType !== null,
    hasGoldenSetReference: hasGoldenSetReference(text),
    // Vacuously true for a non-LLM-based (or undeclared) grader type — this
    // item is genuinely not applicable there, per the checklist's own
    // description, not a check being skipped.
    calibrationRequiredForLLMGraders: graderType !== 'llm-based' || CALIBRATION_MENTION.test(text),
  };
}
