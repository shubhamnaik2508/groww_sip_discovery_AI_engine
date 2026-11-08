import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { reserveDemoCalls, releaseDemoCalls, recordDemoUsage, getDemoStatus, DEMO_LIMITS, dayKey, visitorId, costPaise, geminiPrice, worstCaseCallPaise } from '../guard';
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
    await recordDemoUsage(r, { kind: 'analysis', provider: 'gemini', model: 'test-double', inputTokens: 1000, outputTokens: 234, totalTokens: 1234, ok: true });
    expect(await store.get(`demo:calls:${dayKey()}`)).toBe(1);
    expect(await store.get(`demo:tokens:${dayKey()}`)).toBe(1234);
    expect(await store.get(`demo:paise:${dayKey()}`)).toBe(costPaise('gemini', 1000, 234));
    const status = await getDemoStatus(browser('8.8.8.8'));
    expect(status.callsRemainingToday).toBe(DEMO_LIMITS.dailyCalls - 1);
    expect(status.visitorRemainingToday).toBe(DEMO_LIMITS.visitorDailyCalls - 1);
  });

  it('prices Gemini calls at the published rates, including the January 2027 increase', () => {
    const before = new Date('2026-11-08T12:00:00Z');
    const after = new Date('2027-01-02T12:00:00Z');
    expect(geminiPrice(before)).toEqual({ input: 0.75, output: 3.75 });
    expect(geminiPrice(after)).toEqual({ input: 1.5, output: 7.5 });
    // 2,000 input + 1,000 output tokens = $0.00525 → ₹0.4725 at ₹90/$ → 48 paise (rounded up).
    expect(costPaise('gemini', 2000, 1000, before)).toBe(48);
    expect(costPaise('gemini', 2000, 1000, after)).toBe(95);
    expect(costPaise('groq', 2000, 1000, before)).toBe(0);
  });

  it('stops before a call could push the day past the rupee budget', async () => {
    const budgetPaise = DEMO_LIMITS.dailyBudgetInr * 100;
    store.set(`demo:paise:${dayKey()}`, budgetPaise - worstCaseCallPaise('gemini') + 1, 86_400);
    expect(await reserveDemoCalls(browser('9.9.9.9'), 1, 'gemini')).toMatchObject({ ok: false, code: 'spend_budget' });
    expect((await getDemoStatus(browser('9.9.9.9'))).available).toBe(false);
    // Groq is on its free tier, so it is not blocked by the rupee budget.
    expect((await reserveDemoCalls(browser('9.9.9.9'), 1, 'groq')).ok).toBe(true);
  });

  it('allows calls while the worst case still fits within the budget', async () => {
    store.set(`demo:paise:${dayKey()}`, DEMO_LIMITS.dailyBudgetInr * 100 - worstCaseCallPaise('gemini'), 86_400);
    expect((await reserveDemoCalls(browser('9.9.9.10'), 1, 'gemini')).ok).toBe(true);
  });

  it('charges the worst case when the provider reports no usage', async () => {
    const r = await reserveDemoCalls(browser('9.9.9.11'), 1);
    if (!r.ok) throw new Error('expected reservation');
    await recordDemoUsage(r, { kind: 'synthesis', provider: 'gemini', model: '', ok: false });
    expect(await store.get(`demo:paise:${dayKey()}`)).toBe(worstCaseCallPaise('gemini'));
  });

  it('defaults to a ₹100 daily budget with 200 shared calls', () => {
    expect(DEMO_LIMITS.dailyBudgetInr).toBe(100);
    expect(DEMO_LIMITS.dailyCalls).toBe(200);
  });

  it('never stores raw IP addresses', () => {
    expect(visitorId(browser('203.0.113.9'))).not.toContain('203.0.113.9');
    expect(visitorId(browser('203.0.113.9'))).toHaveLength(24);
  });
});
