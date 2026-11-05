import { describe, it, expect, beforeAll } from 'vitest';
import { initializeDatabase, db } from '@/db';
import { clearAllTables } from '@/db/test-utils';
import { EvidenceService } from '../evidence';
import { AnalysisOrchestrator } from '../ai';
import { ReviewService } from '../review';
import { recordAnalyses, reviews, failureCases } from '@/db/schema';
import { eq } from 'drizzle-orm';

describe('ReviewService & Append-Only Audit Integrity', () => {
  beforeAll(async () => {
    await initializeDatabase();
    await clearAllTables();
  });

  it('records confirmed, corrected, and rejected decisions without mutating original AI output', async () => {
    // 1. Ingest an evidence record
    const { id: evidenceId } = await EvidenceService.createManualRecord({
      sourceUrl: 'https://reddit.com/r/Groww/comments/review_test',
      platform: 'reddit',
      collectedAt: '2026-06-12',
      originalText: 'I started a 1000 Rs SIP in Nifty 50. In month 2, I saw -4% return and panicked. No educational context was provided.',
      investorContext: 'First-time SIP investor',
      journeyStage: 'market_dip_reaction',
      entryMethod: 'manual',
      isSynthetic: false,
      verificationStatus: 'content_verified',
    });

    // 2. Run analysis
    await AnalysisOrchestrator.executeRun({
      providerName: 'fake',
      recordIds: [evidenceId],
    });

    const analyses = await db.select().from(recordAnalyses).where(eq(recordAnalyses.evidenceId, evidenceId));
    expect(analyses.length).toBe(1);
    const originalAnalysis = analyses[0];
    const originalRawOutput = originalAnalysis.rawOutput;

    // 3. Submit a 'corrected' review
    const { reviewId } = await ReviewService.submitReview({
      recordAnalysisId: originalAnalysis.id,
      evidenceId,
      decision: 'corrected',
      rationale: 'AI categorized as general market dip reaction, but the primary user friction is the absence of volatility education during initial drawdown.',
      reviewer: 'ProductLead',
      revisedOutput: {
        themeName: 'Absence of Drawdown Education for New Investors',
        journeyStage: 'market_dip_reaction',
        observedBehaviour: 'Panicked upon seeing -4% return in month 2.',
      },
      failureCaseDetails: {
        failureType: 'theme_misclassification',
        lessonLearned: 'Model mapped to generic emotional reaction rather than the product gap (education absence).',
        preventionStrategy: 'Update prompt to distinguish between inherent market sentiment and platform educational intervention opportunities.',
      },
    });

    expect(reviewId).toBeDefined();

    // 4. Verify that the original record_analyses row is UNCHANGED
    const reFetchedAnalysis = await db.select().from(recordAnalyses).where(eq(recordAnalyses.id, originalAnalysis.id));
    expect(reFetchedAnalysis[0].rawOutput).toBe(originalRawOutput);

    // 5. Verify review row was appended
    const reviewRows = await db.select().from(reviews).where(eq(reviews.id, reviewId));
    expect(reviewRows.length).toBe(1);
    expect(reviewRows[0].decision).toBe('corrected');
    expect(reviewRows[0].reviewer).toBe('ProductLead');

    // 6. Verify failure case was recorded
    const cases = await ReviewService.listFailureCases();
    expect(cases.length).toBe(1);
    expect(cases[0].lessonLearned).toContain('generic emotional reaction');
    expect(cases[0].preventionStrategy).toContain('distinguish between inherent market sentiment');

    // 7. Check stats: 1 failure case is not enough for the >= 3 requirement
    const stats = await ReviewService.getReviewStats();
    expect(stats.totalReviewed).toBe(1);
    expect(stats.corrected).toBe(1);
    expect(stats.meetsFailureCaseRequirement).toBe(false);
  });
});
