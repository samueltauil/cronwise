#!/usr/bin/env node
/**
 * Pre-flight check for the cronwise workshop.
 *
 * Confirms the repository is in its pristine "demo-ready" state: every planted
 * defect is still present and the baseline test suite passes. Run this before a
 * workshop, and again after `npm run demo:reset`, to be certain the exercises
 * will behave the way the facilitator guide describes.
 *
 * Exit code 0 = ready to demo. Exit code 1 = something drifted.
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createApp } from '../src/app.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const results = [];

function record(id, label, ok, detail) {
  results.push({ id, label, ok: Boolean(ok), detail });
}

async function startServer() {
  const server = createApp().listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  return { server, baseUrl: `http://localhost:${server.address().port}` };
}

function git(args) {
  return execSync(`git ${args}`, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

async function main() {
  const { server, baseUrl } = await startServer();
  const explain = async (expression) => {
    const response = await fetch(`${baseUrl}/explain?expression=${encodeURIComponent(expression)}`);
    return { status: response.status, body: await response.json() };
  };

  try {
    // Defect A - 12-hour clock conversion drops noon and midnight to hour 0.
    const noon = await explain('0 12 * * *');
    record(
      'A',
      'humanize: noon renders as "0:00 PM"',
      noon.body.description?.includes('0:00 PM'),
      noon.body.description,
    );

    // Defect B - day-of-week 7 is not normalized to Sunday.
    const dow7 = await explain('0 12 * * 7');
    record(
      'B',
      'parser: day-of-week 7 is rejected with HTTP 400',
      dow7.status === 400,
      `HTTP ${dow7.status} ${JSON.stringify(dow7.body)}`,
    );

    // Defect C - day-of-month and day-of-week are ANDed instead of ORed.
    const both = await explain('0 3 1 * MON');
    const firstRun = both.body.nextRuns?.[0];
    const daysAway = firstRun
      ? Math.round((new Date(firstRun) - Date.now()) / 86400000)
      : null;
    record(
      'C',
      'schedule: day-of-month AND day-of-week starves the job',
      daysAway !== null && daysAway > 60,
      `next run ${firstRun} (~${daysAway} days away)`,
    );

    // Defect D - step syntax is expanded instead of summarized.
    const step = await explain('*/15 * * * *');
    record(
      'D',
      'humanize: step syntax is not summarized',
      step.body.description?.includes('times a day'),
      step.body.description,
    );

    // Defect F - the collisions endpoint does not exist yet.
    const collisions = await fetch(`${baseUrl}/collisions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobs: [] }),
    });
    record(
      'F',
      'routes: POST /collisions is not implemented',
      collisions.status === 404,
      `HTTP ${collisions.status}`,
    );

    // Sanity - the parts that must keep working.
    const weekday = await explain('30 9 * * 1-5');
    record(
      'OK',
      'baseline: weekday expression still explains correctly',
      weekday.body.description === 'At 9:30 AM on weekdays',
      weekday.body.description,
    );
  } finally {
    server.close();
  }

  // Defect E - the README is still missing.
  const readmeExists = existsSync(join(repoRoot, 'README.md'));
  record('E', 'docs: README.md does not exist', !readmeExists, readmeExists ? 'README.md present' : 'absent');

  // Repository hygiene - a dirty tree means a previous run was not reset.
  // Untracked files under docs/ are facilitator materials (slides, notes) that
  // demo:reset deliberately preserves, so they must not count as drift here.
  const status = git('status --porcelain')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^\?\?\s+docs\//.test(line))
    .join('\n');
  record('GIT', 'git: working tree is clean', status === '', status || 'clean');

  const branch = git('rev-parse --abbrev-ref HEAD');
  record('GIT', 'git: checked out on main', branch === 'main', branch);

  let testsPass = true;
  let testDetail = 'baseline suite passes';
  try {
    execSync('npm test', { cwd: repoRoot, stdio: 'pipe' });
  } catch {
    testsPass = false;
    testDetail = 'npm test FAILED';
  }
  record('GIT', 'tests: baseline suite passes', testsPass, testDetail);

  const failures = results.filter((r) => !r.ok);

  console.log('\ncronwise demo pre-flight\n');
  for (const result of results) {
    console.log(`  [${result.ok ? 'PASS' : 'FAIL'}] ${result.id.padEnd(3)} ${result.label}`);
    console.log(`         ${result.detail}`);
  }

  if (failures.length === 0) {
    console.log('\nRepository is demo-ready. All planted defects are present.\n');
    process.exit(0);
  }

  console.log(`\n${failures.length} check(s) failed - the repo has drifted from its demo state.`);
  console.log('Run "npm run demo:reset" to restore it.\n');
  process.exit(1);
}

main().catch((error) => {
  console.error('Pre-flight crashed:', error);
  process.exit(1);
});
