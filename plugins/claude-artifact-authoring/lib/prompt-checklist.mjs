// The deterministic subset (3 of 8 items) of the prompt generator's
// structured-prompting checklist (Epic #40 Story S6 Task #67). Same split
// this plugin already uses in lib/frontmatter-contract.mjs: what a plain
// function can actually verify lives here; what needs real judgment (is
// this role-setting *precise*, is this justification *actually*
// contextual, is this prompt at the "right altitude") is documented as
// explicit steps in skills/generate-prompt/SKILL.md for the invoking agent
// to score itself, using G-Eval-style reasoning-before-verdict — never
// faked as if a regex could grade prose quality.
//
// The full checklist (F: anthropic-structured-prompting-techniques, cited by
// the architecture doc's "Building block 1: Prompt generator" section) has
// eight items. Only three are mechanically checkable from the artifact's
// text alone:
//   - fewShotExamples: counts <example>...</example> blocks.
//   - xmlDelimiting: distinct, properly-paired XML-style section tags,
//     excluding <example> and the tiered-CoT tags (they have their own
//     dedicated checklist items and must not double-count here).
//   - tieredChainOfThought: <thinking> and <answer> opened the same number
//     of times (zero/zero is N/A, not a failure) — see the function's own
//     comment for why counting opening occurrences, not requiring closed
//     pairs, is the correct check for a system prompt's own text.
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

// Counts how many times a tiered-CoT tag name is *opened* — matched on
// "<tagname" followed by whitespace or ">", not requiring a corresponding
// closing tag, since a system prompt's job is normally to *instruct* the
// model to produce its own <thinking>/<answer> tags in its output, not to
// contain a closed demonstration pair itself (golden-sets/prompts.json's
// own "good-code-review-subagent" entry does exactly this: "think step by
// step in <thinking> tags... before writing your <answer> verdict", with no
// closing tags anywhere in the system prompt text — one open-style mention
// each). Counting (not just presence) is what makes "tiered" mean something
// beyond "both appear somewhere": a prompt with 3 <thinking> mentions and
// only 1 <answer> mention is a genuinely broken tiering, not a passing one,
// even though both tag names are technically "mentioned". Matched
// case-insensitively — pairedTagNames() already normalizes case for the
// same reason.
function countTagOpenings(text, tagName) {
  const matches = text.match(new RegExp(`<${tagName}[\\s>]`, 'gi'));
  return matches ? matches.length : 0;
}

export function scoreDeterministicChecklist(content) {
  const text = typeof content === 'string' ? content : '';

  // Case-insensitive and tolerant of attributes on the opening tag (e.g.
  // <example id="1">), matching the case-insensitivity xmlDelimiting and
  // tieredChainOfThought's tag matching already use — a generator drafting
  // <Example> or <example id="...">...</example> shouldn't silently score
  // as zero examples over tag-matching strictness alone.
  const exampleBlocks = [...text.matchAll(/<example(?:\s[^>]*)?>[\s\S]*?<\/example>/gi)];
  const fewShotExamples = exampleBlocks.length >= 3 && exampleBlocks.length <= 5;

  const nonSectionTags = pairedTagNames(text).filter(
    (name) => name !== 'example' && !TIERED_COT_TAG_NAMES.has(name),
  );
  const xmlDelimiting = nonSectionTags.length >= 2;

  // Requires the two tag names to be opened the same number of times —
  // zero/zero passes (no reasoning step at all is not this check's call to
  // make; see countTagOpenings' own comment), a positive equal count passes
  // (including the common single-mention instructional pattern), and any
  // mismatched count is a genuinely broken tiering, not a passing one.
  const thinkingCount = countTagOpenings(text, 'thinking');
  const answerCount = countTagOpenings(text, 'answer');
  const tieredChainOfThought = thinkingCount === answerCount;

  return { fewShotExamples, xmlDelimiting, tieredChainOfThought };
}
