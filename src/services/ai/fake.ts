import { AIProvider, AnalysisInputRecord, KnownThemePromptItem, AIAnalysisResult } from './provider';
import { StructuredAnalysisOutput, validateOutputGuards } from './schema';
import { JourneyStage } from '@/lib/types';

export class FakeAIProvider implements AIProvider {
  readonly providerName = 'fake';
  readonly modelName = 'simulated-rule-engine-test-double';
  readonly modelVersion = '1.0.0-simulated-test';
  readonly promptVersion = '2026-11-investor-intelligence-v4-simulated';
  readonly schemaVersion = '2.2.0';

  async analyzeRecord(
    record: AnalysisInputRecord,
    knownThemes: KnownThemePromptItem[]
  ): Promise<AIAnalysisResult> {
    const startTime = Date.now();
    const text = record.originalText.toLowerCase();

    // Check for off-topic or empty
    if (text.length < 10 || text.includes('unrelated text spam')) {
      const parsedOutput: StructuredAnalysisOutput = {
        researchDimension: 'insufficient_evidence',
        statedMotivation: null, motivationEvidence: null, statedExpectation: null, expectationEvidence: null,
        cashFlowConflict: null, cashFlowEvidence: null, paymentTransactionIssue: null, paymentIssueEvidence: null,
        confidenceConcern: null, confidenceEvidence: null, continuationStatusReason: null, continuationEvidence: null,
        triggerOrContext: null, emotionalSignal: null,
        existingWorkaround: null, workaroundEvidence: null, potentialUnmetNeed: null, unmetNeedEvidence: null,
        relevantTextSpan: record.originalText.slice(0, Math.min(record.originalText.length, 25)),
        missingInformation: ['Specific investor experience and context'],
        explicitlyStatedSegment: { ageBand: null, incomeStability: null, investmentSource: null, startingInfluence: null, sipStatus: 'unknown' },
        theme: null,
        abstainReason: 'Insufficient evidence or off-topic feedback unrelated to mutual fund SIP journey.',
        journeyStage: 'unclear',
        observedBehaviour: 'User provided minimal or unclassifiable text.',
        investorContext: null,
        statedFriction: null,
        evidenceExcerpt: record.originalText.slice(0, Math.min(record.originalText.length, 25)),
        claims: [
          {
            text: 'Text contains insufficient detail for SIP retention analysis.',
            type: 'observation',
          },
        ],
        uncertaintyAnalysis: 'High uncertainty: Feedback lacked substantive detail regarding user journey.',
        sipContinuationHypothesis: null,
        followUpResearchQuestion: 'Can additional context be obtained regarding the user transaction?',
        selfReportedConfidence: 'low',
      };

      const latencyMs = Date.now() - startTime;
      return {
        provider: this.providerName,
        model: this.modelName,
        modelVersion: this.modelVersion,
        promptVersion: this.promptVersion,
        schemaVersion: this.schemaVersion,
        rawOutput: JSON.stringify(parsedOutput),
        parsedOutput,
        validationStatus: 'valid',
        latencyMs,
      };
    }

    // Determine journey stage and theme based on text signals
    let stage: JourneyStage = 'first_instalment';
    let themeName = 'SIP Instalment Allotment Transparency';
    let frictionType: 'concern' | 'unmet_need' | 'workaround' | 'confusion' | 'frustration' = 'confusion';
    let mechanism = 'Uncertainty during the first instalment causes first-time investors to lose trust before second month.';

    if (text.includes('customer care') || text.includes('support ticket') || text.includes('support took')) {
      stage = 'autopay_failure_recovery';
      themeName = 'Customer Support Delay';
      frictionType = 'frustration';
      mechanism = 'Support latency prevents timely resolution of banking glitches, escalating churn risk.';
    } else if (text.includes('allot') || text.includes('nav') || text.includes('payment processing') || text.includes('units were not') || text.includes('allocation delay')) {
      stage = 'first_instalment';
      themeName = 'SIP Instalment Allotment Transparency';
      frictionType = 'confusion';
      mechanism = 'Unclear NAV allotment windows and settlement delay statuses erode initial investor trust.';
    } else if (text.includes('autopay') || text.includes('mandate') || text.includes('deducted') || text.includes('penalty') || text.includes('bank debit') || text.includes('double') || text.includes('cibil') || text.includes('bank server')) {
      stage = 'autopay_failure_recovery';
      themeName = 'Autopay & Mandate Failure Friction';
      frictionType = 'frustration';
      mechanism = 'Surprise bank penalties or silent mandate rejections lead users to abandon automatic debits.';
    } else if (text.includes('crash') || text.includes('loss') || text.includes('negative') || text.includes('dip') || text.includes('panic') || text.includes('losing money')) {
      stage = 'market_dip_reaction';
      themeName = 'Loss Aversion & Panic During Early Market Dips';
      frictionType = 'concern';
      mechanism = 'Beginners interpreting market volatility as permanent capital loss pause or cancel their SIP in months 2-4.';
    } else if (text.includes('pause') || text.includes('skip') || text.includes('step-up') || text.includes('step up') || text.includes('change my sip debit date') || text.includes('prior notice')) {
      stage = 'pause_cancellation';
      themeName = 'SIP Flexibility & Modification Friction';
      frictionType = 'unmet_need';
      mechanism = 'Inability to easily skip or adjust instalment dates causes full cancellation instead of temporary pause.';
    } else if (text.includes('10 months') || text.includes('12 instalments') || text.includes('milestone') || text.includes('disciplined')) {
      stage = 'continuation_milestone';
      themeName = 'Long-Term Horizon & Milestone Affirmation';
      frictionType = 'unmet_need';
      mechanism = 'Lack of reinforcement for disciplined continuous contributions leaves long-term savers unacknowledged.';
    } else if (text.includes('overwhelmed') || text.includes('too many fund choices')) {
      stage = 'discovery_intent';
      themeName = 'Fund Selection Paradox of Choice';
      frictionType = 'confusion';
      mechanism = 'Excessive catalog complexity during initial onboarding triggers decision fatigue and abandonment.';
    } else if (text.includes('salary on 7th') || text.includes('debit date on 7th')) {
      stage = 'discovery_intent';
      themeName = 'SIP Mental Model & Commitment Clarity';
      frictionType = 'unmet_need';
      mechanism = 'Fixed arbitrary calendar debit options mismatch real user salary payment schedules.';
    } else if (text.includes('kyc') && !text.includes('upi') && !text.includes('first instalment')) {
      stage = 'mandate_kyc_setup';
      themeName = 'KYC & Onboarding Verification Drop-off';
      frictionType = 'confusion';
      mechanism = 'Unresolved regulatory friction during onboarding delays first investment and erodes intent.';
    }

    // Match with existing theme if available
    const existingMatch = knownThemes.find((t) => t.name.toLowerCase() === themeName.toLowerCase());
    const finalTheme = {
      name: existingMatch ? existingMatch.name : themeName,
      isNewProposal: !existingMatch,
      subtheme: null,
    };

    // Extract genuine verbatim excerpt (first 40 characters or whole sentence)
    const excerpt = record.originalText.slice(0, Math.min(record.originalText.length, 50));

    // Check for explicit investor context in source
    let investorContext: { status: string; supportingQuote: string } | null = null;
    if (text.includes('first') || text.includes('beginner') || text.includes('new to')) {
      const matchQuote = record.originalText.match(/(first[^.,;]+|beginner[^.,;]+|new to[^.,;]+)/i);
      if (matchQuote) {
        investorContext = {
          status: 'Self-identified first-time investor',
          supportingQuote: matchQuote[0].trim(),
        };
      }
    }

    const parsedOutput: StructuredAnalysisOutput = {
      researchDimension: text.includes('check') || text.includes('how often') ? 'checking_monitoring'
        : text.includes('reddit') || text.includes('google') || text.includes('youtube') || text.includes('friend') ? 'external_workarounds'
        : text.includes('pause') || text.includes('cancel') || text.includes('stop') || text.includes('reduce') ? 'pause_reduction_discontinuation'
        : text.includes('salary') || text.includes('goal') || text.includes('started sip') ? 'sip_starting_motivation'
        : text.includes('confus') || text.includes('unclear') || text.includes('status') || text.includes('allot') || text.includes('nav') ? 'in_app_confusion_anxiety'
        : 'unmet_needs',
      statedMotivation: text.includes('because') || text.includes('goal') ? excerpt : null,
      motivationEvidence: text.includes('because') || text.includes('goal') ? excerpt : null,
      statedExpectation: null,
      expectationEvidence: null,
      cashFlowConflict: null,
      cashFlowEvidence: null,
      paymentTransactionIssue: null,
      paymentIssueEvidence: null,
      confidenceConcern: null,
      confidenceEvidence: null,
      continuationStatusReason: null,
      continuationEvidence: null,
      triggerOrContext: excerpt,
      emotionalSignal: /worried|anxious|panic|frustrat|cheated|scared|confus/i.test(record.originalText) ? excerpt : null,
      existingWorkaround: /reddit|google|youtube|friend|support|search/i.test(record.originalText) ? excerpt : null,
      workaroundEvidence: /reddit|google|youtube|friend|support|search/i.test(record.originalText) ? excerpt : null,
      potentialUnmetNeed: frictionType === 'unmet_need' || frictionType === 'confusion' ? `Clearer help for ${stage.replace(/_/g, ' ')} (model-generated candidate)` : null,
      unmetNeedEvidence: frictionType === 'unmet_need' || frictionType === 'confusion' ? excerpt : null,
      relevantTextSpan: excerpt,
      missingInformation: ['Investor segment and 12-month SIP status are not established unless explicitly stated.'],
      explicitlyStatedSegment: { ageBand: null, incomeStability: null, investmentSource: null, startingInfluence: null, sipStatus: 'unknown' },
      theme: finalTheme,
      abstainReason: null,
      journeyStage: stage,
      observedBehaviour: `User explicitly stated: "${record.originalText.slice(0, 80)}"`,
      investorContext,
      statedFriction: {
        type: frictionType,
        description: `Encountered friction in ${stage.replace(/_/g, ' ')}.`,
        supportingQuote: excerpt,
      },
      evidenceExcerpt: excerpt,
      claims: [
        {
          text: `User reported issue during ${stage.replace(/_/g, ' ')}.`,
          type: 'observation',
          groundingExcerpt: excerpt,
        },
        {
          text: `This issue likely increases cognitive burden on inexperienced mutual fund investors.`,
          type: 'inference',
        },
      ],
      uncertaintyAnalysis: 'Analysis is based solely on unverified public feedback; investor tenure cannot be audited from this text alone.',
      sipContinuationHypothesis: {
        hypothesisText: `Friction regarding ${finalTheme.name} reduces the likelihood of maintaining an active SIP at 12 months.`,
        label: 'HYPOTHESIS',
        plausibleMechanism: mechanism,
      },
      followUpResearchQuestion: `What percentage of first-time SIP drops occur within 30 days of encountering ${finalTheme.name}?`,
      selfReportedConfidence: 'high',
    };

    // Run safety guards
    const guardResult = validateOutputGuards(record.originalText, parsedOutput);

    const latencyMs = Date.now() - startTime;
    return {
      provider: this.providerName,
      model: this.modelName,
      modelVersion: this.modelVersion,
      promptVersion: this.promptVersion,
      schemaVersion: this.schemaVersion,
      rawOutput: JSON.stringify(parsedOutput, null, 2),
      parsedOutput,
      validationStatus: guardResult.isValid ? 'valid' : 'guard_failed',
      validationErrors: guardResult.guardErrors,
      latencyMs,
    };
  }
}
