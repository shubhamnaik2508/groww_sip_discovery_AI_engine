import { describe, it, expect, beforeAll } from 'vitest';
import { initializeDatabase, db } from '@/db';
import { clearAllTables } from '@/db/test-utils';
import { FakeAIProvider } from '../fake';
import { validateOutputGuards, StructuredAnalysisOutput } from '../schema';
import { AnalysisOrchestrator } from '../index';
import { EvidenceService } from '@/services/evidence';
import { recordAnalyses, analysisRuns, themes } from '@/db/schema';
import { eq } from 'drizzle-orm';

describe('AI Analysis Pipeline & Safety Guards', () => {
  beforeAll(async () => {
    await initializeDatabase();
    await clearAllTables();
  });

  it('passes safety guards when excerpt is verbatim and claims are labelled', () => {
    const text = 'Groww deducted my SIP on 5th but NAV of 8th was given. As a beginner this feels like cheating.';
    const validOutput: StructuredAnalysisOutput = {
      theme: { name: 'NAV Allocation Timing Confusion', isNewProposal: true },
      abstainReason: null,
      journeyStage: 'first_instalment',
      observedBehaviour: 'User reported discrepancy between deduction date and NAV allotment date.',
      investorContext: {
        status: 'Beginner',
        supportingQuote: 'beginner',
      },
      statedFriction: {
        type: 'frustration',
        description: 'Felt cheated due to delay between payment deduction and NAV allotment.',
        supportingQuote: 'feels like cheating',
      },
      evidenceExcerpt: 'Groww deducted my SIP on 5th but NAV of 8th was given.',
      claims: [
        {
          text: 'Money was deducted on 5th.',
          type: 'observation',
          groundingExcerpt: 'deducted my SIP on 5th',
        },
        {
          text: 'Delay in NAV allotment damages beginner trust.',
          type: 'inference',
        },
      ],
      uncertaintyAnalysis: 'Unknown whether weekend or bank holiday caused the NAV delay.',
      sipContinuationHypothesis: {
        hypothesisText: 'Unclear NAV allotment timing creates early distrust leading to cancellation before month 3.',
        label: 'HYPOTHESIS',
        plausibleMechanism: 'Beginners suspect hidden charges or platform inefficiency.',
      },
      followUpResearchQuestion: 'Does explaining the cut-off time and T+2 settlement cycle upfront reduce early cancellations?',
      selfReportedConfidence: 'high',
    };

    const guardResult = validateOutputGuards(text, validOutput);
    expect(guardResult.isValid).toBe(true);
    expect(guardResult.guardErrors.length).toBe(0);
  });

  it('fails safety guards when excerpt is not verbatim or context is hallucinated', () => {
    const text = 'My SIP payment failed today.';
    const invalidOutput: StructuredAnalysisOutput = {
      theme: { name: 'Payment Failure', isNewProposal: true },
      journeyStage: 'autopay_failure_recovery',
      observedBehaviour: 'Payment failed.',
      investorContext: {
        status: 'College student with 500 Rs pocket money',
        supportingQuote: 'college student', // Not in text!
      },
      evidenceExcerpt: 'This text was fabricated by the AI model completely.', // Not in text!
      claims: [{ text: 'Payment failed', type: 'observation' }],
      uncertaintyAnalysis: 'None',
      sipContinuationHypothesis: null,
      followUpResearchQuestion: 'Why?',
      selfReportedConfidence: 'high',
    };

    const guardResult = validateOutputGuards(text, invalidOutput);
    expect(guardResult.isValid).toBe(false);
    expect(guardResult.guardErrors.some((e) => e.includes('Excerpt Mismatch'))).toBe(true);
    expect(guardResult.guardErrors.some((e) => e.includes('Hallucinated Context'))).toBe(true);
  });

  it('rejects an inferred demographic and an observation without a source span', () => {
    const text = 'I started a SIP after watching a YouTube video.';
    const output: StructuredAnalysisOutput = {
      theme: null,
      abstainReason: 'Insufficient evidence for a personal investment status.',
      journeyStage: 'unclear',
      observedBehaviour: 'The writer says they started a SIP.',
      evidenceExcerpt: text,
      explicitlyStatedSegment: { ageBand: '25–30', startingInfluence: 'YouTube' },
      segmentEvidence: { ageBand: null, startingInfluence: 'YouTube video' },
      claims: [{ text: 'The investor is 25–30 years old.', type: 'observation' }],
      uncertaintyAnalysis: 'Age is not stated.',
      followUpResearchQuestion: 'How old is the investor?',
      selfReportedConfidence: 'low',
    };
    const result = validateOutputGuards(text, output);
    expect(result.isValid).toBe(false);
    expect(result.guardErrors.some((error) => error.includes('Unsupported Segment'))).toBe(true);
    expect(result.guardErrors.some((error) => error.includes('Ungrounded Observation'))).toBe(true);
  });

  it('rejects question-specific interpretations without an exact supporting quote', () => {
    const output: StructuredAnalysisOutput = {
      theme: null,
      abstainReason: null,
      journeyStage: 'unclear',
      observedBehaviour: 'The source is a question.',
      evidenceExcerpt: 'Should I pause my SIP if rent goes up?',
      statedExpectation: 'Expected high returns',
      expectationEvidence: 'I expected high returns',
      claims: [{ text: 'The source asks whether to pause an SIP.', type: 'observation', groundingExcerpt: 'Should I pause my SIP' }],
      uncertaintyAnalysis: 'It is a hypothetical question and does not establish the writer had this experience.',
      sipContinuationHypothesis: null,
      followUpResearchQuestion: 'Was this a personal experience?',
      selfReportedConfidence: 'low',
    };
    const result = validateOutputGuards('Should I pause my SIP if rent goes up?', output);
    expect(result.isValid).toBe(false);
    expect(result.guardErrors.some((error) => error.includes('Unsupported statedExpectation'))).toBe(true);
  });

  it('executes end-to-end analysis run with FakeAIProvider and persists immutable outputs', async () => {
    // 1. Ingest an evidence record
    const { id } = await EvidenceService.createManualRecord({
      sourceUrl: 'https://play.google.com/review-mandate-test',
      platform: 'play_store',
      collectedAt: '2026-06-10',
      originalText: 'Autopay failed silently without any notification. My bank charged 500 penalty. Horrible experience for a first-time investor.',
      investorContext: 'First-time investor',
      journeyStage: 'autopay_failure_recovery',
      entryMethod: 'manual',
      isSynthetic: false,
    });

    // 2. Run analysis orchestrator with fake provider
    const runSummary = await AnalysisOrchestrator.executeRun({
      providerName: 'fake',
      recordIds: [id],
    });

    expect(runSummary.totalRecords).toBe(1);
    expect(runSummary.successfulRecords).toBe(1);
    expect(runSummary.failedRecords).toBe(0);

    // 3. Verify record analysis was persisted
    const analyses = await db.select().from(recordAnalyses).where(eq(recordAnalyses.evidenceId, id));
    expect(analyses.length).toBe(1);
    expect(analyses[0].validationStatus).toBe('valid');
    const parsed = JSON.parse(analyses[0].parsedOutput!);
    expect(parsed.journeyStage).toBe('autopay_failure_recovery');
    expect(parsed.sipContinuationHypothesis?.label).toBe('HYPOTHESIS');

    // 4. Verify theme was proposed and persisted
    const discoveredThemes = await db.select().from(themes).all();
    expect(discoveredThemes.length).toBeGreaterThan(0);
  });
});
