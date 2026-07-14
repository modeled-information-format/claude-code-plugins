// The deterministic subset of the tool-schema generator's authoring
// checklist (Epic #40 Story S11 Tasks #89/#91), mirroring the split used
// throughout this plugin — but with a higher deterministic ratio than the
// other five generators, because this artifact type's own stated criteria
// (verbatim, golden-sets/tool-schemas.json): "Real JSON Schema within
// Structured Outputs' supported subset — no recursive schemas, no
// numerical min/max constraints, no complex regex — rejected (never
// silently emitted) if it relies on any of those" IS genuinely mechanical:
// recursion, numeric bounds, and regex are all things a plain function can
// honestly detect by walking the parsed schema tree, unlike the prose-
// judgment criteria the other five generators' artifacts carry.

export const TOOL_SCHEMA_CHECKLIST = Object.freeze([
  {
    key: 'isValidJSON',
    description:
      'The content parses as JSON with the expected tool-schema shape: a string `name`, and a ' +
      '`parameters` object schema (`type: "object"`).',
    deterministic: true,
  },
  {
    key: 'noRecursiveSchema',
    description:
      'No `$ref` anywhere in the parameters schema resolves back to an ancestor node (including ' +
      'the schema root, `"$ref": "#"`) — recursive schemas are explicitly unsupported by ' +
      "Structured Outputs' constrained-decoding compiler and must be rejected, never silently emitted.",
    deterministic: true,
  },
  {
    key: 'noNumericalBoundConstraints',
    description:
      'No `minimum`/`maximum`/`exclusiveMinimum`/`exclusiveMaximum`/`multipleOf` anywhere in the ' +
      'schema — numerical bound-checking belongs in application code after generation, not encoded ' +
      'in an unsupported schema keyword.',
    deterministic: true,
  },
  {
    key: 'noComplexRegex',
    description:
      'No `pattern` keyword anywhere in the schema — format validation belongs in application ' +
      "code, not an unsupported regex constraint Structured Outputs' compiler cannot honor.",
    deterministic: true,
  },
  {
    key: 'parameterDescriptionsClear',
    description:
      'Every parameter carries a description clear enough for a model to use it correctly without ' +
      'consulting external docs — not just a bare type with no explanation.',
    deterministic: false,
  },
]);

export const DETERMINISTIC_CHECKLIST_KEYS = Object.freeze(
  TOOL_SCHEMA_CHECKLIST.filter((item) => item.deterministic).map((item) => item.key),
);

function parseToolSchema(content) {
  if (typeof content !== 'string') return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function isValidToolSchemaShape(parsed) {
  return (
    !!parsed &&
    typeof parsed === 'object' &&
    typeof parsed.name === 'string' &&
    !!parsed.parameters &&
    typeof parsed.parameters === 'object' &&
    parsed.parameters.type === 'object'
  );
}

/**
 * Walk a parsed JSON Schema node looking for a `$ref` that resolves back
 * to an ancestor — the schema root (`"#"`) or any JSON Pointer path that is
 * a prefix of the ref's own location. This is a real structural walk, not
 * a literal `"$ref": "#"` string search: it also catches a ref pointing at
 * `"#/properties/children"` from underneath that very node, which a naive
 * search for the exact root marker would miss.
 */
export function hasRecursiveSchema(node, currentPath = '') {
  if (node === null || typeof node !== 'object') return false;
  if (Array.isArray(node)) {
    return node.some((item, i) => hasRecursiveSchema(item, `${currentPath}/${i}`));
  }
  if (typeof node.$ref === 'string') {
    const target = node.$ref;
    if (target === '#') return true;
    if (target.startsWith('#/') && currentPath.startsWith(target.slice(1))) return true;
  }
  return Object.entries(node).some(
    ([key, value]) => value !== null && typeof value === 'object' && hasRecursiveSchema(value, `${currentPath}/${key}`),
  );
}

const UNSUPPORTED_NUMERIC_KEYS = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf'];

function hasKeyAnywhere(node, keys) {
  if (node === null || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some((item) => hasKeyAnywhere(item, keys));
  if (keys.some((key) => Object.prototype.hasOwnProperty.call(node, key))) return true;
  return Object.values(node).some((value) => hasKeyAnywhere(value, keys));
}

/** True if any of Structured Outputs' unsupported numerical bound keywords appear anywhere in the schema. */
export function hasNumericalBoundConstraints(node) {
  return hasKeyAnywhere(node, UNSUPPORTED_NUMERIC_KEYS);
}

/** True if a `pattern` (regex) keyword appears anywhere in the schema. */
export function hasComplexRegex(node) {
  return hasKeyAnywhere(node, ['pattern']);
}

/**
 * Score the deterministic subset of `TOOL_SCHEMA_CHECKLIST` against a
 * drafted tool schema's JSON text. Returns `{ [key]: boolean }` for
 * exactly the four `deterministic: true` items — the caller
 * (skills/generate-tool-schema/SKILL.md) scores `parameterDescriptionsClear`
 * itself. An unparseable or structurally invalid schema fails all four,
 * since none of the other checks are meaningful without valid JSON to walk.
 *
 * @param {string} [content] - the drafted tool schema's JSON text.
 */
export function scoreDeterministicChecklist(content) {
  const parsed = parseToolSchema(content);
  if (!isValidToolSchemaShape(parsed)) {
    return {
      isValidJSON: false,
      noRecursiveSchema: false,
      noNumericalBoundConstraints: false,
      noComplexRegex: false,
    };
  }
  return {
    isValidJSON: true,
    noRecursiveSchema: !hasRecursiveSchema(parsed.parameters),
    noNumericalBoundConstraints: !hasNumericalBoundConstraints(parsed.parameters),
    noComplexRegex: !hasComplexRegex(parsed.parameters),
  };
}

// --- Task #89: explicit derivation-strategy and output-logic choice ---

/** The three prior-art derivation strategies Task #89 names, verbatim. */
export const DERIVATION_STRATEGIES = Object.freeze([
  'docstring-derived',
  'annotated-method-derived',
  'separate-yaml-derived',
]);

/** The validate-and-retry (Instructor) vs. constrained-decoding (Outlines) output-logic fork Task #89 names. */
export const OUTPUT_LOGIC_FORKS = Object.freeze(['validate-and-retry', 'constrained-decoding']);

/**
 * Assert that a drafted tool schema's generation record names both an
 * explicit derivation strategy and an explicit output-logic fork — Task
 * #89's "pick ... explicitly" requirement, never left implicit or defaulted.
 */
export function assertDerivationChoiceRecorded({ derivationStrategy, outputLogic }) {
  if (!DERIVATION_STRATEGIES.includes(derivationStrategy)) {
    throw new Error(
      `derivationStrategy must be one of ${DERIVATION_STRATEGIES.join(', ')}, got ${JSON.stringify(derivationStrategy)}.`,
    );
  }
  if (!OUTPUT_LOGIC_FORKS.includes(outputLogic)) {
    throw new Error(`outputLogic must be one of ${OUTPUT_LOGIC_FORKS.join(', ')}, got ${JSON.stringify(outputLogic)}.`);
  }
}
