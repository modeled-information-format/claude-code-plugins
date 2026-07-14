import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

import {
  resolveCalibrationLogPath,
  recordCalibrationRun,
  readCalibrationRuns,
  latestCalibration,
  isCalibrated,
  assertCalibrated,
  needsRecalibration,
} from '../lib/calibration.mjs';

function tempCalibrationLog() {
  return join(tmpdir(), `caa-calibration-test-${randomBytes(8).toString('hex')}.jsonl`);
}

test('resolveCalibrationLogPath uses XDG_STATE_HOME when set, same category as trace.mjs', () => {
  const path = resolveCalibrationLogPath({ XDG_STATE_HOME: join('/custom', 'state') });
  assert.equal(path, join('/custom', 'state', 'artifact-authoring', 'calibration-runs.jsonl'));
});

test('assertCalibrated throws when no run has ever been recorded for a type', () => {
  const path = tempCalibrationLog();
  try {
    assert.throws(() => assertCalibrated('prompts', { path }), /has never been calibrated/);
  } finally {
    rmSync(path, { force: true });
  }
});

test('assertCalibrated throws when the latest run is below the minimum target agreement', () => {
  const path = tempCalibrationLog();
  try {
    recordCalibrationRun(
      { artifactType: 'goals', agreementPct: 0.5, sampleSize: 4, judgeModel: 'claude-sonnet-5' },
      { path },
    );
    assert.throws(() => assertCalibrated('goals', { path }), /is not calibrated.*50%/);
  } finally {
    rmSync(path, { force: true });
  }
});

test('assertCalibrated passes and returns the run when agreement meets the minimum target', () => {
  const path = tempCalibrationLog();
  try {
    const recorded = recordCalibrationRun(
      { artifactType: 'loops', agreementPct: 0.8, sampleSize: 4, judgeModel: 'claude-sonnet-5' },
      { path },
    );
    const run = assertCalibrated('loops', { path });
    assert.equal(run.agreementPct, recorded.agreementPct);
  } finally {
    rmSync(path, { force: true });
  }
});

test("assertCalibrated's error message reports the actual minAgreement override, not the module default", () => {
  const path = tempCalibrationLog();
  try {
    recordCalibrationRun(
      { artifactType: 'subagents', agreementPct: 0.8, sampleSize: 4, judgeModel: 'claude-sonnet-5' },
      { path },
    );
    // 80% agreement clears the default 75% target but not a caller-supplied
    // 90% target — the thrown message must cite 90%, not the 75% default.
    assert.throws(() => assertCalibrated('subagents', { path, minAgreement: 0.9 }), /is not calibrated.*90%/);
  } finally {
    rmSync(path, { force: true });
  }
});

test("assertCalibrated's error message never rounds a below-threshold score up to look like it passed", () => {
  const path = tempCalibrationLog();
  try {
    // 74.9% is below the 75% default target, but toFixed(0) would round the
    // achieved score up to "75%" and the target down to "75%" too, making
    // the message read as if the run had actually met the bar.
    recordCalibrationRun(
      { artifactType: 'tool-schemas', agreementPct: 0.749, sampleSize: 4, judgeModel: 'claude-sonnet-5' },
      { path },
    );
    assert.throws(() => assertCalibrated('tool-schemas', { path }), /scored 74% agreement \(target >= 75%\)/);
  } finally {
    rmSync(path, { force: true });
  }
});

test('isCalibrated flags aboveTargetRange without treating it as uncalibrated', () => {
  const path = tempCalibrationLog();
  try {
    recordCalibrationRun(
      { artifactType: 'eval-suites', agreementPct: 1.0, sampleSize: 4, judgeModel: 'claude-sonnet-5' },
      { path },
    );
    const { calibrated, aboveTargetRange } = isCalibrated('eval-suites', { path });
    assert.equal(calibrated, true);
    assert.equal(aboveTargetRange, true);
  } finally {
    rmSync(path, { force: true });
  }
});

test('latestCalibration picks the most recently timestamped run, not just the last one appended', () => {
  const path = tempCalibrationLog();
  try {
    recordCalibrationRun(
      { artifactType: 'subagents', agreementPct: 0.6, sampleSize: 4, judgeModel: 'm', timestamp: '2026-01-01T00:00:00Z' },
      { path },
    );
    recordCalibrationRun(
      { artifactType: 'subagents', agreementPct: 0.9, sampleSize: 4, judgeModel: 'm', timestamp: '2026-06-01T00:00:00Z' },
      { path },
    );
    const latest = latestCalibration('subagents', { path });
    assert.equal(latest.agreementPct, 0.9);
  } finally {
    rmSync(path, { force: true });
  }
});

test('readCalibrationRuns filters by artifactType across multiple types in one log', () => {
  const path = tempCalibrationLog();
  try {
    recordCalibrationRun({ artifactType: 'prompts', agreementPct: 0.8, sampleSize: 4, judgeModel: 'm' }, { path });
    recordCalibrationRun({ artifactType: 'goals', agreementPct: 0.8, sampleSize: 4, judgeModel: 'm' }, { path });
    const promptRuns = readCalibrationRuns('prompts', { path });
    assert.equal(promptRuns.length, 1);
    assert.equal(promptRuns[0].artifactType, 'prompts');
  } finally {
    rmSync(path, { force: true });
  }
});

test('needsRecalibration is true when no run exists', () => {
  const path = tempCalibrationLog();
  try {
    assert.equal(needsRecalibration('tool-schemas', { path }), true);
  } finally {
    rmSync(path, { force: true });
  }
});

test('needsRecalibration is true for a run older than maxAgeDays, false for a recent one', () => {
  const path = tempCalibrationLog();
  try {
    recordCalibrationRun(
      {
        artifactType: 'tool-schemas',
        agreementPct: 0.9,
        sampleSize: 4,
        judgeModel: 'm',
        timestamp: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(),
      },
      { path },
    );
    assert.equal(needsRecalibration('tool-schemas', { path, maxAgeDays: 90 }), true);

    recordCalibrationRun(
      { artifactType: 'tool-schemas', agreementPct: 0.9, sampleSize: 4, judgeModel: 'm' },
      { path },
    );
    assert.equal(needsRecalibration('tool-schemas', { path, maxAgeDays: 90 }), false);
  } finally {
    rmSync(path, { force: true });
  }
});

test('recordCalibrationRun preserves per-entry mismatches for audit', () => {
  const path = tempCalibrationLog();
  try {
    recordCalibrationRun(
      {
        artifactType: 'prompts',
        agreementPct: 0.75,
        sampleSize: 4,
        judgeModel: 'm',
        mismatches: [{ id: 'x', goldenLabel: 'good', judgeVerdict: 'bad' }],
      },
      { path },
    );
    const run = latestCalibration('prompts', { path });
    assert.equal(run.mismatches.length, 1);
    assert.equal(run.mismatches[0].id, 'x');
  } finally {
    rmSync(path, { force: true });
  }
});
