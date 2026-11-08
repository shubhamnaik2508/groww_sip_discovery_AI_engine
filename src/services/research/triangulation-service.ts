import { db } from '@/db';
import { evidenceRecords, surveyTextAnalyses, aiSyntheses, validationReviews, analysisRuns } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';
import { classifyEvidenceProvenance } from '@/lib/evidenceEligibility';
import {
  computeTriangulation,
  codedFromParsed,
  PublicCodedRecord,
  PublicDatasetSummary,
  SurveyOpenTextCoding,
  TriangulationResult,
} from '@/lib/research/triangulation';
import { ensureResearchData, latestAnalysisByEvidence, loadActiveSurvey, StoredSurvey } from './datasets';

const PRIMARY_PLATFORMS = new Set(['google_forms', 'user_interview']);

export interface PublicRecordView {
  id: string;
  platform: string;
  sourceUrl: string;
  title: string | null;
  originalText: string;
  publishedAt: string | null;
  collectedAt: string;
  collectionMethod: string | null;
  provenance: string;
  eligible: boolean;
  exclusionReason: string | null;
  analysis: null | {
    id: string;
    runId: string;
    status: string;
    errors: string[];
    model: string;
    analysedAt: string;
    parsed: Record<string, unknown> | null;
    coded: ReturnType<typeof codedFromParsed>;
  };
}

export interface ResearchState {
  survey: StoredSurvey | null;
  surveyOpenText: SurveyOpenTextCoding[];
  publicRecords: PublicRecordView[];
  triangulation: TriangulationResult;
  synthesis: typeof aiSyntheses.$inferSelect | null;
  validation: { reviews: Array<typeof validationReviews.$inferSelect> };
  runs: Array<typeof analysisRuns.$inferSelect>;
}

function meta(json: string | null): Record<string, unknown> {
  try {
    return json ? JSON.parse(json) : {};
  } catch {
    return {};
  }
}

export async function loadResearchState(): Promise<ResearchState> {
  await ensureResearchData();
  const [survey, records, latest, stRows, synths, reviews, runs] = await Promise.all([
    loadActiveSurvey(),
    db.select().from(evidenceRecords).all(),
    latestAnalysisByEvidence(),
    db.select().from(surveyTextAnalyses).all(),
    db.select().from(aiSyntheses).where(eq(aiSyntheses.kind, 'triangulation')).orderBy(desc(aiSyntheses.createdAt)).all(),
    db.select().from(validationReviews).orderBy(desc(validationReviews.createdAt)).all(),
    db.select().from(analysisRuns).orderBy(desc(analysisRuns.startedAt)).all(),
  ]);
  const runModel = new Map(runs.map((r) => [r.id, r.model]));

  const publicRecords: PublicRecordView[] = records
    .filter((r) => !PRIMARY_PLATFORMS.has(r.platform))
    .map((r) => {
      const m = meta(r.sourceMetadata);
      const provenance = classifyEvidenceProvenance(r);
      const eligible = provenance === 'verified_public';
      const exclusionReason = eligible
        ? null
        : provenance === 'duplicate_ineligible'
          ? 'Duplicate of another record'
          : provenance === 'synthetic_fixture' || provenance === 'curated_benchmark'
            ? 'Synthetic / benchmark fixture (kept separate)'
            : 'Source content not verified';
      const a = latest.get(r.id);
      const parsed = a?.parsedOutput ? (JSON.parse(a.parsedOutput) as Record<string, unknown>) : null;
      return {
        id: r.id,
        platform: r.platform,
        sourceUrl: r.sourceUrl,
        title: (m.title as string) ?? null,
        originalText: r.originalText,
        publishedAt: (m.publishedAt as string) ?? null,
        collectedAt: r.collectedAt,
        collectionMethod: (m.collectionMethod as string) ?? r.verifiedBy ?? null,
        provenance,
        eligible,
        exclusionReason,
        analysis: a
          ? {
              id: a.id,
              runId: a.runId,
              status: a.validationStatus,
              errors: a.validationErrors ? (JSON.parse(a.validationErrors) as string[]) : [],
              model: runModel.get(a.runId) ?? 'unknown',
              analysedAt: a.createdAt,
              parsed,
              coded: codedFromParsed(parsed),
            }
          : null,
      };
    });

  const eligible = publicRecords.filter((r) => r.eligible);
  const valid = eligible.filter((r) => r.analysis?.status === 'valid');
  const platforms: Record<string, number> = {};
  for (const r of eligible) platforms[r.platform] = (platforms[r.platform] ?? 0) + 1;

  const publicSummary: PublicDatasetSummary = {
    totalRecords: publicRecords.length,
    eligibleRecords: eligible.length,
    excludedRecords: publicRecords.filter((r) => !r.eligible).map((r) => ({ evidenceId: r.id, reason: r.exclusionReason ?? '' })),
    analysedValid: valid.length,
    analysedFailed: eligible.filter((r) => r.analysis && r.analysis.status !== 'valid').length,
    notAnalysed: eligible.filter((r) => !r.analysis).length,
    firstPersonValid: valid.filter((r) => r.analysis!.coded.firstPerson).length,
    platforms,
    models: [...new Set(valid.map((r) => r.analysis!.model))],
  };

  const coded: PublicCodedRecord[] = valid.map((r) => ({
    evidenceId: r.id,
    recordAnalysisId: r.analysis!.id,
    platform: r.platform,
    sourceUrl: r.sourceUrl,
    title: r.title,
    originalText: r.originalText,
    publishedAt: r.publishedAt,
    firstPerson: r.analysis!.coded.firstPerson,
    codes: r.analysis!.coded.codes,
    signals: r.analysis!.coded.signals,
    themeName: r.analysis!.coded.themeName,
    model: r.analysis!.model,
    analysedAt: r.analysis!.analysedAt,
  }));

  // Latest valid coding per open-ended survey answer for the active dataset.
  const surveyOpenText: SurveyOpenTextCoding[] = [];
  if (survey) {
    const latestByKey = new Map<string, (typeof stRows)[number]>();
    for (const s of stRows.filter((x) => x.datasetId === survey.datasetId && x.validationStatus === 'valid')) {
      const key = `${s.respondentCode}|${s.questionId}`;
      const prev = latestByKey.get(key);
      if (!prev || s.createdAt > prev.createdAt) latestByKey.set(key, s);
    }
    for (const s of latestByKey.values()) {
      const c = codedFromParsed(s.parsedOutput ? JSON.parse(s.parsedOutput) : null);
      surveyOpenText.push({ respondentCode: s.respondentCode, questionId: s.questionId, text: s.text, codes: c.codes, model: s.model });
    }
  }

  const triangulation = computeTriangulation({ survey: survey?.survey ?? null, surveyOpenText, publicRecords: coded, publicSummary });

  return {
    survey,
    surveyOpenText,
    publicRecords,
    triangulation,
    synthesis: synths.find((s) => s.validationStatus === 'valid') ?? synths[0] ?? null,
    validation: { reviews },
    runs: runs.filter((r) => r.provider !== 'fake'),
  };
}
