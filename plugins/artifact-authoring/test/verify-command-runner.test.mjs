// Real subprocess execution tests (Task #75) — these actually spawn `node`
// child processes and observe real exit codes, proving the smoke-test
// mechanism genuinely runs and distinguishes a passing reference solution
// from a failing one. This repo has no Python/pytest fixture to run the
// golden set's own `pytest test/auth -q` against, so a safe, self-contained
// `node -e` invocation stands in as the "reference solution" — what's under
// test is the runner's real execution and pass/fail detection, not the
// specific tool named in any one golden-set entry's prose.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runReferenceSolutionSmokeTest, splitVerifyCommand } from '../lib/verify-command-runner.mjs';

test('a real passing reference solution is observed to exit 0', () => {
  const result = runReferenceSolutionSmokeTest({
    command: process.execPath,
    args: ['-e', 'process.exit(0)'],
  });
  assert.equal(result.ran, true);
  assert.equal(result.passed, true);
  assert.equal(result.exitCode, 0);
  assert.equal(result.timedOut, false);
  assert.equal(result.error, null);
});

test('a real failing reference solution is observed to exit non-zero, not silently treated as passing', () => {
  const result = runReferenceSolutionSmokeTest({
    command: process.execPath,
    args: ['-e', 'process.exit(1)'],
  });
  assert.equal(result.ran, true);
  assert.equal(result.passed, false);
  assert.equal(result.exitCode, 1);
});

test('stdout is actually captured from the real subprocess', () => {
  const result = runReferenceSolutionSmokeTest({
    command: process.execPath,
    args: ['-e', "process.stdout.write('reference solution ran'); process.exit(0)"],
  });
  assert.equal(result.passed, true);
  assert.match(result.stdout, /reference solution ran/);
});

test('a nonexistent command is reported as not-ran, never mistaken for a program that ran and failed', () => {
  const result = runReferenceSolutionSmokeTest({
    command: 'this-command-does-not-exist-anywhere-12345',
    args: [],
  });
  assert.equal(result.ran, false);
  assert.equal(result.passed, false);
  assert.equal(result.exitCode, null);
  assert.ok(result.error);
});

test('a real command that exceeds its timeout is reported as timedOut, not passed', () => {
  const result = runReferenceSolutionSmokeTest({
    command: process.execPath,
    args: ['-e', 'setTimeout(() => process.exit(0), 2000)'],
    timeoutMs: 100,
  });
  assert.equal(result.timedOut, true);
  assert.equal(result.passed, false);
});

test('runReferenceSolutionSmokeTest rejects a non-string command', () => {
  assert.throws(() => runReferenceSolutionSmokeTest({ command: 42 }), /non-empty string/);
});

test('runReferenceSolutionSmokeTest rejects non-array args', () => {
  assert.throws(
    () => runReferenceSolutionSmokeTest({ command: 'node', args: 'not-an-array' }),
    /array of strings/,
  );
});

test('splitVerifyCommand splits a plain command+args string', () => {
  assert.deepEqual(splitVerifyCommand('pytest test/auth -q'), {
    command: 'pytest',
    args: ['test/auth', '-q'],
  });
  assert.deepEqual(splitVerifyCommand('npm test'), { command: 'npm', args: ['test'] });
});

test('splitVerifyCommand refuses shell metacharacters rather than silently mis-splitting them', () => {
  assert.throws(() => splitVerifyCommand('npm test && rm -rf /'), /shell metacharacters/);
  assert.throws(() => splitVerifyCommand('echo "hello world"'), /shell metacharacters/);
});

test('splitVerifyCommand rejects empty input', () => {
  assert.throws(() => splitVerifyCommand(''), /non-empty string/);
  assert.throws(() => splitVerifyCommand('   '), /non-empty string/);
});
