import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { reserveDemoCalls, releaseDemoCalls, recordDemoUsage, getDemoStatus, DEMO_LIMITS, dayKey, visitorId } from '../guard';
import { __setUsageStoreForTests, createMemoryStore, getUsageStore } from '../usage-store';

const browser = (ip: string, ua = 'Mozilla/5.0 (Windows NT 10.0) Chrome/140 Safari/537.36') => new Headers({ 'x-vercel-forwarded-for': ip, 'user-agent': ua });
const ENV = ['VERCEL', 'VERCEL_ENV', 'AI_DEMO_ENABLED', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'];
const saved: Record<string, string | undefined> = {};
let store: ReturnType<typeof createMemoryStore>;

beforeEach(() => {
  for (const k of ENV) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  store = createMemoryStore();
  __setUsageStoreForTests(store);
});
afterEach(() => {
  __setUsageStoreForTests(null);
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('public demo safeguards', () => {
  it('is off on public deployments unless AI_DEMO_ENABLED=true', async () => {
    process.env.VERCEL = '1';
    expect((await reserveDemoCalls(browser('1.1.1.1'), 1)).ok).toBe(false);
    process.env.AI_DEMO_ENABLED = 'true';
    expect((await reserveDemoCalls(browser('1.1.1.1'), 1)).ok).toBe(true);
  });

  it('fails closed on a public deployment with no shared store (never instance memory)', async () => {
    __setUsageStoreForTests(null);
    process.env.VERCEL = '1';
    process.env.AI_DEMO_ENABLED = 'true';
    expect(getUsageStore()).toBeNull();
    const r = await reserveDemoCalls(browser('1.1.1.1'), 1);
    expect(r).toMatchObject({ ok: false, code: 'unavailable' });
  });

  it('rejects automated clients and missing user agents', async () => {
    expect(await reserveDemoCalls(browser('1.1.1.1', 'curl/8.4'), 1)).toMatchObject({ ok: false, code: 'bot' });
    expect(await reserveDemoCalls(new Headers({ 'x-real-ip': '1.1.1.1' }), 1)).toMatchObject({ ok: false, code: 'bot' });
  });

  it('enforces the per-visitor hourly limit across refreshes and new sessions', async () => {
    for (let i = 0; i < DEMO_LIMITS.visitorHourlyCalls; i++) expect((await reserveDemoCalls(browser('2.2.2.2'), 1)).ok).toBe(true);
    // Same IP and browser = same visitor, whatever cookies or tabs are used.
    expect(await reserveDemoCalls(browser('2.2.2.2'), 1)).toMatchObject({ ok: false, code: 'visitor_limit' });
    // A different visitor is unaffected.
    expect((await reserveDemoCalls(browser('3.3.3.3'), 1)).ok).toBe(true);
  });

  it('enforces the shared daily allowance and rolls back the denied reservation', async () => {
    store.set(`demo:calls:${dayKey()}`, DEMO_LIMITS.dailyCalls - 1, 86_400);
    expect((await reserveDemoCalls(browser('4.4.4.4'), 1)).ok).toBe(true);
    const denied = await reserveDemoCalls(browser('5.5.5.5'), 1);
    expect(denied).toMatchObject({ ok: false, code: 'daily_limit' });
    expect(await store.get(`demo:calls:${dayKey()}`)).toBe(DEMO_LIMITS.dailyCalls);
    expect(await store.get(`demo:v:${visitorId(browser('5.5.5.5'))}:${dayKey()}`)).toBe(0);
  });

  it('stops when the daily token budget is used', async () => {
    store.set(`demo:tokens:${dayKey()}`, DEMO_LIMITS.dailyTokens, 86_400);
    expect(await reserveDemoCalls(browser('6.6.6.6'), 1)).toMatchObject({ ok: false, code: 'token_budget' });
  });

  it('honours the instant Redis kill switch', async () => {
    store.set('demo:disabled', '1');
    expect(await reserveDemoCalls(browser('7.7.7.7'), 1)).toMatchObject({ ok: false, code: 'disabled' });
    expect((await getDemoStatus(browser('7.7.7.7'))).available).toBe(false);
  });

  it('tracks tokens and releases unused reservations', async () => {
    const r = await reserveDemoCalls(browser('8.8.8.8'), 3);
    if (!r.ok) throw new Error('expected reservation');
    await releaseDemoCalls(r, 2);
    await recordDemoUsage(r, { kind: 'analysis', provider: 'gemini', model: 'test-double', tokens: 1234, ok: true });
    expect(await store.get(`demo:calls:${dayKey()}`)).toBe(1);
    expect(await store.get(`demo:tokens:${dayKey()}`)).toBe(1234);
    const status = await getDemoStatus(browser('8.8.8.8'));
    expect(status.callsRemainingToday).toBe(DEMO_LIMITS.dailyCalls - 1);
    expect(status.visitorRemainingToday).toBe(DEMO_LIMITS.visitorDailyCalls - 1);
  });

  it('never stores raw IP addresses', () => {
    expect(visitorId(browser('203.0.113.9'))).not.toContain('203.0.113.9');
    expect(visitorId(browser('203.0.113.9'))).toHaveLength(24);
  });
});
