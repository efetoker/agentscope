import { describe, expect, it } from 'vitest';

import { isValidDateFilter, parseDateFilterBoundary } from '../../src/core/date-filter.js';

describe('date filter boundaries', () => {
  it('treats date-only until filters as the end of that UTC day', () => {
    expect(parseDateFilterBoundary('2026-04-26', 'until')).toBe(Date.parse('2026-04-26T23:59:59.999Z'));
  });

  it('keeps date-only since filters at the start of that UTC day', () => {
    expect(parseDateFilterBoundary('2026-04-26', 'since')).toBe(Date.parse('2026-04-26T00:00:00.000Z'));
  });

  it('rejects invalid date-only values strictly', () => {
    expect(parseDateFilterBoundary('2026-99-99', 'until')).toBeUndefined();
  });

  it('does not treat raw numeric timestamps as valid CLI date filters', () => {
    expect(isValidDateFilter('1777204800000')).toBe(false);
  });
});
