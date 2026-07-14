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

import { isCalibrated, needsRecalibration } from './calibration.mjs';

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
 * @param {object} [opts] - passed through to isCalibrated/needsRecalibration
 *   (e.g. `path` to override the calibration log location in tests).
 */
export function assertEvalSuiteCalibrationWired({ graderType, targetArtifactType }, opts = {}) {
  if (graderType !== 'llm-based') return;

  if (!targetArtifactType || typeof targetArtifactType !== 'string') {
    throw new Error(
      'An LLM-based eval suite must name the targetArtifactType its calibration is tracked ' +
        'against (e.g. "prompts", "goals") — there is no artifact type to check calibration for otherwise.',
    );
  }

  const { calibrated, run } = isCalibrated(targetArtifactType, opts);
  if (!calibrated) {
    throw new Error(
      `Eval suite grades "${targetArtifactType}" with an LLM-based grader, but no calibration run ` +
        `is on record for it${run ? ` (latest scored below target)` : ''} — calibrate before this ` +
        'suite may auto-grade unsupervised, per AD-4.',
    );
  }

  if (needsRecalibration(targetArtifactType, opts)) {
    throw new Error(
      `Eval suite grades "${targetArtifactType}" with an LLM-based grader whose calibration is ` +
        "stale — re-calibrate per Task #81's periodic re-calibration cadence before shipping.",
    );
  }
}
