import { beforeAll, describe, expect, it } from 'vitest';
import { initializeDatabase, db } from '@/db';
import { clearAllTables } from '@/db/test-utils';
import { evidenceRecords, evidenceThemeLinks, goldenLabels, themes } from '@/db/schema';
import { EvidenceService } from '../evidence';
import { EvaluationService } from '../evaluation';
import { OpportunityService } from '../opportunity';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';

describe('legacy fixture eligibility across research metrics', () => {
  beforeAll(async () => {
    await initializeDatabase();
    await clearAllTables();
  });

  it('excludes stale-flag fixtures from evidence, evaluation labels, exports, verification and opportunity scores', async () => {
    const fixture = await EvidenceService.createManualRecord({
      sourceUrl: 'https://example.invalid/legacy-fixture',
      platform: 'reddit',
      collectedAt: '2026-05-01',
      originalText: 'Illustrative fixture describing a fictional SIP issue.',
      journeyStage: 'pause_cancellation',
      entryMethod: 'fixture',
      isSynthetic: true,
      verificationStatus: 'synthetic_fixture',
      fieldProvenance: { sourceUrl: 'curated_benchmark', originalText: 'curated_benchmark' },
    });
    await db.update(evidenceRecords).set({ isSynthetic: false, verificationStatus: 'unverified' }).where(eq(evidenceRecords.id, fixture.id));

    const storedForExplorer = await EvidenceService.listEvidence({ limit: 50 });
    expect(storedForExplorer.find((row) => row.id === fixture.id)?.isSynthetic).toBe(true);
    expect((await EvidenceService.listEvidence({ excludeSynthetic: true, limit: 50 })).some((row) => row.id === fixture.id)).toBe(false);
    expect((await EvidenceService.listEvidence({ onlySynthetic: true, limit: 50 })).some((row) => row.id === fixture.id)).toBe(true);

    const provenance = await EvidenceService.getProvenanceBreakdown();
    expect(provenance.syntheticFixture).toBe(1);
    expect(provenance.eligibleNonFixture).toBe(0);

    const csvWithoutFixtures = await EvidenceService.exportToCsv();
    expect(csvWithoutFixtures).not.toContain(fixture.id);
    const csvWithFixtures = await EvidenceService.exportToCsv({ excludeSynthetic: false });
    expect(csvWithFixtures).toContain('synthetic_fixture');

    await db.insert(goldenLabels).values({
      id: crypto.randomUUID(), evidenceId: fixture.id, specialLabel: 'standard',
      journeyStage: 'pause_cancellation', labeller: 'Fixture Labeler', rationale: 'Fixture test label',
    });
    expect((await EvaluationService.listGoldenLabels()).some((row) => row.evidenceId === fixture.id)).toBe(false);
    await expect(EvidenceService.verifyEvidenceRecord(fixture.id, 'content_verified', 'Auditor'))
      .rejects.toThrow(/cannot be verified as genuine/);

    const themeId = crypto.randomUUID();
    await db.insert(themes).values({
      id: themeId, name: 'Fixture Theme', slug: 'fixture-theme', description: 'Fixture-linked theme', journeyStage: 'pause_cancellation',
    });
    await db.insert(evidenceThemeLinks).values({
      id: crypto.randomUUID(), evidenceId: fixture.id, themeId, role: 'supports', source: 'ai',
    });
    const opportunity = await OpportunityService.createOpportunity({
      title: 'Fixture-only opportunity', problemStatement: 'A fixture-only problem statement.',
      hypothesisOnRetention: 'A fixture-only test hypothesis.', themeIds: [themeId],
    });
    const score = await OpportunityService.recalculateOpportunityScore(opportunity.opportunityId);
    expect(score?.independentRecordCount).toBe(0);
    expect(score?.syntheticFixtureCount).toBe(1);
    expect(score?.compositeScore).toBe(0);

    const listed = await OpportunityService.listOpportunities();
    expect(listed.find((row) => row.id === opportunity.opportunityId)?.hasEligibleEvidence).toBe(false);
    expect(listed.find((row) => row.id === opportunity.opportunityId)?.linkedEvidence).toHaveLength(0);
  });
});
