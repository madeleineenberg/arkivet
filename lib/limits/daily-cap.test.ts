import { describe, it, expect } from 'vitest';
import { consumeDailyCap } from './daily-cap';
import { createMemoryStore } from './memory-store';
import type { CounterStore } from './store';

function fakeClock(start: number) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

const NOON_UTC = Date.UTC(2026, 9, 28, 12, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

describe('consumeDailyCap', () => {
  it('släpper igenom upp till gränsen och blockerar nästa', async () => {
    const clock = fakeClock(NOON_UTC);
    const store = createMemoryStore(clock.now);

    for (let i = 1; i <= 3; i++) {
      const d = await consumeDailyCap(store, 'global', 3, clock.now);
      expect(d.allowed).toBe(true);
    }
    const fourth = await consumeDailyCap(store, 'global', 3, clock.now);
    expect(fourth).toMatchObject({
      allowed: false,
      reason: 'limit_reached',
      used: 4,
    });
  });

  it('nollställs vid nytt datum', async () => {
    const clock = fakeClock(NOON_UTC);
    const store = createMemoryStore(clock.now);

    await consumeDailyCap(store, 'global', 1, clock.now);
    expect((await consumeDailyCap(store, 'global', 1, clock.now)).allowed).toBe(
      false,
    );

    clock.advance(DAY_MS);
    expect((await consumeDailyCap(store, 'global', 1, clock.now)).allowed).toBe(
      true,
    );
  });

  it('räknar olika scopes var för sig', async () => {
    const clock = fakeClock(NOON_UTC);
    const store = createMemoryStore(clock.now);

    await consumeDailyCap(store, 'anon:a', 1, clock.now);
    const other = await consumeDailyCap(store, 'anon:b', 1, clock.now);
    expect(other.allowed).toBe(true);
  });

  it('nekar när lagringen inte svarar (fail-closed)', async () => {
    const broken: CounterStore = {
      get: async () => {
        throw new Error('down');
      },
      set: async () => {
        throw new Error('down');
      },
      incr: async () => {
        throw new Error('down');
      },
    };
    const d = await consumeDailyCap(broken, 'global', 100);
    expect(d).toEqual({ allowed: false, reason: 'store_unavailable' });
  });
});
