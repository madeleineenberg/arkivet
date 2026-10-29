import { describe, it, expect, vi, afterEach } from 'vitest';
import { UpstashStore, getUpstashStore, type RedisLike } from './upstash-store';

function setup() {
  // Fejkad transaktion: incr/expire returnerar sig själv så att kedjan fungerar.
  const tx = {
    incr: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn(),
  };
  const redis = { get: vi.fn(), set: vi.fn(), multi: vi.fn(() => tx) };
  const store = new UpstashStore(redis as unknown as RedisLike);
  return { redis, tx, store };
}

describe('UpstashStore', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('get: okänd nyckel ger null', async () => {
    const { redis, store } = setup();
    redis.get.mockResolvedValue(null);
    expect(await store.get('k')).toBeNull();
  });

  it('get: tal och talsträng blir tal', async () => {
    const { redis, store } = setup();
    redis.get.mockResolvedValueOnce(3).mockResolvedValueOnce('7');
    expect(await store.get('k')).toBe(3);
    expect(await store.get('k')).toBe(7);
  });

  it('get: skräpvärde kastar i stället för att tolkas som noll', async () => {
    const { redis, store } = setup();
    redis.get.mockResolvedValue('hej');
    await expect(store.get('k')).rejects.toThrow(/not a number/);
  });

  it('set: skickar TTL som ex', async () => {
    const { redis, store } = setup();
    await store.set('k', 5, 60);
    expect(redis.set).toHaveBeenCalledWith('k', 5, { ex: 60 });
  });

  it('incr: INCR + EXPIRE NX i en och samma transaktion', async () => {
    const { redis, tx, store } = setup();
    tx.exec.mockResolvedValue([1, 1]);
    expect(await store.incr('k', 60)).toBe(1);
    expect(redis.multi).toHaveBeenCalledTimes(1);
    expect(tx.incr).toHaveBeenCalledWith('k');
    expect(tx.expire).toHaveBeenCalledWith('k', 60, 'NX');
    expect(tx.incr.mock.invocationCallOrder[0]).toBeLessThan(
      tx.expire.mock.invocationCallOrder[0],
    );
  });

  it('incr: returnerar räknaren även när TTL redan fanns (expire svarar 0)', async () => {
    const { tx, store } = setup();
    tx.exec.mockResolvedValue([4, 0]);
    expect(await store.incr('k', 60)).toBe(4);
  });

  it('incr: fel från Redis släpps vidare (dagstaket gör det till store_unavailable)', async () => {
    const { tx, store } = setup();
    tx.exec.mockRejectedValue(new Error('fetch failed'));
    await expect(store.incr('k', 60)).rejects.toThrow('fetch failed');
  });

  it('getUpstashStore: kastar tydligt när miljövariabler saknas', () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    expect(() => getUpstashStore()).toThrow(/saknas/);
  });
});
