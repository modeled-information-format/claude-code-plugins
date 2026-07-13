// Central XDG_DATA_HOME artifact store for claude-artifact-authoring.
//
// Generated artifacts (prompts, goals, loops, eval-suites, subagent
// definitions, tool schemas) are durable user-level data, not configuration
// or a disposable cache — so this resolves under XDG_DATA_HOME
// (fallback ~/.local/share), not XDG_CONFIG_HOME (the convention gdlc's
// own store uses) or a hardcoded ~/.claude/ path (mnemonic's convention).
// See Epic #40's Decision #2 for the rationale.

import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
} from 'node:fs';
import { randomBytes } from 'node:crypto';

export const ARTIFACT_TYPES = Object.freeze([
  'prompts',
  'goals',
  'loops',
  'eval-suites',
  'subagents',
  'tool-schemas',
]);

const STORE_NAMESPACE = 'claude-artifact-authoring';
const CURRENT_POINTER_FILE = 'current.json';
const MAX_VERSION_CLAIM_ATTEMPTS = 50;

/** `${XDG_DATA_HOME:-~/.local/share}/claude-artifact-authoring`. */
export function resolveStoreRoot(env = process.env) {
  const dataHome =
    env.XDG_DATA_HOME && env.XDG_DATA_HOME !== ''
      ? env.XDG_DATA_HOME
      : join(homedir(), '.local', 'share');
  return join(dataHome, STORE_NAMESPACE);
}

function assertArtifactType(type) {
  if (!ARTIFACT_TYPES.includes(type)) {
    throw new Error(
      `Unknown artifact type "${type}" — expected one of: ${ARTIFACT_TYPES.join(', ')}`,
    );
  }
}

// slug/filename are external identifiers (generator-chosen, potentially
// derived from user input) that get joined straight into filesystem paths.
// Reject anything but a single safe path segment so a value like "../../etc"
// or "foo/../../bar" can't escape the store root (path traversal).
const SAFE_PATH_SEGMENT = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;

function assertSafePathSegment(value, label) {
  if (typeof value !== 'string' || !SAFE_PATH_SEGMENT.test(value)) {
    throw new Error(
      `Invalid ${label} "${value}" — must be a single path segment matching ${SAFE_PATH_SEGMENT} ` +
        '(no "/", "\\", "..", or leading/trailing separators).',
    );
  }
}

/** Directory holding every slug for one artifact type. */
export function typeDir(type, root = resolveStoreRoot()) {
  assertArtifactType(type);
  return join(root, type);
}

/** Directory holding every version of one named artifact. */
export function slugDir(type, slug, root = resolveStoreRoot()) {
  assertSafePathSegment(slug, 'slug');
  return join(typeDir(type, root), slug);
}

function versionDirName(version) {
  return `v${version}`;
}

function pointerPath(type, slug, root = resolveStoreRoot()) {
  return join(slugDir(type, slug, root), CURRENT_POINTER_FILE);
}

/** Highest existing version number for a slug, or 0 if none exist yet. */
export function latestVersion(type, slug, root = resolveStoreRoot()) {
  const dir = slugDir(type, slug, root);
  if (!existsSync(dir)) return 0;
  const versions = readdirSync(dir)
    .filter((name) => /^v\d+$/.test(name))
    .map((name) => Number(name.slice(1)));
  return versions.length ? Math.max(...versions) : 0;
}

/**
 * Atomically write the *current* pointer via write-temp-then-rename
 * (rename is atomic on POSIX filesystems), so a reader never observes a
 * half-written pointer file.
 */
function writePointerAtomic(type, slug, version, root) {
  const dir = slugDir(type, slug, root);
  mkdirSync(dir, { recursive: true });
  const target = pointerPath(type, slug, root);
  const tmp = join(dir, `.${CURRENT_POINTER_FILE}.${randomBytes(6).toString('hex')}.tmp`);
  writeFileSync(
    tmp,
    JSON.stringify({ version, promotedAt: new Date().toISOString() }, null, 2) + '\n',
  );
  renameSync(tmp, target);
}

/** The artifact version currently promoted as "current", or null if none. */
export function getCurrentVersion(type, slug, root = resolveStoreRoot()) {
  const target = pointerPath(type, slug, root);
  if (!existsSync(target)) return null;
  const { version } = JSON.parse(readFileSync(target, 'utf8'));
  return version;
}

/** Promote an already-written version to "current" (rollback-capable: pass any prior version). */
export function promoteVersion(type, slug, version, root = resolveStoreRoot()) {
  const dir = join(slugDir(type, slug, root), versionDirName(version));
  if (!existsSync(dir)) {
    throw new Error(`Cannot promote version ${version} of "${slug}" — ${dir} does not exist`);
  }
  writePointerAtomic(type, slug, version, root);
  return version;
}

/**
 * Claim the next version number and its directory, collision-safe across
 * concurrent sessions writing to the same shared, machine-wide store.
 *
 * `mkdirSync` with no `recursive` flag throws EEXIST if the directory is
 * already taken, so a race between two writers computing the same
 * "next version" is resolved by retrying with an incremented number rather
 * than silently overwriting one writer's content with the other's.
 */
export function claimNextVersionDir(type, slug, root = resolveStoreRoot()) {
  const dir = slugDir(type, slug, root);
  mkdirSync(dir, { recursive: true });
  let attempt = 0;
  let candidate = latestVersion(type, slug, root) + 1;
  while (attempt < MAX_VERSION_CLAIM_ATTEMPTS) {
    const versionPath = join(dir, versionDirName(candidate));
    try {
      mkdirSync(versionPath);
      return { version: candidate, path: versionPath };
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      candidate += 1;
      attempt += 1;
    }
  }
  throw new Error(
    `Could not claim a version directory for "${slug}" after ${MAX_VERSION_CLAIM_ATTEMPTS} attempts — ` +
      'another writer may be claiming versions faster than this one, or the store is corrupted.',
  );
}

/**
 * Write a new artifact version and, unless `promote: false`, atomically
 * promote it to "current". Returns the version number and the path the
 * artifact content was written to (caller writes the actual file(s) there
 * before calling `promote` if `promote: false` was passed, e.g. to run
 * mif-validate against the draft before it becomes current).
 */
export function writeArtifactVersion(type, slug, filename, content, opts = {}) {
  assertSafePathSegment(filename, 'filename');
  const { root = resolveStoreRoot(), promote = true } = opts;
  const { version, path: versionDir } = claimNextVersionDir(type, slug, root);
  writeFileSync(join(versionDir, filename), content);
  if (promote) writePointerAtomic(type, slug, version, root);
  return { version, path: join(versionDir, filename), versionDir };
}
