export type DateFilterBoundary = 'since' | 'until';

export function parseDateFilterBoundary(value: string | undefined, boundary: DateFilterBoundary): number | undefined {
  if (!value) {
    return undefined;
  }

  if (/^\d+$/.test(value)) {
    const numeric = Number(value);
    return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = Date.parse(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) {
      return undefined;
    }

    return boundary === 'until' ? parsed + 86_400_000 - 1 : parsed;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function isValidDateFilter(value: string): boolean {
  if (/^\d+$/.test(value)) {
    return false;
  }

  return parseDateFilterBoundary(value, 'since') !== undefined;
}
