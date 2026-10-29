import { Redis } from '@upstash/redis';
import type { CounterStore } from './store';

// Bara de metoder vi använder. Gör att testerna kan skicka in en liten fejk
// i stället för en riktig klient.
export type RedisLike = Pick<Redis, 'get' | 'set' | 'multi'>;

export class UpstashStore implements CounterStore {
  constructor(private readonly redis: RedisLike) {}

  async get(key: string): Promise<number | null> {
    const value = await this.redis.get<number | string>(key);
    if (value === null || value === undefined) return null;
    const n = Number(value);
    // Något annat än ett tal i en räknarnyckel är ett fel, inte "noll".
    if (!Number.isFinite(n)) throw new Error(`Counter ${key} is not a number`);
    return n;
  }

  async set(key: string, value: number, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, { ex: ttlSeconds });
  }

  async incr(key: string, ttlSeconds: number): Promise<number> {
    // MULTI = transaktion: båda kommandona körs i följd utan att något annat
    // anrop kommer emellan. EXPIRE ... NX sätter TTL bara om nyckeln saknar TTL,
    // alltså när INCR just skapade den. Senare anrop förlänger inte fönstret.
    const [count] = await this.redis
      .multi()
      .incr(key)
      .expire(key, ttlSeconds, 'NX')
      .exec<[number, 0 | 1]>();
    return count;
  }
}

let defaultStore: UpstashStore | undefined;

export function getUpstashStore(): UpstashStore {
  if (defaultStore) return defaultStore;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  // Klienten varnar bara i loggen om uppgifterna saknas. Vi vill hellre krascha tydligt.
  if (!url || !token) throw new Error('UPSTASH_REDIS_REST_URL / _TOKEN saknas');

  defaultStore = new UpstashStore(
    new Redis({
      url,
      token,
      // Standard är 5 omförsök med växande väntan (flera sekunder). Ett räcker.
      retry: { retries: 1, backoff: () => 100 },
      // Måste vara en FUNKTION. Med en färdig AbortSignal tolkar klienten en
      // timeout som ett lyckat svar med värdet null, dvs. "räknaren finns inte".
      signal: () => AbortSignal.timeout(2_000),
    }),
  );
  return defaultStore;
}
