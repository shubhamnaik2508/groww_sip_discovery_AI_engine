import { db, initializeDatabase } from '@/db';
import { reviews, recordAnalyses, evidenceRecords, failureCases, themes, evidenceThemeLinks } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import crypto from 'crypto';
import { isGenuineResearchEvidence } from '@/lib/evidenceEligibility';

export type ReviewDecision = 'confirmed' | 'corrected' | 'rejected';

export interface SubmitReviewInput {
  recordAnalysisId: string;
  evidenceId: string;
  decision: ReviewDecision;
  rationale: string;
  reviewer: string;
  revisedOutput?: {
    themeName?: string;
    journeyStage?: string;
    observedBehaviour?: string;
    investorContext?: string | null;
    statedFriction?: string | null;
    sipContinuationHypothesis?: string | null;
  } | null;
  // If corrected or rejected, optionally record a failure case
  failureCaseDetails?: {
    failureType: 'hallucinated_context' | 'unwarranted_causal_leap' | 'theme_misclassification' | 'missed_sarcasm' | 'overconfidence_on_vague_text' | 'excerpt_mismatch';
    lessonLearned: string;
    preventionStrategy: string;
  };
}

export class ReviewService {
  /**
   * Submits an append-only human review decision.
   * GUARANTEE: Never alters or overwrites the original record_analyses row.
   */
  static async submitReview(input: SubmitReviewInput) {
    await initializeDatabase();

    if (!input.rationale || !input.rationale.trim()) {
      throw new Error('A detailed rationale is required for all human review decisions.');
    }

    if (input.decision === 'corrected' && !input.revisedOutput) {
      throw new Error('Revised classification output must be provided when decision is "corrected".');
    }

    // 1. Fetch the target analysis to create version snapshot
    const targetAnalysis = await db
      .select()
      .from(recordAnalyses)
      .where(eq(recordAnalyses.id, input.recordAnalysisId))
      .limit(1);

    if (targetAnalysis.length === 0) {
      throw new Error(`Record analysis ${input.recordAnalysisId} not found.`);
    }

    const reviewId = crypto.randomUUID();
    const versionSnapshot = JSON.stringify({
      runId: targetAnalysis[0].runId,
      rawOutput: targetAnalysis[0].rawOutput,
      parsedOutput: targetAnalysis[0].parsedOutput ? JSON.parse(targetAnalysis[0].parsedOutput) : null,
      validationStatus: targetAnalysis[0].validationStatus,
    });

    // 2. Insert append-only review row
    await db.insert(reviews).values({
      id: reviewId,
      recordAnalysisId: input.recordAnalysisId,
      evidenceId: input.evidenceId,
      decision: input.decision,
      revisedOutput: input.revisedOutput ? JSON.stringify(input.revisedOutput) : null,
      rationale: input.rationale.trim(),
      reviewer: input.reviewer.trim() || 'Fellowship Reviewer',
      analysisVersionSnapshot: versionSnapshot,
    });

    // 3. If corrected and a revised theme is specified, update theme link
    if (input.decision === 'corrected' && input.revisedOutput?.themeName) {
      const revisedThemeName = input.revisedOutput.themeName.trim();
      const slug = revisedThemeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      const themeRecord = await db.select().from(themes).where(eq(themes.slug, slug)).limit(1);
      let themeId: string;

      if (themeRecord.length === 0) {
        themeId = crypto.randomUUID();
        await db.insert(themes).values({
          id: themeId,
          name: revisedThemeName,
          slug,
          description: `Created via human reviewer correction`,
          journeyStage: input.revisedOutput.journeyStage || 'unclear',
          origin: 'human_created',
          status: 'accepted',
        });
      } else {
        themeId = themeRecord[0].id;
      }

      // Add human review link
      await db.insert(evidenceThemeLinks).values({
        id: crypto.randomUUID(),
        evidenceId: input.evidenceId,
        themeId,
        role: 'supports',
        source: 'human_review',
        recordAnalysisId: input.recordAnalysisId,
        reviewId,
        notes: `Corrected by ${input.reviewer}: ${input.rationale}`,
      });
    }

    // 4. If a failure case was supplied (or decision was rejected/corrected with lesson), persist in failure_cases
    if (input.failureCaseDetails) {
      await db.insert(failureCases).values({
        id: crypto.randomUUID(),
        reviewId,
        evidenceId: input.evidenceId,
        failureType: input.failureCaseDetails.failureType,
        originalPrediction: targetAnalysis[0].parsedOutput || targetAnalysis[0].rawOutput,
        correctedOutput: input.revisedOutput ? JSON.stringify(input.revisedOutput) : 'REJECTED - INVALID PREDICTION',
        reviewerRationale: input.rationale,
        lessonLearned: input.failureCaseDetails.lessonLearned,
        preventionStrategy: input.failureCaseDetails.preventionStrategy,
      });
    }

    return { reviewId, decision: input.decision };
  }

  /**
   * Lists all documented failure cases with original prediction vs correction and lessons learned
   */
  static async listFailureCases() {
    await initializeDatabase();
    const cases = await db
      .select({
        id: failureCases.id,
        reviewId: failureCases.reviewId,
        evidenceId: failureCases.evidenceId,
        failureType: failureCases.failureType,
        originalPrediction: failureCases.originalPrediction,
        correctedOutput: failureCases.correctedOutput,
        reviewerRationale: failureCases.reviewerRationale,
        lessonLearned: failureCases.lessonLearned,
        preventionStrategy: failureCases.preventionStrategy,
        createdAt: failureCases.createdAt,
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
      .from(failureCases)
      .innerJoin(evidenceRecords, eq(failureCases.evidenceId, evidenceRecords.id))
      .orderBy(desc(failureCases.createdAt))
      .all();

    return cases.filter((c) => isGenuineResearchEvidence(c)).map((c) => ({
      ...c,
      originalPrediction: typeof c.originalPrediction === 'string' && c.originalPrediction.startsWith('{')
        ? JSON.parse(c.originalPrediction)
        : c.originalPrediction,
      correctedOutput: typeof c.correctedOutput === 'string' && c.correctedOutput.startsWith('{')
        ? JSON.parse(c.correctedOutput)
        : c.correctedOutput,
    }));
  }

  /**
   * Retrieves review statistics for the Intelligence Overview & Reliability views
   */
  static async getReviewStats() {
    await initializeDatabase();
    const [storedReviews, allRecords] = await Promise.all([
      db.select().from(reviews).all(),
      db.select().from(evidenceRecords).all(),
    ]);
    const eligibleIds = new Set(allRecords.filter(isGenuineResearchEvidence).map((record) => record.id));
    const allReviews = storedReviews.filter((review) => eligibleIds.has(review.evidenceId));
    const confirmed = allReviews.filter((r) => r.decision === 'confirmed').length;
    const corrected = allReviews.filter((r) => r.decision === 'corrected').length;
    const rejected = allReviews.filter((r) => r.decision === 'rejected').length;

    const failureCaseCount = (await this.listFailureCases()).length;

    return {
      totalReviewed: allReviews.length,
      confirmed,
      corrected,
      rejected,
      agreementRate: allReviews.length > 0 ? (confirmed / allReviews.length) : 0,
      documentedFailureCases: failureCaseCount,
      meetsFailureCaseRequirement: failureCaseCount >= 3,
    };
  }
}

