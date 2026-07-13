---
name: grade-artifact
description: The shared calibrated-grading step every claude-artifact-authoring generator runs before treating an artifact as shippable — check the grader is calibrated against its golden set (AD-4's hard gate), have the invoking agent act as the LLM-judge, and record the verdict. Use this skill whenever a generator has produced a draft artifact and needs to grade it before persisting.
argument-hint: "<artifact type> <draft content>"
---

# grade-artifact

The LLM-judgment half of calibrated grading (Epic #40 Story S4), paired with
`lib/golden-set.mjs` and `lib/calibration.mjs`'s deterministic half. AD-4's
intent is unconditional: **no LLM-as-judge grader should auto-grade
unsupervised until calibrated against a golden, human-labeled set.** What
`assertCalibrated` actually enforces mechanically is narrower — a recorded
agreement percentage at or above the target threshold — it has no way to
verify the golden set's labels were independently human-authored rather than
self-labeled by the same session producing the judge verdicts. See "Known
limitation" below: this Story's own initial calibration is the self-labeled
case, satisfying the mechanical gate without yet satisfying AD-4's full
intent.

## The sequence

1. **Check the gate first — `assertCalibrated(artifactType)`.** Before
   grading anything, call this (from `lib/calibration.mjs`). It throws
   unless a calibration run is on record for `artifactType` with agreement
   at or above the target minimum. If it throws, **stop** — do not grade
   unsupervised. Either run calibration first (see step 4) or route the
   artifact to human review instead of auto-grading it.

2. **Judge, using G-Eval two-stage ordering.** Read the artifact type's
   golden set (`loadGoldenSet`, from `lib/golden-set.mjs`) for the stated
   `criteria`, then apply that same criteria to the draft artifact:
   reason step by step about each checklist item first (Stage 1), and only
   then emit a single pass/fail verdict (Stage 2) — reasoning before score,
   per TruLens's ordering. This step needs LLM judgment; it is the
   generator skill itself acting as judge, not a call into this plugin's
   `lib/` code.

3. **Grade the artifact, not the path.** The verdict is about the produced
   artifact's final content against the checklist — never about how many
   iterations the generator took, what mistakes were corrected along the
   way, or how confident the generation felt.

4. **Calibration runs, when needed — `computeAgreement` +
   `recordCalibrationRun`.** To (re-)calibrate a grader: judge every entry
   in its golden set (blind to the entries' `label` field), pass the
   verdicts to `computeAgreement`, and record the result with
   `recordCalibrationRun`. Re-run whenever `needsRecalibration(artifactType)`
   returns true (Task #63's cadence — default 90 days) or after a human
   spot-audit surfaces drift, per AD-4.

## Known limitation of this Story's initial calibration

The golden sets under `golden-sets/*.json` and their first calibration run
were both produced by the same authoring session (this Epic's Story S4) —
not an independently human-labeled set reviewed by a separate judge. The
100% agreement this produced is `isCalibrated`'s `aboveTargetRange: true`
case: technically passing the gate, but a weaker signal than a real blind
calibration would be. This is stated here rather than glossed over. A real
human spot-audit (AD-4) is the next step to genuinely strengthen it, not a
one-time exercise this Story treats as sufficient forever.
