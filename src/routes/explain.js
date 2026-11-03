import { Router } from 'express';
import { parseExpression, CronParseError } from '../parser.js';
import { humanize } from '../humanize.js';
import { nextRuns, averageIntervalMinutes } from '../schedule.js';

const router = Router();

function buildExplanation(expression, count) {
  const parsed = parseExpression(expression);
  const now = new Date();

  return {
    expression: parsed.source,
    normalized: parsed.normalized,
    description: humanize(parsed),
    averageIntervalMinutes: averageIntervalMinutes(parsed, now),
    nextRuns: nextRuns(parsed, count, now).map((date) => date.toISOString()),
  };
}

function handle(req, res, expression, countRaw, isQuery = false) {
  if (!expression) {
    return res.status(400).json({ error: 'expression is required' });
  }

  let count = 5;
  if (countRaw !== undefined) {
    const valid = isQuery
      ? typeof countRaw === 'string' && /^\d+$/.test(countRaw)
      : typeof countRaw === 'number' && Number.isInteger(countRaw);
    count = valid ? Number(countRaw) : NaN;
    if (!Number.isInteger(count) || count < 1 || count > 100) {
      return res.status(400).json({ error: 'count must be an integer from 1 through 100' });
    }
  }

  try {
    return res.json(buildExplanation(expression, count));
  } catch (error) {
    if (error instanceof CronParseError) {
      return res.status(400).json({ error: error.message, field: error.field });
    }
    throw error;
  }
}

router.get('/explain', (req, res) => handle(req, res, req.query.expression, req.query.count, true));

router.post('/explain', (req, res) => handle(req, res, req.body?.expression, req.body?.count));

export default router;
