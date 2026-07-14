// The deterministic subset of the goal generator's authoring checklist
// (Epic #40 Story S7 Tasks #70/#72/#75). Same split this plugin already
// uses in lib/prompt-checklist.mjs: what a plain function can actually
// verify lives here; what needs real judgment (is this goal *genuinely*
// specific, is it *actually* achievable, is it *truly* relevant) is
// documented as explicit steps in skills/generate-goal/SKILL.md for the
// invoking agent to score itself.
//
// The bar (Task #70, verbatim): "the 'two domain experts reach the same
// pass/fail verdict' bar and the SMART criteria checklist. Reject any
// completion condition unless it names an executable verification command
// rather than prose" — the same checks[].verify discipline
// research-harness-template's own goal.schema.json uses
// (`completion_condition.checks[].verify`, a real shell command string; see
// `evals/fixtures/models/goal.sample.json` in that repo). This plugin's
// generated goal is PROSE (Claude Code's own `/goal` free-text form, exactly
// like golden-sets/goals.json's entries — the goal-writer command in that
// same repo produces this same prose form alongside the structured JSON),
// not that JSON schema itself — so what's checked here is prose-shaped:
// does the text actually name an executable command, an explicit scope
// boundary, and a time/turn bound, rather than vague, ungradable language.
//
// Of SMART's five letters, only "Measurable" (an executable verify command)
// and "Time-bound" (an explicit stop condition) are mechanically checkable
// from text alone. Specific/Achievable/Relevant all require judging whether
// the goal's *content* is genuinely well-scoped, realistic, and worth doing
// — no regex can honestly claim that.

/**
 * The full goal-authoring checklist named in Task #70. `deterministic` marks
 * which items `scoreDeterministicChecklist` actually scores; the rest are
 * scored by the generating agent per skills/generate-goal/SKILL.md.
 */
export const GOAL_CHECKLIST = Object.freeze([
  {
    key: 'twoExpertsAgreeVerdict',
    description:
      'Two domain experts reading only this goal would reach the same pass/fail verdict — no ' +
      'ambiguous or subjective ask ("make it better", "in a nice way") that different readers ' +
      'could grade differently.',
    deterministic: false,
  },
  {
    key: 'specific',
    description:
      'SMART: Specific — names a concrete target (files, behavior, or output), not an open-ended ' +
      'or vague scope.',
    deterministic: false,
  },
  {
    key: 'measurableVerifyCommand',
    description:
      'SMART: Measurable — every completion condition names an executable verification command ' +
      '(e.g. a shown-passing test/lint invocation), never prose alone. The checks[].verify ' +
      'discipline research-harness-template\'s goal.schema.json enforces structurally, applied ' +
      'here to this plugin\'s prose goal form.',
    deterministic: true,
  },
  {
    key: 'achievable',
    description:
      'SMART: Achievable — realistic in scope for the stated turn/time bound, not an open-ended ' +
      'or overreaching ask.',
    deterministic: false,
  },
  {
    key: 'relevant',
    description: 'SMART: Relevant — tied to a real, stated need, not arbitrary busywork.',
    deterministic: false,
  },
  {
    key: 'timeBound',
    description:
      'SMART: Time-bound — an explicit stop condition (e.g. "stop after N turns") bounding how ' +
      'long the session may run before reporting back, even if incomplete.',
    deterministic: true,
  },
  {
    key: 'boundedConstraints',
    description:
      'Explicit constraints bounding blast radius (e.g. which files/dirs may change, what must ' +
      "not be touched) — the goal's own version of \"right altitude\": scoped, not unbounded.",
    deterministic: true,
  },
]);

export const DETERMINISTIC_CHECKLIST_KEYS = Object.freeze(
  GOAL_CHECKLIST.filter((item) => item.deterministic).map((item) => item.key),
);

// A code span counts as naming an executable command only if its content
// actually looks like one: a leading program-name-or-path token (letters,
// digits, "./_-"), optionally followed by space-separated arguments that are
// not themselves whitespace. This rejects a backticked English phrase like
// `looks nice` (two plain words, no path-like first token... actually this
// heuristic alone wouldn't reject that — see the exclusion list below) while
// accepting `pytest test/auth -q`, `ruff check src/auth`, `markdownlint
// README.md`, `npm test`, etc.
const COMMAND_LIKE = /^[A-Za-z0-9._/-]+(\s+\S+)*$/;

// A small, fixed list of common non-command English words that would
// otherwise slip past COMMAND_LIKE's shape-only check when used as the
// FIRST token of a backticked span (e.g. `` `is good` `` shape-matches but
// is prose, not a command). Kept short and specific rather than attempting
// general English detection, which this deterministic function has no
// business doing.
const NON_COMMAND_FIRST_WORDS = new Set([
  'is', 'are', 'was', 'were', 'be', 'been', 'the', 'a', 'an', 'this', 'that',
  'good', 'bad', 'nice', 'better', 'useful', 'clean', 'improve', 'improved',
]);

/**
 * Extract every inline (single-backtick) code span from `content` whose text
 * looks like an executable command, per the heuristic above. Returns the raw
 * span contents (backticks stripped), in document order. Triple-backtick
 * fenced blocks are deliberately excluded — this plugin's goal prose form
 * inlines its verify commands (see golden-sets/goals.json), it doesn't fence
 * them.
 */
export function extractVerifyCommands(content) {
  const text = typeof content === 'string' ? content : '';
  const commands = [];
  // Match single backticks only: a run of exactly one backtick, non-greedy
  // content, one backtick — `(?<!`)` / `(?!`)` guard against matching inside
  // a longer ``` fence.
  for (const m of text.matchAll(/(?<!`)`([^`]+)`(?!`)/g)) {
    const span = m[1].trim();
    if (!span || !COMMAND_LIKE.test(span)) continue;
    const firstWord = span.split(/\s+/)[0].toLowerCase();
    if (NON_COMMAND_FIRST_WORDS.has(firstWord)) continue;
    commands.push(span);
  }
  return commands;
}

// Deliberately narrow to what golden-sets/goals.json's own good entries use
// ("Stop after 15 turns...", "Stop after 10 turns...") plus the "within N"
// variant — an explicit numeric turn/time bound, not any use of the word
// "stop" (e.g. "do not stop working on this" must not match).
const STOP_CONDITION_PATTERN = /\bstop\s+(?:after|within)\b[^.]{0,30}?\d+/i;
const CONSTRAINTS_SECTION_PATTERN = /\bconstraints?\s*:/i;

/**
 * Score the deterministic subset of `GOAL_CHECKLIST` against a drafted
 * goal's full prose text. Returns `{ [key]: boolean }` for exactly the three
 * `deterministic: true` items — the caller
 * (skills/generate-goal/SKILL.md) is responsible for scoring the remaining
 * four judgment items itself and merging both into one explicit pass/fail
 * record, per Task #70/#72's "record each checklist item as an explicit
 * pass or fail."
 *
 * @param {string} [content] - the drafted goal's full text. Non-string input
 *   is treated as an empty string rather than throwing.
 */
export function scoreDeterministicChecklist(content) {
  const text = typeof content === 'string' ? content : '';
  return {
    measurableVerifyCommand: extractVerifyCommands(text).length > 0,
    timeBound: STOP_CONDITION_PATTERN.test(text),
    boundedConstraints: CONSTRAINTS_SECTION_PATTERN.test(text),
  };
}

// --- Task #75: structural balance linter + reference-solution smoke test ---
//
// These operate on the generator's INTERNAL structured checks[] record —
// the same shape research-harness-template's goal.schema.json uses
// (`{ id, assertion, verify }`), extended here with the two fields Task #72
// and #75 each need — which the generator drafts before composing the final
// prose (mirrors lib/prompt-checklist.mjs's checklist-scoring record being
// drafted before it's written into frontmatter extensions). This plugin
// never persists the checks[] array as its own document; it persists the
// prose. The structured record is drafting scaffolding recorded into
// frontmatter `extensions` (Task #72), not a second artifact.
//
// Expected shape of one check:
//   {
//     id: string,                      // stable identifier, e.g. "auth-tests-pass"
//     assertion: string,                // what must be true, e.g. "all auth tests pass"
//     verify: string,                   // the executable command, e.g. "pytest test/auth -q"
//     groundedIn: string,               // Task #72: which source failure mode or
//                                       // acceptance-criteria pattern justifies this
//                                       // specific check (non-empty, per-check — never
//                                       // a single shared citation for the whole goal)
//     negativeCaseApplicable: boolean,  // does a meaningful "must NOT happen" case exist?
//     negativeCase: string|undefined,   // required iff negativeCaseApplicable
//   }

/**
 * Task #72: assert every check in a drafted goal's internal checks[] record
 * carries its own non-empty `groundedIn` — the source failure mode or
 * acceptance-criteria pattern that justified it. Per-check, deliberately not
 * satisfied by one shared citation for the whole artifact (that's what
 * `lib/frontmatter-contract.mjs`'s `citations[]` already covers at the
 * whole-artifact level).
 */
export function assertChecksGrounded(checks) {
  if (!Array.isArray(checks) || checks.length === 0) {
    throw new Error('checks[] must be a non-empty array — a goal with zero completion checks cannot be graded.');
  }
  const errors = [];
  for (const [i, check] of checks.entries()) {
    if (!check?.groundedIn || typeof check.groundedIn !== 'string' || check.groundedIn.trim() === '') {
      errors.push(
        `checks[${i}] ("${check?.id ?? 'unknown'}") is missing a non-empty groundedIn — ` +
          'record which source failure mode or acceptance-criteria pattern justified this check.',
      );
    }
  }
  if (errors.length > 0) {
    throw new Error(`Task #72 per-check grounding is incomplete:\n- ${errors.join('\n- ')}`);
  }
}

/**
 * Task #75: structural linter asserting every check carries both a positive
 * and a negative case *where applicable*. A check that legitimately has no
 * meaningful negative case (`negativeCaseApplicable: false`) is never
 * flagged — this is a balance check, not a blanket "every check needs two
 * cases" rule. Returns `{ balanced, violations }` rather than throwing, so
 * the caller can feed violations back into the generation feedback loop.
 */
export function lintChecksBalance(checks) {
  if (!Array.isArray(checks)) {
    throw new Error('checks[] must be an array.');
  }
  const violations = [];
  for (const [i, check] of checks.entries()) {
    if (!check?.assertion || typeof check.assertion !== 'string' || check.assertion.trim() === '') {
      violations.push({ index: i, id: check?.id, reason: 'missing a positive assertion' });
      continue;
    }
    if (check.negativeCaseApplicable) {
      if (!check.negativeCase || typeof check.negativeCase !== 'string' || check.negativeCase.trim() === '') {
        violations.push({
          index: i,
          id: check?.id,
          reason: 'negativeCaseApplicable is true but negativeCase is missing — balanced criteria requires both.',
        });
      }
    }
  }
  return { balanced: violations.length === 0, violations };
}
