import { describe, it, expect, beforeAll } from 'vitest';
import { initializeDatabase, db } from '@/db';
import { clearAllTables } from '@/db/test-utils';
import { EvidenceService } from '../evidence';
import { AnalysisOrchestrator } from '../ai';
import { EvaluationService } from '../evaluation';
import { themes } from '@/db/schema';
import crypto from 'crypto';

describe('Golden Set Evaluation Pipeline', () => {
  beforeAll(async () => {
    await initializeDatabase();
    await clearAllTables();
  });

  it('evaluates analysis run against manually labelled golden set', async () => {
    // 1. Ingest 3 evidence records
    const r1 = await EvidenceService.createManualRecord({
      sourceUrl: 'https://play.google.com/test-eval-1',
      platform: 'play_store',
      collectedAt: '2026-06-01',
      originalText: 'Autopay mandate failed silently and my bank charged a penalty. Very bad.',
      journeyStage: 'autopay_failure_recovery',
      entryMethod: 'manual',
      isSynthetic: false,
      verificationStatus: 'content_verified',
    });

    const r2 = await EvidenceService.createManualRecord({
      sourceUrl: 'https://play.google.com/test-eval-2',
      platform: 'play_store',
      collectedAt: '2026-06-02',
      originalText: 'Market dipped in month 2, I panicked seeing red portfolio and stopped SIP.',
      journeyStage: 'market_dip_reaction',
      entryMethod: 'manual',
      isSynthetic: false,
      verificationStatus: 'content_verified',
    });

    const r3 = await EvidenceService.createManualRecord({
      sourceUrl: 'https://play.google.com/test-eval-3',
      platform: 'play_store',
      collectedAt: '2026-06-03',
      originalText: 'Good app nice colors.', // Vague / insufficient evidence
      journeyStage: 'unclear',
      entryMethod: 'manual',
      isSynthetic: false,
      verificationStatus: 'content_verified',
    });

    // 2. Register golden labels
    // Label r1 with Autopay theme
    const themeAutopayId = crypto.randomUUID();
    await db.insert(themes).values({
      id: themeAutopayId,
      name: 'Autopay & Mandate Failure Friction',
      slug: 'autopay-mandate-failure-friction',
      description: 'Autopay mandate issues',
      journeyStage: 'autopay_failure_recovery',
    });

    await EvaluationService.addGoldenLabel({
      evidenceId: r1.id,
      themeId: themeAutopayId,
      journeyStage: 'autopay_failure_recovery',
      labeller: 'LeadFellow',
      rationale: 'User specifically described silent mandate failure and bank penalty.',
      labelledBlind: true,
    });

    // Label r2 with Market Dip theme
    const themeDipId = crypto.randomUUID();
    await db.insert(themes).values({
      id: themeDipId,
      name: 'Loss Aversion & Panic During Early Market Dips',
      slug: 'loss-aversion-early-market-dips',
      description: 'Market dips panic',
      journeyStage: 'market_dip_reaction',
    });

    await EvaluationService.addGoldenLabel({
      evidenceId: r2.id,
      themeId: themeDipId,
      journeyStage: 'market_dip_reaction',
      labeller: 'LeadFellow',
      rationale: 'Clear description of month-2 panic stop upon market drawdown.',
      labelledBlind: true,
    });

    // Label r3 with insufficient_evidence
    await EvaluationService.addGoldenLabel({
      evidenceId: r3.id,
      specialLabel: 'insufficient_evidence',
      journeyStage: 'unclear',
      labeller: 'LeadFellow',
      rationale: 'Text does not mention SIPs or financial journey friction.',
      labelledBlind: true,
    });

    // 3. Run Fake AI analysis on these 3 records
    const run = await AnalysisOrchestrator.executeRun({
      providerName: 'fake',
      recordIds: [r1.id, r2.id, r3.id],
    });

    // 4. Run evaluation
    const evalResult = await EvaluationService.evaluateAnalysisRun(run.runId);

    expect(evalResult.totalGoldenRecords).toBe(3);
    expect(evalResult.exactMatches).toBeGreaterThan(0);
    expect(evalResult.accuracy).toBeGreaterThan(0);
    expect(evalResult.smallSampleWarning).toBe(true);
    expect(evalResult.confusionMatrix.length).toBeGreaterThan(0);
    expect(evalResult.themeMetrics.length).toBeGreaterThan(0);
    expect(evalResult.diagnostics.journeyStageAgreement.denominator).toBeGreaterThan(0);
    expect(evalResult.diagnostics.evidenceGroundingAccuracy.denominator).toBeGreaterThan(0);

    // Verify latest evaluation retrieval
    const latest = await EvaluationService.getLatestEvaluation();
    expect(latest).not.toBeNull();
    expect(latest?.items.length).toBe(3);
    expect(latest?.diagnostics.evaluationSampleSize).toBe(3);
    expect(latest?.genuineSampleSize).toBe(3);
    expect(latest?.illustrativeSampleSize).toBe(0);
    expect(latest?.otherSampleSize).toBe(0);
  });
});
