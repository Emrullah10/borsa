const VALID_BREAKDOWN_BY = ['regime', 'tf', 'hour', 'direction'];

export function parseDays(rawDays, { min = 1, max = 90, defaultValue = 7 } = {}) {
  if (rawDays == null) return { days: defaultValue, error: null };
  const parsed = parseInt(rawDays, 10);
  if (Number.isNaN(parsed) || parsed < min || parsed > max) {
    return { days: null, error: `days must be an integer between ${min} and ${max}` };
  }
  return { days: parsed, error: null };
}

export function parseBreakdownQuery({ by, days: rawDays }) {
  if (!VALID_BREAKDOWN_BY.includes(by)) {
    return { error: `invalid 'by' — must be one of: ${VALID_BREAKDOWN_BY.join(', ')}` };
  }
  const { days, error } = parseDays(rawDays);
  if (error) return { error };
  return { by, days };
}
