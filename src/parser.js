const MONTH_ALIASES = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const DOW_ALIASES = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

const FIELDS = [
  { key: 'minute', min: 0, max: 59 },
  { key: 'hour', min: 0, max: 23 },
  { key: 'dayOfMonth', min: 1, max: 31 },
  { key: 'month', min: 1, max: 12, aliases: MONTH_ALIASES },
  { key: 'dayOfWeek', min: 0, max: 6, aliases: DOW_ALIASES },
];

const MACROS = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

export class CronParseError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'CronParseError';
    this.field = field;
  }
}

function resolveAtom(atom, field) {
  const lowered = atom.toLowerCase();
  if (field.aliases && lowered in field.aliases) {
    return field.aliases[lowered];
  }
  if (!/^\d+$/.test(atom)) {
    throw new CronParseError(`"${atom}" is not a valid ${field.key} value`, field.key);
  }
  const value = Number(atom);
  if (value < field.min || value > field.max) {
    throw new CronParseError(
      `${field.key} value ${value} is out of range (${field.min}-${field.max})`,
      field.key,
    );
  }
  return value;
}

function expandTerm(term, field) {
  const [spec, stepRaw] = term.split('/');
  const step = stepRaw === undefined ? 1 : Number(stepRaw);

  if (!Number.isInteger(step) || step < 1) {
    throw new CronParseError(`step value "${stepRaw}" is not valid for ${field.key}`, field.key);
  }

  let start;
  let end;

  if (spec === '*') {
    start = field.min;
    end = field.max;
  } else if (spec.includes('-')) {
    const [lo, hi] = spec.split('-');
    start = resolveAtom(lo, field);
    end = resolveAtom(hi, field);
    if (start > end) {
      throw new CronParseError(`range ${spec} is inverted for ${field.key}`, field.key);
    }
  } else {
    start = resolveAtom(spec, field);
    end = stepRaw === undefined ? start : field.max;
  }

  const values = [];
  for (let value = start; value <= end; value += step) {
    values.push(value);
  }
  return values;
}

function parseField(token, field) {
  const values = new Set();
  for (const term of token.split(',')) {
    if (term === '') {
      throw new CronParseError(`empty ${field.key} term in "${token}"`, field.key);
    }
    for (const value of expandTerm(term, field)) {
      values.add(value);
    }
  }
  return values;
}

/**
 * Parse a five-field cron expression (or a @macro) into matchable value sets.
 */
export function parseExpression(input) {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new CronParseError('expression must be a non-empty string');
  }

  const source = input.trim();
  const normalized = MACROS[source.toLowerCase()] ?? source;
  const tokens = normalized.split(/\s+/);

  if (tokens.length !== 5) {
    throw new CronParseError(
      `expected 5 fields but received ${tokens.length}: "${source}"`,
    );
  }

  const fields = {};
  const restricted = {};

  FIELDS.forEach((field, index) => {
    const token = tokens[index];
    fields[field.key] = parseField(token, field);
    restricted[field.key] = token !== '*';
  });

  return { source, normalized, fields, restricted };
}
