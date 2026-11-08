import { isPublicDeployment } from '@/lib/research/access';

/**
 * Persistent, shared counters for the public AI demo.
 *
 * Production uses Upstash Redis over its REST API (no SDK dependency). The variables are
 * created automatically when an Upstash Redis store is connected to the Vercel project:
 * KV_REST_API_URL / KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN).
 *
 * An in-memory store exists ONLY for the private local workspace and tests. Public
 * deployments never fall back to instance memory: without Redis the demo stays off.
 */
export interface UsageStore {
  readonly kind: 'redis' | 'memory';
  /** Atomically adds `by` to a counter and (re)sets its expiry; returns the new value. */
  incr(key: string, by: number, ttlSeconds: number): Promise<number>;
  get(key: string): Promise<number>;
  /** Appends a JSON line to a capped list (newest first). */
  log(key: string, entry: unknown, maxEntries: number, ttlSeconds: number): Promise<void>;
  getString(key: string): Promise<string | null>;
}

function redisEnv(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

class UpstashStore implements UsageStore {
  readonly kind = 'redis' as const;
  constructor(private readonly url: string, private readonly token: string) {}

  private async pipeline(commands: Array<Array<string | number>>): Promise<Array<{ result?: unknown; error?: string }>> {
    const res = await fetch(`${this.url}/multi-exec`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Usage store unavailable (${res.status}).`);
    const out = (await res.json()) as Array<{ result?: unknown; error?: string }>;
    const err = out.find((r) => r.error);
    if (err) throw new Error(`Usage store error: ${err.error}`);
    return out;
  }

  async incr(key: string, by: number, ttlSeconds: number): Promise<number> {
    const [r] = await this.pipeline([
      ['INCRBY', key, by],
      ['EXPIRE', key, ttlSeconds],
    ]);
    return Number(r.result);
  }
  async get(key: string): Promise<number> {
    const [r] = await this.pipeline([['GET', key]]);
    return Number(r.result ?? 0) || 0;
  }
  async getString(key: string): Promise<string | null> {
    const [r] = await this.pipeline([['GET', key]]);
    return r.result == null ? null : String(r.result);
  }
  async log(key: string, entry: unknown, maxEntries: number, ttlSeconds: number): Promise<void> {
    await this.pipeline([
      ['LPUSH', key, JSON.stringify(entry)],
      ['LTRIM', key, 0, maxEntries - 1],
      ['EXPIRE', key, ttlSeconds],
    ]);
  }
}

class MemoryStore implements UsageStore {
  readonly kind = 'memory' as const;
  private values = new Map<string, { v: number | string; exp: number }>();
  private live(key: string) {
    const e = this.values.get(key);
    if (e && e.exp < Date.now()) this.values.delete(key);
    return this.values.get(key);
  }
  async incr(key: string, by: number, ttlSeconds: number) {
    const v = Number(this.live(key)?.v ?? 0) + by;
    this.values.set(key, { v, exp: Date.now() + ttlSeconds * 1000 });
    return v;
  }
  async get(key: string) {
    return Number(this.live(key)?.v ?? 0);
  }
  async getString(key: string) {
    const v = this.live(key)?.v;
    return v == null ? null : String(v);
  }
  async log() {
    /* local workspace: no shared log needed */
  }
  /** Test helper. */
  set(key: string, value: string | number, ttlSeconds = 3600) {
    this.values.set(key, { v: value, exp: Date.now() + ttlSeconds * 1000 });
  }
}

let memory: MemoryStore | null = null;
let override: UsageStore | null = null;

/** Tests can inject a store. */
export function __setUsageStoreForTests(store: UsageStore | null) {
  override = store;
}
export function createMemoryStore(): MemoryStore {
  return new MemoryStore();
}

/** Returns the shared store, or null when none is available on a public deployment (fail closed). */
export function getUsageStore(): UsageStore | null {
  if (override) return override;
  const env = redisEnv();
  if (env) return new UpstashStore(env.url, env.token);
  if (isPublicDeployment()) return null;
  memory ??= new MemoryStore();
  return memory;
}
