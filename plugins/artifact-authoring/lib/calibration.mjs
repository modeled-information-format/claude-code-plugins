// Calibration-run recording and the hard gate that blocks an uncalibrated
// LLM-as-judge grader from auto-grading unsupervised (AD-4). Calibration
// runs are operational/audit data, not durable generated content, so they
// live under XDG_STATE_HOME alongside the trace log — a separate file,
// since a calibration run isn't a trace span (it has no request/artifact to
// link to; it's a standing property of a grader for an artifact type).

import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { mkdirSync, appendFileSync, readFileSync, existsSync } from 'node:fs';

const STORE_NAMESPACE = 'artifact-authoring';
const CALIBRATION_LOG_FILENAME = 'calibration-runs.jsonl';

const MIN_TARGET_AGREEMENT = 0.75;
const MAX_TARGET_AGREEMENT = 0.9;
const DEFAULT_RECALIBRATION_MAX_AGE_DAYS = 90;

/** `${XDG_STATE_HOME:-~/.local/state}/artifact-authoring/calibration-runs.jsonl`. */
export function resolveCalibrationLogPath(env = process.env) {
  const stateHome =
    env.XDG_STATE_HOME && env.XDG_STATE_HOME !== ''
      ? env.XDG_STATE_HOME
      : join(homedir(), '.local', 'state');
  return join(stateHome, STORE_NAMESPACE, CALIBRATION_LOG_FILENAME);
}

/**
 * Record one calibration run. `agreementPct` below MIN_TARGET_AGREEMENT is
 * still recorded (the log is a history, not just a pass/fail gate) — it's
 * `assertCalibrated` that enforces the gate at grading time, using the
 * latest recorded run.
 */
export function recordCalibrationRun(
  { artifactType, agreementPct, sampleSize, judgeModel, mismatches = [], timestamp = new Date().toISOString() },
  { path = resolveCalibrationLogPath() } = {},
) {
  mkdirSync(dirname(path), { recursive: true });
  const run = { artifactType, agreementPct, sampleSize, judgeModel, mismatches, timestamp };
  appendFileSync(path, JSON.stringify(run) + '\n');
  return run;
}

/** Every recorded run for an artifact type (or all types, if omitted), oldest first. */
export function readCalibrationRuns(artifactType, { path = resolveCalibrationLogPath() } = {}) {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
  const runs = [];
  for (const line of lines) {
    try {
      runs.push(JSON.parse(line));
    } catch {
      // Skip a corrupted/partial line rather than failing the whole read —
      // same rationale as lib/trace.mjs's readTraceSpans.
    }
  }
  return artifactType ? runs.filter((r) => r.artifactType === artifactType) : runs;
}

// Date.parse, not a raw string comparison — string comparison silently
// picks the wrong "latest" run for any two timestamps not in the exact
// same lexicographically-comparable format (e.g. a "+02:00" offset instead
// of "Z"). An unparseable timestamp becomes -Infinity so it can never win
// against a validly-timestamped run — this result gates auto-grading, so a
// corrupt/missing timestamp must never be mistaken for "most recent."
function parsedTime(run) {
  const ms = Date.parse(run.timestamp);
  return Number.isNaN(ms) ? -Infinity : ms;
}

/** The most recent recorded run for an artifact type, or null if none. */
export function latestCalibration(artifactType, opts = {}) {
  const runs = readCalibrationRuns(artifactType, opts);
  if (runs.length === 0) return null;
  return runs.reduce((latest, r) => (parsedTime(r) > parsedTime(latest) ? r : latest));
}

/**
 * Whether an artifact type's grader is currently calibrated: a run exists
 * and its agreement meets the minimum target. Agreement above
 * MAX_TARGET_AGREEMENT is still "calibrated" (AD-4's 75-90% is a target
 * range to aim for, not an upper bound that rejects unusually strong
 * agreement) but is surfaced via `aboveTargetRange` so a caller can flag it
 * as a signal the golden set may be too easy/small, worth expanding.
 */
export function isCalibrated(artifactType, { minAgreement = MIN_TARGET_AGREEMENT, ...opts } = {}) {
  const run = latestCalibration(artifactType, opts);
  if (!run) return { calibrated: false, run: null, aboveTargetRange: false };
  return {
    calibrated: run.agreementPct >= minAgreement,
    run,
    aboveTargetRange: run.agreementPct > MAX_TARGET_AGREEMENT,
  };
}

/**
 * The hard gate (AD-4): throws unless the artifact type has a calibrated
 * grader on record. Call this before letting any grader auto-grade
 * unsupervised.
 */
export function assertCalibrated(artifactType, { minAgreement = MIN_TARGET_AGREEMENT, ...opts } = {}) {
  const { calibrated, run } = isCalibrated(artifactType, { minAgreement, ...opts });
  if (!calibrated) {
    throw new Error(
      run
        ? `Grader for "${artifactType}" is not calibrated: latest run scored ` +
          // Floor the achieved percent and ceil the target percent — this is
          // a "you didn't meet the bar" message, so rounding must never make
          // a below-threshold run (e.g. 74.9%) display as if it met a 75%
          // target.
          `${Math.floor(run.agreementPct * 100)}% agreement (target >= ` +
          `${Math.ceil(minAgreement * 100)}%). Re-run calibration before auto-grading.`
        : `Grader for "${artifactType}" has never been calibrated. Run calibration against its ` +
          'golden set before auto-grading unsupervised.',
    );
  }
  return run;
}

/**
 * Story S4 Task #63: periodic re-calibration cadence. True if there is no
 * calibration run on record, or the latest one is older than
 * `maxAgeDays` — LLM judges drift and lose human-level agreement without
 * frequent re-calibration.
 */
export function needsRecalibration(
  artifactType,
  { maxAgeDays = DEFAULT_RECALIBRATION_MAX_AGE_DAYS, ...opts } = {},
) {
  const run = latestCalibration(artifactType, opts);
  if (!run) return true;
  const runTime = Date.parse(run.timestamp);
  // Fail closed: an unparseable timestamp must force recalibration, not
  // silently compute `NaN > threshold` (always false) and be treated as
  // perpetually "recent."
  if (Number.isNaN(runTime)) return true;
  const ageMs = Date.now() - runTime;
  return ageMs > maxAgeDays * 24 * 60 * 60 * 1000;
}
