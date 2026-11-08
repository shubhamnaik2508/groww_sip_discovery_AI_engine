'use server';

import crypto from 'crypto';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { recordAnalyses, validationReviews } from '@/db/schema';
import { AnalysisOrchestrator } from '@/services/ai';
import { isLiveProvider, LiveProvider, providerConfigured, resolveProvider } from '@/services/ai/llm';
import { ensureResearchData, importSurveyCsvText, loadActiveSurvey } from '@/services/research/datasets';
import { loadResearchState } from '@/services/research/triangulation-service';
import { analyseSurveyOpenText, runTriangulationSynthesis } from '@/services/research/ai-research';
import { isResearchCode } from '@/lib/research/codebook';

type Result<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Mutations and paid AI calls are gated. In production a RESEARCH_ADMIN_PASSCODE must be
 * configured and supplied; locally (no passcode configured, not production) they are open.
 */
function checkAccess(passcode: string | null | undefined): string | null {
  const expected = process.env.RESEARCH_ADMIN_PASSCODE;
  const isProduction = process.env.VERCEL_ENV === 'production';
  if (!expected) return isProduction ? 'Changes are disabled on this deployment (no RESEARCH_ADMIN_PASSCODE configured).' : null;
  const a = Buffer.from(String(passcode ?? ''));
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return 'Incorrect research passcode.';
  return null;
}

/** Validates the provider chosen in the UI (Gemini is the default when none is sent). */
function pickProvider(requested?: string): LiveProvider | { ok: false; error: string } {
  if (requested && isLiveProvider(requested) && !providerConfigured(requested)) {
    return { ok: false, error: `${requested === 'gemini' ? 'Gemini' : 'Groq'} has no API key on this server. Choose the other provider.` };
  }
  try {
    return resolveProvider(requested || null);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No AI provider is available.' };
  }
}

// Cost control: per-instance budget of live record analyses per rolling hour.
const HOURLY_RECORD_BUDGET = 40;
const MAX_RECORDS_PER_REQUEST = 5;
const usage: number[] = [];
function takeBudget(n: number): number {
  const cutoff = Date.now() - 3600_000;
  while (usage.length && usage[0] < cutoff) usage.shift();
  const allowed = Math.max(0, Math.min(n, HOURLY_RECORD_BUDGET - usage.length));
  for (let i = 0; i < allowed; i++) usage.push(Date.now());
  return allowed;
}

function revalidateResearch() {
  for (const p of ['/', '/primary-research', '/analysis', '/themes', '/triangulation', '/opportunities', '/validation', '/evidence-log', '/evidence']) revalidatePath(p);
}

export async function importSurveyAction(formData: FormData): Promise<Result<{ respondents: number; excludedColumns: string[]; warnings: string[]; created: boolean }>> {
  const denied = checkAccess(formData.get('passcode') as string);
  if (denied) return { ok: false, error: denied };
  const file = formData.get('file') as File | null;
  if (!file || file.size === 0) return { ok: false, error: 'Choose the Google Forms CSV export to import.' };
  if (file.size > 2_000_000) return { ok: false, error: 'The file is larger than 2 MB. Export only the responses sheet as CSV.' };
  if (!/\.csv$/i.test(file.name)) return { ok: false, error: 'Upload a .csv export (File → Download → CSV in Google Sheets).' };
  try {
    const r = await importSurveyCsvText(await file.text(), file.name, (formData.get('importedBy') as string)?.trim() || 'Researcher');
    revalidateResearch();
    return { ok: true, data: { respondents: r.respondents, excludedColumns: r.excludedColumns, warnings: r.warnings, created: r.created } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Import failed.' };
  }
}

export async function runPublicAnalysisAction(input: { passcode?: string; limit?: number; provider?: string }): Promise<Result<{ analysed: number; valid: number; failed: number; runId: string | null; remaining: number; model: string | null }>> {
  const denied = checkAccess(input.passcode);
  if (denied) return { ok: false, error: denied };
  const chosen = pickProvider(input.provider);
  if (typeof chosen !== 'string' || !isLiveProvider(chosen)) return chosen;
  await ensureResearchData();
  const state = await loadResearchState();
  const todo = state.publicRecords.filter((r) => r.eligible && r.analysis?.status !== 'valid').map((r) => r.id);
  if (!todo.length) return { ok: true, data: { analysed: 0, valid: 0, failed: 0, runId: null, remaining: 0, model: null } };
  const n = takeBudget(Math.min(MAX_RECORDS_PER_REQUEST, Math.max(1, input.limit ?? MAX_RECORDS_PER_REQUEST), todo.length));
  if (n === 0) return { ok: false, error: `Hourly AI budget reached (${HOURLY_RECORD_BUDGET} records/hour). Try again later.` };
  try {
    const run = await AnalysisOrchestrator.executeRun({ providerName: chosen, recordIds: todo.slice(0, n), maxRecords: n });
    revalidateResearch();
    return { ok: true, data: { analysed: run.totalRecords, valid: run.successfulRecords, failed: run.failedRecords, runId: run.runId, remaining: todo.length - run.totalRecords, model: run.model } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'AI analysis failed.' };
  }
}

export async function runSurveyTextAnalysisAction(input: { passcode?: string; provider?: string }): Promise<Result<{ analysed: number; failed: number; errors: string[] }>> {
  const denied = checkAccess(input.passcode);
  if (denied) return { ok: false, error: denied };
  const chosen = pickProvider(input.provider);
  if (typeof chosen !== 'string' || !isLiveProvider(chosen)) return chosen;
  const survey = await loadActiveSurvey();
  if (!survey) return { ok: false, error: 'No survey dataset is loaded.' };
  if (takeBudget(3) === 0) return { ok: false, error: 'Hourly AI budget reached. Try again later.' };
  const r = await analyseSurveyOpenText(survey, chosen);
  revalidateResearch();
  return { ok: true, data: r };
}

export async function runSynthesisAction(input: { passcode?: string; provider?: string }): Promise<Result<{ id: string; status: string }>> {
  const denied = checkAccess(input.passcode);
  if (denied) return { ok: false, error: denied };
  const chosen = pickProvider(input.provider);
  if (typeof chosen !== 'string' || !isLiveProvider(chosen)) return chosen;
  if (takeBudget(2) === 0) return { ok: false, error: 'Hourly AI budget reached. Try again later.' };
  try {
    const state = await loadResearchState();
    if (state.triangulation.publicSummary.analysedValid === 0) return { ok: false, error: 'Analyse public feedback first: the synthesis needs both sources.' };
    const row = await runTriangulationSynthesis(state.triangulation, chosen);
    revalidateResearch();
    return { ok: true, data: { id: row.id, status: row.validationStatus } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Synthesis failed.' };
  }
}

export async function submitValidationAction(input: {
  passcode?: string;
  recordAnalysisId: string;
  verdict: 'accurate' | 'partially_accurate' | 'inaccurate';
  correctedCodes?: string[];
  note?: string;
  reviewer: string;
}): Promise<Result<{ id: string }>> {
  const denied = checkAccess(input.passcode);
  if (denied) return { ok: false, error: denied };
  if (!['accurate', 'partially_accurate', 'inaccurate'].includes(input.verdict)) return { ok: false, error: 'Choose accurate, partially accurate or inaccurate.' };
  const reviewer = input.reviewer?.trim();
  if (!reviewer || reviewer.length < 2) return { ok: false, error: 'Enter the reviewer name so the decision is attributable.' };
  if (input.verdict !== 'accurate' && !(input.note?.trim() || input.correctedCodes?.length)) {
    return { ok: false, error: 'Record a correction: pick the correct themes or describe what the AI got wrong.' };
  }
  const corrected = (input.correctedCodes ?? []).filter(isResearchCode);
  await ensureResearchData();
  const ra = await db.select().from(recordAnalyses).where(eq(recordAnalyses.id, input.recordAnalysisId)).limit(1);
  if (!ra.length) return { ok: false, error: 'That AI analysis no longer exists.' };
  const id = crypto.randomUUID();
  await db.insert(validationReviews).values({
    id,
    recordAnalysisId: ra[0].id,
    evidenceId: ra[0].evidenceId,
    verdict: input.verdict,
    correctedCodes: input.verdict === 'accurate' ? null : JSON.stringify(corrected),
    correctionNote: input.note?.trim() || null,
    reviewer: reviewer.slice(0, 80),
    // The AI output is snapshotted unchanged; reviews never modify it.
    aiOutputSnapshot: ra[0].parsedOutput ?? ra[0].rawOutput,
    createdAt: new Date().toISOString(),
  });
  revalidateResearch();
  return { ok: true, data: { id } };
}

export async function importValidationSheetAction(formData: FormData): Promise<Result<{ imported: number; skipped: string[] }>> {
  const denied = checkAccess(formData.get('passcode') as string);
  if (denied) return { ok: false, error: denied };
  const file = formData.get('file') as File | null;
  if (!file) return { ok: false, error: 'Choose the completed review sheet (CSV).' };
  const Papa = (await import('papaparse')).default;
  const rows = Papa.parse<Record<string, string>>(await file.text(), { header: true, skipEmptyLines: 'greedy' }).data;
  let imported = 0;
  const skipped: string[] = [];
  for (const [i, row] of rows.entries()) {
    const verdict = (row.verdict ?? '').trim().toLowerCase().replace(/\s+/g, '_');
    if (!verdict) continue; // not yet reviewed
    const r = await submitValidationAction({
      passcode: formData.get('passcode') as string,
      recordAnalysisId: (row.record_analysis_id ?? '').trim(),
      verdict: verdict as 'accurate',
      correctedCodes: (row.corrected_codes ?? '').split(/[;,]/).map((s) => s.trim()).filter(Boolean),
      note: row.correction_note,
      reviewer: row.reviewer ?? '',
    });
    if (r.ok) imported++;
    else skipped.push(`Row ${i + 2}: ${r.error}`);
  }
  return { ok: true, data: { imported, skipped } };
}
