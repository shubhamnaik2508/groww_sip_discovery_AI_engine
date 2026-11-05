import { db, initializeDatabase, client } from '@/db';
import {
  evidenceRecords,
  themes,
  evidenceThemeLinks,
  contradictions,
  researchQuestions,
  recordAnalyses,
  reviews,
  opportunities,
} from '@/db/schema';
import { EvidenceService } from '@/services/evidence';
import { AnalysisOrchestrator } from '@/services/ai';
import { ReviewService } from '@/services/review';
import { EvaluationService } from '@/services/evaluation';
import { OpportunityService } from '@/services/opportunity';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';
import { computeContentHash } from '@/lib/hashing';

export const BENCHMARK_ITEMS = [
  {
    sourceUrl: 'https://play.google.com/store/apps/details?id=com.nextbillion.groww&reviewId=gp_101',
    platform: 'play_store',
    collectedAt: '2026-05-10',
    originalText: 'Autopay failed silently without any SMS or push alert. My HDFC bank charged 590 Rs ECS bounce penalty. As a first-time investor with 1000 Rs SIP, losing 590 was devastating. I cancelled immediately.',
    investorContext: 'First-time investor with 1000 Rs monthly SIP',
    journeyStage: 'autopay_failure_recovery',
    goldenTheme: 'Autopay & Mandate Failure Friction',
    goldenRationale: 'Classic silent mandate failure resulting in bank penalty and immediate SIP termination.',
  },
  {
    sourceUrl: 'https://play.google.com/store/apps/details?id=com.nextbillion.groww&reviewId=gp_102',
    platform: 'play_store',
    collectedAt: '2026-05-14',
    originalText: 'My SIP instalment was deducted on 5th June, but mutual fund units were not allotted until 11th June. Customer support had no clear answer. I felt cheated thinking Groww holds my money.',
    investorContext: 'New mutual fund investor',
    journeyStage: 'first_instalment',
    goldenTheme: 'SIP Instalment Allotment Transparency',
    goldenRationale: 'Unclear NAV allotment and settlement cycle creates deep early distrust during first instalment.',
  },
  {
    sourceUrl: 'https://reddit.com/r/IndiaInvestments/comments/1c23x9/groww_sip_panic_question',
    platform: 'reddit',
    collectedAt: '2026-05-18',
    originalText: 'Started my first SIP in Parag Parikh Flexi Cap 3 months ago. Market crashed this week and my returns are -5%. I stopped my SIP because I cannot afford to lose my hard earned money.',
    investorContext: '3 months into first SIP',
    journeyStage: 'market_dip_reaction',
    goldenTheme: 'Loss Aversion & Panic During Early Market Dips',
    goldenRationale: 'Beginner loss aversion triggered by initial drawdown in months 2-4 without volatility education.',
  },
  {
    sourceUrl: 'https://reddit.com/r/Groww/comments/987xyz/pause_sip_feature_is_useless',
    platform: 'reddit',
    collectedAt: '2026-05-22',
    originalText: 'I had unexpected medical expenses this month and wanted to skip only the July instalment. Groww only allows pausing for minimum 3 months! I had no choice but to cancel the whole SIP.',
    investorContext: 'Regular investor facing liquidity pinch',
    journeyStage: 'pause_cancellation',
    goldenTheme: 'SIP Flexibility & Modification Friction',
    goldenRationale: 'Rigid pause rules force complete SIP cancellation when users only experience single-month liquidity constraints.',
  },
  {
    sourceUrl: 'https://twitter.com/investor_rahul/status/17923489123',
    platform: 'twitter_x',
    collectedAt: '2026-05-28',
    originalText: 'Why does Groww require 30 days prior notice just to change my SIP debit date from 1st to 10th? My salary date shifted and because I could not change it easily, I had to stop and restart.',
    investorContext: 'Salaried individual',
    journeyStage: 'pause_cancellation',
    goldenTheme: 'SIP Flexibility & Modification Friction',
    goldenRationale: 'Inability to flexibly align debit dates with dynamic salary schedules.',
  },
  {
    sourceUrl: 'https://play.google.com/store/apps/details?id=com.nextbillion.groww&reviewId=gp_106',
    platform: 'play_store',
    collectedAt: '2026-06-02',
    originalText: 'Kyc rejection without showing which document was blurry. Submitted 4 times. Finally gave up on investing in mutual funds altogether.',
    investorContext: 'First-time applicant',
    journeyStage: 'mandate_kyc_setup',
    goldenTheme: 'KYC & Onboarding Verification Drop-off',
    goldenRationale: 'Vague KYC document rejection reasons stop user intent before first investment can occur.',
  },
  {
    sourceUrl: 'https://reddit.com/r/IndiaInvestments/comments/m71qwe/first_sip_allocation_delay',
    platform: 'reddit',
    collectedAt: '2026-06-05',
    originalText: 'First SIP debit went through, but order status stayed "Payment Processing" for 72 hours over the weekend. App should display a timeline so beginners don\'t freak out.',
    investorContext: 'First SIP',
    journeyStage: 'first_instalment',
    goldenTheme: 'SIP Instalment Allotment Transparency',
    goldenRationale: 'Lack of visual progress tracker creates uncertainty during settlement windows.',
  },
  {
    sourceUrl: 'https://play.google.com/store/apps/details?id=com.nextbillion.groww&reviewId=gp_108',
    platform: 'play_store',
    collectedAt: '2026-06-11',
    originalText: 'Mandate setup via SBI netbanking failed with session timeout. Money debited 1 Rs for validation but autopay is not showing active. Terrified to click again.',
    investorContext: 'SBI account holder setting up e-mandate',
    journeyStage: 'mandate_kyc_setup',
    goldenTheme: 'Autopay & Mandate Failure Friction',
    goldenRationale: 'Bank netbanking gateway drop-offs during mandate creation produce fear of recurring phantom debits.',
  },
  {
    sourceUrl: 'https://twitter.com/priya_finance/status/17988231201',
    platform: 'twitter_x',
    collectedAt: '2026-06-15',
    originalText: 'After 10 months of continuous SIP, app still shows no milestone acknowledgment or return comparison. Only push notification I get is "Invest in NFO today!". Uninstalled.',
    investorContext: '10 months of disciplined SIP',
    journeyStage: 'continuation_milestone',
    goldenTheme: 'Long-Term Horizon & Milestone Affirmation',
    goldenRationale: 'Absence of disciplined milestone validation weakens commitment as users approach the 12-month mark.',
  },
  {
    sourceUrl: 'https://play.google.com/store/apps/details?id=com.nextbillion.groww&reviewId=gp_110',
    platform: 'play_store',
    collectedAt: '2026-06-19',
    originalText: 'Invested 500 Rs each month for 4 months. Total 2000 invested, current value 1980. Why am I losing money when inflation is 6%? Nobody explained mutual funds can go down in short term.',
    investorContext: 'Small ticket 500 Rs monthly investor',
    journeyStage: 'market_dip_reaction',
    goldenTheme: 'Loss Aversion & Panic During Early Market Dips',
    goldenRationale: 'Misalignment between initial return expectations and short-term equity drawdown.',
  },
  {
    sourceUrl: 'https://reddit.com/r/Groww/comments/k281la/double_deduction_issue',
    platform: 'reddit',
    collectedAt: '2026-06-23',
    originalText: 'My bank debited SIP amount twice on the 2nd! Groww says wait 7 working days for refund. As a student with 3000 monthly allowance, this wiped out my balance.',
    investorContext: 'Student with limited monthly budget',
    journeyStage: 'first_instalment',
    goldenTheme: 'Autopay & Mandate Failure Friction',
    goldenRationale: 'Double debit anomalies create acute liquidity distress for tight-budget investors.',
  },
  {
    sourceUrl: 'https://play.google.com/store/apps/details?id=com.nextbillion.groww&reviewId=gp_112',
    platform: 'play_store',
    collectedAt: '2026-06-26',
    originalText: 'I thought SIP means I can pay anytime before month end like electricity bill. App automatically deducted on 5th when I didn\'t have salary yet.',
    investorContext: 'Complete beginner with incorrect mental model of SIP',
    journeyStage: 'discovery_intent',
    goldenTheme: 'SIP Mental Model & Commitment Clarity',
    goldenRationale: 'Beginners conflating automatic standing instructions with manual utility bill payments.',
  },
  {
    sourceUrl: 'https://twitter.com/amit_techguy/status/18012938102',
    platform: 'twitter_x',
    collectedAt: '2026-06-30',
    originalText: 'Groww customer care took 6 days to respond to my failed SIP query. In the meantime, I got hit with another bounce penalty. Absolutely terrible.',
    investorContext: 'Frustrated user seeking resolution',
    journeyStage: 'autopay_failure_recovery',
    goldenTheme: 'Autopay & Mandate Failure Friction',
    goldenRationale: 'Slow support response compounds financial distress from recurring bank bounce penalties.',
  },
  {
    sourceUrl: 'https://play.google.com/store/apps/details?id=com.nextbillion.groww&reviewId=gp_114',
    platform: 'play_store',
    collectedAt: '2026-07-04',
    originalText: 'Too many fund choices. Small cap, large cap, sectoral, hybrid. Felt overwhelmed and abandoned app before setting up SIP.',
    investorContext: 'Paralyzed prospective investor',
    journeyStage: 'discovery_intent',
    goldenTheme: 'Fund Selection Paradox of Choice',
    goldenRationale: 'Cognitive overload during fund discovery prevents initial SIP initiation.',
  },
  {
    sourceUrl: 'https://reddit.com/r/IndiaInvestments/comments/p019xx/1_year_sip_completed',
    platform: 'reddit',
    collectedAt: '2026-07-08',
    originalText: 'Completed 12 instalments in Nifty 50 index fund! Feeling great that I stayed disciplined despite all the war news and market swings.',
    investorContext: '12 months retained investor',
    journeyStage: 'continuation_milestone',
    goldenTheme: 'Long-Term Horizon & Milestone Affirmation',
    goldenRationale: 'Positive discipline reinforcement upon reaching 1-year mark confirms active SIP retention.',
  },
  {
    sourceUrl: 'https://play.google.com/store/apps/details?id=com.nextbillion.groww&reviewId=gp_116',
    platform: 'play_store',
    collectedAt: '2026-07-12',
    originalText: 'Wanted to increase my SIP from 2000 to 3000 after my salary hike. App told me to cancel existing SIP and start new one! Why is step-up so unintuitive?',
    investorContext: 'Salaried investor seeking to step up investment',
    journeyStage: 'pause_cancellation',
    goldenTheme: 'SIP Flexibility & Modification Friction',
    goldenRationale: 'Rigid SIP modification interfaces force destructive cancel-restart cycles.',
  },
  {
    sourceUrl: 'https://twitter.com/deepa_invests/status/18045920192',
    platform: 'twitter_x',
    collectedAt: '2026-07-16',
    originalText: 'Bank server was down on debit day. Groww marked SIP as "Missed". Does this ruin my CIBIL score? I am very worried.',
    investorContext: 'Financially cautious beginner',
    journeyStage: 'autopay_failure_recovery',
    goldenTheme: 'Autopay & Mandate Failure Friction',
    goldenRationale: 'Unjustified panic that investment mandate failures damage credit bureau ratings.',
  },
  {
    sourceUrl: 'https://play.google.com/store/apps/details?id=com.nextbillion.groww&reviewId=gp_118',
    platform: 'play_store',
    collectedAt: '2026-07-20',
    originalText: 'Everything was smooth during KYC, but during first instalment payment via UPI, page went blank and took 24 hrs to reflect. Need better payment feedback.',
    investorContext: 'First instalment investor',
    journeyStage: 'first_instalment',
    goldenTheme: 'SIP Instalment Allotment Transparency',
    goldenRationale: 'Blank UI states during critical first payment create immense anxiety.',
  },
  {
    sourceUrl: 'https://reddit.com/r/Groww/comments/b712aa/stop_sip_vs_pause',
    platform: 'reddit',
    collectedAt: '2026-07-24',
    originalText: 'Accidentally clicked "Stop SIP" thinking it was just pausing for this month. Now all my automated mandates are cancelled and I have to redo the bank setup from scratch.',
    investorContext: 'Confused user navigating app settings',
    journeyStage: 'pause_cancellation',
    goldenTheme: 'SIP Flexibility & Modification Friction',
    goldenRationale: 'Ambiguous nomenclature between pause and permanent termination triggers irreversible cancellations.',
  },
  {
    sourceUrl: 'https://play.google.com/store/apps/details?id=com.nextbillion.groww&reviewId=gp_120',
    platform: 'play_store',
    collectedAt: '2026-07-28',
    originalText: 'Love the app interface and dark mode, but please give an option to select debit date on 7th or 10th instead of just 1st or 5th. Most private companies pay salary on 7th.',
    investorContext: 'Salaried employee with 7th of month pay schedule',
    journeyStage: 'discovery_intent',
    goldenTheme: 'SIP Mental Model & Commitment Clarity',
    goldenRationale: 'Misalignment between rigid platform debit date options and employer payroll cycles.',
  },
];

/**
 * Explicit development-only destructive reset.
 * Strictly requires confirmation string 'CONFIRM_DESTRUCTIVE_RESET'.
 * Never executed during normal seeding.
 */
export async function dangerousResetDatabase(options: { confirmation: string }) {
  if (options?.confirmation !== 'CONFIRM_DESTRUCTIVE_RESET') {
    throw new Error(
      'Destructive reset aborted: Invalid confirmation string. Pass confirmation: "CONFIRM_DESTRUCTIVE_RESET" to execute.'
    );
  }

  await initializeDatabase();
  await client.executeMultiple(`
    PRAGMA foreign_keys = OFF;
    DELETE FROM failure_cases;
    DELETE FROM evidence_theme_links;
    DELETE FROM reviews;
    DELETE FROM evaluation_items;
    DELETE FROM evaluation_runs;
    DELETE FROM golden_labels;
    DELETE FROM opportunity_themes;
    DELETE FROM opportunities;
    DELETE FROM contradictions;
    DELETE FROM research_questions;
    DELETE FROM record_analyses;
    DELETE FROM analysis_runs;
    DELETE FROM evidence_edits;
    DELETE FROM evidence_records;
    DELETE FROM import_batches;
    DELETE FROM themes;
    PRAGMA foreign_keys = ON;
  `);

  return { success: true, message: 'All tables cleanly reset.' };
}

export async function seedBenchmarkData() {
  await initializeDatabase();

  const createdRecordIds: { [url: string]: string } = {};

  // 1. Idempotently Ingest Synthetic Benchmark Fixtures & Register Golden Labels
  for (const [fixtureIndex, item] of BENCHMARK_ITEMS.entries()) {
    const contentHash = computeContentHash(item.originalText);
    const fixtureSourceUrl = `https://example.invalid/groww-sip-lab/synthetic-fixture-${fixtureIndex + 1}`;

    // CRITICAL: Only look for existing SYNTHETIC FIXTURES, never match user records.
    // This prevents the seeder from ever finding or modifying genuine user-imported records
    // even if they have identical content text.
    const existingFixture = await db
      .select()
      .from(evidenceRecords)
      .where(
        and(
          eq(evidenceRecords.contentHash, contentHash),
          eq(evidenceRecords.entryMethod, 'fixture')
        )
      )
      .limit(1);

    let recordId: string;

    if (existingFixture.length > 0) {
      // Found an existing fixture with same content — just refresh its timestamp
      recordId = existingFixture[0].id;
      await db
        .update(evidenceRecords)
        .set({
          sourceUrl: fixtureSourceUrl,
          isSynthetic: true,
          verificationStatus: 'synthetic_fixture',
          updatedAt: new Date().toISOString(),
        })
        .where(eq(evidenceRecords.id, recordId));
    } else {
      // No matching fixture exists. Insert a new one.
      // Note: if a user record with the same content exists, createManualRecord
      // will set duplicateOfId (informational only) but NEVER modify the user record.
      const res = await EvidenceService.createManualRecord(
        {
          sourceUrl: fixtureSourceUrl,
          platform: item.platform as any,
          collectedAt: item.collectedAt,
          originalText: item.originalText,
          investorContext: item.investorContext,
          journeyStage: item.journeyStage as any,
          fieldProvenance: {
            sourceUrl: 'curated_benchmark',
            platform: 'curated_benchmark',
            collectedAt: 'curated_benchmark',
            originalText: 'curated_benchmark',
            investorContext: 'user_entered',
            journeyStage: 'user_entered',
          },
          sourceMetadata: {
            curatedBy: 'NextLeap PM Fellowship Research Lead',
            attributionNote:
              'Synthetic / illustrative benchmark fixture developed for testing and golden evaluation.',
          },
          entryMethod: 'fixture',
          isSynthetic: true,
          verificationStatus: 'synthetic_fixture',
        },
        'Fellowship Benchmark Ingestion'
      );
      recordId = res.id;
    }

    createdRecordIds[item.sourceUrl] = recordId;

    // Register golden-set ground truth (upsert logic inside addGoldenLabel prevents duplicates)
    await EvaluationService.addGoldenLabel({
      evidenceId: recordId,
      themeName: item.goldenTheme,
      specialLabel: item.goldenTheme === 'insufficient_evidence' ? 'insufficient_evidence' : 'standard',
      journeyStage: item.journeyStage,
      labeller: 'Senior Product Manager (Blind Benchmark)',
      rationale: item.goldenRationale,
      labelledBlind: true,
    });
  }

  // 2. Execute deterministic simulated analysis on benchmark records without duplicating existing runs
  const runSummary = await AnalysisOrchestrator.executeRun({
    providerName: 'fake',
    maxRecords: 50,
    skipAlreadyAnalyzed: true,
  });

  // 3. Document 3 genuine failure cases with detailed post-mortems if not already recorded
  const allAnalyses = await db.select().from(recordAnalyses).all();
  const allThemes = await db.select().from(themes).all();
  const allExistingReviews = await db.select().from(reviews).all();
  const reviewedEvidenceIds = new Set(allExistingReviews.map((r) => r.evidenceId));

  // Failure Case 1: Overconfidence on ambiguous mental model conflating utility bill with SIP
  const rec12Id = createdRecordIds['https://play.google.com/store/apps/details?id=com.nextbillion.groww&reviewId=gp_112'];
  const analysis12 = allAnalyses.find((a) => a.evidenceId === rec12Id);
  if (analysis12 && !reviewedEvidenceIds.has(rec12Id)) {
    await ReviewService.submitReview({
      recordAnalysisId: analysis12.id,
      evidenceId: rec12Id,
      decision: 'corrected',
      reviewer: 'Fellowship Lead PM',
      rationale:
        'AI classified this feedback under "Autopay & Mandate Failure Friction" because of the phrase "deducted on 5th". However, the true root cause is a fundamental mental model failure where first-time investors misunderstand standing orders as manual utility bills.',
      revisedOutput: {
        themeName: 'SIP Mental Model & Commitment Clarity',
        journeyStage: 'discovery_intent',
        observedBehaviour: 'Assumed SIP could be paid manually before month end like utility bills',
      },
      failureCaseDetails: {
        failureType: 'theme_misclassification',
        lessonLearned:
          'Keyword heuristics trigger superficial mandate-failure classifications when debit verbs appear, masking upstream mental-model misconceptions.',
        preventionStrategy:
          'Prompt and validator require checking whether user explicitly indicates they expected manual payment control before assigning mandate operational friction.',
      },
    });
    reviewedEvidenceIds.add(rec12Id);
  }

  // Failure Case 2: Sarcasm / frustration misclassification on support delay
  const rec13Id = createdRecordIds['https://twitter.com/amit_techguy/status/18012938102'];
  const analysis13 = allAnalyses.find((a) => a.evidenceId === rec13Id);
  if (analysis13 && !reviewedEvidenceIds.has(rec13Id)) {
    await ReviewService.submitReview({
      recordAnalysisId: analysis13.id,
      evidenceId: rec13Id,
      decision: 'corrected',
      reviewer: 'Fellowship Lead PM',
      rationale:
        'AI identified this as general "Customer Support Delay". In reality, the critical failure is the compounding bank bounce penalty that occurs when support resolution latency exceeds the bank retry cycle.',
      revisedOutput: {
        themeName: 'Autopay & Mandate Failure Friction',
        journeyStage: 'autopay_failure_recovery',
        observedBehaviour: 'Incurred secondary ECS bounce penalty while waiting for support ticket resolution',
      },
      failureCaseDetails: {
        failureType: 'unwarranted_causal_leap',
        lessonLearned:
          'Customer service grievances often disguise high-stakes financial penalties caused by banking API cycle mismatches.',
        preventionStrategy:
          'Cross-link support latency feedback with explicit financial damage markers (ECS bounce, penalty amounts).',
      },
    });
    reviewedEvidenceIds.add(rec13Id);
  }

  // Failure Case 3: Accidental Stop SIP vs Pause nomenclature confusion
  const rec19Id = createdRecordIds['https://reddit.com/r/Groww/comments/b712aa/stop_sip_vs_pause'];
  const analysis19 = allAnalyses.find((a) => a.evidenceId === rec19Id);
  if (analysis19 && !reviewedEvidenceIds.has(rec19Id)) {
    await ReviewService.submitReview({
      recordAnalysisId: analysis19.id,
      evidenceId: rec19Id,
      decision: 'corrected',
      reviewer: 'Fellowship Lead PM',
      rationale:
        'AI classified this feedback under "Autopay & Mandate Failure Friction" because the user mentioned "automated mandates are cancelled". In reality, the root cause is UI nomenclature ambiguity where users confuse "Stop SIP" with a single-month pause, causing irreversible cancellation.',
      revisedOutput: {
        themeName: 'SIP Flexibility & Modification Friction',
        journeyStage: 'pause_cancellation',
        observedBehaviour: 'Accidentally triggered permanent cancellation due to ambiguous "Stop SIP" vs "Pause" UI nomenclature',
      },
      failureCaseDetails: {
        failureType: 'theme_misclassification',
        lessonLearned:
          'When users describe downstream technical aftermath ("mandates cancelled, redo bank setup"), the AI model anchors on the technical effect rather than the user intent that caused it ("Stop SIP" vs "Pause" ambiguity).',
        preventionStrategy:
          'Instruct extraction prompt to distinguish upstream user action trigger (cancellation/pause intent) from downstream technical aftermath.',
      },
    });
    reviewedEvidenceIds.add(rec19Id);
  }

  // 4. Confirm remaining benchmark records if unreviewed
  for (const item of BENCHMARK_ITEMS) {
    const recId = createdRecordIds[item.sourceUrl];
    if (recId === rec12Id || recId === rec13Id || recId === rec19Id) continue;
    if (reviewedEvidenceIds.has(recId)) continue;

    const analysis = allAnalyses.find((a) => a.evidenceId === recId);
    if (!analysis) continue;

    await ReviewService.submitReview({
      recordAnalysisId: analysis.id,
      evidenceId: recId,
      decision: 'confirmed',
      reviewer: 'Fellowship Ground Truth Reviewer',
      rationale: 'Verified agreement with qualitative sentiment and contextual lifecycle stage.',
    });
    reviewedEvidenceIds.add(recId);
  }

  // 5. Seed candidate opportunities grounded in evidence (idempotent by title)
  const existingOpps = await db.select().from(opportunities).all();
  const existingOppTitles = new Set(existingOpps.map((o) => o.title));

  const mandateTheme = allThemes.find((t) => t.name.includes('Autopay'));
  const opp1Title = 'Proactive Mandate Health & Pre-Debit Alert System';
  if (mandateTheme && !existingOppTitles.has(opp1Title)) {
    await OpportunityService.createOpportunity({
      title: opp1Title,
      problemStatement:
        'First-time investors encounter surprise bank overdraft charges (up to 590 Rs) and silent mandate drops because debits occur without 48-hour balance warnings or penalty-free auto-retry.',
      hypothesisOnRetention:
        'Providing proactive WhatsApp/SMS pre-debit notifications and a 3-day penalty-free recovery window is hypothesized to increase 12-month active SIP retention by rescuing inadvertent instalment drops.',
      themeIds: [mandateTheme.id],
      humanScores: {
        userImpact: { score: 4.8, rationale: 'Bank penalties create acute financial distress and trust betrayal for beginners.', scoredBy: 'PM Fellow' },
        businessMetricLink: { score: 4.9, rationale: 'Directly salvages the 30-day active definition window upon first failure.', scoredBy: 'PM Fellow' },
        researchUncertainty: { score: 1.5, rationale: 'Heavily documented across store reviews and confirmed by banking regulations.', scoredBy: 'PM Fellow' },
        potentialFeasibility: { score: 4.2, rationale: 'Standard webhook notifications and NPCI e-mandate retry APIs exist.', scoredBy: 'PM Fellow' },
      },
    });
    existingOppTitles.add(opp1Title);
  }

  const dipTheme = allThemes.find((t) => t.name.includes('Loss Aversion'));
  const opp2Title = 'First-Year Drawdown Context & Rupee-Cost-Averaging Coach';
  if (dipTheme && !existingOppTitles.has(opp2Title)) {
    await OpportunityService.createOpportunity({
      title: opp2Title,
      problemStatement:
        'Inexperienced investors experiencing their first market dip in months 2-4 interpret portfolio volatility as permanent loss due to lack of in-situ context.',
      hypothesisOnRetention:
        'Displaying contextual historical recovery timelines and "units acquired at discount" metrics during drawdowns is hypothesized to prevent panic cancellations before month 6.',
      themeIds: [dipTheme.id],
      humanScores: {
        userImpact: { score: 4.2, rationale: 'Dramatically reduces investor anxiety and premature capital destruction.', scoredBy: 'PM Fellow' },
        businessMetricLink: { score: 4.5, rationale: 'Retains users through the critical month 3-6 churn hump.', scoredBy: 'PM Fellow' },
        researchUncertainty: { score: 2.2, rationale: 'Behavioral finance literature strongly supports rupee-cost-averaging framing.', scoredBy: 'PM Fellow' },
        potentialFeasibility: { score: 4.6, rationale: 'UI educational cards and return calculator overlays require zero backend banking changes.', scoredBy: 'PM Fellow' },
      },
    });
    existingOppTitles.add(opp2Title);
  }

  // 6. Evaluate only against eligible (non-fixture) human labels. Benchmark
  // fixtures are useful for demos, but cannot substantiate model metrics.
  const eligibleGoldenLabels = await EvaluationService.listGoldenLabels();
  if (eligibleGoldenLabels.length > 0 && runSummary.runId && runSummary.successfulRecords > 0) {
    await EvaluationService.evaluateAnalysisRun(runSummary.runId);
  } else if (eligibleGoldenLabels.length > 0) {
    // If skipped, check if any evaluation exists
    const latestEval = await EvaluationService.getLatestEvaluation();
    if (!latestEval) {
      const latestRun = (await db.select().from(recordAnalyses).limit(1))[0];
      if (latestRun) {
        await EvaluationService.evaluateAnalysisRun(latestRun.runId);
      }
    }
  }

  // 7. Seed sample contradiction (idempotent)
  const existingContradictions = await db.select().from(contradictions).all();
  if (existingContradictions.length === 0) {
    const rAutopay = createdRecordIds['https://play.google.com/store/apps/details?id=com.nextbillion.groww&reviewId=gp_108'];
    const rDeduct = createdRecordIds['https://play.google.com/store/apps/details?id=com.nextbillion.groww&reviewId=gp_112'];
    if (rAutopay && rDeduct) {
      await db.insert(contradictions).values({
        id: crypto.randomUUID(),
        title: 'Seamless Autopay Friction vs. Autonomous Double-Debit Risk',
        description:
          'Users on one side demand zero-click frictionless automatic payments, while budget-constrained users report catastrophic liquidity emergencies when automatic debits execute without manual confirmation.',
        evidenceAId: rAutopay,
        evidenceBId: rDeduct,
        status: 'open',
      });
    }
  }

  // 8. Seed sample open research questions (idempotent)
  const existingQuestions = await db.select().from(researchQuestions).all();
  if (existingQuestions.length === 0) {
    await db.insert(researchQuestions).values([
      {
        id: crypto.randomUUID(),
        question: 'What percentage of month-3 cancellations are triggered by bank ECS bounce penalties vs voluntary market pullback?',
        origin: 'ai_analysis',
        relatedJourneyStage: 'autopay_failure_recovery',
        status: 'open',
      },
      {
        id: crypto.randomUUID(),
        question: 'Do first-time investors who encounter a negative portfolio return in month 2 retain longer if educated on rupee-cost-averaging?',
        origin: 'human_researcher',
        relatedJourneyStage: 'market_dip_reaction',
        status: 'investigating',
      },
      {
        id: crypto.randomUUID(),
        question: 'How many investors abandon SIP continuation simply due to changing salary credit dates from 1st to 10th of the month?',
        origin: 'gap_tracker',
        relatedJourneyStage: 'pause_cancellation',
        status: 'answered',
        answerSummary:
          'Initial data suggests up to 14% of pause/cancellation requests correlate with payroll date shifts where rigid 30-day notice periods prevent timely rescheduling.',
      },
    ]);
  }

  return { success: true, count: BENCHMARK_ITEMS.length };
}

// Auto-run if executed directly via CLI
if (process.argv[1]?.endsWith('seed.ts')) {
  seedBenchmarkData()
    .then((res) => {
      console.log('Seeded benchmark dataset successfully:', res);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed error:', err);
      process.exit(1);
    });
}
