// A sandboxed dry-run harness for a generated loop (Epic #40 Story S8 Task
// #85): "executes the generated loop against a scripted mock environment
// before it runs unattended, checking that the declared stop condition
// actually fires." A generated loop's own step logic and stop condition
// are supplied by the caller as plain functions operating purely in-memory
// against a caller-scripted mock state — no real side effects (no shell
// exec, no network, no filesystem writes), which is what makes this
// "sandboxed": the dry run can never do anything except call the two
// functions it was given and count iterations.
//
// This is Task #85's mechanism made real, not a shape check: it actually
// runs the declared stop condition against the declared step function and
// observes whether it fires within a real bounded number of iterations —
// the same "actually execute, don't just check the text mentions a
// condition" discipline lib/verify-command-runner.mjs applies to a goal's
// verify command.

const DEFAULT_HARD_CEILING_MULTIPLIER = 3;
const DEFAULT_HARD_CEILING_MINIMUM = 20;

/**
 * Run a generated loop's `step`/`isDone` pair against a scripted mock
 * environment and report whether the declared stop condition actually
 * fires. Never runs past `hardCeiling` iterations regardless of what
 * `isDone` or `maxIterations` claim — this is the "sandboxed" backstop: a
 * caller-scripted `isDone` that never returns true cannot hang the harness.
 *
 * @param {object} args
 * @param {(state: any, iteration: number) => any} args.step - advances the
 *   mock state by one iteration; called with the previous state (undefined
 *   on the first call) and the current iteration index (0-based).
 * @param {(state: any, iteration: number) => boolean} args.isDone - the
 *   loop's own declared stop condition (a goal/score check). Checked
 *   BEFORE each `step` call, including before the first one — a loop whose
 *   condition is already satisfied at iteration 0 must dry-run as
 *   stopping immediately, not run one wasted iteration first.
 * @param {number} [args.maxIterations] - the loop's own declared
 *   iteration cap, if it has one (omit for a purely goal-checked loop with
 *   no separate numeric cap).
 * @param {number} [args.hardCeiling] - the harness's own absolute backstop,
 *   independent of anything the loop declares. Defaults to
 *   `max(maxIterations * 3, 20)` so a legitimately-declared cap has real
 *   headroom to be observed overshooting it (a "ranAway" case) without the
 *   harness cutting the observation off at exactly the declared cap.
 * @returns {{iterations: number, stoppedBy: ('condition'|'iteration-cap'|null), ranAway: boolean, finalState: any}}
 *   `stoppedBy` is `null` only when `ranAway` is true (hit `hardCeiling`
 *   without either the declared condition or the declared cap ever
 *   firing) — proof the declared stop condition does NOT actually work
 *   against this scripted scenario.
 */
export function dryRunLoop({ step, isDone, maxIterations, hardCeiling }) {
  if (typeof step !== 'function') throw new Error('dryRunLoop: step must be a function.');
  if (typeof isDone !== 'function') throw new Error('dryRunLoop: isDone must be a function.');

  const ceiling =
    hardCeiling ??
    Math.max(
      Number.isFinite(maxIterations) ? maxIterations * DEFAULT_HARD_CEILING_MULTIPLIER : 0,
      DEFAULT_HARD_CEILING_MINIMUM,
    );

  let state;
  let iterations = 0;
  let stoppedBy = null;

  while (iterations < ceiling) {
    if (isDone(state, iterations)) {
      stoppedBy = 'condition';
      break;
    }
    if (Number.isFinite(maxIterations) && iterations >= maxIterations) {
      stoppedBy = 'iteration-cap';
      break;
    }
    state = step(state, iterations);
    iterations += 1;
  }

  return {
    iterations,
    stoppedBy,
    ranAway: stoppedBy === null,
    finalState: state,
  };
}
