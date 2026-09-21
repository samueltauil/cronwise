const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function sorted(set) {
  return [...set].sort((a, b) => a - b);
}

function isContiguous(values) {
  return values.every((value, index) => index === 0 || value === values[index - 1] + 1);
}

function joinList(parts) {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

function ordinal(n) {
  const remainder = n % 100;
  if (remainder >= 11 && remainder <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

function formatClock(hour, minute) {
  const suffix = hour < 12 ? 'AM' : 'PM';
  const displayHour = hour % 12;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function describeTime(parsed) {
  const minutes = sorted(parsed.fields.minute);
  const hours = sorted(parsed.fields.hour);
  const everyMinute = minutes.length === 60;
  const everyHour = hours.length === 24;

  if (everyMinute && everyHour) {
    return 'Every minute';
  }

  if (everyMinute) {
    return `Every minute during ${joinList(hours.map((h) => formatClock(h, 0).replace(':00', '')))}`;
  }

  if (everyHour && minutes.length === 1) {
    return `Every hour at minute ${minutes[0]}`;
  }

  // TODO: describe step patterns like */15 as "every 15 minutes" instead of listing each value.
  const times = [];
  for (const hour of hours) {
    for (const minute of minutes) {
      times.push(formatClock(hour, minute));
    }
  }

  if (times.length > 6) {
    return `${times.length} times a day`;
  }

  return `At ${joinList(times)}`;
}

function describeDays(parsed) {
  const clauses = [];

  if (parsed.restricted.dayOfWeek) {
    const days = sorted(parsed.fields.dayOfWeek);
    if (days.length === 5 && isContiguous(days) && days[0] === 1) {
      clauses.push('on weekdays');
    } else {
      clauses.push(`on ${joinList(days.map((d) => DAY_NAMES[d]))}`);
    }
  }

  if (parsed.restricted.dayOfMonth) {
    const dates = sorted(parsed.fields.dayOfMonth);
    clauses.push(`on the ${joinList(dates.map(ordinal))}`);
  }

  if (parsed.restricted.month) {
    const months = sorted(parsed.fields.month);
    clauses.push(`in ${joinList(months.map((m) => MONTH_NAMES[m - 1]))}`);
  }

  if (clauses.length === 0) {
    return 'every day';
  }

  return clauses.join(' ');
}

/**
 * Turn a parsed cron expression into a human-readable sentence.
 */
export function humanize(parsed) {
  return `${describeTime(parsed)} ${describeDays(parsed)}`.replace(/\s+/g, ' ').trim();
}
