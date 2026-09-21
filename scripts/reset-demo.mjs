#!/usr/bin/env node
/**
 * Restore the cronwise workshop repository to its pristine demo state.
 *
 *   node scripts/reset-demo.mjs            # reset the local clone only
 *   node scripts/reset-demo.mjs --remote   # also restore GitHub issues and branches
 *   node scripts/reset-demo.mjs --yes      # skip the confirmation prompt
 *
 * Local reset discards every change made during a workshop: it returns main to
 * the `demo-start` tag, deletes branches created during the session, and removes
 * untracked files. Ignored files such as node_modules are left in place so the
 * next run starts fast.
 */
import { execFileSync, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE_TAG = 'demo-start';
const PROTECTED_BRANCHES = new Set(['main', 'master']);

const args = new Set(process.argv.slice(2));
const includeRemote = args.has('--remote');
const skipPrompt = args.has('--yes') || args.has('-y');

function git(argv, { allowFailure = false } = {}) {
  try {
    return execFileSync('git', argv, { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch (error) {
    if (allowFailure) return null;
    throw error;
  }
}

function gh(argv, { allowFailure = true } = {}) {
  try {
    return execFileSync('gh', argv, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    if (allowFailure) return null;
    throw error;
  }
}

function step(message) {
  console.log(`  - ${message}`);
}

async function confirm() {
  if (skipPrompt) return true;
  const rl = createInterface({ input: stdin, output: stdout });
  const scope = includeRemote ? 'LOCAL changes and GitHub issue/branch state' : 'LOCAL changes';
  const answer = await rl.question(`\nThis discards all ${scope}. Continue? [y/N] `);
  rl.close();
  return answer.trim().toLowerCase() === 'y';
}

function resetLocal() {
  console.log('\nResetting local repository');

  const dirty = git(['status', '--porcelain']);
  if (dirty) {
    step(`discarding ${dirty.split('\n').length} uncommitted change(s)`);
  }

  git(['fetch', 'origin', '--tags', '--prune'], { allowFailure: true });

  const hasTag = git(['rev-parse', '--verify', `refs/tags/${BASE_TAG}`], { allowFailure: true });
  const target = hasTag ? BASE_TAG : 'origin/main';
  step(`reset target: ${target}`);

  git(['checkout', '--force', 'main']);
  git(['reset', '--hard', target]);
  step('main reset to pristine commit');

  const branches = (git(['branch', '--format=%(refname:short)']) || '')
    .split('\n')
    .map((b) => b.trim())
    .filter((b) => b && !PROTECTED_BRANCHES.has(b));

  for (const branch of branches) {
    git(['branch', '-D', branch], { allowFailure: true });
    step(`deleted local branch ${branch}`);
  }

  git(['clean', '-fd']);
  step('removed untracked files');

  if (!existsSync(join(repoRoot, 'node_modules'))) {
    step('node_modules missing, installing dependencies');
    execSync('npm install --no-fund --no-audit', { cwd: repoRoot, stdio: 'inherit' });
  }
}

function resetRemote() {
  console.log('\nRestoring GitHub state');

  if (!gh(['auth', 'status'])) {
    step('gh CLI not authenticated, skipping remote reset');
    return;
  }

  git(['push', 'origin', 'main', '--force-with-lease'], { allowFailure: true });
  step('pushed pristine main');

  const prsRaw = gh(['pr', 'list', '--state', 'open', '--json', 'number,headRefName', '--limit', '50']);
  const prs = prsRaw ? JSON.parse(prsRaw) : [];
  for (const pr of prs) {
    gh(['pr', 'close', String(pr.number), '--delete-branch']);
    step(`closed PR #${pr.number} and deleted ${pr.headRefName}`);
  }

  const branchesRaw = gh([
    'api', 'repos/{owner}/{repo}/branches', '--jq', '.[].name',
  ]);
  const remoteBranches = (branchesRaw || '')
    .split('\n')
    .map((b) => b.trim())
    .filter((b) => b && !PROTECTED_BRANCHES.has(b));

  for (const branch of remoteBranches) {
    gh(['api', '-X', 'DELETE', `repos/{owner}/{repo}/git/refs/heads/${branch}`]);
    step(`deleted remote branch ${branch}`);
  }

  const closedRaw = gh(['issue', 'list', '--state', 'closed', '--json', 'number,title', '--limit', '50']);
  const closed = closedRaw ? JSON.parse(closedRaw) : [];
  for (const issue of closed) {
    gh(['issue', 'reopen', String(issue.number)]);
    step(`reopened issue #${issue.number}`);
  }

  if (prs.length === 0 && remoteBranches.length === 0 && closed.length === 0) {
    step('nothing to restore, GitHub state already pristine');
  }

  // Recreate any workshop issue that was deleted outright, not just closed.
  console.log('\nReconciling workshop issues');
  try {
    execSync('node scripts/seed-issues.mjs', { cwd: repoRoot, stdio: 'inherit' });
  } catch {
    console.error('Issue reconciliation reported a problem. Review the output above.');
  }
}

async function main() {
  if (!(await confirm())) {
    console.log('Aborted. Nothing changed.');
    process.exit(1);
  }

  resetLocal();

  if (includeRemote) {
    resetRemote();
  } else {
    console.log('\nSkipping GitHub state (pass --remote to close demo PRs and reopen issues)');
  }

  console.log('\nRunning pre-flight check');
  try {
    execSync('node scripts/verify-demo.mjs', { cwd: repoRoot, stdio: 'inherit' });
    console.log('Reset complete. The repository is ready for another run.\n');
  } catch {
    console.error('\nReset finished but the pre-flight check failed. Inspect the output above.\n');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Reset failed:', error.message);
  process.exit(1);
});
