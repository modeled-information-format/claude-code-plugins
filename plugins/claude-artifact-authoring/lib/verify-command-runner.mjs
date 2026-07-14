// Real execution of a goal's verify command against a reference solution
// (Epic #40 Story S7 Task #75: "a reference-solution smoke test proving the
// goal is actually achievable before it ships" — not merely checking that
// the goal's text *names* a command, which lib/goal-checklist.mjs's
// `measurableVerifyCommand` already does). A goal is not provably achievable
// until its own verify command has actually been run against a solution and
// observed to exit 0.
//
// Security: this runs an argv array via `spawnSync` with `shell: false` —
// never a concatenated shell string. A generated goal's verify command is
// untrusted-until-verified text (per the Epic's own NFR); the caller must
// split it into a vetted `command` + `args` array itself (e.g. via a
// reviewed parse of `extractVerifyCommands`'s output, never by handing an
// unparsed raw string to a shell). This module refuses to shell-interpret
// anything.

import { spawnSync } from 'node:child_process';

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Actually run a verify command and report whether it passed. This is a
 * real subprocess execution, not a simulation — the whole point of Task
 * #75's smoke test is proving the command really exits 0 against a real
 * reference solution, not just that the goal's prose mentions one.
 *
 * @param {object} args
 * @param {string} args.command - the program to execute (never shell-interpreted)
 * @param {string[]} [args.args] - argv, passed straight to the program (no shell expansion)
 * @param {string} [args.cwd] - working directory for the reference solution
 * @param {number} [args.timeoutMs] - kill and report `timedOut: true` past this
 * @returns {{ran: boolean, passed: boolean, exitCode: (number|null), timedOut: boolean, error: (string|null), stdout: string, stderr: string}}
 */
export function runReferenceSolutionSmokeTest({
  command,
  args = [],
  cwd,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  if (typeof command !== 'string' || command.trim() === '') {
    throw new Error('runReferenceSolutionSmokeTest: command must be a non-empty string.');
  }
  if (!Array.isArray(args) || args.some((a) => typeof a !== 'string')) {
    throw new Error('runReferenceSolutionSmokeTest: args must be an array of strings.');
  }

  const result = spawnSync(command, args, {
    cwd,
    timeout: timeoutMs,
    shell: false,
    encoding: 'utf8',
  });

  // A timeout kill sets BOTH result.error (ETIMEDOUT) and result.signal
  // (SIGTERM) — this must be checked before the generic result.error
  // branch below, or a timed-out process is misreported as "did not run"
  // (ran: false) instead of "ran but was killed for exceeding its bound"
  // (timedOut: true) — two genuinely different outcomes for this smoke
  // test's caller to distinguish.
  if (result.error?.code === 'ETIMEDOUT' || (result.signal === 'SIGTERM' && result.status === null)) {
    return {
      ran: true,
      passed: false,
      exitCode: null,
      timedOut: true,
      error: null,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  }

  if (result.error) {
    // ENOENT (command not found) and similar spawn-level failures land here
    // — reported as a smoke test that did not run, never mistaken for a
    // program that ran and legitimately failed.
    return {
      ran: false,
      passed: false,
      exitCode: null,
      timedOut: false,
      error: result.error.message,
      stdout: '',
      stderr: '',
    };
  }

  return {
    ran: true,
    passed: result.status === 0,
    exitCode: result.status,
    timedOut: false,
    error: null,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/**
 * Split a single-backtick verify-command string (e.g. from
 * `extractVerifyCommands`) into a vetted `{command, args}` pair for
 * `runReferenceSolutionSmokeTest`. Deliberately naive (whitespace split, no
 * quoting/escaping support) — this is NOT a shell parser, and is not meant
 * to handle arbitrary shell syntax (pipes, quoted args with spaces, env
 * vars). A generator encountering a verify command this can't safely split
 * should route it to human review rather than attempting to execute it.
 *
 * @param {string} raw
 * @returns {{command: string, args: string[]}}
 */
export function splitVerifyCommand(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error('splitVerifyCommand: raw must be a non-empty string.');
  }
  if (/["'|&;$<>]/.test(raw)) {
    throw new Error(
      `splitVerifyCommand: "${raw}" contains shell metacharacters this naive splitter cannot ` +
        'safely handle — route to human review instead of auto-executing.',
    );
  }
  const [command, ...args] = raw.trim().split(/\s+/);
  return { command, args };
}
