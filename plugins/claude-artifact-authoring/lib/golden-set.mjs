// Golden-set loading and agreement computation (Epic #40 Story S4). What's
// deterministic here: reading a committed golden set, validating its shape,
// and computing agreement between a judge's verdicts and the human labels.
// What's NOT here: the judging itself — an LLM-judge grader is invoked by
// the calling generator's eval step (or, for calibration, by a human
// reviewer), never simulated by a plain function. A "judge" that could be
// reduced to deterministic code wouldn't need calibrating in the first
// place.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_GOLDEN_SETS_DIR = join(__dirname, '..', 'golden-sets');

const VALID_LABELS = Object.freeze(['good', 'bad']);

function assertValidGoldenSet(data, sourcePath) {
  if (!data?.artifactType || typeof data.artifactType !== 'string') {
    throw new Error(`${sourcePath}: missing or invalid "artifactType"`);
  }
  if (!Array.isArray(data.entries) || data.entries.length === 0) {
    throw new Error(`${sourcePath}: "entries" must be a non-empty array`);
  }
  const seenIds = new Set();
  for (const entry of data.entries) {
    if (!entry.id || typeof entry.id !== 'string') {
      throw new Error(`${sourcePath}: an entry is missing a string "id"`);
    }
    if (seenIds.has(entry.id)) {
      throw new Error(`${sourcePath}: duplicate entry id "${entry.id}"`);
    }
    seenIds.add(entry.id);
    if (!VALID_LABELS.includes(entry.label)) {
      throw new Error(
        `${sourcePath}: entry "${entry.id}" has label "${entry.label}", expected one of ${VALID_LABELS.join('/')}`,
      );
    }
    if (!entry.content || typeof entry.content !== 'string') {
      throw new Error(`${sourcePath}: entry "${entry.id}" is missing string "content"`);
    }
    if (!entry.rationale || typeof entry.rationale !== 'string') {
      throw new Error(`${sourcePath}: entry "${entry.id}" is missing string "rationale"`);
    }
  }
}

/** Load and validate the committed golden set for one artifact type. */
export function loadGoldenSet(artifactType, { goldenSetsDir = DEFAULT_GOLDEN_SETS_DIR } = {}) {
  const sourcePath = join(goldenSetsDir, `${artifactType}.json`);
  if (!existsSync(sourcePath)) {
    throw new Error(`No golden set found for artifact type "${artifactType}" at ${sourcePath}`);
  }
  const data = JSON.parse(readFileSync(sourcePath, 'utf8'));
  assertValidGoldenSet(data, sourcePath);
  if (data.artifactType !== artifactType) {
    throw new Error(
      `${sourcePath}: artifactType field says "${data.artifactType}" but was loaded as "${artifactType}"`,
    );
  }
  return data;
}

/**
 * Compare a judge's verdicts against a golden set's human labels.
 * `judgeVerdicts` is `{ [entryId]: 'good' | 'bad' }` — every entry in the
 * golden set must have a verdict, or this throws (a partial calibration
 * run isn't a real one).
 */
export function computeAgreement(goldenSet, judgeVerdicts) {
  const mismatches = [];
  let matched = 0;
  for (const entry of goldenSet.entries) {
    const verdict = judgeVerdicts[entry.id];
    if (verdict === undefined) {
      throw new Error(`No judge verdict provided for golden-set entry "${entry.id}"`);
    }
    if (!VALID_LABELS.includes(verdict)) {
      throw new Error(`Invalid judge verdict "${verdict}" for entry "${entry.id}"`);
    }
    if (verdict === entry.label) {
      matched += 1;
    } else {
      mismatches.push({ id: entry.id, humanLabel: entry.label, judgeVerdict: verdict });
    }
  }
  const total = goldenSet.entries.length;
  return { agreementPct: matched / total, matched, total, mismatches };
}
