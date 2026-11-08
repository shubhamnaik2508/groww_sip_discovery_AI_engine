import crypto from 'crypto';
import { isPublicDeployment } from '@/lib/research/access';
import { getUsageStore, UsageStore } from './usage-store';

/**
 * Public AI demo safeguards — all enforced server-side against the shared usage store.
 *
 * - Kill switches: AI_DEMO_ENABLED must be "true" on public deployments (default off), and
 *   setting the Redis key `demo:disabled` to "1" stops the demo instantly without a redeploy.
 * - Shared daily allowance (all visitors): calls and tokens.
 * - Per-visitor limits (hashed IP + user agent, never stored raw): hourly and daily calls.
 * - Small batches, input/output token caps, and basic automated-client filtering.
 * Limits survive refreshes, new sessions and multiple server instances because they live in Redis.
 */
const int = (v: string | undefined, d: number) => (v && /^\d+$/.test(v) ? Number(v) : d);

export const DEMO_LIMITS = {
  dailyCalls: int(process.env.AI_DEMO_DAILY_CALLS, 60),
  dailyTokens: int(process.env.AI_DEMO_DAILY_TOKENS, 400_000),
  visitorHourlyCalls: int(process.env.AI_DEMO_VISITOR_HOURLY_CALLS, 6),
  visitorDailyCalls: int(process.env.AI_DEMO_VISITOR_DAILY_CALLS, 12),
  maxRecordsPerRun: 3,
  maxOutputTokens: 1600,
};

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

export type DemoDenial = { ok: false; code: 'disabled' | 'unavailable' | 'bot' | 'visitor_limit' | 'daily_limit' | 'token_budget'; message: string };
export type DemoReservation = { ok: true; visitor: string; calls: number; store: UsageStore };

const keys = (visitor: string, now = new Date()) => ({
  globalCalls: `demo:calls:${dayKey(now)}`,
  globalTokens: `demo:tokens:${dayKey(now)}`,
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

/** Atomically reserves `calls` against every limit; rolls back on denial. */
export async function reserveDemoCalls(headers: Headers, calls: number): Promise<DemoReservation | DemoDenial> {
  if (!demoEnabledByConfig()) return { ok: false, code: 'disabled', message: 'The live AI demo is switched off right now. All stored AI results remain available.' };
  const ua = headers.get('user-agent') ?? '';
  if (!ua || BOT_UA.test(ua)) return { ok: false, code: 'bot', message: 'Automated clients cannot run the live AI demo. Open the site in a regular browser.' };
  const store = getUsageStore();
  if (!store) return { ok: false, code: 'unavailable', message: 'The live AI demo is not available on this deployment yet. All stored AI results remain available.' };
  if (await killSwitchOn(store)) return { ok: false, code: 'disabled', message: 'The live AI demo has been paused by the researcher. All stored AI results remain available.' };

  const visitor = visitorId(headers);
  const k = keys(visitor);
  try {
    if ((await store.get(k.globalTokens)) >= DEMO_LIMITS.dailyTokens) {
      return { ok: false, code: 'token_budget', message: "Today's shared AI demo budget has been used. It resets at midnight IST; stored results remain available." };
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
    return { ok: true, visitor, calls, store };
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

/** Records actual token usage and an audit entry (no visitor IPs or content). */
export async function recordDemoUsage(r: DemoReservation, entry: { kind: 'analysis' | 'synthesis'; provider: string; model: string; tokens: number; ok: boolean }) {
  const k = keys(r.visitor);
  await r.store.incr(k.globalTokens, Math.max(0, Math.round(entry.tokens)), 2 * 86_400).catch(() => undefined);
  await r.store.log(k.log, { at: new Date().toISOString(), visitor: r.visitor.slice(0, 8), ...entry }, 500, 14 * 86_400).catch(() => undefined);
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
    const [g, v, t] = await Promise.all([store.get(k.globalCalls), store.get(k.visitorDay), store.get(k.globalTokens)]);
    const callsRemainingToday = Math.max(0, DEMO_LIMITS.dailyCalls - g);
    const exhausted = callsRemainingToday === 0 || t >= DEMO_LIMITS.dailyTokens;
    return {
      ...base,
      available: !exhausted,
      message: exhausted ? "Today's shared demo allowance has been used. It resets at midnight IST." : null,
      callsRemainingToday: exhausted ? 0 : callsRemainingToday,
      visitorRemainingToday: Math.max(0, DEMO_LIMITS.visitorDailyCalls - v),
    };
  } catch {
    return { ...base, available: false, message: 'The usage tracker is temporarily unavailable.' };
  }
}
