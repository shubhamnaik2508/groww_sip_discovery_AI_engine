import { describe, expect, it } from 'vitest';
import { summarizeIntelligence } from '../intelligence';

const record = (id: string, extras: Record<string, unknown> = {}) => ({
  id, platform: 'reddit', sourceUrl: 'https://example.invalid/post', originalText: 'I check my SIP weekly.',
  duplicateOfId: null, isSynthetic: false, verificationStatus: 'content_verified', entryMethod: 'manual',
  parsedOutput: { researchDimension: 'checking_monitoring', explicitlyStatedSegment: { ageBand: null, sipStatus: 'unknown' } },
  ...extras,
});

describe('investor intelligence coverage', () => {
  it('counts only explicit dimension assignments and excludes synthetic and duplicate records', () => {
    const result = summarizeIntelligence([
      record('one'),
      record('copy', { duplicateOfId: 'one' }),
      record('fixture', { isSynthetic: true }),
      record('old-schema', { parsedOutput: { journeyStage: 'unclear' } }),
    ]);
    const checking = result.dimensions.find((d) => d.key === 'checking_monitoring');
    expect(checking?.count).toBe(1);
    expect(checking?.confidence).toBe('Limited evidence support');
    expect(result.eligibleRecordCount).toBe(2);
    expect(result.syntheticExcluded).toBe(1);
    expect(result.duplicatesExcluded).toBe(1);
  });

  it('does not report high confidence from volume alone without source diversity and verification', () => {
    const result = summarizeIntelligence(Array.from({ length: 8 }, (_, i) => record(`r${i}`, {
      verificationStatus: 'unverified',
    })));
    expect(result.dimensions.find((d) => d.key === 'checking_monitoring')?.confidence).toBe('Insufficient evidence');
    expect(result.dimensions.find((d) => d.key === 'unmet_needs')?.confidence).toBe('Insufficient evidence');
  });

  it('requires verified coverage across three source types for high support', () => {
    const rows = ['reddit', 'play_store', 'youtube', 'app_store', 'reddit'].map((platform, i) => record(`v${i}`, { platform }));
    expect(summarizeIntelligence(rows).dimensions.find((d) => d.key === 'checking_monitoring')?.confidence).toBe('High evidence support');
  });

  it('keeps unknown segments visible, builds traceable behavioural chains, and excludes simulated analysis', () => {
    const grounded = record('chain', {
      originalText: 'In month 2, I check weekly after a debit alert, checked my account and asked support what happened.',
      parsedOutput: {
        researchDimension: 'external_workarounds',
        journeyStage: 'autopay_failure_recovery',
        journeyPeriod: 'months_2_3',
        journeyPeriodEvidence: 'In month 2',
        checkingFrequency: 'weekly',
        checkingFrequencyEvidence: 'check weekly',
        observedBehaviour: 'Asked support after a debit alert.',
        triggerOrContext: 'Received a debit alert',
        statedFriction: { description: 'Could not understand the debit status.' },
        existingWorkaround: 'Asked support',
        potentialUnmetNeed: 'Clear debit status explanation',
        explicitlyStatedSegment: { ageBand: null, sipStatus: 'unknown' },
        claims: [{ type: 'observation', groundingExcerpt: 'asked support' }],
      },
    });
    const simulated = record('simulated', { analysisProvider: 'fake' });
    const result = summarizeIntelligence([grounded, simulated], []);
    expect(result.eligibleRecordCount).toBe(2);
    expect(result.analyzedRecordCount).toBe(1);
    expect(result.simulatedAnalysisExcluded).toBe(1);
    expect(result.behaviouralChains[0].id).toBe('chain');
    expect(result.segments.find((segment) => segment.key === 'ageBand')?.unknownCount).toBe(2);
    expect(result.evidenceQuality.observationClaimsGrounded).toBe(1);
    expect(result.journeyPeriods.find((period) => period.period === 'months_2_3')?.count).toBe(1);
    expect(result.checkingFrequencies.find((frequency) => frequency.frequency === 'weekly')?.count).toBe(1);
  });

  it('counts a segment as explicit only when its exact supporting quote occurs in the source', () => {
    const unsupported = record('unsupported', {
      parsedOutput: { researchDimension: 'investor_segmentation', explicitlyStatedSegment: { ageBand: '25–30' } },
    });
    const supported = record('supported', {
      originalText: 'I am 27 and started a monthly SIP.',
      parsedOutput: {
        researchDimension: 'investor_segmentation',
        explicitlyStatedSegment: { ageBand: '25–30' },
        segmentEvidence: { ageBand: 'I am 27' },
      },
    });
    const age = summarizeIntelligence([unsupported, supported]).segments.find((segment) => segment.key === 'ageBand');
    expect(age?.knownCount).toBe(1);
    expect(age?.unknownCount).toBe(1);
    expect(age?.groups.find((group) => group.value === '25–30')?.count).toBe(1);
  });

  it('audits all nine product questions independently and requires exact, question-relevant evidence spans', () => {
    // Isolated unit-test specimen only; it is never inserted into the research database or reported as research.
    const source = 'I am a first-time investor, age 25, starting my first SIP to build wealth. I expect steady long-term growth. In month 2, I paused my SIP because expenses rose; I now check my SIP weekly. The mandate debit failed and confused me. I searched Google. I continued after the issue was resolved. I needed a clear failed-debit explanation.';
    const analysis = {
      investorContext: { status: 'First-time investor', supportingQuote: 'I am a first-time investor' },
      statedMotivation: 'Build wealth', motivationEvidence: 'to build wealth',
      statedExpectation: 'Steady long-term growth', expectationEvidence: 'I expect steady long-term growth',
      journeyPeriod: 'months_2_3', journeyPeriodEvidence: 'In month 2',
      observedBehaviour: 'Paused my SIP and checks weekly after two months.', relevantTextSpan: 'In month 2, I paused my SIP because expenses rose; I now check my SIP weekly.',
      continuationStatusReason: 'Paused because expenses rose', continuationEvidence: 'I paused my SIP because expenses rose',
      checkingFrequency: 'weekly', checkingFrequencyEvidence: 'I now check my SIP weekly',
      explicitlyStatedSegment: { ageBand: '25–30', investmentSource: null, incomeStability: null, startingInfluence: null, sipStatus: 'paused' }, segmentEvidence: { ageBand: 'age 25', sipStatus: 'I paused my SIP because expenses rose' },
      cashFlowConflict: 'Expenses rose', cashFlowEvidence: 'because expenses rose',
      paymentTransactionIssue: 'Mandate debit failed', paymentIssueEvidence: 'The mandate debit failed',
      statedFriction: { description: 'Mandate debit status was confusing', supportingQuote: 'The mandate debit failed and confused me' },
      existingWorkaround: 'Searched Google', workaroundEvidence: 'I searched Google',
      potentialUnmetNeed: 'Clear failed-debit explanation', unmetNeedEvidence: 'I needed a clear failed-debit explanation',
    };
    const result = summarizeIntelligence([record('complete', { originalText: source, parsedOutput: analysis })]);
    expect(result.questionCoverage.map((question) => question.count)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(result.questionCoverage.every((question) => question.status === 'PARTIALLY SUPPORTED')).toBe(true);
    expect(result.questionCoverage[3].evidence[0]).toMatchObject({ id: 'complete', excerpt: 'I now check my SIP weekly' });
    expect(result.questionCoverage[7].evidence.some((item) => item.category === 'Age')).toBe(true);

    const unsupported = summarizeIntelligence([record('bad-span', {
      originalText: source,
      parsedOutput: { paymentTransactionIssue: 'Mandate failed', paymentIssueEvidence: 'a fabricated quote' },
    })]);
    expect(unsupported.questionCoverage[4].count).toBe(0);
  });

  it('keeps fixture analyses visible as illustrative without making question coverage genuine', () => {
    const fixture = record('fixture-with-output', {
      isSynthetic: true,
      verificationStatus: 'synthetic_fixture',
      journeyStage: 'pause_cancellation',
      analysisProvider: 'fake',
      originalText: 'Unexpected medical expenses forced me to pause my SIP.',
      parsedOutput: { potentialUnmetNeed: 'Clearer pause controls', unmetNeedEvidence: 'pause my SIP', researchDimension: 'unmet_needs' },
    });
    const result = summarizeIntelligence([fixture]);
    const unmetNeed = result.questionCoverage.find((question) => question.key === 'Q9');
    expect(result.allAnalyzedRecordCount).toBe(1);
    expect(result.illustrativeAnalyzedRecordCount).toBe(1);
    expect(unmetNeed?.illustrativeCount).toBe(1);
    expect(unmetNeed?.count).toBe(0);
    expect(unmetNeed?.status).toBe('NOT SUPPORTED');
    expect(unmetNeed?.illustrativeEvidence[0].analysisProvider).toBe('fake');
  });

  it('does not inflate direct question counts with related-stage context', () => {
    const fixture = record('stage-only', {
      isSynthetic: true,
      verificationStatus: 'synthetic_fixture',
      journeyStage: 'first_instalment',
      analysisProvider: 'fake',
      parsedOutput: { journeyStage: 'first_instalment', theme: { name: 'Payment status' } },
    });
    const question = summarizeIntelligence([fixture]).questionCoverage.find((item) => item.key === 'Q2');
    expect(question?.totalRelevantCount).toBe(0);
    expect(question?.illustrativeCount).toBe(0);
    expect(question?.illustrativeContextCount).toBe(1);
  });
});
