// The deterministic half of the prompt generator's structured-prompting
// checklist (Epic #40 Story S6 Task #67). Same split this plugin already
// uses in lib/frontmatter-contract.mjs: what a plain function can actually
// verify lives here; what needs real judgment (is this role-setting
// *precise*, is this justification *actually* contextual, is this prompt at
// the "right altitude") is documented as explicit steps in
// skills/generate-prompt/SKILL.md for the invoking agent to score itself,
// using G-Eval-style reasoning-before-verdict — never faked as if a regex
// could grade prose quality.
//
// The full checklist (F: anthropic-structured-prompting-techniques, cited by
// the architecture doc's "Building block 1: Prompt generator" section) has
// eight items. Only three are mechanically checkable from the artifact's
// text alone:
//   - fewShotExamples: counts <example>...</example> blocks.
//   - xmlDelimiting: distinct, properly-paired XML-style section tags,
//     excluding <example> and the tiered-CoT tags (they have their own
//     dedicated checklist items and must not double-count here).
//   - tieredChainOfThought: whether both <thinking> and <answer> are
//     mentioned, or neither is — never exactly one (see the function's own
//     comment for why this checks consistent *mention*, not that every
//     individual tag instance is literally paired, and why an unclosed
//     instructional mention still counts as a real mention).
// The other five (clarity/golden rule, contextual justification,
// role-setting, right altitude, document-and-quote grounding) require
// judging whether prose is *actually* clear, *actually* justified,
// *actually* minimal — none of which a deterministic function can honestly
// claim to grade.

/**
 * The full structured-prompting checklist named in Task #67. `deterministic`
 * marks which items `scoreDeterministicChecklist` actually scores; the rest
 * are scored by the generating agent per skills/generate-prompt/SKILL.md.
 */
export const PROMPT_CHECKLIST = Object.freeze([
  {
    key: 'clarityGoldenRule',
    description:
      'Golden rule: a domain expert reading only the prompt could predict the exact output. ' +
      'No ambiguous or ungradable asks (e.g. "tell me if it\'s good or bad" with no stated criteria).',
    deterministic: false,
  },
  {
    key: 'contextualJustification',
    description:
      'Explains why the agent is being invoked and what context it does or does not have — ' +
      'not just what to do.',
    deterministic: false,
  },
  {
    key: 'fewShotExamples',
    description: '3-5 diverse <example>...</example> blocks (not near-duplicates of the same case).',
    deterministic: true,
  },
  {
    key: 'xmlDelimiting',
    description:
      'Distinct sections wrapped in properly opened-and-closed XML-style tags ' +
      '(e.g. <context>, <role>) beyond <example> itself.',
    deterministic: true,
  },
  {
    key: 'roleSetting',
    description:
      'Names a specific role/persona narrow enough to bound scope — not "a helpful AI assistant".',
    deterministic: false,
  },
  {
    key: 'tieredChainOfThought',
    description:
      'When a reasoning step is used, it is structured as <thinking>/<answer> tiering — ' +
      'never one tag without the other. Genuinely reasoning-free prompts are not penalized ' +
      'for omitting both.',
    deterministic: true,
  },
  {
    key: 'rightAltitude',
    description:
      'Minimal, high-signal tokens — no filler ("try your best", "think carefully") and no ' +
      'unbounded scope ("anything else the user needs").',
    deterministic: false,
  },
  {
    key: 'documentGrounding',
    description:
      'For long-context prompts, quotes grounding text from provided documents rather than ' +
      'paraphrasing from memory.',
    deterministic: false,
  },
]);

export const DETERMINISTIC_CHECKLIST_KEYS = Object.freeze(
  PROMPT_CHECKLIST.filter((item) => item.deterministic).map((item) => item.key),
);

// Tag names are matched case-insensitively and normalized to lowercase for
// pairing — XML tag names are conventionally lowercase throughout this
// plugin's golden set, but a generator drafting <Context>...</Context>
// shouldn't silently fail pairing over casing alone.
function pairedTagNames(content) {
  const openCounts = new Map();
  const closeCounts = new Map();
  for (const m of content.matchAll(/<([a-zA-Z][a-zA-Z0-9_-]*)>/g)) {
    const name = m[1].toLowerCase();
    openCounts.set(name, (openCounts.get(name) ?? 0) + 1);
  }
  for (const m of content.matchAll(/<\/([a-zA-Z][a-zA-Z0-9_-]*)>/g)) {
    const name = m[1].toLowerCase();
    closeCounts.set(name, (closeCounts.get(name) ?? 0) + 1);
  }
  const paired = [];
  for (const [name, openCount] of openCounts) {
    if (closeCounts.get(name) === openCount) paired.push(name);
  }
  return paired;
}

/**
 * Score the deterministic subset of `PROMPT_CHECKLIST` against a drafted
 * prompt's full text. Returns `{ [key]: boolean }` for exactly the three
 * `deterministic: true` items — the caller (skills/generate-prompt/SKILL.md)
 * is responsible for scoring the remaining five judgment items itself and
 * merging both into one explicit pass/fail record, per Task #69's
 * "record each checklist item as an explicit pass or fail."
 *
 * @param {string} content - the drafted prompt's full text (body only, or
 *   full markdown — this function only looks at literal tag text, so
 *   frontmatter noise above it doesn't affect the result).
 */
// Tags that have their own dedicated checklist item and must never count
// toward xmlDelimiting's "distinct content-sectioning tags" tally — without
// this exclusion, a prompt using only <thinking>/<answer> tiering (with zero
// actual content-sectioning tags like <context>/<role>) would satisfy
// xmlDelimiting for free, collapsing two independent checklist items into
// one.
const TIERED_COT_TAG_NAMES = new Set(['thinking', 'answer']);

// A tiered-CoT tag is scored as "mentioned" on either a real opening tag or
// a real closing tag, not only a fully-closed pair — a system prompt's job
// is normally to *instruct* the model to produce its own <thinking>/<answer>
// tags in its output, not to contain a closed demonstration pair itself
// (golden-sets/prompts.json's own "good-code-review-subagent" entry does
// exactly this: "think step by step in <thinking> tags... before writing
// your <answer> verdict", with no closing tags anywhere in the system
// prompt text). Requiring a closed pair would fail every prompt that uses
// this correct, common instructional pattern. Matched case-insensitively —
// pairedTagNames() already normalizes case for the same reason.
function mentionsTag(text, tagName) {
  return new RegExp(`<${tagName}[\\s>]|</${tagName}>`, 'i').test(text);
}

export function scoreDeterministicChecklist(content) {
  const text = typeof content === 'string' ? content : '';

  const exampleBlocks = [...text.matchAll(/<example>[\s\S]*?<\/example>/g)];
  const fewShotExamples = exampleBlocks.length >= 3 && exampleBlocks.length <= 5;

  const nonSectionTags = pairedTagNames(text).filter(
    (name) => name !== 'example' && !TIERED_COT_TAG_NAMES.has(name),
  );
  const xmlDelimiting = nonSectionTags.length >= 2;

  // This checks *consistent mention* of both tag names, not that every
  // <thinking> instance has a literal matching <answer> instance nearby: a
  // prompt legitimately mentions <thinking> more than once (e.g. "for each
  // finding, think in <thinking> tags before your <answer>" describes a
  // per-item loop, not a single literal pair) without that being a broken
  // tiering. What IS broken is one tag name never appearing at all while
  // the other does — a prompt referencing <thinking> but never <answer>
  // (or vice versa). A prompt with neither tag is treated as having no
  // reasoning step at all, which this deterministic check cannot fault:
  // whether a reasoning step was actually *needed* is a judgment call this
  // function has no basis to make, so it passes rather than penalizing a
  // prompt for a design choice it can't evaluate. Verifying the tags are
  // genuinely *well-formed* pairs where they do appear (not just mentioned)
  // is a judgment call left to the invoking agent, same as the five
  // fully-judgment checklist items above.
  const hasThinking = mentionsTag(text, 'thinking');
  const hasAnswer = mentionsTag(text, 'answer');
  const tieredChainOfThought = hasThinking === hasAnswer;

  return { fewShotExamples, xmlDelimiting, tieredChainOfThought };
}
