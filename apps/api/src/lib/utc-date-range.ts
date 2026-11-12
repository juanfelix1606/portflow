export interface UtcDateRange {
  occurredAtGte?: Date;
  occurredAtLt?: Date;
}

export function isValidUtcDateRange(from?: string, to?: string): boolean {
  return from === undefined || to === undefined || from <= to;
}

export function toUtcDateRange(from?: string, to?: string): UtcDateRange {
  const range: UtcDateRange = {};

  if (from !== undefined) {
    range.occurredAtGte = new Date(`${from}T00:00:00.000Z`);
  }

  if (to !== undefined) {
    const exclusiveEnd = new Date(`${to}T00:00:00.000Z`);
    exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
    range.occurredAtLt = exclusiveEnd;
  }

  return range;
}
