// Fail-loud check that the mif-docs plugin this plugin depends on
// (plugin.json's dependencies[]) is actually installed and invokable in the
// current environment, rather than a persistence step silently no-op'ing or
// producing a confusing downstream error when it isn't.
//
// Claude Code installs a plugin's vendored copy under
// ${CLAUDE_CONFIG_DIR:-~/.claude}/plugins/cache/<marketplace>/<plugin-name>/<version[-sha]>/
// (confirmed against this session's own CLAUDE_CONFIG_DIR + PATH entries).
// Multiple versions can coexist on disk from prior installs/upgrades; the
// highest semver-ish version whose scripts/ actually contains the mif-docs
// script this plugin needs is the one resolved.

import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, readdirSync } from 'node:fs';

const MARKETPLACE = 'modeled-information-format';
const PLUGIN_NAME = 'mif-docs';

// All three entry points the documented persist-artifact sequence actually
// depends on (skills/persist-artifact/SKILL.md steps 1, 3, 4) — checking
// only mif-validate let the dependency check pass while mif-frontmatter or
// mif-provenance were still missing, failing later with a confusing error
// instead of failing loud up front.
const REQUIRED_ENTRY_POINTS = Object.freeze([
  join('skills', 'mif-frontmatter', 'SKILL.md'),
  join('scripts', 'mif-provenance.mjs'),
  join('scripts', 'mif-validate.mjs'),
]);

function pluginCacheRoots(env = process.env) {
  const configDir = env.CLAUDE_CONFIG_DIR && env.CLAUDE_CONFIG_DIR !== ''
    ? env.CLAUDE_CONFIG_DIR
    : join(homedir(), '.claude');
  return [join(configDir, 'plugins', 'cache', MARKETPLACE, PLUGIN_NAME)];
}

function hasAllRequiredEntryPoints(versionDir) {
  return REQUIRED_ENTRY_POINTS.every((entry) => existsSync(join(versionDir, entry)));
}

// Only directory names shaped like a real version are ever considered — this
// guarantees `base()` below never sees a non-numeric segment (no NaN from
// Number()), rather than patching the comparator to tolerate NaN inputs.
const VERSION_DIR_NAME = /^\d+\.\d+\.\d+(-[0-9a-f]+)?$/;

// Best-effort version compare: numeric dot-segments win; a trailing
// "-<sha>" build suffix (e.g. "0.4.3-ade02650fa36") doesn't affect ordering
// against its own base version — same rule `claude plugin validate`'s own
// version-sync check treats ref+sha pins under. When the base versions tie
// (e.g. "0.4.3" vs. "0.4.3-ade02650fa36", the same release pinned two ways),
// break the tie on the full string so resolution is deterministic —
// independent of `readdirSync`'s filesystem-dependent order — rather than
// returning 0 and leaving it to Array.sort()'s stability.
function compareVersions(a, b) {
  const base = (v) => v.split('-')[0].split('.').map(Number);
  const [ba, bb] = [base(a), base(b)];
  for (let i = 0; i < Math.max(ba.length, bb.length); i += 1) {
    const diff = (ba[i] ?? 0) - (bb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Resolve the installed mif-docs plugin's directory, or null if no
 * installed version actually has the script this module needs.
 */
export function resolveMifDocsDir(env = process.env) {
  for (const root of pluginCacheRoots(env)) {
    if (!existsSync(root)) continue;
    const versions = readdirSync(root).filter(
      (name) => VERSION_DIR_NAME.test(name) && hasAllRequiredEntryPoints(join(root, name)),
    );
    if (versions.length === 0) continue;
    versions.sort(compareVersions);
    return join(root, versions[versions.length - 1]);
  }
  return null;
}

/**
 * Throw a clear, actionable error if mif-docs isn't installed/invokable,
 * rather than letting a persistence step fail confusingly later or
 * silently skip a step it depends on. Returns the resolved plugin dir on
 * success, so callers can build script paths from it directly.
 */
export function assertMifDocsAvailable(env = process.env) {
  const dir = resolveMifDocsDir(env);
  if (!dir) {
    throw new Error(
      `mif-docs plugin not found (searched ${pluginCacheRoots(env).join(', ')} for a version ` +
        `containing all of: ${REQUIRED_ENTRY_POINTS.join(', ')}). This plugin's persistence ` +
        'pipeline requires it — install with `/plugin install mif-docs@modeled-information-format` ' +
        'and retry.',
    );
  }
  return dir;
}
