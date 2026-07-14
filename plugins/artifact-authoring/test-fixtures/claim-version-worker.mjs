// Worker process for the real cross-process concurrency test in
// xdg-store.test.mjs. Each invocation is a genuinely separate OS process, so
// racing several of these against the same slug exercises claimNextVersionDir's
// EEXIST-retry path against real filesystem contention — a same-process,
// synchronous test cannot do this, since Node's synchronous fs calls never
// interleave within one thread (see PR #103 review discussion).
import { claimNextVersionDir } from '../lib/xdg-store.mjs';

const [, , root, type, slug] = process.argv;
const { version } = claimNextVersionDir(type, slug, root);
process.stdout.write(String(version));
