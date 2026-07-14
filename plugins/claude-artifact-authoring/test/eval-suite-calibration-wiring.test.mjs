// Real exercises against lib/calibration.mjs's actual file-backed
// calibration log (redirected to a temp path per test) — proving Tasks
// #79/#81's calibration wiring is genuinely checked against recorded runs,
// not just asserted in prose.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assertEvalSuiteCalibrationWired } from '../lib/eval-suite-calibration-wiring.mjs';
import { recordCalibrationRun } from '../lib/calibration.mjs';

function tempCalibrationLogPath() {
  const dir = mkdtempSync(join(tmpdir(), 'caa-eval-suite-calibration-test-'));
  return join(dir, 'calibration-runs.jsonl');
}

test('code-based and human graders are exempt from calibration wiring entirely', () => {
  assert.doesNotThrow(() => assertEvalSuiteCalibrationWired({ graderType: 'code-based' }));
  assert.doesNotThrow(() => assertEvalSuiteCalibrationWired({ graderType: 'human' }));
});

test('an unrecognized or missing graderType is rejected, never silently treated as exempt', () => {
  // Regression: an earlier version only checked `graderType !== 'llm-based'`
  // to decide exemption, so a typo, wrong casing, or omitted graderType all
  // silently took the "no calibration needed" path a genuine code-based/
  // human grader takes — exactly the gap this test locks in.
  assert.throws(
    () => assertEvalSuiteCalibrationWired({ graderType: 'LLM-based' }),
    /graderType must be one of/,
  );
  assert.throws(
    () => assertEvalSuiteCalibrationWired({ graderType: 'ai-based' }),
    /graderType must be one of/,
  );
  assert.throws(() => assertEvalSuiteCalibrationWired({}), /graderType must be one of/);
});

test('an llm-based grader with no targetArtifactType is rejected before any calibration lookup', () => {
  assert.throws(
    () => assertEvalSuiteCalibrationWired({ graderType: 'llm-based' }),
    /must name the targetArtifactType/,
  );
});

test('an llm-based grader with no recorded calibration run for its target is rejected', () => {
  const path = tempCalibrationLogPath();
  try {
    // Message delegated to lib/calibration.mjs's own assertCalibrated —
    // "has never been calibrated", distinct from the below-target message.
    assert.throws(
      () =>
        assertEvalSuiteCalibrationWired(
          { graderType: 'llm-based', targetArtifactType: 'prompts' },
          { path },
        ),
      /has never been calibrated/,
    );
  } finally {
    rmSync(path, { force: true });
  }
});

test('an llm-based grader with a real, passing, fresh calibration run is accepted', () => {
  const path = tempCalibrationLogPath();
  try {
    recordCalibrationRun(
      {
        artifactType: 'prompts',
        agreementPct: 1.0,
        sampleSize: 4,
        judgeModel: 'claude-test',
        timestamp: new Date(Date.now()).toISOString(),
      },
      { path },
    );
    assert.doesNotThrow(() =>
      assertEvalSuiteCalibrationWired({ graderType: 'llm-based', targetArtifactType: 'prompts' }, { path }),
    );
  } finally {
    rmSync(path, { force: true });
  }
});

test('an llm-based grader whose recorded calibration scored below target is rejected with an accurate message, not "no run recorded"', () => {
  // Regression: an earlier version's error message always said "no
  // calibration run is on record for it" even when a real run existed and
  // merely scored below target — a self-contradictory message once the
  // parenthetical ran alongside it. Delegating to assertCalibrated fixes
  // this: the message here correctly names the actual scored percentage.
  const path = tempCalibrationLogPath();
  try {
    recordCalibrationRun(
      {
        artifactType: 'goals',
        agreementPct: 0.5,
        sampleSize: 4,
        judgeModel: 'claude-test',
        timestamp: new Date(Date.now()).toISOString(),
      },
      { path },
    );
    assert.throws(
      () =>
        assertEvalSuiteCalibrationWired({ graderType: 'llm-based', targetArtifactType: 'goals' }, { path }),
      /latest run scored 50% agreement/,
    );
  } finally {
    rmSync(path, { force: true });
  }
});

test('an llm-based grader whose calibration is stale (Task #81 cadence) is rejected even though a passing run exists', () => {
  const path = tempCalibrationLogPath();
  try {
    const staleTimestamp = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
    recordCalibrationRun(
      {
        artifactType: 'loops',
        agreementPct: 1.0,
        sampleSize: 4,
        judgeModel: 'claude-test',
        timestamp: staleTimestamp,
      },
      { path },
    );
    assert.throws(
      () =>
        assertEvalSuiteCalibrationWired({ graderType: 'llm-based', targetArtifactType: 'loops' }, { path }),
      /calibration is.*stale/,
    );
  } finally {
    rmSync(path, { force: true });
  }
});
