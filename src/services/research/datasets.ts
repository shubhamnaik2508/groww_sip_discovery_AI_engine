import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db, initializeDatabase } from '@/db';
import {
  evidenceRecords,
  surveyDatasets,
  surveyResponses,
  analysisRuns,
  recordAnalyses,
  themes,
  evidenceThemeLinks,
  surveyTextAnalyses,
  aiSyntheses,
  validationReviews,
} from '@/db/schema';
import { computeContentHash } from '@/lib/hashing';
import { parseAnonymisedCsv, parseGoogleFormsCsv, ParsedSurvey, SurveyQuestion } from '@/lib/research/survey';

/**
 * Research datasets bundled with the repository (version-controlled, reviewable):
 *   data/primary/google-forms-sip-survey.anonymized.csv   — Pipeline A (PII removed)
 *   data/secondary/*.jsonl                                — Pipeline B public records
 *   data/analysis/analysis-snapshot.json                  — stored AI runs (real model outputs)
 *   data/validation/validation-reviews.json               — human review decisions (if any)
 *
 * On a fresh database (e.g. a Vercel cold start with ephemeral /tmp storage) the
 * bundle is loaded idempotently so every deployment shows the same evidence.
 * Data imported through the UI is stored in the database alongside it.
 */

export const DATA_DIR = path.join(process.cwd(), 'data');
export const SURVEY_DATASET_NAME = 'Primary Research — Google Forms SIP Investor Survey';
export const BUNDLED_SURVEY_FILE = 'google-forms-sip-survey.anonymized.csv';

export interface PublicFeedbackFileRecord {
  externalId: string;
  platform: string;
  sourceUrl: string;
  title: string | null;
  originalText: string;
  publishedAt: string | null;
  collectedAt: string;
  language?: string | null;
  authorHash?: string | null;
  metadata?: Record<string, unknown>;
  collectionMethod: string;
}

export function publicEvidenceId(externalId: string): string {
  return `pub-${externalId}`;
}

export function readBundledPublicFeedback(): PublicFeedbackFileRecord[] {
  const dir = path.join(DATA_DIR, 'secondary');
  if (!fs.existsSync(dir)) return [];
  const records: PublicFeedbackFileRecord[] = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort()) {
    for (const line of fs.readFileSync(path.join(dir, file), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      records.push(JSON.parse(line));
    }
  }
  return records;
}

// ---------------------------------------------------------------------------
// Survey (Pipeline A)
// ---------------------------------------------------------------------------

export async function importSurvey(
  survey: ParsedSurvey,
  fileName: string,
  importedBy: string,
): Promise<{ datasetId: string; created: boolean }> {
  await initializeDatabase();
  const existing = await db.select().from(surveyDatasets).where(eq(surveyDatasets.sourceHash, survey.sourceHash)).limit(1);
  if (existing.length) {
    await db.update(surveyDatasets).set({ isActive: false });
    await db.update(surveyDatasets).set({ isActive: true }).where(eq(surveyDatasets.id, existing[0].id));
    return { datasetId: existing[0].id, created: false };
  }
  const datasetId = `survey-${survey.sourceHash.slice(0, 12)}`;
  await db.update(surveyDatasets).set({ isActive: false });
  await db.insert(surveyDatasets).values({
    id: datasetId,
    name: SURVEY_DATASET_NAME,
    fileName,
    sourceHash: survey.sourceHash,
    importedBy,
    respondentCount: survey.responses.length,
    questionSchema: JSON.stringify(survey.questions),
    excludedColumns: JSON.stringify(survey.excludedColumns),
    warnings: JSON.stringify(survey.warnings),
    isActive: true,
  });
  for (const r of survey.responses) {
    await db.insert(surveyResponses).values({
      id: `${datasetId}-${r.respondentCode}`,
      datasetId,
      respondentCode: r.respondentCode,
      submittedAt: r.submittedAt,
      answers: JSON.stringify(r.answers),
    });
  }
  return { datasetId, created: true };
}

/** Imports a raw Google Forms export uploaded through the UI (PII stripped on parse). */
export async function importSurveyCsvText(csvText: string, fileName: string, importedBy: string) {
  const isAnonymised = /^﻿?Respondent,/.test(csvText);
  const survey = isAnonymised ? parseAnonymisedCsv(csvText) : parseGoogleFormsCsv(csvText);
  if (!survey.questions.some((q) => q.type === 'timestamp')) {
    throw new Error('This file does not look like a Google Forms export: the Timestamp column is missing.');
  }
  if (!survey.questions.some((q) => q.type === 'multi_choice' || q.type === 'single_choice')) {
    throw new Error('This file does not look like a Google Forms export (no choice questions found).');
  }
  const result = await importSurvey(survey, fileName, importedBy);
  return { ...result, respondents: survey.responses.length, excludedColumns: survey.excludedColumns, warnings: survey.warnings };
}

export interface StoredSurvey {
  datasetId: string;
  name: string;
  fileName: string;
  importedAt: string;
  importedBy: string;
  excludedColumns: string[];
  survey: ParsedSurvey;
}

export async function loadActiveSurvey(): Promise<StoredSurvey | null> {
  await ensureResearchData();
  const ds = await db.select().from(surveyDatasets).where(eq(surveyDatasets.isActive, true)).limit(1);
  if (!ds.length) return null;
  const d = ds[0];
  const rows = await db.select().from(surveyResponses).where(eq(surveyResponses.datasetId, d.id)).all();
  rows.sort((a, b) => a.respondentCode.localeCompare(b.respondentCode, undefined, { numeric: true }));
  const survey: ParsedSurvey = {
    questions: JSON.parse(d.questionSchema) as SurveyQuestion[],
    responses: rows.map((r) => ({ respondentCode: r.respondentCode, submittedAt: r.submittedAt, answers: JSON.parse(r.answers) })),
    excludedColumns: JSON.parse(d.excludedColumns),
    warnings: JSON.parse(d.warnings),
    sourceHash: d.sourceHash,
  };
  return { datasetId: d.id, name: d.name, fileName: d.fileName, importedAt: d.importedAt, importedBy: d.importedBy, excludedColumns: survey.excludedColumns, survey };
}

// ---------------------------------------------------------------------------
// Public feedback (Pipeline B)
// ---------------------------------------------------------------------------

export async function upsertPublicFeedback(records: PublicFeedbackFileRecord[]): Promise<{ inserted: number; duplicates: number }> {
  await initializeDatabase();
  const existing = await db.select({ id: evidenceRecords.id, contentHash: evidenceRecords.contentHash }).from(evidenceRecords).all();
  const ids = new Set(existing.map((e) => e.id));
  const hashToId = new Map(existing.map((e) => [e.contentHash, e.id]));
  let inserted = 0;
  let duplicates = 0;
  for (const r of records) {
    const id = publicEvidenceId(r.externalId);
    if (ids.has(id)) continue;
    const contentHash = computeContentHash(r.originalText);
    const duplicateOf = hashToId.get(contentHash) ?? null;
    if (duplicateOf) duplicates++;
    await db.insert(evidenceRecords).values({
      id,
      sourceUrl: r.sourceUrl,
      platform: r.platform,
      collectedAt: r.collectedAt,
      originalText: r.originalText,
      contentHash,
      investorContext: null,
      journeyStage: 'unclear',
      sourceMetadata: JSON.stringify({
        title: r.title ?? undefined,
        publishedAt: r.publishedAt ?? undefined,
        language: r.language ?? undefined,
        authorId: r.authorHash ?? undefined,
        collectionMethod: r.collectionMethod,
        evidenceType: 'public_feedback',
        ...(r.metadata ?? {}),
      }),
      fieldProvenance: JSON.stringify({
        sourceUrl: 'verified_live',
        platform: 'verified_live',
        collectedAt: 'verified_live',
        originalText: 'verified_live',
        journeyStage: 'unverified',
        sourceMetadata: 'verified_live',
      }),
      entryMethod: 'csv',
      importBatchId: 'bundled-public-feedback',
      duplicateOfId: duplicateOf,
      isSynthetic: false,
      // Text was copied from the live public page at collection time (see collectionMethod).
      verificationStatus: 'content_verified',
      verifiedAt: r.collectedAt,
      verifiedBy: r.collectionMethod,
    });
    ids.add(id);
    if (!duplicateOf) hashToId.set(contentHash, id);
    inserted++;
  }
  return { inserted, duplicates };
}

// ---------------------------------------------------------------------------
// Stored AI outputs and reviews
// ---------------------------------------------------------------------------

export interface AnalysisSnapshot {
  exportedAt: string;
  note: string;
  runs: Array<typeof analysisRuns.$inferSelect>;
  recordAnalyses: Array<typeof recordAnalyses.$inferSelect>;
  surveyTextAnalyses: Array<typeof surveyTextAnalyses.$inferSelect>;
  syntheses: Array<typeof aiSyntheses.$inferSelect>;
}

function readJsonIfExists<T>(rel: string): T | null {
  const p = path.join(DATA_DIR, rel);
  return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, 'utf8')) as T) : null;
}

/** Registers the AI-proposed theme and its evidence link for a valid analysis (idempotent). */
export async function registerThemeLink(analysis: { id: string; evidenceId: string; parsedOutput: string | null; validationStatus: string }) {
  if (analysis.validationStatus !== 'valid' || !analysis.parsedOutput) return;
  const parsed = JSON.parse(analysis.parsedOutput);
  const name: string | undefined = parsed?.theme?.name?.trim();
  if (!name) return;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const found = await db.select().from(themes).where(eq(themes.slug, slug)).limit(1);
  let themeId = found[0]?.id;
  if (!themeId) {
    themeId = `theme-${crypto.createHash('sha1').update(slug).digest('hex').slice(0, 12)}`;
    await db.insert(themes).values({
      id: themeId,
      name,
      slug,
      description: `Discovered from investor feedback: "${String(parsed.observedBehaviour ?? '').slice(0, 100)}"`,
      journeyStage: parsed.journeyStage ?? 'unclear',
      origin: 'ai_proposed',
      status: 'proposed',
    }).onConflictDoNothing();
  }
  const linkId = `link-${analysis.id}`;
  const existingLink = await db.select().from(evidenceThemeLinks).where(eq(evidenceThemeLinks.id, linkId)).limit(1);
  if (!existingLink.length) {
    await db.insert(evidenceThemeLinks).values({ id: linkId, evidenceId: analysis.evidenceId, themeId, role: 'supports', source: 'ai', recordAnalysisId: analysis.id });
  }
}

async function loadAnalysisSnapshot() {
  const snap = readJsonIfExists<AnalysisSnapshot>('analysis/analysis-snapshot.json');
  if (!snap) return;
  const runIds = new Set((await db.select({ id: analysisRuns.id }).from(analysisRuns).all()).map((r) => r.id));
  for (const run of snap.runs) if (!runIds.has(run.id)) await db.insert(analysisRuns).values(run);
  const raIds = new Set((await db.select({ id: recordAnalyses.id }).from(recordAnalyses).all()).map((r) => r.id));
  const evIds = new Set((await db.select({ id: evidenceRecords.id }).from(evidenceRecords).all()).map((r) => r.id));
  for (const ra of snap.recordAnalyses) {
    if (raIds.has(ra.id) || !evIds.has(ra.evidenceId)) continue;
    await db.insert(recordAnalyses).values(ra);
    await registerThemeLink(ra);
  }
  const stIds = new Set((await db.select({ id: surveyTextAnalyses.id }).from(surveyTextAnalyses).all()).map((r) => r.id));
  const dsIds = new Set((await db.select({ id: surveyDatasets.id }).from(surveyDatasets).all()).map((r) => r.id));
  for (const st of snap.surveyTextAnalyses ?? []) if (!stIds.has(st.id) && dsIds.has(st.datasetId)) await db.insert(surveyTextAnalyses).values(st);
  const syIds = new Set((await db.select({ id: aiSyntheses.id }).from(aiSyntheses).all()).map((r) => r.id));
  for (const sy of snap.syntheses ?? []) if (!syIds.has(sy.id)) await db.insert(aiSyntheses).values(sy);
}

async function loadValidationSnapshot() {
  const snap = readJsonIfExists<{ reviews: Array<typeof validationReviews.$inferSelect> }>('validation/validation-reviews.json');
  if (!snap) return;
  const ids = new Set((await db.select({ id: validationReviews.id }).from(validationReviews).all()).map((r) => r.id));
  for (const r of snap.reviews) if (!ids.has(r.id)) await db.insert(validationReviews).values(r);
}

let bootstrapPromise: Promise<void> | null = null;

/** Idempotently loads the bundled research datasets into the database once per process. */
export function ensureResearchData(): Promise<void> {
  if (process.env.SKIP_RESEARCH_BOOTSTRAP === '1') return initializeDatabase();
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      await initializeDatabase();
      const surveyPath = path.join(DATA_DIR, 'primary', BUNDLED_SURVEY_FILE);
      const anySurvey = await db.select({ id: surveyDatasets.id }).from(surveyDatasets).limit(1);
      if (!anySurvey.length && fs.existsSync(surveyPath)) {
        const parsed = parseAnonymisedCsv(fs.readFileSync(surveyPath, 'utf8'));
        // The bundled CSV is already anonymised; its provenance file records which columns were removed.
        const prov = readJsonIfExists<{ excludedColumns?: string[] }>('primary/google-forms-sip-survey.provenance.json');
        if (prov?.excludedColumns) parsed.excludedColumns = prov.excludedColumns;
        await importSurvey(parsed, BUNDLED_SURVEY_FILE, 'Bundled dataset (anonymised Google Forms export)');
      }
      await upsertPublicFeedback(readBundledPublicFeedback());
      await loadAnalysisSnapshot();
      await loadValidationSnapshot();
    })().catch((err) => {
      bootstrapPromise = null;
      throw err;
    });
  }
  return bootstrapPromise;
}

/** Exports stored AI outputs so a run can be committed and reproduced on every deployment. */
export async function buildAnalysisSnapshot(): Promise<AnalysisSnapshot> {
  await initializeDatabase();
  const runs = (await db.select().from(analysisRuns).all()).filter((r) => r.provider !== 'fake');
  const runIds = new Set(runs.map((r) => r.id));
  const pubIds = new Set((await db.select({ id: evidenceRecords.id }).from(evidenceRecords).all()).map((r) => r.id).filter((id) => id.startsWith('pub-')));
  return {
    exportedAt: new Date().toISOString(),
    note: 'Real model outputs exported from the analysis database. Raw outputs are unmodified.',
    runs,
    recordAnalyses: (await db.select().from(recordAnalyses).all()).filter((r) => runIds.has(r.runId) && pubIds.has(r.evidenceId)),
    surveyTextAnalyses: await db.select().from(surveyTextAnalyses).all(),
    syntheses: await db.select().from(aiSyntheses).all(),
  };
}

export async function latestAnalysisByEvidence(): Promise<Map<string, typeof recordAnalyses.$inferSelect>> {
  const all = await db.select().from(recordAnalyses).all();
  const runs = await db.select().from(analysisRuns).all();
  const realRuns = new Set(runs.filter((r) => r.provider !== 'fake').map((r) => r.id));
  const map = new Map<string, typeof recordAnalyses.$inferSelect>();
  for (const a of all) {
    if (!realRuns.has(a.runId)) continue;
    const prev = map.get(a.evidenceId);
    // Prefer the most recent valid analysis; otherwise the most recent attempt.
    if (!prev || (a.validationStatus === 'valid' && prev.validationStatus !== 'valid') || (a.validationStatus === prev.validationStatus && a.createdAt > prev.createdAt)) {
      map.set(a.evidenceId, a);
    }
  }
  return map;
}

