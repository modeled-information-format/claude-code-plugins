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

// A structurally-aware walk over a parsed JSON Schema node, distinguishing
// genuine schema KEYWORDS from arbitrary identifiers that merely sit at
// locations a keyword could also occupy. Two earlier, naive approaches
// were both confirmed broken by review:
//   - Walking every object VALUE blindly (treating any key as inspectable)
//     means a parameter literally NAMED "pattern" or "minimum" (e.g. a
//     glob-search tool's `pattern` argument, or a price-range tool's
//     `minimum`/`maximum` arguments) gets its NAME mistaken for the
//     keyword itself, even though its own sub-schema never declares that
//     keyword — `hasComplexRegex({ properties: { pattern: { type: 'string' } } })`
//     wrongly returned `true`.
//   - Detecting a recursive `$ref` via raw string-prefix path comparison
//     (`currentPath.startsWith(target.slice(1))`) has no JSON-Pointer
//     segment boundary, so a sibling named "node2" false-triggers against
//     a ref targeting "node" (`"node"` is a plain string-prefix of
//     `"node2"`); and it only catches a ref pointing directly at one of
//     ITS OWN ancestors, missing an indirect cycle through named `$defs`
//     (A refs B, B refs A) entirely.
//
// The fix: only recurse into the JSON-Schema-STRUCTURAL locations where a
// nested value is genuinely another schema (never into "properties"'/
// "$defs"'/"definitions"' own KEYS, which are arbitrary identifiers, only
// into their VALUES), and detect recursion via a real graph-cycle check
// over $defs/definitions/root — the only locations a `$ref` conventionally
// targets — rather than raw path-string comparison.

// Maps of name -> sub-schema: the KEYS are arbitrary identifiers (parameter
// names, or definition names) and must never be treated as keywords; only
// the VALUES are schemas to recurse into.
const SCHEMA_NAME_MAPS = ['properties', '$defs', 'definitions'];
// Arrays of sub-schemas.
const SCHEMA_ARRAYS = ['anyOf', 'oneOf', 'allOf'];
// A single sub-schema (or, for "items" in older drafts, an array of them).
const SCHEMA_SINGLE = ['items', 'additionalProperties', 'not', 'contains'];

/**
 * Visit every genuine schema node reachable from `root` (never a
 * "properties"/"$defs" KEY, only its VALUE), calling `visit(node, path)`
 * for each — `path` is that node's JSON Pointer, used by both the
 * unsupported-keyword checks (which only ever inspect a visited node's
 * OWN direct keys) and the recursive-schema graph builder below.
 */
function walkSchemaNodes(root, path, visit) {
  if (root === null || typeof root !== 'object' || Array.isArray(root)) return;
  visit(root, path);
  for (const key of SCHEMA_NAME_MAPS) {
    const map = root[key];
    if (map && typeof map === 'object' && !Array.isArray(map)) {
      for (const [name, subSchema] of Object.entries(map)) {
        walkSchemaNodes(subSchema, `${path}/${key}/${name}`, visit);
      }
    }
  }
  for (const key of SCHEMA_ARRAYS) {
    if (Array.isArray(root[key])) {
      root[key].forEach((subSchema, i) => walkSchemaNodes(subSchema, `${path}/${key}/${i}`, visit));
    }
  }
  for (const key of SCHEMA_SINGLE) {
    const value = root[key];
    if (Array.isArray(value)) {
      value.forEach((subSchema, i) => walkSchemaNodes(subSchema, `${path}/${key}/${i}`, visit));
    } else if (value && typeof value === 'object') {
      walkSchemaNodes(value, `${path}/${key}`, visit);
    }
  }
}

/** The definition locations a `$ref` can conventionally target: the schema root, plus every named `$defs`/`definitions` entry. */
function collectDefinitions(root) {
  const defs = new Map([['', root]]);
  for (const key of ['$defs', 'definitions']) {
    const map = root[key];
    if (map && typeof map === 'object' && !Array.isArray(map)) {
      for (const [name, subSchema] of Object.entries(map)) {
        defs.set(`/${key}/${name}`, subSchema);
      }
    }
  }
  return defs;
}

/** `"#"` resolves to the schema root (`''`); `"#/a/b"` resolves to `'/a/b'`; any other form (an `$anchor`, an external ref) is not resolvable here and returns `null`. */
function refTargetPath(ref) {
  if (ref === '#') return '';
  if (ref.startsWith('#/')) return ref.slice(1);
  return null;
}

/**
 * Build a directed graph over the schema's definition locations (root +
 * every `$defs`/`definitions` entry): an edge from A to B means A's own
 * subtree contains a `$ref` resolving to B. A cycle in this graph — direct
 * (A refs itself) or indirect (A refs B, B refs A) — is a genuinely
 * recursive schema, unsupported by Structured Outputs' constrained-
 * decoding compiler.
 */
function buildDefinitionRefGraph(root) {
  const defs = collectDefinitions(root);
  const graph = new Map();
  for (const [defPath, defSchema] of defs) {
    const targets = new Set();
    walkSchemaNodes(defSchema, defPath, (node) => {
      if (typeof node.$ref === 'string') {
        const target = refTargetPath(node.$ref);
        if (target !== null && defs.has(target)) targets.add(target);
      }
    });
    graph.set(defPath, targets);
  }
  return graph;
}

function hasCycle(graph) {
  const UNVISITED = 0;
  const IN_PROGRESS = 1;
  const DONE = 2;
  const state = new Map([...graph.keys()].map((node) => [node, UNVISITED]));

  function visit(node) {
    state.set(node, IN_PROGRESS);
    for (const neighbor of graph.get(node) ?? []) {
      const neighborState = state.get(neighbor);
      if (neighborState === IN_PROGRESS) return true; // back edge -> real cycle
      if (neighborState === UNVISITED && visit(neighbor)) return true;
    }
    state.set(node, DONE);
    return false;
  }

  return [...graph.keys()].some((node) => state.get(node) === UNVISITED && visit(node));
}

// JSON-Pointer SEGMENT comparison (split on "/", compare element by
// element), not a raw string-prefix test — `"/properties/node"` is a text
// substring of `"/properties/node2/..."` but must NOT count as an ancestor
// pointer; segment comparison correctly rejects that while still
// recognizing a genuine ancestor like `"/properties/node"` under
// `"/properties/node/properties/child"`.
function isAncestorPointer(targetPath, currentPath) {
  const targetSegments = targetPath.split('/').filter(Boolean);
  const currentSegments = currentPath.split('/').filter(Boolean);
  if (targetSegments.length > currentSegments.length) return false;
  return targetSegments.every((segment, i) => currentSegments[i] === segment);
}

/**
 * True if the schema contains a genuinely recursive `$ref` — either a
 * direct/ancestor self-reference (segment-compared, not string-prefix
 * compared) anywhere in the tree, or an indirect cycle through named
 * `$defs`/`definitions` entries (A refs B, B refs A) via a real graph-cycle
 * check. Neither the earlier naive string-prefix comparison (false-positive
 * on text-prefix sibling names, e.g. "node" vs "node2") nor a same-subtree-
 * only walk (false-negative on a two-`$defs`-entry mutual cycle) alone
 * would catch both cases.
 */
export function hasRecursiveSchema(root) {
  if (root === null || typeof root !== 'object') return false;

  let hasDirectSelfReference = false;
  walkSchemaNodes(root, '', (node, path) => {
    if (hasDirectSelfReference || typeof node.$ref !== 'string') return;
    const target = refTargetPath(node.$ref);
    if (target !== null && isAncestorPointer(target, path)) hasDirectSelfReference = true;
  });

  return hasDirectSelfReference || hasCycle(buildDefinitionRefGraph(root));
}

const UNSUPPORTED_NUMERIC_KEYS = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf'];

/** True if any visited schema NODE's own direct keys include one of `keys` — never a "properties"/"$defs" map's own key, only a real schema node's. */
function hasKeywordAnywhere(root, keys) {
  if (root === null || typeof root !== 'object') return false;
  let found = false;
  walkSchemaNodes(root, '', (node) => {
    if (!found && keys.some((key) => Object.prototype.hasOwnProperty.call(node, key))) found = true;
  });
  return found;
}

/** True if any of Structured Outputs' unsupported numerical bound keywords appear on any real schema node. */
export function hasNumericalBoundConstraints(node) {
  return hasKeywordAnywhere(node, UNSUPPORTED_NUMERIC_KEYS);
}

/** True if a `pattern` (regex) keyword appears on any real schema node — never a parameter merely NAMED "pattern". */
export function hasComplexRegex(node) {
  return hasKeywordAnywhere(node, ['pattern']);
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
