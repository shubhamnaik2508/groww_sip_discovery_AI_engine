'use server';

import { headers } from 'next/headers';
import { getDemoStatus, recordDemoUsage, releaseDemoCalls, reserveDemoCalls, DEMO_LIMITS, DemoStatus } from '@/services/demo/guard';
import { analyseDemoRecord, DEMO_RECORD_IDS, loadDemoRecords, LiveDemoResult } from '@/services/demo/demo';
import { isLiveProvider, LiveProvider, providerConfigured, resolveProvider } from '@/services/ai/llm';
import { generateTriangulationSynthesis, SynthesisOutput } from '@/services/research/ai-research';
import { loadResearchState } from '@/services/research/triangulation-service';

/**
 * Public live-AI demo. Anyone can call these (no login, no passcode), but every call is
 * checked against the shared, persistent limits in services/demo/guard.ts before any
 * provider request is made, and nothing is written to the official research record.
 */
type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function chooseProvider(requested?: string): LiveProvider | { error: string } {
  try {
    if (requested && isLiveProvider(requested) && !providerConfigured(requested)) return { error: 'That AI provider is not available. Choose another one.' };
    return resolveProvider(requested || null); // Gemini preferred when configured
  } catch {
    return { error: 'Live AI is not available right now. Stored results remain available.' };
  }
}

export async function getDemoStatusAction(): Promise<DemoStatus> {
  return getDemoStatus(await headers());
}

export async function runDemoAnalysisAction(input: { recordIds: string[]; provider?: string }): Promise<Result<{ results: LiveDemoResult[]; status: DemoStatus }>> {
  const ids = [...new Set((input.recordIds ?? []).filter((id) => (DEMO_RECORD_IDS as readonly string[]).includes(id)))];
  if (!ids.length) return { ok: false, error: 'Choose at least one record from the demo set.' };
  if (ids.length > DEMO_LIMITS.maxRecordsPerRun) return { ok: false, error: `Choose at most ${DEMO_LIMITS.maxRecordsPerRun} records per run.` };
  const provider = chooseProvider(input.provider);
  if (typeof provider !== 'string') return { ok: false, error: provider.error };

  const h = await headers();
  const reservation = await reserveDemoCalls(h, ids.length, provider);
  if (!reservation.ok) return { ok: false, error: reservation.message };

  const records = (await loadDemoRecords()).filter((r) => ids.includes(r.id));
  const results: LiveDemoResult[] = [];
  let attempted = 0;
  for (const record of records) {
    attempted++;
    try {
      const r = await analyseDemoRecord(record, provider, DEMO_LIMITS.maxOutputTokens);
      results.push(r);
      await recordDemoUsage(reservation, { kind: 'analysis', provider, model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, totalTokens: r.totalTokens, ok: r.status === 'valid' });
    } catch (e) {
      // Visitors get a plain message; provider details stay in server logs.
      console.error('demo analysis failed', e instanceof Error ? e.message : e);
      const busy = e instanceof Error && /rate limit|429|busy|exhausted/i.test(e.message);
      const message = busy ? 'The AI provider is busy right now. Please try again in a minute.' : 'The AI provider could not complete this record. Please try again later.';
      results.push({ evidenceId: record.id, provider, model: '', generatedAt: new Date().toISOString(), latencyMs: 0, totalTokens: null, inputTokens: null, outputTokens: null, status: 'error', messages: [message], themeName: null, firstPerson: null, codes: [], signals: [], uncertainty: null });
      // No usage reported: charged at the worst-case cost (conservative).
      await recordDemoUsage(reservation, { kind: 'analysis', provider, model: '', ok: false });
    }
  }
  await releaseDemoCalls(reservation, ids.length - attempted);
  return { ok: true, data: { results, status: await getDemoStatus(h) } };
}

export interface LiveSynthesis {
  provider: LiveProvider;
  model: string;
  generatedAt: string;
  status: string;
  messages: string[];
  output: SynthesisOutput | null;
}

export async function runDemoSynthesisAction(input: { provider?: string }): Promise<Result<{ synthesis: LiveSynthesis; status: DemoStatus }>> {
  const provider = chooseProvider(input.provider);
  if (typeof provider !== 'string') return { ok: false, error: provider.error };
  const h = await headers();
  const state = await loadResearchState();
  if (state.triangulation.publicSummary.analysedValid === 0) return { ok: false, error: 'There is no analysed public feedback to synthesise yet.' };
  const reservation = await reserveDemoCalls(h, 1, provider);
  if (!reservation.ok) return { ok: false, error: reservation.message };
  try {
    const row = await generateTriangulationSynthesis(state.triangulation, provider, { maxTokens: 2500 });
    await recordDemoUsage(reservation, { kind: 'synthesis', provider, model: row.model, inputTokens: row.inputTokens, outputTokens: row.outputTokens, totalTokens: row.totalTokens, ok: row.validationStatus === 'valid' });
    return {
      ok: true,
      data: {
        synthesis: {
          provider,
          model: row.model,
          generatedAt: row.createdAt,
          status: row.validationStatus,
          messages: row.validationErrors ? (JSON.parse(row.validationErrors) as string[]).slice(0, 5) : [],
          output: row.parsedOutput ? (JSON.parse(row.parsedOutput) as SynthesisOutput) : null,
        },
        status: await getDemoStatus(h),
      },
    };
  } catch {
    await recordDemoUsage(reservation, { kind: 'synthesis', provider, model: '', ok: false });
    return { ok: false, error: 'The AI provider could not complete the synthesis. Please try again later; the stored synthesis remains available.' };
  }
}
