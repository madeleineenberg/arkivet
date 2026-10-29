import { Redis } from '@upstash/redis';
import { getUpstashStore } from '../lib/limits/upstash-store';

async function main() {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
  const store = getUpstashStore();
  const key = `check:${Date.now()}`;

  console.log('get okänd (väntat null):', await store.get(key));
  console.log('incr (väntat 1):', await store.incr(key, 60));
  console.log('ttl (väntat ~60):', await redis.ttl(key));
  await new Promise((r) => setTimeout(r, 3_000));
  console.log('incr (väntat 2):', await store.incr(key, 60));
  console.log('ttl (väntat ~57, INTE 60):', await redis.ttl(key));
  console.log('get (väntat 2):', await store.get(key));
  await redis.del(key);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
