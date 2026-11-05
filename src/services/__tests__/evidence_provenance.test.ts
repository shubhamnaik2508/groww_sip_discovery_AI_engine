import { describe, it, expect, beforeAll } from 'vitest';
import { initializeDatabase, db } from '@/db';
import { clearAllTables } from '@/db/test-utils';
import { EvidenceService } from '../evidence';
import { OpportunityService } from '../opportunity';
import { evidenceRecords, evidenceEdits, themes, evidenceThemeLinks } from '@/db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

describe('Evidence Provenance & Opportunity Deduplication', () => {
  beforeAll(async () => {
    await initializeDatabase();
    await clearAllTables();
  });

  it('labels user-entered URLs as user_entered rather than automatically verified', async () => {
    const record = await EvidenceService.createManualRecord({
      sourceUrl: 'https://play.google.com/store/apps/details?id=com.nextleap.groww&reviewId=user_submitted_1',
      platform: 'play_store',
      collectedAt: '2026-06-20',
      originalText: 'Units took 7 days to reflect in my portfolio after first monthly installment.',
      journeyStage: 'first_instalment',
      entryMethod: 'manual',
      isSynthetic: false,
    });

    const stored = await db
      .select()
      .from(evidenceRecords)
      .where(eq(evidenceRecords.id, record.id));

    expect(stored.length).toBe(1);
    expect(stored[0].verificationStatus).toBe('user_entered');
    expect(stored[0].verifiedAt).toBeNull();
    expect(stored[0].verifiedBy).toBeNull();
  });

  it('updates verification status and logs audit entry when source is verified', async () => {
    const record = await EvidenceService.createManualRecord({
      sourceUrl: 'https://reddit.com/r/IndiaInvestments/comments/verified_post',
      platform: 'reddit',
      collectedAt: '2026-06-21',
      originalText: 'Direct plan switch was confusing for beginner.',
      journeyStage: 'discovery_intent',
      entryMethod: 'manual',
      isSynthetic: false,
    });

    // Verify record
    await EvidenceService.verifyEvidenceRecord(
      record.id,
      'content_verified',
      'Auditor PM',
      'Confirmed live Reddit post and verbatim quote match.'
    );

    const updated = await db
      .select()
      .from(evidenceRecords)
      .where(eq(evidenceRecords.id, record.id));

    expect(updated[0].verificationStatus).toBe('content_verified');
    expect(updated[0].verifiedBy).toBe('Auditor PM');
    expect(updated[0].verifiedAt).not.toBeNull();

    // Check audit trail
    const auditEntries = await db
      .select()
      .from(evidenceEdits)
      .where(eq(evidenceEdits.evidenceId, record.id));

    expect(auditEntries.length).toBe(1);
    expect(auditEntries[0].fieldName).toBe('verification_status');
    expect(auditEntries[0].newValue).toBe('content_verified');
    expect(auditEntries[0].editedBy).toBe('Auditor PM');
  });

  it('ensures duplicate records do NOT inflate independent record count in opportunity scoring', async () => {
    // Create a theme
    const themeId = crypto.randomUUID();
    await db.insert(themes).values({
      id: themeId,
      name: 'Allotment Delay Anxiety',
      slug: 'allotment-delay-anxiety',
      description: 'Anxiety caused by NAV allotment delay',
      journeyStage: 'first_instalment',
    });

    // Ingest canonical record
    const r1 = await EvidenceService.createManualRecord({
      sourceUrl: 'https://play.google.com/review_unique_1',
      platform: 'play_store',
      collectedAt: '2026-06-01',
      originalText: 'My first SIP debit occurred on Friday but units were not shown until Wednesday.',
      journeyStage: 'first_instalment',
      entryMethod: 'manual',
      isSynthetic: false,
      verificationStatus: 'content_verified',
    });

    // Ingest duplicate record (identical text)
    const r2 = await EvidenceService.createManualRecord({
      sourceUrl: 'https://play.google.com/review_duplicate_2',
      platform: 'play_store',
      collectedAt: '2026-06-02',
      originalText: 'My first SIP debit occurred on Friday but units were not shown until Wednesday.',
      journeyStage: 'first_instalment',
      entryMethod: 'manual',
      isSynthetic: false,
      verificationStatus: 'content_verified',
    });

    // Ingest another distinct record
    const r3 = await EvidenceService.createManualRecord({
      sourceUrl: 'https://reddit.com/r/IndiaInvestments/comments/unique_distinct',
      platform: 'reddit',
      collectedAt: '2026-06-03',
      originalText: 'Completely different feedback about KYC document rejection.',
      journeyStage: 'first_instalment',
      entryMethod: 'manual',
      isSynthetic: false,
      verificationStatus: 'content_verified',
    });

    // Link all 3 records to the theme
    for (const rec of [r1, r2, r3]) {
      await db.insert(evidenceThemeLinks).values({
        id: crypto.randomUUID(),
        evidenceId: rec.id,
        themeId,
      });
    }

    // Create an opportunity grounded in this theme
    const { opportunityId } = await OpportunityService.createOpportunity({
      title: 'Real-time NAV Allotment Clarity',
      problemStatement: 'First-time investors panic when funds debit but units do not display immediately.',
      hypothesisOnRetention: 'Providing pending NAV status will prevent panic cancellations in month 1.',
      themeIds: [themeId],
    });

    // Recalculate score
    const scoreResult = await OpportunityService.recalculateOpportunityScore(opportunityId);

    // Total linked records = 3 (r1, r2 duplicate, r3)
    // Independent records must strictly equal 2!
    expect(scoreResult).not.toBeNull();
    expect(scoreResult?.independentRecordCount).toBe(2);
  });
});
