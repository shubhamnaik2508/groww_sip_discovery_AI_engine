import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { initializeDatabase, db } from '@/db';
import { clearAllTables } from '@/db/test-utils';
import { seedBenchmarkData, BENCHMARK_ITEMS } from '@/db/seed';
import { EvidenceService } from '../evidence';
import { evidenceRecords } from '@/db/schema';
import { eq } from 'drizzle-orm';

describe('Benchmark Seeding: User Record Provenance Protection', () => {
  beforeAll(async () => {
    await initializeDatabase();
  });

  beforeEach(async () => {
    await clearAllTables();
  });

  it('never overwrites a user-imported record that has the same content hash as a benchmark fixture', async () => {
    // ── Arrange ──────────────────────────────────────────────────────────
    // Insert a genuine user-imported record with the EXACT SAME text as the
    // first benchmark fixture. This is the core regression scenario.
    const benchmarkText = BENCHMARK_ITEMS[0].originalText;

    const userRecord = await EvidenceService.createManualRecord({
      sourceUrl: 'https://play.google.com/store/apps/details?id=com.nextbillion.groww&reviewId=user_real_01',
      platform: 'play_store',
      collectedAt: '2026-06-01',
      originalText: benchmarkText,
      investorContext: 'Real investor feedback from app review',
      journeyStage: 'autopay_failure_recovery',
      entryMethod: 'manual',
      isSynthetic: false,
      verificationStatus: 'content_verified',
      verifiedAt: '2026-06-02T10:00:00Z',
      verifiedBy: 'ResearchLead',
    });

    expect(userRecord.id).toBeDefined();

    // Snapshot the user record state before seeding
    const beforeSeed = await db
      .select()
      .from(evidenceRecords)
      .where(eq(evidenceRecords.id, userRecord.id));
    expect(beforeSeed.length).toBe(1);
    expect(beforeSeed[0].isSynthetic).toBe(false);
    expect(beforeSeed[0].verificationStatus).toBe('content_verified');
    expect(beforeSeed[0].entryMethod).toBe('manual');
    expect(beforeSeed[0].verifiedBy).toBe('ResearchLead');

    // ── Act ──────────────────────────────────────────────────────────────
    // Run benchmark seeding. The bug was that the seeder would match by content
    // hash and unconditionally set isSynthetic=true / verificationStatus='synthetic_fixture'.
    const seedResult = await seedBenchmarkData();
    expect(seedResult.success).toBe(true);

    // ── Assert ───────────────────────────────────────────────────────────
    // Re-fetch the user record and verify NONE of its provenance fields changed.
    const afterSeed = await db
      .select()
      .from(evidenceRecords)
      .where(eq(evidenceRecords.id, userRecord.id));

    expect(afterSeed.length).toBe(1);
    const record = afterSeed[0];

    // These are the critical fields the bug was corrupting:
    expect(record.isSynthetic).toBe(false);
    expect(record.verificationStatus).toBe('content_verified');
    expect(record.entryMethod).toBe('manual');

    // Additional provenance fields that must survive:
    expect(record.verifiedBy).toBe('ResearchLead');
    expect(record.verifiedAt).toBe('2026-06-02T10:00:00Z');
    expect(record.investorContext).toBe('Real investor feedback from app review');

    // The benchmark fixture should ALSO exist as a separate record
    const allRecords = await db.select().from(evidenceRecords);
    const fixtureRecords = allRecords.filter(
      (r) => r.isSynthetic === true && r.entryMethod === 'fixture'
    );
    // All 20 benchmark items should be present as fixtures
    expect(fixtureRecords.length).toBe(BENCHMARK_ITEMS.length);

    // The user record must remain as a separate, non-fixture record
    const userRecords = allRecords.filter(
      (r) => r.id === userRecord.id && r.isSynthetic === false && r.entryMethod === 'manual'
    );
    expect(userRecords.length).toBe(1);
  });

  it('still correctly updates an existing synthetic fixture on re-seed', async () => {
    // ── Arrange ──────────────────────────────────────────────────────────
    // First seed creates all fixtures
    const firstSeed = await seedBenchmarkData();
    expect(firstSeed.success).toBe(true);

    const allAfterFirst = await db.select().from(evidenceRecords);
    const fixturesAfterFirst = allAfterFirst.filter(
      (r) => r.isSynthetic === true && r.entryMethod === 'fixture'
    );
    expect(fixturesAfterFirst.length).toBe(BENCHMARK_ITEMS.length);

    // Record fixture IDs for comparison
    const fixtureIds = new Set(fixturesAfterFirst.map((r) => r.id));

    // ── Act ──────────────────────────────────────────────────────────────
    // Second seed should be idempotent — no new fixture records
    const secondSeed = await seedBenchmarkData();
    expect(secondSeed.success).toBe(true);

    // ── Assert ───────────────────────────────────────────────────────────
    const allAfterSecond = await db.select().from(evidenceRecords);
    const fixturesAfterSecond = allAfterSecond.filter(
      (r) => r.isSynthetic === true && r.entryMethod === 'fixture'
    );

    // Same count — no duplicates created
    expect(fixturesAfterSecond.length).toBe(BENCHMARK_ITEMS.length);

    // Same IDs — records were updated in-place, not recreated
    for (const fixture of fixturesAfterSecond) {
      expect(fixtureIds.has(fixture.id)).toBe(true);
    }
  });

  it('preserves user record even when seeded twice after user import', async () => {
    // ── Arrange ──────────────────────────────────────────────────────────
    const benchmarkText = BENCHMARK_ITEMS[2].originalText; // Use third benchmark item
    const userRecord = await EvidenceService.createManualRecord({
      sourceUrl: 'https://reddit.com/r/test/user_real_sip',
      platform: 'reddit',
      collectedAt: '2026-07-01',
      originalText: benchmarkText,
      journeyStage: 'market_dip_reaction',
      entryMethod: 'manual',
      isSynthetic: false,
      verificationStatus: 'user_entered',
    });

    // ── Act ──────────────────────────────────────────────────────────────
    await seedBenchmarkData();
    await seedBenchmarkData(); // Seed twice to test idempotency with user collision

    // ── Assert ───────────────────────────────────────────────────────────
    const afterDoubleSeed = await db
      .select()
      .from(evidenceRecords)
      .where(eq(evidenceRecords.id, userRecord.id));

    expect(afterDoubleSeed.length).toBe(1);
    expect(afterDoubleSeed[0].isSynthetic).toBe(false);
    expect(afterDoubleSeed[0].verificationStatus).toBe('user_entered');
    expect(afterDoubleSeed[0].entryMethod).toBe('manual');
  });

  it('recognizes legacy fixture-provenance rows with a stale false synthetic flag during re-seeding', async () => {
    const legacyFixture = BENCHMARK_ITEMS[0];
    const oldRow = await EvidenceService.createManualRecord({
      sourceUrl: legacyFixture.sourceUrl,
      platform: legacyFixture.platform as any,
      collectedAt: legacyFixture.collectedAt,
      originalText: legacyFixture.originalText,
      journeyStage: legacyFixture.journeyStage as any,
      entryMethod: 'fixture',
      isSynthetic: false,
      verificationStatus: 'unverified',
      fieldProvenance: {
        sourceUrl: 'curated_benchmark',
        platform: 'curated_benchmark',
        collectedAt: 'curated_benchmark',
        originalText: 'curated_benchmark',
        journeyStage: 'curated_benchmark',
      },
    });
    await db.update(evidenceRecords).set({ isSynthetic: false, verificationStatus: 'unverified' }).where(eq(evidenceRecords.id, oldRow.id));

    await seedBenchmarkData();

    const matchingRows = await db.select().from(evidenceRecords).where(eq(evidenceRecords.contentHash, (await db.select().from(evidenceRecords).where(eq(evidenceRecords.id, oldRow.id)))[0].contentHash));
    expect(matchingRows).toHaveLength(1);
    expect(matchingRows[0].id).toBe(oldRow.id);
    expect(matchingRows[0].isSynthetic).toBe(true);
    expect(matchingRows[0].verificationStatus).toBe('synthetic_fixture');
  });
});
