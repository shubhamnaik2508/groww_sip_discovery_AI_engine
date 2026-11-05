import { describe, it, expect, beforeAll } from 'vitest';
import { initializeDatabase, db } from '@/db';
import { clearAllTables } from '@/db/test-utils';
import { EvidenceService } from '../evidence';
import { AnalysisOrchestrator } from '../ai';
import { EvaluationService } from '../evaluation';
import { themes, evaluationRuns } from '@/db/schema';
import crypto from 'crypto';

describe('AI Evaluation Separation & Model Provenance', () => {
  beforeAll(async () => {
    await initializeDatabase();
    await clearAllTables();
  });

  it('marks fake provider outputs as simulated and tracks model provenance', async () => {
    // 1. Create evidence record
    const r1 = await EvidenceService.createManualRecord({
      sourceUrl: 'https://play.google.com/test-prov-1',
      platform: 'play_store',
      collectedAt: '2026-06-01',
      originalText: 'Autopay mandate failed silently and my bank charged a penalty.',
      journeyStage: 'autopay_failure_recovery',
      entryMethod: 'manual',
      isSynthetic: false,
      verificationStatus: 'content_verified',
    });

    // 2. Add golden label
    const themeId = crypto.randomUUID();
    await db.insert(themes).values({
      id: themeId,
      name: 'Autopay & Mandate Failure Friction',
      slug: 'autopay-mandate-failure-friction',
      description: 'Autopay mandate issues',
      journeyStage: 'autopay_failure_recovery',
    });

    await EvaluationService.addGoldenLabel({
      evidenceId: r1.id,
      themeId,
      journeyStage: 'autopay_failure_recovery',
      labeller: 'Human Expert',
      rationale: 'User specifically described silent mandate failure.',
      labelledBlind: true,
    });

    // 3. Execute analysis using FakeAIProvider
    const run = await AnalysisOrchestrator.executeRun({
      providerName: 'fake',
      recordIds: [r1.id],
    });

    // 4. Run evaluation
    const evalResult = await EvaluationService.evaluateAnalysisRun(run.runId);

    // Verify model provenance
    expect(evalResult.provider).toBe('fake');
    expect(evalResult.model).toBe('simulated-rule-engine-test-double');
    expect(evalResult.modelVersion).toBe('1.0.0-simulated-test');
    expect(evalResult.isSimulated).toBe(true);
    expect(evalResult.totalGoldenRecords).toBe(1);

    // Verify persisted evaluation run in database
    const savedRuns = await db.select().from(evaluationRuns);
    expect(savedRuns.length).toBe(1);
    expect(savedRuns[0].provider).toBe('fake');
    expect(savedRuns[0].isSimulated).toBe(true);
    expect(savedRuns[0].model).toBe('simulated-rule-engine-test-double');
    expect(savedRuns[0].modelVersion).toBe('1.0.0-simulated-test');
  });

  it('detects incomplete evaluation when golden labels exist without predictions', async () => {
    // Add another golden label for a record that has not been analyzed
    const r2 = await EvidenceService.createManualRecord({
      sourceUrl: 'https://play.google.com/test-prov-2',
      platform: 'play_store',
      collectedAt: '2026-06-02',
      originalText: 'Another unanalyzed feedback quote.',
      journeyStage: 'unclear',
      entryMethod: 'manual',
      isSynthetic: false,
      verificationStatus: 'content_verified',
    });

    await EvaluationService.addGoldenLabel({
      evidenceId: r2.id,
      specialLabel: 'insufficient_evidence',
      journeyStage: 'unclear',
      labeller: 'Human Expert',
      rationale: 'Vague text',
      labelledBlind: true,
    });

    // Run evaluation against the previous run (which only analyzed r1, not r2)
    const latestRuns = await db.select().from(evaluationRuns);
    const prevRunId = latestRuns[0].analysisRunId;

    const evalResult = await EvaluationService.evaluateAnalysisRun(prevRunId);

    // Golden set has 2 records, but analysis run only analyzed 1 record -> must be marked incomplete
    expect(evalResult.isIncomplete).toBe(true);
    expect(evalResult.missingDetails).toContain('1 golden records were not analyzed');
  });
});
