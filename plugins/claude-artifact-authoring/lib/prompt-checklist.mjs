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
//   - xmlDelimiting: distinct, properly-paired XML-style section tags.
//   - tieredChainOfThought: <thinking>/<answer> tiering, checked for
//     internal consistency rather than mere presence (see the function's
//     own comment for why "has <thinking>" alone is not the check).
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
export function scoreDeterministicChecklist(content) {
  const text = typeof content === 'string' ? content : '';

  const exampleBlocks = [...text.matchAll(/<example>[\s\S]*?<\/example>/g)];
  const fewShotExamples = exampleBlocks.length >= 3 && exampleBlocks.length <= 5;

  const nonExampleTags = pairedTagNames(text).filter((name) => name !== 'example');
  const xmlDelimiting = nonExampleTags.length >= 2;

  // "Tiered" means both tags present and consistently paired, not merely
  // "contains <thinking>" — a prompt with <thinking> but no matching
  // <answer> (or vice versa) is a broken tiering, not a passing one. A
  // prompt with neither tag is treated as having no reasoning step at all,
  // which this deterministic check cannot fault: whether a reasoning step
  // was actually *needed* is a judgment call this function has no basis to
  // make, so it passes rather than penalizing a prompt for a design choice
  // it can't evaluate.
  const hasThinking = /<thinking>[\s\S]*?<\/thinking>/.test(text);
  const hasAnswer = /<answer>[\s\S]*?<\/answer>/.test(text);
  const tieredChainOfThought = hasThinking === hasAnswer;

  return { fewShotExamples, xmlDelimiting, tieredChainOfThought };
}
