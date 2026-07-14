// Wires a generated eval suite into Story S4's EXISTING calibration
// infrastructure (lib/calibration.mjs), rather than reinventing calibration
// tracking for the suites this generator produces.
//
// Task #79: "The eval suite is itself versioned (via Story S1's layout) and
// its calibration run is logged." Versioning is already automatic — every
// persisted artifact goes through lib/xdg-store.mjs's version directories
// via lib/persist-artifact.mjs, no eval-suite-specific code needed. Logging
// its calibration run means: for an LLM-based suite, a run is on record
// (via `recordCalibrationRun`) for the artifact type IT GRADES — checked
// here, not re-implemented.
//
// Task #81: "Wire this generator's suites into Story S4's periodic human
// spot-audit / re-calibration cadence, since LLM judges drift unless
// frequently re-calibrated." An LLM-based suite's calibration must not just
// exist once — it must not have gone stale, per `needsRecalibration`'s
// existing cadence (default 90 days). Checked here too.

import { assertCalibrated, needsRecalibration } from './calibration.mjs';
import { GRADER_TYPES } from './eval-suite-checklist.mjs';

/**
 * Assert that a drafted eval suite's calibration is genuinely wired into
 * the existing calibration cadence for the artifact type it grades. A
 * code-based or human grader has no LLM-judge drift to calibrate against
 * and is exempt (per EVAL_SUITE_CHECKLIST's `calibrationRequiredForLLMGraders`
 * item) — this only applies real teeth to `graderType: 'llm-based'`.
 *
 * @param {object} args
 * @param {string} args.graderType - one of GRADER_TYPES (lib/eval-suite-checklist.mjs)
 * @param {string} [args.targetArtifactType] - the artifact type this suite
 *   grades (e.g. 'prompts', 'goals') — required when graderType is 'llm-based'.
 * @param {object} [opts] - passed through to assertCalibrated/needsRecalibration
 *   (e.g. `path` to override the calibration log location in tests).
 */
export function assertEvalSuiteCalibrationWired({ graderType, targetArtifactType }, opts = {}) {
  // Validated against the fixed enum, not just checked for equality with
  // 'llm-based' — an unrecognized value (a typo, wrong casing, or omitted
  // entirely) must be rejected outright, never silently take the "exempt,
  // no calibration needed" path a genuine code-based/human grader takes.
  if (!GRADER_TYPES.includes(graderType)) {
    throw new Error(
      `assertEvalSuiteCalibrationWired: graderType must be one of ${GRADER_TYPES.join(', ')}, got ${JSON.stringify(graderType)}.`,
    );
  }
  if (graderType !== 'llm-based') return;

  if (!targetArtifactType || typeof targetArtifactType !== 'string') {
    throw new Error(
      'An LLM-based eval suite must name the targetArtifactType its calibration is tracked ' +
        'against (e.g. "prompts", "goals") — there is no artifact type to check calibration for otherwise.',
    );
  }

  // Delegates to lib/calibration.mjs's own assertCalibrated rather than
  // re-deriving the calibrated/not-calibrated verdict here — it already
  // correctly distinguishes "never calibrated" from "a run exists but
  // scored below target," a distinction an earlier version of this
  // function collapsed into a single, self-contradictory "no calibration
  // run is on record (latest scored below target)" message.
  assertCalibrated(targetArtifactType, opts);

  if (needsRecalibration(targetArtifactType, opts)) {
    throw new Error(
      `Eval suite grades "${targetArtifactType}" with an LLM-based grader whose calibration is ` +
        "stale — re-calibrate per Task #81's periodic re-calibration cadence before shipping.",
    );
  }
}
