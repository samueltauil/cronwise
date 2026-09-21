#!/usr/bin/env node
/**
 * Seed, repair, and report the cronwise workshop issues.
 *
 *   node scripts/seed-issues.mjs           # create anything missing, reopen anything closed
 *   node scripts/seed-issues.mjs --list    # report current numbers without changing anything
 *
 * The issue bodies in workshop/issues/ are the single source of truth. Issues
 * are matched by exact title, never by number, so a repository can be wiped and
 * reseeded as many times as needed. Issue numbers will change on every reseed --
 * that is expected, and nothing in the facilitator guide depends on them.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const issuesDir = join(repoRoot, 'workshop', 'issues');

const listOnly = process.argv.includes('--list');

function gh(argv, { allowFailure = false } = {}) {
  try {
    return execFileSync('gh', argv, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    if (allowFailure) return null;
    throw new Error(`gh ${argv.slice(0, 2).join(' ')} failed: ${error.stderr || error.message}`);
  }
}

/** Parse the lightweight frontmatter block at the top of a workshop issue file. */
function parseIssueFile(path) {
  const raw = readFileSync(path, 'utf8');
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);

  if (!match) {
    throw new Error(`${path} is missing its --- frontmatter block`);
  }

  const [, frontmatter, body] = match;
  const meta = {};

  for (const line of frontmatter.split(/\r?\n/)) {
    const field = line.match(/^(\w+):\s*(.*)$/);
    if (field) {
      meta[field[1]] = field[2].trim().replace(/^"(.*)"$/, '$1');
    }
  }

  for (const required of ['key', 'title', 'labels']) {
    if (!meta[required]) {
      throw new Error(`${path} is missing the "${required}" frontmatter field`);
    }
  }

  return {
    key: meta.key,
    title: meta.title,
    labels: meta.labels.split(',').map((l) => l.trim()).filter(Boolean),
    body: body.trim(),
  };
}

function loadDefinitions() {
  return readdirSync(issuesDir)
    .filter((file) => file.endsWith('.md'))
    .map((file) => parseIssueFile(join(issuesDir, file)))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function fetchExisting() {
  const raw = gh([
    'issue', 'list',
    '--state', 'all',
    '--limit', '200',
    '--json', 'number,title,state,body',
  ]);
  return JSON.parse(raw || '[]');
}

function ensureLabels(definitions) {
  const raw = gh(['label', 'list', '--limit', '100', '--json', 'name'], { allowFailure: true });
  const existing = new Set((raw ? JSON.parse(raw) : []).map((l) => l.name));
  const wanted = new Set(definitions.flatMap((d) => d.labels));

  for (const label of wanted) {
    if (!existing.has(label)) {
      gh(['label', 'create', label, '--force'], { allowFailure: true });
    }
  }
}

function main() {
  if (!gh(['auth', 'status'], { allowFailure: true })) {
    console.error('gh CLI is not authenticated. Run "gh auth login" first.');
    process.exit(1);
  }

  const definitions = loadDefinitions();
  const existing = fetchExisting();
  const byTitle = new Map(existing.map((issue) => [issue.title, issue]));
  const resolved = [];

  if (!listOnly) {
    ensureLabels(definitions);
  }

  for (const def of definitions) {
    const match = byTitle.get(def.title);

    if (!match) {
      if (listOnly) {
        resolved.push({ ...def, number: null, action: 'MISSING' });
        continue;
      }
      const url = gh([
        'issue', 'create',
        '--title', def.title,
        '--body', def.body,
        ...def.labels.flatMap((l) => ['--label', l]),
      ]);
      const number = Number(url.split('/').pop());
      resolved.push({ ...def, number, action: 'created' });
      continue;
    }

    if (match.state === 'CLOSED' && !listOnly) {
      gh(['issue', 'reopen', String(match.number)], { allowFailure: true });
      resolved.push({ ...def, number: match.number, action: 'reopened' });
      continue;
    }

    // Self-heal: an issue edited during a previous workshop is restored to the
    // manifest text, so every run starts from identical wording.
    if (!listOnly && match.body !== undefined && match.body.trim() !== def.body) {
      gh(['issue', 'edit', String(match.number), '--body', def.body], { allowFailure: true });
      resolved.push({ ...def, number: match.number, action: 'restored' });
      continue;
    }

    resolved.push({
      ...def,
      number: match.number,
      action: match.state === 'CLOSED' ? 'CLOSED' : 'ok',
    });
  }

  const repo = gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], {
    allowFailure: true,
  }) || 'this repo';

  console.log(`\nWorkshop issues for ${repo}\n`);
  for (const issue of resolved) {
    const number = issue.number ? `#${issue.number}` : '  -';
    console.log(`  ${issue.key}  ${number.padStart(5)}  ${issue.action.padEnd(8)}  ${issue.title}`);
  }

  const broken = resolved.filter((i) => i.action === 'MISSING' || i.action === 'CLOSED');
  if (broken.length > 0) {
    console.log('\nSome issues are missing or closed. Run "npm run demo:issues" to restore them.\n');
    process.exit(1);
  }

  console.log('\nAll workshop issues are present and open.');
  console.log('Issue numbers change on every reseed - the facilitator guide never depends on them.\n');
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
