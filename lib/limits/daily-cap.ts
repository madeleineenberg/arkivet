import type { CounterStore } from './store';

export type CapDecision =
  | { allowed: true; used: number; limit: number }
  | { allowed: false; reason: 'limit_reached'; used: number; limit: number }
  | { allowed: false; reason: 'store_unavailable' };

const TWO_DAYS_SECONDS = 60 * 60 * 24 * 2;

export function dayKey(scope: string, now: number): string {
  const date = new Date(now).toISOString().slice(0, 10); // UTC, t.ex. 2026-10-28
  return `ai:day:${date}:${scope}`;
}

export async function consumeDailyCap(
  store: CounterStore,
  scope: string,
  limit: number,
  now: () => number = Date.now,
): Promise<CapDecision> {
  let used: number;
  try {
    used = await store.incr(dayKey(scope, now()), TWO_DAYS_SECONDS);
  } catch {
    return { allowed: false, reason: 'store_unavailable' };
  }

  if (used > limit) {
    return { allowed: false, reason: 'limit_reached', used, limit };
  }
  return { allowed: true, used, limit };
}
