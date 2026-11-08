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
import { dataChangesAllowed, isPublicDeployment, liveAiAllowed, READ_ONLY_MESSAGE } from '@/lib/research/access';

type Result<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Server-side enforcement (not a frontend restriction): on any public deployment these
 * actions refuse to run, so anonymous visitors can never trigger paid AI calls or alter
 * the research record. Authorised work happens in the private workspace (see access.ts).
 */
function checkAiAccess(): string | null {
  return liveAiAllowed() ? null : READ_ONLY_MESSAGE;
}
function checkDataAccess(): string | null {
  return dataChangesAllowed() ? null : READ_ONLY_MESSAGE;
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

// Cost control for official (saved) runs in the private workspace. Public visitors never
// reach these actions (checkAiAccess refuses them); the public demo has its own shared,
// persistent limits in services/demo/guard.ts.
type BudgetKind = 'records' | 'synthesis' | 'survey_text';
const HOUR = 3600_000;
const DAY = 24 * HOUR;
function budgetLimits(kind: BudgetKind): Array<{ windowMs: number; max: number; label: string }> {
  const prod = isPublicDeployment();
  if (kind === 'records') return prod ? [{ windowMs: HOUR, max: 10, label: '10 records per hour' }, { windowMs: DAY, max: 30, label: '30 records per day' }] : [{ windowMs: HOUR, max: 40, label: '40 records per hour' }];
  if (kind === 'synthesis') return [{ windowMs: HOUR, max: prod ? 2 : 6, label: `${prod ? 2 : 6} syntheses per hour` }];
  return [{ windowMs: HOUR, max: prod ? 1 : 3, label: `${prod ? 1 : 3} survey-coding run(s) per hour` }];
}
const usage: Record<BudgetKind, number[]> = { records: [], synthesis: [], survey_text: [] };
const MAX_RECORDS_PER_REQUEST = 5;

/** Reserves up to n units; returns how many were granted and, if none, which limit was hit. */
function takeBudget(kind: BudgetKind, n: number): { granted: number; limit: string | null } {
  const now = Date.now();
  const log = usage[kind];
  const longest = Math.max(...budgetLimits(kind).map((l) => l.windowMs));
  while (log.length && log[0] < now - longest) log.shift();
  let granted = n;
  let hit: string | null = null;
  for (const l of budgetLimits(kind)) {
    const used = log.filter((t) => t >= now - l.windowMs).length;
    const room = Math.max(0, l.max - used);
    if (room < granted) {
      granted = room;
      hit = l.label;
    }
  }
  for (let i = 0; i < granted; i++) log.push(now);
  return { granted, limit: granted === 0 ? hit : null };
}

function revalidateResearch() {
  for (const p of ['/', '/primary-research', '/analysis', '/themes', '/triangulation', '/opportunities', '/validation', '/evidence-log', '/evidence']) revalidatePath(p);
}

export async function importSurveyAction(formData: FormData): Promise<Result<{ respondents: number; excludedColumns: string[]; warnings: string[]; created: boolean }>> {
  const denied = checkDataAccess();
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

export async function runPublicAnalysisAction(input: { limit?: number; provider?: string }): Promise<Result<{ analysed: number; valid: number; failed: number; runId: string | null; remaining: number; model: string | null }>> {
  const denied = checkAiAccess();
  if (denied) return { ok: false, error: denied };
  const chosen = pickProvider(input.provider);
  if (typeof chosen !== 'string' || !isLiveProvider(chosen)) return chosen;
  await ensureResearchData();
  const state = await loadResearchState();
  const todo = state.publicRecords.filter((r) => r.eligible && r.analysis?.status !== 'valid').map((r) => r.id);
  if (!todo.length) return { ok: true, data: { analysed: 0, valid: 0, failed: 0, runId: null, remaining: 0, model: null } };
  const budget = takeBudget('records', Math.min(MAX_RECORDS_PER_REQUEST, Math.max(1, input.limit ?? MAX_RECORDS_PER_REQUEST), todo.length));
  const n = budget.granted;
  if (n === 0) return { ok: false, error: `Usage limit reached (${budget.limit}). Stored results remain available; try again later.` };
  try {
    const run = await AnalysisOrchestrator.executeRun({ providerName: chosen, recordIds: todo.slice(0, n), maxRecords: n });
    revalidateResearch();
    return { ok: true, data: { analysed: run.totalRecords, valid: run.successfulRecords, failed: run.failedRecords, runId: run.runId, remaining: todo.length - run.totalRecords, model: run.model } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'AI analysis failed.' };
  }
}

export async function runSurveyTextAnalysisAction(input: { provider?: string }): Promise<Result<{ analysed: number; failed: number; errors: string[] }>> {
  const denied = checkAiAccess();
  if (denied) return { ok: false, error: denied };
  const chosen = pickProvider(input.provider);
  if (typeof chosen !== 'string' || !isLiveProvider(chosen)) return chosen;
  const survey = await loadActiveSurvey();
  if (!survey) return { ok: false, error: 'No survey dataset is loaded.' };
  const sb = takeBudget('survey_text', 1);
  if (sb.granted === 0) return { ok: false, error: `Usage limit reached (${sb.limit}). Try again later.` };
  const r = await analyseSurveyOpenText(survey, chosen);
  revalidateResearch();
  return { ok: true, data: r };
}

export async function runSynthesisAction(input: { provider?: string }): Promise<Result<{ id: string; status: string }>> {
  const denied = checkAiAccess();
  if (denied) return { ok: false, error: denied };
  const chosen = pickProvider(input.provider);
  if (typeof chosen !== 'string' || !isLiveProvider(chosen)) return chosen;
  const yb = takeBudget('synthesis', 1);
  if (yb.granted === 0) return { ok: false, error: `Usage limit reached (${yb.limit}). Try again later.` };
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
  recordAnalysisId: string;
  verdict: 'accurate' | 'partially_accurate' | 'inaccurate';
  correctedCodes?: string[];
  note?: string;
  reviewer: string;
}): Promise<Result<{ id: string }>> {
  const denied = checkDataAccess();
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
  const denied = checkDataAccess();
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
