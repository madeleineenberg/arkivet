import type { CounterStore } from './store';

type Entry = { value: number; expiresAt: number };

export function createMemoryStore(now: () => number = Date.now): CounterStore {
  const data = new Map<string, Entry>();

  function read(key: string): Entry | null {
    const entry = data.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now()) {
      data.delete(key);
      return null;
    }
    return entry;
  }

  return {
    async get(key) {
      return read(key)?.value ?? null;
    },
    async set(key, value, ttlSeconds) {
      data.set(key, { value, expiresAt: now() + ttlSeconds * 1000 });
    },
    async incr(key, ttlSeconds) {
      const entry = read(key);
      const next = (entry?.value ?? 0) + 1;
      data.set(key, {
        value: next,
        expiresAt: entry?.expiresAt ?? now() + ttlSeconds * 1000,
      });
      return next;
    },
  };
}
