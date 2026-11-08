import { z } from 'zod';
import { JourneyStageSchema } from '@/lib/types';
import { RESEARCH_CODES, LIFEFLOW_SIGNALS } from '@/lib/research/codebook';

/**
 * Normalises text for verbatim-quote matching: case, whitespace, typographic quotes
 * and dashes. Leading/trailing quote marks and ellipses on a quote are ignored.
 */
export function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeQuote(value: string): string {
  // Strip wrapping quote marks and leading/trailing ellipses the model may add.
  return normalizeForMatch(value)
    .replace(/^(?:["'\s]|\.\.\.)+/, '')
    .replace(/(?:["'\s]|\.\.\.)+$/, '')
    .trim();
}

export function isVerbatim(originalText: string, quote: string | null | undefined): boolean {
  if (!quote) return false;
  const q = normalizeQuote(quote);
  return q.length >= 3 && normalizeForMatch(originalText).includes(q);
}

export const CodedQuoteSchema = z.object({
  code: z.enum(RESEARCH_CODES),
  evidenceQuote: z.string().min(3),
});
export const SignalQuoteSchema = z.object({
  signal: z.enum(LIFEFLOW_SIGNALS),
  evidenceQuote: z.string().min(3),
});

export const ResearchDimensionSchema = z.enum([
  'sip_starting_motivation',
  'behavioural_evolution',
  'pause_reduction_discontinuation',
  'checking_monitoring',
  'in_app_confusion_anxiety',
  'external_workarounds',
  'continuer_vs_dropoff',
  'investor_segmentation',
  'unmet_needs',
  'insufficient_evidence',
]);

export const JourneyPeriodSchema = z.enum([
  'before_start', 'registration', 'first_instalment', 'months_2_3', 'months_4_6', 'months_7_11', 'month_12', 'unspecified',
]);
export const CheckingFrequencySchema = z.enum(['multiple_daily', 'daily', 'weekly', 'monthly', 'after_notifications', 'rarely', 'not_specified']);

export const ClaimItemSchema = z.object({
  text: z.string().min(1, 'Claim text cannot be empty'),
  type: z.enum(['observation', 'inference']),
  groundingExcerpt: z.string().optional().describe('Direct quote supporting this observation or inference'),
});

export const StructuredAnalysisOutputSchema = z.object({
  // Optional to preserve parsing of immutable analyses created by earlier schema versions.
  researchDimension: ResearchDimensionSchema.optional(),
  statedMotivation: z.string().nullable().optional(),
  motivationEvidence: z.string().nullable().optional().describe('Exact quote supporting a stated starting motivation.'),
  statedExpectation: z.string().nullable().optional(),
  expectationEvidence: z.string().nullable().optional().describe('Exact quote supporting an expectation held when starting the SIP.'),
  cashFlowConflict: z.string().nullable().optional(),
  cashFlowEvidence: z.string().nullable().optional().describe('Exact quote supporting a salary, expense or cash-flow conflict.'),
  paymentTransactionIssue: z.string().nullable().optional(),
  paymentIssueEvidence: z.string().nullable().optional().describe('Exact quote supporting a payment, mandate or transaction issue.'),
  confidenceConcern: z.string().nullable().optional(),
  confidenceEvidence: z.string().nullable().optional().describe('Exact quote supporting uncertainty or lack of confidence.'),
  continuationStatusReason: z.string().nullable().optional(),
  continuationEvidence: z.string().nullable().optional().describe('Exact quote supporting a reported continuation, reduction, pause or stop and its reason.'),
  triggerOrContext: z.string().nullable().optional(),
  emotionalSignal: z.string().nullable().optional(),
  existingWorkaround: z.string().nullable().optional(),
  workaroundEvidence: z.string().nullable().optional().describe('Exact quote supporting an explicitly stated external workaround.'),
  potentialUnmetNeed: z.string().nullable().optional(),
  unmetNeedEvidence: z.string().nullable().optional().describe('Exact quote supporting the stated unmet need.'),
  relevantTextSpan: z.string().optional(),
  missingInformation: z.array(z.string()).optional(),
  explicitlyStatedSegment: z.object({
    ageBand: z.string().nullable().optional(),
    incomeStability: z.string().nullable().optional(),
    investmentSource: z.string().nullable().optional(),
    startingInfluence: z.string().nullable().optional(),
    sipStatus: z.enum(['continuer', 'paused', 'reduced', 'cancelled', 'failed_instalment', 'temporarily_inactive', 'unknown']).optional(),
  }).optional(),
  segmentEvidence: z.object({
    ageBand: z.string().nullable().optional(),
    incomeStability: z.string().nullable().optional(),
    investmentSource: z.string().nullable().optional(),
    startingInfluence: z.string().nullable().optional(),
    sipStatus: z.string().nullable().optional(),
  }).optional().describe('Verbatim quote supporting each non-null explicitly stated demographic or financial segment value.'),
  theme: z.object({
    name: z.string().min(1, 'Theme name is required'),
    isNewProposal: z.boolean().default(false).describe('True if this feedback does not fit any existing theme'),
    subtheme: z.string().optional().nullable(),
  }).nullable().describe('Primary discovered theme or null if abstaining'),

  abstainReason: z.string().optional().nullable().describe('Reason for abstention if insufficient evidence or off-topic'),

  journeyStage: JourneyStageSchema.describe('Journey stage where this friction or behaviour occurred'),
  journeyPeriod: JourneyPeriodSchema.optional(),
  journeyPeriodEvidence: z.string().nullable().optional().describe('Verbatim quote supporting an explicit timing or tenure period.'),
  checkingFrequency: CheckingFrequencySchema.optional(),
  checkingFrequencyEvidence: z.string().nullable().optional().describe('Verbatim quote supporting an explicit monitoring frequency.'),

  observedBehaviour: z.string().min(3, 'Observed behaviour is required').describe('Specific behaviour explicitly reported in the feedback'),

  investorContext: z.object({
    status: z.string().describe('e.g., First-time investor, 6 months in SIP, student, salaried'),
    supportingQuote: z.string().describe('Exact quote from feedback verifying investor status'),
  }).optional().nullable().describe('Only provide if explicitly verified in source text. Null otherwise.'),

  statedFriction: z.object({
    type: z.enum(['concern', 'unmet_need', 'workaround', 'confusion', 'frustration']),
    description: z.string().min(3),
    supportingQuote: z.string().optional(),
  }).optional().nullable(),

  evidenceExcerpt: z.string().min(3, 'Supporting verbatim excerpt is required').describe('Direct verbatim substring from original feedback'),

  claims: z.array(ClaimItemSchema).min(1, 'At least one categorized claim (observation or inference) is required'),

  uncertaintyAnalysis: z.string().min(3, 'Uncertainty and limitations explanation is required'),

  sipContinuationHypothesis: z.object({
    hypothesisText: z.string().min(5),
    label: z.literal('HYPOTHESIS').default('HYPOTHESIS'),
    plausibleMechanism: z.string().min(5).describe('Plausible mechanism connecting this friction to 12-month active SIP continuation'),
  }).optional().nullable().describe('Clearly labelled hypothesis, NOT a causal fact'),

  followUpResearchQuestion: z.string().min(5, 'Actionable follow-up research question is required'),

  selfReportedConfidence: z.enum(['low', 'medium', 'high']).describe('Self-reported model confidence (unvalidated)'),

  // Prompt v5+: shared-codebook coding used for research triangulation.
  isFirstPersonExperience: z.boolean().optional().describe('True when the author describes their own SIP experience rather than giving general advice/news.'),
  triangulationCodes: z.array(CodedQuoteSchema).optional(),
  lifeflowSignals: z.array(SignalQuoteSchema).optional(),
});

export type StructuredAnalysisOutput = z.infer<typeof StructuredAnalysisOutputSchema>;

export interface GuardValidationResult {
  isValid: boolean;
  guardErrors: string[];
}

/**
 * Enforces safety and anti-hallucination guards on model output:
 * 1. Verbatim excerpt check: evidenceExcerpt MUST be a substring of originalText.
 * 2. Investor context quote check: supportingQuote MUST be a substring of originalText.
 * 3. Hypothesis label check: Any continuation relationship MUST carry the 'HYPOTHESIS' label.
 */
export function validateOutputGuards(
  originalText: string,
  output: StructuredAnalysisOutput
): GuardValidationResult {
  const errors: string[] = [];
  const normalizedOriginal = normalizeForMatch(originalText);

  // 1. Excerpt guard
  if (output.evidenceExcerpt) {
    const normalizedExcerpt = normalizeQuote(output.evidenceExcerpt);
    if (!normalizedOriginal.includes(normalizedExcerpt)) {
      errors.push(
        `Guard Violation [Excerpt Mismatch]: The cited excerpt "${output.evidenceExcerpt}" is not a verbatim substring of the original evidence.`
      );
    }
  }

  // 2. Investor context quote guard
  if (output.investorContext && output.investorContext.supportingQuote) {
    const normalizedQuote = normalizeQuote(output.investorContext.supportingQuote);
    if (!normalizedOriginal.includes(normalizedQuote)) {
      errors.push(
        `Guard Violation [Hallucinated Context]: The claimed investor context quote "${output.investorContext.supportingQuote}" cannot be found in the source text.`
      );
    }
  }

  if (output.relevantTextSpan) {
    const normalizedSpan = normalizeQuote(output.relevantTextSpan);
    if (!normalizedOriginal.includes(normalizedSpan)) errors.push('Guard Violation [Relevant Span Mismatch]: relevantTextSpan is not a source substring.');
  }
  if (output.journeyPeriod && output.journeyPeriod !== 'unspecified') {
    const periodQuote = (output.journeyPeriodEvidence ? normalizeQuote(output.journeyPeriodEvidence) : undefined);
    if (!periodQuote || !normalizedOriginal.includes(periodQuote)) errors.push('Guard Violation [Unsupported Journey Period]: specific journeyPeriod requires an exact source quote.');
  }
  if (output.checkingFrequency && output.checkingFrequency !== 'not_specified') {
    const frequencyQuote = (output.checkingFrequencyEvidence ? normalizeQuote(output.checkingFrequencyEvidence) : undefined);
    if (!frequencyQuote || !normalizedOriginal.includes(frequencyQuote)) errors.push('Guard Violation [Unsupported Checking Frequency]: a stated frequency requires an exact source quote.');
  }

  for (const [key, value] of Object.entries(output.explicitlyStatedSegment ?? {})) {
    if (!value || value === 'unknown') continue;
    const quote = output.segmentEvidence?.[key as 'ageBand' | 'incomeStability' | 'investmentSource' | 'startingInfluence' | 'sipStatus'];
    const normalizedQuote = (quote ? normalizeQuote(quote) : undefined);
    if (!normalizedQuote || !normalizedOriginal.includes(normalizedQuote)) {
      errors.push(`Guard Violation [Unsupported Segment]: ${key} was populated without a matching verbatim segmentEvidence quote.`);
    }
  }

  for (const [index, claim] of output.claims.entries()) {
    if (claim.type !== 'observation') continue;
    const excerpt = (claim.groundingExcerpt ? normalizeQuote(claim.groundingExcerpt) : undefined);
    if (!excerpt || !normalizedOriginal.includes(excerpt)) {
      errors.push(`Guard Violation [Ungrounded Observation]: observation claim ${index + 1} has no matching source span.`);
    }
  }

  const groundedFields: Array<[string, string | null | undefined, string | null | undefined]> = [
    ['statedMotivation', output.statedMotivation, output.motivationEvidence],
    ['statedExpectation', output.statedExpectation, output.expectationEvidence],
    ['cashFlowConflict', output.cashFlowConflict, output.cashFlowEvidence],
    ['paymentTransactionIssue', output.paymentTransactionIssue, output.paymentIssueEvidence],
    ['confidenceConcern', output.confidenceConcern, output.confidenceEvidence],
    ['continuationStatusReason', output.continuationStatusReason, output.continuationEvidence],
    ['existingWorkaround', output.existingWorkaround, output.workaroundEvidence],
    ['potentialUnmetNeed', output.potentialUnmetNeed, output.unmetNeedEvidence],
  ];
  for (const [field, value, quote] of groundedFields) {
    if (!value) continue;
    const normalizedQuote = (quote ? normalizeQuote(quote) : undefined);
    if (!normalizedQuote || !normalizedOriginal.includes(normalizedQuote)) {
      errors.push(`Guard Violation [Unsupported ${field}]: a populated ${field} requires a matching verbatim evidence quote.`);
    }
  }

  // 3. Hypothesis label guard
  if (output.sipContinuationHypothesis) {
    if (output.sipContinuationHypothesis.label !== 'HYPOTHESIS') {
      errors.push(
        'Guard Violation [Unlabeled Causal Claim]: Potential relationship to SIP continuation must be explicitly labelled with label="HYPOTHESIS".'
      );
    }
  }

  return {
    isValid: errors.length === 0,
    guardErrors: errors,
  };
}

/**
 * Removes codebook codes and LifeFlow signals whose evidence quote is not verbatim
 * in the source. Ungrounded codes are dropped (and reported) rather than failing
 * the whole record, so one paraphrased quote cannot add an unsupported count.
 */
export function pruneUngroundedCoding(
  originalText: string,
  output: StructuredAnalysisOutput,
): { output: StructuredAnalysisOutput; pruned: string[] } {
  const pruned: string[] = [];
  const seenCodes = new Set<string>();
  const codes = (output.triangulationCodes ?? []).filter((c) => {
    if (!isVerbatim(originalText, c.evidenceQuote)) {
      pruned.push(`Pruned code ${c.code}: quote not found verbatim ("${c.evidenceQuote.slice(0, 80)}")`);
      return false;
    }
    if (seenCodes.has(c.code)) return false;
    seenCodes.add(c.code);
    return true;
  });
  const seenSignals = new Set<string>();
  const signals = (output.lifeflowSignals ?? []).filter((s) => {
    if (!isVerbatim(originalText, s.evidenceQuote)) {
      pruned.push(`Pruned signal ${s.signal}: quote not found verbatim ("${s.evidenceQuote.slice(0, 80)}")`);
      return false;
    }
    if (seenSignals.has(s.signal)) return false;
    seenSignals.add(s.signal);
    return true;
  });
  return { output: { ...output, triangulationCodes: codes, lifeflowSignals: signals }, pruned };
}
