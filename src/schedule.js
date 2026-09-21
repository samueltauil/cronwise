const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_DAYS_AHEAD = 1500;

function sorted(set) {
  return [...set].sort((a, b) => a - b);
}

function matchesDate(parsed, date) {
  const month = date.getUTCMonth() + 1;
  if (!parsed.fields.month.has(month)) {
    return false;
  }

  const dayOfMonth = date.getUTCDate();
  const dayOfWeek = date.getUTCDay();

  const domRestricted = parsed.restricted.dayOfMonth;
  const dowRestricted = parsed.restricted.dayOfWeek;
  const domMatch = parsed.fields.dayOfMonth.has(dayOfMonth);
  const dowMatch = parsed.fields.dayOfWeek.has(dayOfWeek);

  if (domRestricted && dowRestricted) {
    return domMatch || dowMatch;
  }

  return domMatch && dowMatch;
}

/**
 * Compute the next `count` fire times (UTC) strictly after `from`.
 */
export function nextRuns(parsed, count = 5, from = new Date()) {
  const hours = sorted(parsed.fields.hour);
  const minutes = sorted(parsed.fields.minute);
  const runs = [];

  let cursor = new Date(Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate(),
  ));

  for (let day = 0; day < MAX_DAYS_AHEAD && runs.length < count; day += 1) {
    if (matchesDate(parsed, cursor)) {
      for (const hour of hours) {
        for (const minute of minutes) {
          if (runs.length >= count) break;
          const fireTime = new Date(Date.UTC(
            cursor.getUTCFullYear(),
            cursor.getUTCMonth(),
            cursor.getUTCDate(),
            hour,
            minute,
          ));
          if (fireTime > from) {
            runs.push(fireTime);
          }
        }
      }
    }
    cursor = new Date(cursor.getTime() + MS_PER_DAY);
  }

  return runs;
}

/**
 * Average gap between consecutive runs, in minutes. Null when we cannot sample two runs.
 */
export function averageIntervalMinutes(parsed, from = new Date()) {
  const runs = nextRuns(parsed, 6, from);
  if (runs.length < 2) {
    return null;
  }

  let total = 0;
  for (let i = 1; i < runs.length; i += 1) {
    total += runs[i] - runs[i - 1];
  }

  return Math.round(total / (runs.length - 1) / 60000);
}
