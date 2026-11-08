import crypto from 'crypto';
import { isPublicDeployment } from '@/lib/research/access';
import { getUsageStore, UsageStore } from './usage-store';

/**
 * Public AI demo safeguards — all enforced server-side against the shared usage store.
 *
 * - Kill switches: AI_DEMO_ENABLED must be "true" on public deployments (default off), and
 *   setting the Redis key `demo:disabled` to "1" stops the demo instantly without a redeploy.
 * - Daily rupee budget (default ₹100/day): every Gemini call is costed from the input and
 *   output tokens the provider reports, at Google's published prices, and the demo stops for
 *   the day before a call could push spend past the budget.
 * - Shared daily call and token caps (backstops), per-visitor hourly/daily limits (hashed IP +
 *   user agent, never stored raw), small batches, output caps and automated-client filtering.
 * Limits survive refreshes, new sessions and multiple server instances because they live in Redis.
 */
const num = (v: string | undefined, d: number) => (v && /^\d+(\.\d+)?$/.test(v) ? Number(v) : d);

export const DEMO_LIMITS = {
  dailyBudgetInr: num(process.env.AI_DEMO_DAILY_BUDGET_INR, 100),
  dailyCalls: num(process.env.AI_DEMO_DAILY_CALLS, 200),
  dailyTokens: num(process.env.AI_DEMO_DAILY_TOKENS, 2_000_000),
  visitorHourlyCalls: num(process.env.AI_DEMO_VISITOR_HOURLY_CALLS, 6),
  visitorDailyCalls: num(process.env.AI_DEMO_VISITOR_DAILY_CALLS, 12),
  maxRecordsPerRun: 3,
  maxOutputTokens: 1600,
};

// ---------------------------------------------------------------------------
// Cost model
// ---------------------------------------------------------------------------

/**
 * Gemini 3.8 Flash, Standard paid tier, USD per 1M tokens (Google AI pricing page,
 * checked 8 Nov 2026). Thinking tokens are billed as output. Prices double on 1 Jan 2027.
 * Overridable with AI_DEMO_PRICE_INPUT_USD / AI_DEMO_PRICE_OUTPUT_USD if the model changes.
 */
const GEMINI_PRICES = [
  { from: '2027-01-01', input: 1.5, output: 7.5 },
  { from: '0000-00-00', input: 0.75, output: 3.75 },
];
/** Conservative exchange rate (rupees per US dollar); overridable with AI_DEMO_USD_INR. */
export const USD_INR = num(process.env.AI_DEMO_USD_INR, 90);

export function geminiPrice(now = new Date()): { input: number; output: number } {
  if (process.env.AI_DEMO_PRICE_INPUT_USD && process.env.AI_DEMO_PRICE_OUTPUT_USD) {
    return { input: num(process.env.AI_DEMO_PRICE_INPUT_USD, 1.5), output: num(process.env.AI_DEMO_PRICE_OUTPUT_USD, 7.5) };
  }
  const day = now.toISOString().slice(0, 10);
  const { input, output } = GEMINI_PRICES.find((p) => day >= p.from)!;
  return { input, output };
}

/** Cost of one call in paise (rounded up). Groq runs on its free tier, so it costs nothing. */
export function costPaise(provider: string, inputTokens: number, outputTokens: number, now = new Date()): number {
  if (provider === 'groq') return 0;
  const p = geminiPrice(now);
  const usd = (Math.max(0, inputTokens) * p.input + Math.max(0, outputTokens) * p.output) / 1_000_000;
  return Math.ceil(usd * USD_INR * 100);
}

/**
 * Largest plausible cost of a single demo call (synthesis prompt ≈ 12k input tokens,
 * output cap + thinking ≈ 5k). Used as the safety margin so the final call of the day
 * cannot overshoot the budget, and as the charge when a provider reports no usage.
 */
export function worstCaseCallPaise(provider: string, now = new Date()): number {
  return costPaise(provider, 12_000, 5_000, now);
}

// ---------------------------------------------------------------------------

const BOT_UA = /(bot|crawl|spider|slurp|curl|wget|python|httpclient|okhttp|go-http|java\/|axios|node-fetch|headlesschrome|phantomjs|scrapy)/i;

export function demoEnabledByConfig(): boolean {
  if (process.env.AI_DEMO_ENABLED === 'false') return false;
  return isPublicDeployment() ? process.env.AI_DEMO_ENABLED === 'true' : true;
}

/** Day bucket in India Standard Time, so "daily" matches the researcher's day. */
export function dayKey(now = new Date()): string {
  return new Date(now.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
}
function hourKey(now = new Date()): string {
  return new Date(now.getTime() + 5.5 * 3600_000).toISOString().slice(0, 13);
}

export function visitorId(headers: Headers): string {
  const ip =
    headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip')?.trim() ||
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'local';
  const ua = headers.get('user-agent') ?? '';
  const salt = process.env.AI_DEMO_SALT || 'groww-sip-discovery-demo';
  return crypto.createHash('sha256').update(`${salt}|${ip}|${ua}`).digest('hex').slice(0, 24);
}

export type DemoDenial = {
  ok: false;
  code: 'disabled' | 'unavailable' | 'bot' | 'visitor_limit' | 'daily_limit' | 'token_budget' | 'spend_budget';
  message: string;
};
export type DemoReservation = { ok: true; visitor: string; calls: number; provider: string; store: UsageStore };

const keys = (visitor: string, now = new Date()) => ({
  globalCalls: `demo:calls:${dayKey(now)}`,
  globalTokens: `demo:tokens:${dayKey(now)}`,
  globalPaise: `demo:paise:${dayKey(now)}`,
  visitorDay: `demo:v:${visitor}:${dayKey(now)}`,
  visitorHour: `demo:vh:${visitor}:${hourKey(now)}`,
  log: `demo:log:${dayKey(now)}`,
});

async function killSwitchOn(store: UsageStore): Promise<boolean> {
  try {
    return (await store.getString('demo:disabled')) === '1';
  } catch {
    return true; // fail closed if the store cannot be read
  }
}

const BUDGET_MESSAGE = "Today's live AI demo budget has been used. It resets at midnight IST; all stored results remain available.";

/** Atomically reserves `calls` against every limit; rolls back on denial. */
export async function reserveDemoCalls(headers: Headers, calls: number, provider = 'gemini'): Promise<DemoReservation | DemoDenial> {
  if (!demoEnabledByConfig()) return { ok: false, code: 'disabled', message: 'The live AI demo is switched off right now. All stored AI results remain available.' };
  const ua = headers.get('user-agent') ?? '';
  if (!ua || BOT_UA.test(ua)) return { ok: false, code: 'bot', message: 'Automated clients cannot run the live AI demo. Open the site in a regular browser.' };
  const store = getUsageStore();
  if (!store) return { ok: false, code: 'unavailable', message: 'The live AI demo is not available on this deployment yet. All stored AI results remain available.' };
  if (await killSwitchOn(store)) return { ok: false, code: 'disabled', message: 'The live AI demo has been paused by the researcher. All stored AI results remain available.' };

  const visitor = visitorId(headers);
  const k = keys(visitor);
  try {
    // Spend guard: leave room for the worst case of every call in this request.
    const spent = await store.get(k.globalPaise);
    if (spent + calls * worstCaseCallPaise(provider) > DEMO_LIMITS.dailyBudgetInr * 100) {
      return { ok: false, code: 'spend_budget', message: BUDGET_MESSAGE };
    }
    if ((await store.get(k.globalTokens)) >= DEMO_LIMITS.dailyTokens) {
      return { ok: false, code: 'token_budget', message: BUDGET_MESSAGE };
    }
    const hour = await store.incr(k.visitorHour, calls, 3700);
    const day = await store.incr(k.visitorDay, calls, 2 * 86_400);
    if (hour > DEMO_LIMITS.visitorHourlyCalls || day > DEMO_LIMITS.visitorDailyCalls) {
      await store.incr(k.visitorHour, -calls, 3700);
      await store.incr(k.visitorDay, -calls, 2 * 86_400);
      const which = hour > DEMO_LIMITS.visitorHourlyCalls ? `${DEMO_LIMITS.visitorHourlyCalls} AI calls per hour` : `${DEMO_LIMITS.visitorDailyCalls} AI calls per day`;
      return { ok: false, code: 'visitor_limit', message: `You have reached the demo limit of ${which}. Please try again later.` };
    }
    const global = await store.incr(k.globalCalls, calls, 2 * 86_400);
    if (global > DEMO_LIMITS.dailyCalls) {
      await store.incr(k.globalCalls, -calls, 2 * 86_400);
      await store.incr(k.visitorHour, -calls, 3700);
      await store.incr(k.visitorDay, -calls, 2 * 86_400);
      return { ok: false, code: 'daily_limit', message: `Today's shared allowance of ${DEMO_LIMITS.dailyCalls} live AI calls has been used. It resets at midnight IST; stored results remain available.` };
    }
    return { ok: true, visitor, calls, provider, store };
  } catch {
    return { ok: false, code: 'unavailable', message: 'The usage tracker is temporarily unavailable, so the live AI demo is paused. Stored results remain available.' };
  }
}

/** Returns unused reservations (e.g. a call that never reached the provider). */
export async function releaseDemoCalls(r: DemoReservation, unused: number) {
  if (unused <= 0) return;
  const k = keys(r.visitor);
  await r.store.incr(k.globalCalls, -unused, 2 * 86_400).catch(() => undefined);
  await r.store.incr(k.visitorHour, -unused, 3700).catch(() => undefined);
  await r.store.incr(k.visitorDay, -unused, 2 * 86_400).catch(() => undefined);
}

/**
 * Records actual usage: tokens, the call's cost in paise (from reported input/output tokens;
 * worst case when the provider reports nothing), and an audit entry (no IPs or content).
 */
export async function recordDemoUsage(
  r: DemoReservation,
  entry: { kind: 'analysis' | 'synthesis'; provider: string; model: string; inputTokens?: number | null; outputTokens?: number | null; totalTokens?: number | null; ok: boolean },
) {
  const k = keys(r.visitor);
  const known = entry.inputTokens != null && entry.outputTokens != null;
  const paise = known ? costPaise(entry.provider, entry.inputTokens!, entry.outputTokens!) : worstCaseCallPaise(entry.provider);
  const tokens = entry.totalTokens ?? (known ? entry.inputTokens! + entry.outputTokens! : 17_000);
  await r.store.incr(k.globalTokens, Math.max(0, Math.round(tokens)), 2 * 86_400).catch(() => undefined);
  await r.store.incr(k.globalPaise, paise, 2 * 86_400).catch(() => undefined);
  await r.store
    .log(k.log, { at: new Date().toISOString(), visitor: r.visitor.slice(0, 8), kind: entry.kind, provider: entry.provider, model: entry.model, tokens, paise, ok: entry.ok }, 500, 14 * 86_400)
    .catch(() => undefined);
}

export interface DemoStatus {
  available: boolean;
  message: string | null;
  callsRemainingToday: number | null;
  visitorRemainingToday: number | null;
  limits: typeof DEMO_LIMITS;
}

export async function getDemoStatus(headers: Headers): Promise<DemoStatus> {
  const base = { limits: DEMO_LIMITS, callsRemainingToday: null, visitorRemainingToday: null };
  if (!demoEnabledByConfig()) return { ...base, available: false, message: 'The live AI demo is switched off right now.' };
  const store = getUsageStore();
  if (!store) return { ...base, available: false, message: 'The live AI demo is not available on this deployment yet.' };
  try {
    if (await killSwitchOn(store)) return { ...base, available: false, message: 'The live AI demo has been paused by the researcher.' };
    const k = keys(visitorId(headers));
    const [g, v, t, paise] = await Promise.all([store.get(k.globalCalls), store.get(k.visitorDay), store.get(k.globalTokens), store.get(k.globalPaise)]);
    const callsRemainingToday = Math.max(0, DEMO_LIMITS.dailyCalls - g);
    const budgetLeft = paise + worstCaseCallPaise('gemini') <= DEMO_LIMITS.dailyBudgetInr * 100;
    const exhausted = callsRemainingToday === 0 || t >= DEMO_LIMITS.dailyTokens || !budgetLeft;
    return {
      ...base,
      available: !exhausted,
      message: exhausted ? "Today's live AI demo allowance has been used. It resets at midnight IST." : null,
      callsRemainingToday: exhausted ? 0 : callsRemainingToday,
      visitorRemainingToday: Math.max(0, DEMO_LIMITS.visitorDailyCalls - v),
    };
  } catch {
    return { ...base, available: false, message: 'The usage tracker is temporarily unavailable.' };
  }
}
