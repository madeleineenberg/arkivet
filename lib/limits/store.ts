export interface CounterStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Räknar upp och returnerar nya värdet. TTL sätts bara när nyckeln skapas. */
  incr(key: string, ttlSeconds: number): Promise<number>;
}
