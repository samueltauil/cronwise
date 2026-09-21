#!/usr/bin/env node
/**
 * Move the `demo-start` tag to the current commit.
 *
 *   node scripts/retag-demo.mjs           # verify, then retag locally and push
 *   node scripts/retag-demo.mjs --local   # retag locally only, do not push
 *
 * `demo-start` marks the pristine state that `demo:reset` restores. Anything
 * committed after the tag is reverted by a reset, so whenever workshop material
 * is added - slides, docs, tooling - the tag has to move forward or the next
 * reset will delete it.
 *
 * The pre-flight check runs first: a tag is only useful if it points at a commit
 * where every planted defect is still present.
 */
import { execFileSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE_TAG = 'demo-start';
const localOnly = process.argv.includes('--local');

function git(argv, { allowFailure = false } = {}) {
  try {
    return execFileSync('git', argv, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    if (allowFailure) return null;
    throw new Error(`git ${argv.slice(0, 2).join(' ')} failed: ${error.stderr || error.message}`);
  }
}

const dirty = git(['status', '--porcelain']);
if (dirty) {
  console.error('\nWorking tree is not clean. Commit or discard changes before retagging:\n');
  console.error(dirty);
  console.error('\nThe tag must point at a committed state.\n');
  process.exit(1);
}

const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
if (branch !== 'main') {
  console.error(`\nOn branch "${branch}". Retag from main so the pristine state is the shared one.\n`);
  process.exit(1);
}

console.log('\nVerifying this commit is demo-ready before tagging it\n');
try {
  execSync('node scripts/verify-demo.mjs', { cwd: repoRoot, stdio: 'inherit' });
} catch {
  console.error('\nPre-flight failed. Refusing to tag a commit that is not demo-ready.\n');
  process.exit(1);
}

const previous = git(['rev-parse', '--short', BASE_TAG], { allowFailure: true });
const head = git(['rev-parse', '--short', 'HEAD']);

git(['tag', '-f', BASE_TAG, '-m', 'Pristine cronwise workshop state']);
console.log(`\n  ${BASE_TAG}: ${previous ?? '(new)'} -> ${head}`);

if (localOnly) {
  console.log('\nTagged locally. Push it with:\n  git push -f origin demo-start\n');
  process.exit(0);
}

const pushed = git(['push', '-f', 'origin', BASE_TAG], { allowFailure: true });
if (pushed === null) {
  console.error('\nTagged locally, but the push failed. Push it manually:\n  git push -f origin demo-start\n');
  process.exit(1);
}

console.log('\nPushed. Future resets will restore this commit.\n');
