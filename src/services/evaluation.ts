import { db, initializeDatabase } from '@/db';
import {
  goldenLabels,
  evaluationRuns,
  evaluationItems,
  recordAnalyses,
  evidenceRecords,
  themes,
  analysisRuns,
} from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import crypto from 'crypto';
import { isGenuineResearchEvidence, isSyntheticFixture } from '@/lib/evidenceEligibility';

export type SpecialLabel = 'standard' | 'insufficient_evidence' | 'ambiguous';

export interface AddGoldenLabelInput {
  evidenceId: string;
  themeId?: string | null;
  themeName?: string | null;
  specialLabel?: SpecialLabel;
  journeyStage: string;
  observedBehaviour?: string;
  labeller: string;
  rationale: string;
  labelledBlind?: boolean;
}

export interface ThemeMetric {
  themeName: string;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  support: number;
  precision: number | null; // null if precision undefined (0 denominator)
  recall: number | null;
  f1: number | null;
  statisticallyMeaningful: boolean; // true if support >= 3
}

export interface ConfusionMatrixCell {
  actual: string;
  predicted: string;
  count: number;
}

type DiagnosticItem = {
  journeyStageComparable: boolean;
  journeyStageMatch: boolean;
  behaviorLabelAvailable: boolean;
  behaviorExtracted: boolean;
  groundedSpanMatches: number;
  groundedSpanTotal: number;
  inferenceClaims: number;
  unsupportedInferenceClaims: number;
  actualAbstain: boolean;
  predictedAbstain: boolean;
};

function summarizeDiagnosticItems(items: Array<{ notes?: string | null }>) {
  const diagnostics = items.flatMap((item) => {
    try {
      const value = item.notes ? JSON.parse(item.notes) as DiagnosticItem : null;
      return value && typeof value === 'object' ? [value] : [];
    } catch { return []; }
  });
  const stageItems = diagnostics.filter((item) => item.journeyStageComparable);
  const behaviorItems = diagnostics.filter((item) => item.behaviorLabelAvailable);
  const totalSpans = diagnostics.reduce((sum, item) => sum + item.groundedSpanTotal, 0);
  const matchedSpans = diagnostics.reduce((sum, item) => sum + item.groundedSpanMatches, 0);
  const inferenceClaims = diagnostics.reduce((sum, item) => sum + item.inferenceClaims, 0);
  const unsupportedInferenceClaims = diagnostics.reduce((sum, item) => sum + item.unsupportedInferenceClaims, 0);
  const abstentions = diagnostics.filter((item) => item.predictedAbstain);
  const abstentionTruePositives = abstentions.filter((item) => item.actualAbstain).length;
  const actualAbstentions = diagnostics.filter((item) => item.actualAbstain).length;
  return {
    journeyStageAgreement: { numerator: stageItems.filter((item) => item.journeyStageMatch).length, denominator: stageItems.length },
    behaviorExtractionCoverage: { numerator: behaviorItems.filter((item) => item.behaviorExtracted).length, denominator: behaviorItems.length },
    evidenceGroundingAccuracy: { numerator: matchedSpans, denominator: totalSpans },
    unsupportedInferenceRate: { numerator: unsupportedInferenceClaims, denominator: inferenceClaims },
    abstentionPrecision: { numerator: abstentionTruePositives, denominator: abstentions.length },
    abstentionRecall: { numerator: abstentionTruePositives, denominator: actualAbstentions },
    evaluationSampleSize: diagnostics.length,
  };
}

function normalizedContains(source: string, excerpt: string) {
  const normalize = (text: string) => text.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  return Boolean(excerpt && normalize(source).includes(normalize(excerpt)));
}

export class EvaluationService {
  /**
   * Records a human-verified golden label independently of AI output
   */
  static async addGoldenLabel(input: AddGoldenLabelInput) {
    await initializeDatabase();

    if (!input.rationale || !input.rationale.trim()) {
      throw new Error('A detailed justification is required for every golden-set ground-truth label.');
    }

    let themeId = input.themeId || null;
    if (!themeId && input.themeName && input.themeName.trim()) {
      const trimmedName = input.themeName.trim();
      const existingTheme = await db
        .select()
        .from(themes)
        .where(eq(themes.name, trimmedName))
        .limit(1);

      if (existingTheme.length > 0) {
        themeId = existingTheme[0].id;
      } else {
        const newThemeId = crypto.randomUUID();
        const slug = trimmedName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');

        await db.insert(themes).values({
          id: newThemeId,
          name: trimmedName,
          slug,
          description: `Discovered from blind ground truth: ${trimmedName}`,
          journeyStage: input.journeyStage,
          origin: 'human_created',
          status: 'accepted',
        });
        themeId = newThemeId;
      }
    }

    const labelId = crypto.randomUUID();

    // Upsert golden label
    const existing = await db
      .select()
      .from(goldenLabels)
      .where(eq(goldenLabels.evidenceId, input.evidenceId))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(goldenLabels)
        .set({
          themeId: themeId || null,
          specialLabel: input.specialLabel || 'standard',
          journeyStage: input.journeyStage,
          observedBehaviour: input.observedBehaviour || null,
          labeller: input.labeller,
          rationale: input.rationale,
          labelledBlind: input.labelledBlind !== undefined ? Boolean(input.labelledBlind) : true,
          labelledAt: new Date().toISOString(),
        })
        .where(eq(goldenLabels.evidenceId, input.evidenceId));

      return { labelId: existing[0].id, updated: true };
    }

    await db.insert(goldenLabels).values({
      id: labelId,
      evidenceId: input.evidenceId,
      themeId: themeId || null,
      specialLabel: input.specialLabel || 'standard',
      journeyStage: input.journeyStage,
      observedBehaviour: input.observedBehaviour || null,
      labeller: input.labeller,
      rationale: input.rationale,
      labelledBlind: input.labelledBlind !== undefined ? Boolean(input.labelledBlind) : true,
    });

    return { labelId, updated: false };
  }

  /**
   * Lists all registered golden set labels
   */
  static async listGoldenLabels() {
    await initializeDatabase();
    const rows = await db
      .select({
        id: goldenLabels.id,
        evidenceId: goldenLabels.evidenceId,
        themeId: goldenLabels.themeId,
        specialLabel: goldenLabels.specialLabel,
        journeyStage: goldenLabels.journeyStage,
        observedBehaviour: goldenLabels.observedBehaviour,
        labeller: goldenLabels.labeller,
        rationale: goldenLabels.rationale,
        labelledBlind: goldenLabels.labelledBlind,
        labelledAt: goldenLabels.labelledAt,
        evidenceText: evidenceRecords.originalText,
        sourceUrl: evidenceRecords.sourceUrl,
        platform: evidenceRecords.platform,
        entryMethod: evidenceRecords.entryMethod,
        isSynthetic: evidenceRecords.isSynthetic,
        verificationStatus: evidenceRecords.verificationStatus,
        duplicateOfId: evidenceRecords.duplicateOfId,
        fieldProvenance: evidenceRecords.fieldProvenance,
        sourceMetadata: evidenceRecords.sourceMetadata,
        themeName: themes.name,
      })
      .from(goldenLabels)
      .innerJoin(evidenceRecords, eq(goldenLabels.evidenceId, evidenceRecords.id))
      .leftJoin(themes, eq(goldenLabels.themeId, themes.id))
      .orderBy(desc(goldenLabels.labelledAt))
      .all();

    return rows.filter((row) => isGenuineResearchEvidence(row));
  }

  /**
   * Executes a formal evaluation run comparing an AI analysis run against the golden ground truth
   */
  static async evaluateAnalysisRun(analysisRunId: string) {
    await initializeDatabase();

    // 1. Fetch all golden labels
    const goldens = await this.listGoldenLabels();
    if (goldens.length === 0) {
      throw new Error('Cannot run evaluation: No golden-set labels have been registered yet.');
    }

    // 2. Fetch record analyses for this analysis run
    const analyses = await db
      .select()
      .from(recordAnalyses)
      .where(eq(recordAnalyses.runId, analysisRunId))
      .all();

    const analysisByEvidenceId = new Map(analyses.map((a) => [a.evidenceId, a]));

    const evalRunId = crypto.randomUUID();
    let exactMatches = 0;
    let evaluatedCount = 0;
    let abstentionMatches = 0;
    let totalAbstentionGoldens = 0;

    const evalItemsToInsert = [];
    const confusionMap = new Map<string, number>(); // "actual:::predicted" -> count
    const errorCategoryCounts: Record<string, number> = {
      wrong_theme: 0,
      missed_abstention: 0,
      unwarranted_abstention: 0,
      unsupported_context: 0,
      excerpt_mismatch: 0,
      inference_as_observation: 0,
      none: 0,
    };

    // Track per-theme TP, FP, FN
    const allThemeNames = new Set<string>();
    const tpMap = new Map<string, number>();
    const fpMap = new Map<string, number>();
    const fnMap = new Map<string, number>();
    const supportMap = new Map<string, number>();

    for (const golden of goldens) {
      const analysis = analysisByEvidenceId.get(golden.evidenceId);
      if (!analysis) continue; // Record was not part of this analysis run

      evaluatedCount++;
      const parsedAi = analysis.parsedOutput ? JSON.parse(analysis.parsedOutput) : null;

      // Determine predicted class
      let predictedClass = 'unclassified';
      if (parsedAi) {
        if (parsedAi.abstainReason) {
          predictedClass = 'abstention';
        } else if (parsedAi.theme?.name) {
          predictedClass = parsedAi.theme.name.trim();
        }
      }

      // Determine actual class
      let actualClass = golden.themeName ? golden.themeName.trim() : golden.specialLabel;
      if (golden.specialLabel === 'insufficient_evidence') {
        actualClass = 'abstention';
        totalAbstentionGoldens++;
      }

      allThemeNames.add(actualClass);
      allThemeNames.add(predictedClass);

      supportMap.set(actualClass, (supportMap.get(actualClass) || 0) + 1);

      // Check match
      const isMatch = actualClass.toLowerCase() === predictedClass.toLowerCase();

      // Classify error category
      let errorCategory:
        | 'none'
        | 'wrong_theme'
        | 'missed_abstention'
        | 'unwarranted_abstention'
        | 'unsupported_context'
        | 'excerpt_mismatch'
        | 'inference_as_observation' = 'none';

      if (isMatch) {
        exactMatches++;
        if (actualClass === 'abstention') {
          abstentionMatches++;
        }
        tpMap.set(actualClass, (tpMap.get(actualClass) || 0) + 1);
        errorCategoryCounts.none++;
      } else {
        // Classify the failure mode
        if (actualClass === 'abstention' && predictedClass !== 'abstention') {
          errorCategory = 'missed_abstention';
          errorCategoryCounts.missed_abstention++;
        } else if (actualClass !== 'abstention' && predictedClass === 'abstention') {
          errorCategory = 'unwarranted_abstention';
          errorCategoryCounts.unwarranted_abstention++;
        } else if (analysis.validationStatus === 'guard_failed') {
          if (analysis.validationErrors?.includes('Excerpt Mismatch')) {
            errorCategory = 'excerpt_mismatch';
            errorCategoryCounts.excerpt_mismatch++;
          } else {
            errorCategory = 'unsupported_context';
            errorCategoryCounts.unsupported_context++;
          }
        } else {
          errorCategory = 'wrong_theme';
          errorCategoryCounts.wrong_theme++;
        }

        fpMap.set(predictedClass, (fpMap.get(predictedClass) || 0) + 1);
        fnMap.set(actualClass, (fnMap.get(actualClass) || 0) + 1);
      }

      // Record confusion
      const pairKey = `${actualClass}:::${predictedClass}`;
      confusionMap.set(pairKey, (confusionMap.get(pairKey) || 0) + 1);

      const aiOutput = parsedAi && typeof parsedAi === 'object' ? parsedAi as Record<string, unknown> : {};
      const claims = Array.isArray(aiOutput.claims)
        ? aiOutput.claims.filter((claim): claim is Record<string, unknown> => Boolean(claim && typeof claim === 'object'))
        : [];
      const context = aiOutput.investorContext && typeof aiOutput.investorContext === 'object' ? aiOutput.investorContext as Record<string, unknown> : {};
      const friction = aiOutput.statedFriction && typeof aiOutput.statedFriction === 'object' ? aiOutput.statedFriction as Record<string, unknown> : {};
      const candidateSpans: string[] = [
        aiOutput.evidenceExcerpt,
        aiOutput.relevantTextSpan,
        context.supportingQuote,
        friction.supportingQuote,
        ...claims.map((claim) => claim.groundingExcerpt),
      ].filter((span): span is string => typeof span === 'string' && span.trim().length > 0);
      const inferenceClaims = claims.filter((claim) => claim.type === 'inference');
      const diagnosticItem: DiagnosticItem = {
        journeyStageComparable: Boolean(golden.journeyStage && typeof aiOutput.journeyStage === 'string'),
        journeyStageMatch: Boolean(golden.journeyStage && typeof aiOutput.journeyStage === 'string' && golden.journeyStage === aiOutput.journeyStage),
        behaviorLabelAvailable: Boolean(golden.observedBehaviour?.trim()),
        behaviorExtracted: Boolean(typeof aiOutput.observedBehaviour === 'string' && aiOutput.observedBehaviour.trim()),
        groundedSpanMatches: candidateSpans.filter((span) => normalizedContains(golden.evidenceText, span)).length,
        groundedSpanTotal: candidateSpans.length,
        inferenceClaims: inferenceClaims.length,
        unsupportedInferenceClaims: inferenceClaims.filter((claim) => !normalizedContains(golden.evidenceText, typeof claim.groundingExcerpt === 'string' ? claim.groundingExcerpt : '')).length,
        actualAbstain: actualClass === 'abstention',
        predictedAbstain: predictedClass === 'abstention',
      };

      evalItemsToInsert.push({
        id: crypto.randomUUID(),
        evaluationRunId: evalRunId,
        evidenceId: golden.evidenceId,
        goldenLabelId: golden.id,
        recordAnalysisId: analysis.id,
        predictedTheme: predictedClass,
        actualTheme: actualClass,
        isMatch: Boolean(isMatch),
        errorCategory,
        notes: JSON.stringify(diagnosticItem),
      });
    }

    if (evaluatedCount === 0) {
      throw new Error('None of the golden set records were analyzed in this run.');
    }

    const accuracy = exactMatches / evaluatedCount;
    const diagnostics = summarizeDiagnosticItems(evalItemsToInsert);
    const abstentionAccuracy =
      totalAbstentionGoldens > 0 ? abstentionMatches / totalAbstentionGoldens : null;

    // Calculate per-theme metrics
    const themeMetrics: ThemeMetric[] = [];
    for (const themeName of allThemeNames) {
      const tp = tpMap.get(themeName) || 0;
      const fp = fpMap.get(themeName) || 0;
      const fn = fnMap.get(themeName) || 0;
      const support = supportMap.get(themeName) || 0;

      const precision = tp + fp > 0 ? tp / (tp + fp) : null;
      const recall = tp + fn > 0 ? tp / (tp + fn) : null;
      const f1 =
        precision !== null && recall !== null && precision + recall > 0
          ? (2 * (precision * recall)) / (precision + recall)
          : null;

      themeMetrics.push({
        themeName,
        truePositives: tp,
        falsePositives: fp,
        falseNegatives: fn,
        support,
        precision,
        recall,
        f1,
        statisticallyMeaningful: support >= 3,
      });
    }

    // Build confusion matrix array
    const confusionMatrix: ConfusionMatrixCell[] = [];
    for (const [key, count] of confusionMap.entries()) {
      const [actual, predicted] = key.split(':::');
      confusionMatrix.push({ actual, predicted, count });
    }

    // Fetch run metadata to separate real AI models from simulated test doubles
    const runRecords = await db
      .select()
      .from(analysisRuns)
      .where(eq(analysisRuns.id, analysisRunId))
      .limit(1);

    const runInfo = runRecords.length > 0 ? runRecords[0] : null;
    const provider = runInfo?.provider || 'unknown';
    const model = runInfo?.model || 'unknown';
    const modelVersion = runInfo?.modelVersion || 'unknown';
    const isSimulated = provider === 'fake';
    const missingGoldens = Math.max(0, goldens.length - evaluatedCount);
    const isIncomplete = missingGoldens > 0;
    const missingDetails = isIncomplete
      ? `${missingGoldens} golden records were not analyzed in this run (${evaluatedCount}/${goldens.length} evaluated)`
      : null;

    // Save evaluation run
    await db.insert(evaluationRuns).values({
      id: evalRunId,
      analysisRunId,
      provider,
      model,
      modelVersion,
      isSimulated,
      isIncomplete,
      missingDetails,
      totalGoldenRecords: evaluatedCount,
      exactMatches,
      accuracy,
      metricsByTheme: JSON.stringify(themeMetrics),
      confusionMatrix: JSON.stringify(confusionMatrix),
      abstentionAccuracy,
      commonErrorCategories: JSON.stringify(errorCategoryCounts),
      smallSampleWarning: evaluatedCount < 50,
    });

    // Save evaluation items
    for (const item of evalItemsToInsert) {
      await db.insert(evaluationItems).values(item);
    }

    return {
      evalRunId,
      analysisRunId,
      provider,
      model,
      modelVersion,
      isSimulated,
      isIncomplete,
      missingDetails,
      totalGoldenRecords: evaluatedCount,
      exactMatches,
      accuracy,
      themeMetrics,
      confusionMatrix,
      abstentionAccuracy,
      errorCategoryCounts,
      diagnostics,
      smallSampleWarning: evaluatedCount < 50,
      warningMessage: isSimulated
        ? 'SIMULATED TEST BENCHMARK: Evaluated using FakeAIProvider rule engine. This measures deterministic unit test assertion coverage, NOT real-world Gemini AI model accuracy.'
        : 'Empirical model accuracy evaluated against blind human-curated golden benchmark set.',
    };
  }

  /**
   * Retrieves the latest evaluation run result
   */
  static async getLatestEvaluation() {
    await initializeDatabase();
    const runs = await db
      .select()
      .from(evaluationRuns)
      .orderBy(desc(evaluationRuns.evaluatedAt))
      .limit(1);

    if (runs.length === 0) return null;
    const run = runs[0];

    // Fallback if provider was not recorded in legacy rows
    let provider = run.provider;
    let model = run.model;
    let modelVersion = run.modelVersion;
    let isSimulated = Boolean(run.isSimulated);

    if (!provider) {
      const parentRun = await db
        .select()
        .from(analysisRuns)
        .where(eq(analysisRuns.id, run.analysisRunId))
        .limit(1);
      if (parentRun.length > 0) {
        provider = parentRun[0].provider;
        model = parentRun[0].model;
        modelVersion = parentRun[0].modelVersion;
        isSimulated = provider === 'fake';
      }
    }

    const items = await db
      .select({
        id: evaluationItems.id,
        evidenceId: evaluationItems.evidenceId,
        predictedTheme: evaluationItems.predictedTheme,
        actualTheme: evaluationItems.actualTheme,
        isMatch: evaluationItems.isMatch,
        errorCategory: evaluationItems.errorCategory,
        notes: evaluationItems.notes,
        evidenceText: evidenceRecords.originalText,
        sourceUrl: evidenceRecords.sourceUrl,
        platform: evidenceRecords.platform,
        entryMethod: evidenceRecords.entryMethod,
        isSynthetic: evidenceRecords.isSynthetic,
        verificationStatus: evidenceRecords.verificationStatus,
        duplicateOfId: evidenceRecords.duplicateOfId,
        fieldProvenance: evidenceRecords.fieldProvenance,
        sourceMetadata: evidenceRecords.sourceMetadata,
      })
      .from(evaluationItems)
      .innerJoin(evidenceRecords, eq(evaluationItems.evidenceId, evidenceRecords.id))
      .where(eq(evaluationItems.evaluationRunId, run.id))
      .all();

    const genuineSampleSize = items.filter((item) => isGenuineResearchEvidence(item)).length;
    const illustrativeSampleSize = items.filter((item) => isSyntheticFixture(item)).length;
    return {
      ...run,
      provider: provider || 'unknown',
      model: model || 'unknown',
      modelVersion: modelVersion || 'unknown',
      isSimulated,
      isIncomplete: Boolean(run.isIncomplete),
      missingDetails: run.missingDetails || null,
      metricsByTheme: JSON.parse(run.metricsByTheme) as ThemeMetric[],
      confusionMatrix: JSON.parse(run.confusionMatrix) as ConfusionMatrixCell[],
      commonErrorCategories: JSON.parse(run.commonErrorCategories) as Record<string, number>,
      items,
      genuineSampleSize,
      illustrativeSampleSize,
      otherSampleSize: Math.max(0, items.length - genuineSampleSize - illustrativeSampleSize),
      diagnostics: summarizeDiagnosticItems(items),
    };
  }
}

