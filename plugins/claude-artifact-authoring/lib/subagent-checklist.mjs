// The deterministic subset of the subagent-definition generator's
// authoring checklist (Epic #40 Story S10 Task #88), mirroring the split
// used throughout this plugin. A subagent is distinct from a plain prompt
// because it carries its own frontmatter contract (name/description/tools/
// model), not just a system prompt — golden-sets/subagents.json's own
// stated criteria (verbatim): "A sharply scoped tool allow-list
// (self-contained, minimal overlap with sibling subagents) and a
// description precise enough that the orchestrator reliably delegates to
// it and not another subagent... the frontmatter contract (name/
// description/tools/model) is validated separately" from the
// structured-prompting checklist (which applies to the system-prompt body,
// per lib/prompt-checklist.mjs, and is not re-implemented here).

export const SUBAGENT_CHECKLIST = Object.freeze([
  {
    key: 'hasFrontmatterFields',
    description:
      'The frontmatter block declares name, description, and tools — the minimum contract a ' +
      'subagent definition must carry (model is optional; the orchestrator has a default).',
    deterministic: true,
  },
  {
    key: 'toolAllowListScoped',
    description:
      'The tool allow-list is sharply scoped to the subagent\'s stated role — self-contained, not ' +
      'an "everything" list, no tools the described role has no use for.',
    deterministic: false,
  },
  {
    key: 'descriptionStatesBoundary',
    description:
      'The description states an explicit non-goal or boundary (what this subagent does NOT do, ' +
      'and/or a pointer to the sibling subagent that owns that instead) — minimizing mis-delegation ' +
      'risk, not just describing what it does do.',
    deterministic: true,
  },
  {
    key: 'descriptionStatesTrigger',
    description:
      'The description states an explicit trigger condition ("Use when...", "Use PROACTIVELY ' +
      'after...") an orchestrator can pattern-match against — not just a topic summary.',
    deterministic: true,
  },
  {
    key: 'minimalOverlapWithSiblings',
    description:
      'The description\'s claimed responsibility does not overlap with another known sibling ' +
      'subagent\'s — an orchestrator must have a reliable, unambiguous signal for which one to pick. ' +
      'Not applicable when no sibling subagent context is available to check against.',
    deterministic: false,
  },
]);

export const DETERMINISTIC_CHECKLIST_KEYS = Object.freeze(
  SUBAGENT_CHECKLIST.filter((item) => item.deterministic).map((item) => item.key),
);

// Matches the frontmatter block: a leading "---" line, its content, and
// the closing "---" line — the same shape every subagent/skill/command
// definition in this org uses.
const FRONTMATTER_BLOCK = /^---\n([\s\S]*?)\n---/;

function extractFrontmatterBlock(text) {
  const match = FRONTMATTER_BLOCK.exec(text);
  return match ? match[1] : null;
}

function hasFrontmatterFields(text) {
  const block = extractFrontmatterBlock(text);
  if (!block) return false;
  return /^name:/m.test(block) && /^description:/m.test(block) && /^tools:/m.test(block);
}

// A YAML block-scalar indicator ("|", ">", with optional chomping/
// indentation modifiers like "|-", ">+", ">4") on the description: line
// itself — the real content lives on the following, more-indented lines,
// not on this line.
const BLOCK_SCALAR_INDICATOR = /^[|>][-+0-9]*$/;

/**
 * The frontmatter's `description:` field value, reconstructed across
 * lines when written as a YAML block scalar (`description: |` / `>`,
 * content indented on following lines) — not just the same-line text. A
 * single-line description (the convention every entry in
 * golden-sets/subagents.json uses) is returned unchanged; this only adds
 * handling for the multi-line case, which an earlier version silently
 * truncated to the bare block-scalar indicator, scoring a well-written
 * multi-line description as if it stated neither a trigger nor a boundary.
 * Returns '' if no description field is present at all.
 */
export function extractDescriptionValue(text) {
  const block = extractFrontmatterBlock(text);
  if (!block) return '';
  const lines = block.split('\n');
  const startIndex = lines.findIndex((line) => /^description:/.test(line));
  if (startIndex === -1) return '';

  const firstLine = lines[startIndex].replace(/^description:\s*/, '');
  const parts = BLOCK_SCALAR_INDICATOR.test(firstLine.trim()) ? [] : [firstLine];

  for (let i = startIndex + 1; i < lines.length; i += 1) {
    if (/^\s+\S/.test(lines[i])) {
      parts.push(lines[i].trim());
    } else {
      break; // a line back at column 0 ends the description field
    }
  }
  return parts.join(' ').trim();
}

// A negation word ("do not"/"don't"/"never"/"does not"/"doesn't")
// IMMEDIATELY before "use" means this is an instruction about when NOT to
// delegate, not a real trigger declaration — e.g. "Do not use this when
// the input is malformed" is not itself a trigger condition. Same
// negation-lookback discipline lib/goal-checklist.mjs's boundedConstraints
// and lib/loop-checklist.mjs's explicitStopCondition already apply to
// their own mention-presence checks.
const NEGATED_USE = /\b(?:do\s+not|don'?t|never|does\s+not|doesn'?t)\s*$/i;
const TRIGGER_LANGUAGE = /\buse\b[\s\S]{0,20}?\b(proactively|when|after|for)\b/i;

function hasTriggerLanguage(description) {
  for (const match of description.matchAll(/\buse\b/gi)) {
    const before = description.slice(Math.max(0, match.index - 15), match.index);
    if (NEGATED_USE.test(before)) continue;
    const after = description.slice(match.index, match.index + 30);
    if (TRIGGER_LANGUAGE.test(after)) return true;
  }
  return false;
}

// Deliberately narrower than a bare "\bnever\b" (which an earlier version
// included) — "never crashes even on huge files" is a reliability claim,
// not a stated non-goal/scope boundary, and every real good entry in
// golden-sets/subagents.json uses "does not"/"not for"/"not the" instead.
const BOUNDARY_LANGUAGE = /\bdoes\s+not\b|\bnot\s+for\b|\bnot\s+the\b/i;

/**
 * Score the deterministic subset of `SUBAGENT_CHECKLIST` against a drafted
 * subagent's full markdown text (frontmatter + body). Returns
 * `{ [key]: boolean }` for exactly the three `deterministic: true` items —
 * the caller (skills/generate-subagent/SKILL.md) scores the remaining two
 * judgment items itself.
 *
 * @param {string} [content] - non-string input is treated as an empty string.
 */
export function scoreDeterministicChecklist(content) {
  const text = typeof content === 'string' ? content : '';
  const description = extractDescriptionValue(text);
  return {
    hasFrontmatterFields: hasFrontmatterFields(text),
    descriptionStatesBoundary: BOUNDARY_LANGUAGE.test(description),
    descriptionStatesTrigger: hasTriggerLanguage(description),
  };
}

/**
 * Task #90: assert a drafted subagent's provenance record names its parent
 * skill/command and (if any exist yet) the tool-schema artifacts it
 * depends on. `dependsOnToolSchemas` may legitimately be an empty array —
 * Story S11 (tool-schema generator) is a soft dependency per this Story's
 * own "Why this order" framing: record the link once S11 exists, don't
 * require it to already exist.
 */
export function assertSubagentProvenanceRecorded({ parentSkillOrCommand, dependsOnToolSchemas }) {
  if (!parentSkillOrCommand || typeof parentSkillOrCommand !== 'string' || parentSkillOrCommand.trim() === '') {
    throw new Error(
      'A subagent\'s provenance must name its parentSkillOrCommand (which skill/command it ' +
        'supports) — a non-empty string is required, even if dependsOnToolSchemas is empty.',
    );
  }
  if (dependsOnToolSchemas !== undefined && !Array.isArray(dependsOnToolSchemas)) {
    throw new Error('dependsOnToolSchemas must be an array (may be empty) if provided.');
  }
}
