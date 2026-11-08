import { db } from '@/db';
import { evidenceRecords, themes } from '@/db/schema';
import { inArray } from 'drizzle-orm';
import { analyzeRecordWith } from '@/services/ai/record-analysis';
import { chatJson, LiveProvider, providerModel } from '@/services/ai/llm';
import { codedFromParsed } from '@/lib/research/triangulation';
import { ensureResearchData } from '@/services/research/datasets';

/**
 * Controlled demonstration dataset: six genuine public records (three platforms,
 * the main themes, one Hinglish comment). Visitors re-run live AI on these; results are
 * returned to the browser only and never written to the official research record.
 */
export const DEMO_RECORD_IDS = [
  'pub-play-2026-08-20-1', // skipping an instalment during financial difficulty
  'pub-play-2026-10-15-1', // failed autopay with no retry
  'pub-tqna-post-83861', // insufficient funds on the debit date
  'pub-yt-QFVffpBj4NU-1', // skipping SIPs at a market peak
  'pub-yt-QFVffpBj4NU-3', // Hinglish comment on a flat market
  'pub-play-2026-07-16-1', // wrong invested amount shown
] as const;

export interface DemoRecord {
  id: string;
  platform: string;
  sourceUrl: string;
  originalText: string;
}

export async function loadDemoRecords(): Promise<DemoRecord[]> {
  await ensureResearchData();
  const rows = await db.select().from(evidenceRecords).where(inArray(evidenceRecords.id, [...DEMO_RECORD_IDS])).all();
  const byId = new Map(rows.map((r) => [r.id, r]));
  return DEMO_RECORD_IDS.map((id) => byId.get(id)).filter(Boolean).map((r) => ({ id: r!.id, platform: r!.platform, sourceUrl: r!.sourceUrl, originalText: r!.originalText }));
}

export interface LiveDemoResult {
  evidenceId: string;
  provider: LiveProvider;
  model: string;
  generatedAt: string;
  latencyMs: number;
  totalTokens: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  status: 'valid' | 'invalid' | 'guard_failed' | 'error';
  messages: string[];
  themeName: string | null;
  firstPerson: boolean | null;
  codes: Array<{ code: string; quote: string }>;
  signals: Array<{ signal: string; quote: string }>;
  uncertainty: string | null;
}

/** Runs live AI on one demo record. Read-only: nothing is persisted. */
export async function analyseDemoRecord(record: DemoRecord, provider: LiveProvider, maxOutputTokens: number): Promise<LiveDemoResult> {
  const known = (await db.select({ id: themes.id, name: themes.name, description: themes.description, journeyStage: themes.journeyStage }).from(themes).all()).slice(0, 40);
  const r = await analyzeRecordWith(
    (system, user, o) => chatJson(system, user, { ...o, provider }),
    { provider, model: providerModel(provider) },
    { id: record.id, sourceUrl: record.sourceUrl, platform: record.platform, collectedAt: '', originalText: record.originalText },
    known,
    { maxTokens: maxOutputTokens },
  );
  const coded = codedFromParsed(r.parsedOutput ?? null);
  const p = (r.parsedOutput ?? {}) as Record<string, unknown>;
  return {
    evidenceId: record.id,
    provider,
    model: r.modelVersion || r.model,
    generatedAt: new Date().toISOString(),
    latencyMs: r.latencyMs,
    totalTokens: r.totalTokens ?? null,
    inputTokens: r.inputTokens ?? null,
    outputTokens: r.outputTokens ?? null,
    status: r.validationStatus,
    messages: r.validationErrors ?? [],
    themeName: coded.themeName,
    firstPerson: coded.firstPerson,
    codes: coded.codes,
    signals: coded.signals,
    uncertainty: typeof p.uncertaintyAnalysis === 'string' ? p.uncertaintyAnalysis : null,
  };
}
