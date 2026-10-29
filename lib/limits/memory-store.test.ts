import { describe, it, expect } from 'vitest';
import { createMemoryStore } from './memory-store';

function fakeClock(start = 0) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe('createMemoryStore', () => {
  it('returnerar null för okänd nyckel', async () => {
    const store = createMemoryStore();
    expect(await store.get('saknas')).toBeNull();
  });

  it('räknar upp från 1', async () => {
    const store = createMemoryStore();
    expect(await store.incr('k', 60)).toBe(1);
    expect(await store.incr('k', 60)).toBe(2);
  });

  it('glömmer nyckeln när TTL gått ut', async () => {
    const clock = fakeClock();
    const store = createMemoryStore(clock.now);
    await store.set('k', 1, 10);
    clock.advance(10_000);
    expect(await store.get('k')).toBeNull();
  });

  it('incr förlänger inte TTL', async () => {
    const clock = fakeClock();
    const store = createMemoryStore(clock.now);
    await store.incr('k', 10);
    clock.advance(9_000);
    await store.incr('k', 10);
    clock.advance(1_000);
    expect(await store.get('k')).toBeNull();
  });

  it('börjar om från 1 efter att TTL gått ut', async () => {
    const clock = fakeClock();
    const store = createMemoryStore(clock.now);
    await store.incr('k', 10);
    clock.advance(10_000);
    expect(await store.incr('k', 10)).toBe(1);
  });
});
