import { Router } from 'express';
import { parseExpression, CronParseError } from '../parser.js';
import { humanize } from '../humanize.js';
import { nextRuns, averageIntervalMinutes } from '../schedule.js';

const router = Router();

function buildExplanation(expression, count, now = new Date()) {
  const parsed = parseExpression(expression);

  return {
    expression: parsed.source,
    normalized: parsed.normalized,
    description: humanize(parsed),
    averageIntervalMinutes: averageIntervalMinutes(parsed, now),
    nextRuns: nextRuns(parsed, count, now).map((date) => date.toISOString()),
  };
}

function handle(req, res, expression, countRaw) {
  if (!expression) {
    return res.status(400).json({ error: 'expression is required' });
  }

  const count = Number(countRaw ?? 5);

  try {
    return res.json(buildExplanation(expression, count));
  } catch (error) {
    if (error instanceof CronParseError) {
      return res.status(400).json({ error: error.message, field: error.field });
    }
    throw error;
  }
}

router.get('/explain', (req, res) => handle(req, res, req.query.expression, req.query.count));

router.post('/explain', (req, res) => handle(req, res, req.body?.expression, req.body?.count));

router.post('/explain/batch', (req, res) => {
  const jobs = req.body?.jobs;
  if (!Array.isArray(jobs) || jobs.length < 1 || jobs.length > 50) {
    return res.status(400).json({ error: 'jobs must be an array of 1-50 objects', field: 'jobs' });
  }

  const count = req.body.count === undefined ? 5 : req.body.count;
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    return res.status(400).json({ error: 'count must be an integer from 1 through 100', field: 'count' });
  }

  const names = new Set();
  for (const [index, job] of jobs.entries()) {
    if (!job || typeof job !== 'object' || Array.isArray(job)) {
      return res.status(400).json({ error: 'each job must be an object', field: `jobs[${index}]` });
    }
    if (typeof job.name !== 'string' || job.name.trim() === '' || names.has(job.name)) {
      return res.status(400).json({
        error: 'job names must be non-empty unique strings',
        field: `jobs[${index}].name`,
      });
    }
    if (typeof job.schedule !== 'string') {
      return res.status(400).json({ error: 'schedule must be a string', field: `jobs[${index}].schedule` });
    }
    names.add(job.name);
  }

  const now = new Date();
  const results = jobs.map((job) => {
    try {
      return { name: job.name, explanation: buildExplanation(job.schedule, count, now) };
    } catch (error) {
      if (error instanceof CronParseError) {
        return { name: job.name, error: { message: error.message, field: error.field } };
      }
      throw error;
    }
  });
  return res.json({ results });
});

export default router;
