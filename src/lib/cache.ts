import { Redis } from "@upstash/redis";

/**
 * Upstash-backed cache with a graceful in-memory fallback.
 *
 * If UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set we use Upstash
 * (works great on Vercel's serverless functions). Otherwise we fall back to a
 * per-instance Map so the app still runs locally without any config.
 */

let redis: Redis | null = null;
try {
  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    redis = Redis.fromEnv();
  }
} catch {
  redis = null;
}

type MemEntry = { value: unknown; expires: number };
const mem = new Map<string, MemEntry>();

export const cacheBackend = () => (redis ? "upstash" : "memory");

export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  if (redis) {
    try {
      const hit = await redis.get<T>(key);
      if (hit !== null && hit !== undefined) return hit;
    } catch {
      // ignore cache read failures, fall through to fetch
    }
  } else {
    const hit = mem.get(key);
    if (hit && hit.expires > Date.now()) return hit.value as T;
  }

  const value = await fetcher();

  if (redis) {
    try {
      await redis.set(key, value, { ex: ttlSeconds });
    } catch {
      // ignore cache write failures
    }
  } else {
    mem.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
  }

  return value;
}
