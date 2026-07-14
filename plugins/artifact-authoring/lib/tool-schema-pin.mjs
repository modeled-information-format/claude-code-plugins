// Task #91: "The schema's version (via Story S1's versioning layout) is
// what other artifacts (subagents from Story S10, evals from Story S9) pin
// against — make it the single source of typed truth." Reuses
// lib/xdg-store.mjs's EXISTING version tracking rather than inventing a
// second versioning mechanism for tool schemas specifically — the "single
// source of truth" is the store's own `current.json` pointer, resolved
// here into the `{slug, version}` pin shape a dependent artifact (e.g. a
// subagent's `dependsOnToolSchemas[]`, Story S10 Task #90) actually records.

import { getCurrentVersion } from './xdg-store.mjs';

/**
 * Resolve the pin a dependent artifact should record for a tool schema:
 * its slug and its currently-promoted version. Throws if the schema has no
 * promoted (current) version yet — an artifact cannot pin against a draft
 * that has never passed the persistence pipeline's gate.
 *
 * @param {string} slug - the tool schema's slug in the central store.
 * @param {string} [root] - override the XDG store root (tests only).
 * @returns {{slug: string, version: number}}
 */
export function resolveToolSchemaPin(slug, root) {
  const version = getCurrentVersion('tool-schemas', slug, root);
  if (version === null) {
    throw new Error(
      `resolveToolSchemaPin: tool schema "${slug}" has no promoted (current) version — ` +
        'a dependent artifact cannot pin against a draft that has never passed the persistence gate.',
    );
  }
  return { slug, version };
}
