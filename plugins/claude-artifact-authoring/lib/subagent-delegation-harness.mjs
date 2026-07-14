// A real integration-style delegation harness for a generated subagent
// (Epic #40 Story S10 Task #92): "invokes the orchestrating agent with
// tasks designed to hit and miss the subagent's description boundary,
// checking for correct delegation rather than only correct output."
//
// Whether a given task description SHOULD delegate to a given subagent is
// an LLM judgment call — the same reason lib/goal-checklist.mjs's
// per-check grounding and lib/loop-checklist.mjs's pattern-appropriateness
// item stay judgment items scored by the invoking agent, not a plain
// function. What IS genuinely mechanical, and what this module provides,
// is the scoring harness itself: given a set of hit/miss test cases and the
// agent's own real delegation judgment for each, compute real accuracy —
// never assumed, never skipped.

/**
 * Score a set of delegation hit/miss cases against a real decision
 * function. `decide` is the invoking agent's own G-Eval-style judgment for
 * whether the orchestrator would delegate a given task description to this
 * subagent — this harness does not simulate that judgment, it only scores
 * it against the declared expected outcomes.
 *
 * @param {Array<{taskDescription: string, shouldDelegate: boolean, label?: string}>} cases
 *   - hit cases (`shouldDelegate: true`) exercise tasks squarely inside the
 *     subagent's stated scope; miss cases (`shouldDelegate: false`) exercise
 *     tasks that sound similar but belong to a sibling subagent or no
 *     subagent at all — testing the description's BOUNDARY, not just its center.
 * @param {(taskDescription: string) => boolean} decide - the real delegation
 *   judgment to score, called once per case.
 * @returns {{accuracy: number, correct: number, total: number, results: Array}}
 */
export function scoreDelegationCases(cases, decide) {
  if (!Array.isArray(cases) || cases.length === 0) {
    throw new Error('scoreDelegationCases: cases must be a non-empty array of hit/miss test cases.');
  }
  if (typeof decide !== 'function') {
    throw new Error('scoreDelegationCases: decide must be a function.');
  }

  const results = cases.map((testCase) => {
    if (typeof testCase.taskDescription !== 'string' || typeof testCase.shouldDelegate !== 'boolean') {
      throw new Error(
        `scoreDelegationCases: each case needs a string taskDescription and boolean shouldDelegate, got ${JSON.stringify(testCase)}.`,
      );
    }
    const decided = Boolean(decide(testCase.taskDescription));
    return { ...testCase, decided, correct: decided === testCase.shouldDelegate };
  });

  const correct = results.filter((r) => r.correct).length;
  return { accuracy: correct / results.length, correct, total: results.length, results };
}

/**
 * Assert that a scored set of delegation cases includes at least one real
 * hit case AND one real miss case — a harness scoring only hits (or only
 * misses) never actually tests the description's BOUNDARY, per Task #92's
 * explicit "hit and miss" requirement.
 */
export function assertTestsBoundary(cases) {
  if (!Array.isArray(cases) || cases.length === 0) {
    throw new Error('assertTestsBoundary: cases must be a non-empty array.');
  }
  const hasHit = cases.some((c) => c.shouldDelegate === true);
  const hasMiss = cases.some((c) => c.shouldDelegate === false);
  if (!hasHit || !hasMiss) {
    throw new Error(
      'Delegation test cases must include at least one hit (shouldDelegate: true) AND one miss ' +
        '(shouldDelegate: false) — scoring only one side never tests the description\'s boundary.',
    );
  }
}
