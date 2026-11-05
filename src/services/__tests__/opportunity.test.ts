import { describe, it, expect, beforeAll } from 'vitest';
import { initializeDatabase, db } from '@/db';
import { clearAllTables } from '@/db/test-utils';
import { EvidenceService } from '../evidence';
import { OpportunityService, DEFAULT_OPPORTUNITY_WEIGHTS } from '../opportunity';
import { themes, evidenceThemeLinks } from '@/db/schema';
import crypto from 'crypto';

describe('Opportunity Scoring & Transparent Prioritization', () => {
  beforeAll(async () => {
    await initializeDatabase();
    await clearAllTables();
  });

  it('calculates component scores and collapses duplicate records', async () => {
    // 1. Create a theme
    const themeId = crypto.randomUUID();
    await db.insert(themes).values({
      id: themeId,
      name: 'Silent Mandate Failure & Penalty Panic',
      slug: 'silent-mandate-failure-penalty',
      description: 'Bank penalties and silent rejection of autopay mandates',
      journeyStage: 'autopay_failure_recovery',
    });

    // 2. Ingest 3 records: 2 distinct texts and 1 exact duplicate
    const r1 = await EvidenceService.createManualRecord({
      sourceUrl: 'https://play.google.com/review-opp-1',
      platform: 'play_store',
      collectedAt: '2026-06-01',
      originalText: 'Autopay failed silently without any SMS alert. Bank charged 500 Rs penalty.',
      journeyStage: 'autopay_failure_recovery',
      entryMethod: 'manual',
      isSynthetic: false,
      verificationStatus: 'content_verified',
    });

    const r2 = await EvidenceService.createManualRecord({
      sourceUrl: 'https://reddit.com/r/Groww/comments/opp2',
      platform: 'reddit',
      collectedAt: '2026-06-02',
      originalText: 'Why does Groww not notify me 24 hours before debit so I can maintain balance?',
      journeyStage: 'autopay_failure_recovery',
      entryMethod: 'manual',
      isSynthetic: false,
      verificationStatus: 'content_verified',
    });

    // Exact duplicate of r1
    const r3 = await EvidenceService.createManualRecord({
      sourceUrl: 'https://play.google.com/review-opp-dup',
      platform: 'play_store',
      collectedAt: '2026-06-03',
      originalText: 'Autopay failed silently without any SMS alert. Bank charged 500 Rs penalty.',
      journeyStage: 'autopay_failure_recovery',
      entryMethod: 'manual',
      isSynthetic: false,
      verificationStatus: 'content_verified',
    });

    const fixture = await EvidenceService.createManualRecord({
      sourceUrl: 'https://example.invalid/synthetic-fixture',
      platform: 'youtube',
      collectedAt: '2026-06-04',
      originalText: 'Synthetic fixture describing a fictional SIP payment experience.',
      journeyStage: 'autopay_failure_recovery',
      entryMethod: 'fixture',
      isSynthetic: true,
      verificationStatus: 'synthetic_fixture',
    });

    // Link all 3 records to the theme
    await db.insert(evidenceThemeLinks).values([
      { id: crypto.randomUUID(), evidenceId: r1.id, themeId, role: 'supports', source: 'ai' },
      { id: crypto.randomUUID(), evidenceId: r2.id, themeId, role: 'supports', source: 'ai' },
      { id: crypto.randomUUID(), evidenceId: r3.id, themeId, role: 'supports', source: 'ai' },
      { id: crypto.randomUUID(), evidenceId: fixture.id, themeId, role: 'supports', source: 'ai' },
    ]);

    // 3. Create candidate opportunity
    const { opportunityId } = await OpportunityService.createOpportunity({
      title: 'Pre-Debit Balance Notification & Mandate Recovery Gap',
      problemStatement: 'First-time investors encounter unexpected bank overdraft penalties because autopay mandates debit without sufficient prior warning or recovery guidance.',
      hypothesisOnRetention: 'Providing proactive pre-debit alerts and instant zero-penalty retry mechanisms will reduce month-2 to month-4 silent drop-offs caused by autopay failure panic.',
      themeIds: [themeId],
      humanScores: {
        userImpact: {
          score: 4.5,
          rationale: 'Severe financial distress from unexpected bank penalty leads to immediate trust loss.',
          scoredBy: 'PM Fellow',
        },
        businessMetricLink: {
          score: 4.8,
          rationale: 'Failed mandate directly terminates the 12-month active SIP cycle on day 30.',
          scoredBy: 'PM Fellow',
        },
        researchUncertainty: {
          score: 2.0,
          rationale: 'Well documented across multiple Play Store reviews and Reddit threads.',
          scoredBy: 'PM Fellow',
        },
        potentialFeasibility: {
          score: 4.0,
          rationale: 'WhatsApp and push notifications 48h prior to debit are standard across Indian fintech.',
          scoredBy: 'PM Fellow',
        },
      },
    });

    // 4. Recalculate score
    const result = await OpportunityService.recalculateOpportunityScore(
      opportunityId,
      DEFAULT_OPPORTUNITY_WEIGHTS
    );

    expect(result).not.toBeNull();
    // Verify duplicate was COLLAPSED: exactly 2 independent records, not 3!
    expect(result?.independentRecordCount).toBe(2);
    expect(result?.syntheticFixtureCount).toBe(1);
    // Source diversity: play_store + reddit = 2 distinct platforms
    expect(result?.sourceDiversityCount).toBe(2);
    expect(DEFAULT_OPPORTUNITY_WEIGHTS).toEqual({
      evidenceStrength: 20,
      independentRecords: 15,
      sourceDiversity: 10,
      userImpact: 20,
      businessMetricLink: 15,
      researchUncertainty: 10,
      potentialFeasibility: 10,
    });
    // Since independentRecordCount is 2 (< 3), it should be flagged as thin evidence
    expect(result?.isThinEvidence).toBe(true);
    expect(result?.compositeScore).toBeGreaterThan(0);

    const override = await OpportunityService.updateHumanScore({
      opportunityId,
      criterion: 'user_impact',
      score: 3.7,
      rationale: 'Revised after reviewing the two independent records and one duplicate.',
      scoredBy: 'Human Reviewer',
    });
    expect(override).toMatchObject({ previousScore: 4.5, newScore: 3.7 });
    expect(override.auditId).toBeTruthy();
    const listed = await OpportunityService.listOpportunities();
    expect(listed[0].scoreAudit[0]).toMatchObject({ previousScore: 4.5, newScore: 3.7, scoredBy: 'Human Reviewer' });
    expect(listed[0]).toMatchObject({ totalLinkedEvidenceCount: 4, eligibleEvidenceCount: 2, illustrativeEvidenceCount: 1 });
    expect(listed[0].illustrativeEvidence[0]).toMatchObject({ id: fixture.id, isSynthetic: true });
    expect(listed[0].linkedEvidence.every((row: { isSynthetic?: boolean }) => !row.isSynthetic)).toBe(true);
  });
});
