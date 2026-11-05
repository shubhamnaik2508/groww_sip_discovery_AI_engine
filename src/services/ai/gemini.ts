import { GoogleGenAI } from '@google/genai';
import {
  AIProvider,
  AnalysisInputRecord,
  KnownThemePromptItem,
  AIAnalysisResult,
  AIProviderError,
} from './provider';
import {
  StructuredAnalysisOutput,
  StructuredAnalysisOutputSchema,
  validateOutputGuards,
} from './schema';

export class GeminiProvider implements AIProvider {
  readonly providerName = 'gemini';
  readonly modelName: string;
  readonly modelVersion = '3.8-flash';
  readonly promptVersion = '2026-11-investor-intelligence-v4';
  readonly schemaVersion = '2.2.0';

  private client: GoogleGenAI | null = null;

  constructor(modelName?: string) {
    this.modelName = modelName || process.env.GEMINI_MODEL || 'gemini-3.8-flash';
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (apiKey) {
      this.client = new GoogleGenAI({ apiKey });
    }
  }

  async analyzeRecord(
    record: AnalysisInputRecord,
    knownThemes: KnownThemePromptItem[]
  ): Promise<AIAnalysisResult> {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new AIProviderError(
        'Missing Gemini API Key. Please configure GEMINI_API_KEY in .env.local to run live AI analysis.',
        'MISSING_API_KEY',
        false
      );
    }

    if (!this.client) {
      this.client = new GoogleGenAI({ apiKey });
    }

    const startTime = Date.now();

    const knownThemesText =
      knownThemes.length > 0
        ? knownThemes
            .map(
              (t) =>
                `- "${t.name}" (Stage: ${t.journeyStage}): ${t.description}`
            )
            .join('\n')
        : 'None registered yet. Propose new themes as appropriate.';

    const systemPrompt = `You are the lead Discovery Research Analyst for the Groww SIP Intelligence Lab (NextLeap PM Fellowship Graduation Project).
Your business objective is discovering why first-time mutual fund investors stop or continue their systematic investment plans (SIPs) 12 months after initiation.

CRITICAL DISCOVERY RULES:
1. EVIDENCE FIRST: Base observations strictly on what the user explicitly stated. Never invent context or motives.
2. VERBATIM EXCERPT: The "evidenceExcerpt" field MUST be an EXACT verbatim substring copied character-for-character from the original text.
3. INVESTOR CONTEXT: Only populate "investorContext" if the text explicitly states it (e.g. "I am a first time investor", "started my first SIP 2 months ago"). If unstated, set to null.
4. CLAIMS SEPARATION: Clearly categorize every claim as either "observation" (directly reported in text) or "inference" (logical analytical deduction).
5. HYPOTHESIS, NOT FACT: Relationships to 12-month active SIP continuation MUST be formulated as testable hypotheses with label="HYPOTHESIS". Do not assert unproven causality.
6. ABSTENTION: If the text is off-topic, spam, or too vague to derive insight, abstain with a clear reason.
7. THEMES: If the feedback matches an existing theme, use it. If it reveals a novel friction pattern, propose a new theme name and set isNewProposal=true.
8. CLASSIFICATION: Select one primary researchDimension from the nine dimensions: sip_starting_motivation, behavioural_evolution, pause_reduction_discontinuation, checking_monitoring, in_app_confusion_anxiety, external_workarounds, continuer_vs_dropoff, investor_segmentation, unmet_needs, insufficient_evidence. Use insufficient_evidence when the source supports no defensible dimension.
9. SEGMENTS: Populate explicitlyStatedSegment only with segment facts directly stated in the source. Keep unstated values null; never infer demographics or financial circumstances. For every non-null age, income, investment-source or influence value, supply an exact verbatim segmentEvidence quote. Leave values null if no quote supports them. SIP status must be explicit; a failed debit alone is not a drop-off.
10. BEHAVIOUR: Separate statedMotivation, triggerOrContext, emotionalSignal, existingWorkaround and potentialUnmetNeed. Use null when absent. Preserve distinctions between a failed instalment, a pause, and stopping a SIP; use unknown when continuation status is not stated.
11. COVERAGE: Record missingInformation as specific unanswered details and relevantTextSpan as an exact source substring. Include multiple claims only when each is grounded.
12. TIMELINE: Use journeyPeriod only when the source explicitly supports the window. Require journeyPeriodEvidence to be an exact quote; otherwise return "unspecified". Do not derive elapsed months from the collection date.
13. MONITORING: Use checkingFrequency only when the source explicitly states how often the investor checks. Require an exact checkingFrequencyEvidence quote; otherwise use "not_specified". Do not infer frequency from sentiment or app-review timing.
14. QUESTION COVERAGE: Populate statedExpectation, cashFlowConflict, paymentTransactionIssue, confidenceConcern, continuationStatusReason, existingWorkaround and potentialUnmetNeed only when the source actually supports them. For each populated field return its matching exact source quote in the corresponding *Evidence field. Leave unsupported fields null. A question, hypothetical or general opinion is not a personal incident.

Existing Known Themes:
${knownThemesText}

Return valid JSON conforming to this schema:
{
  "researchDimension": "sip_starting_motivation" | "behavioural_evolution" | "pause_reduction_discontinuation" | "checking_monitoring" | "in_app_confusion_anxiety" | "external_workarounds" | "continuer_vs_dropoff" | "investor_segmentation" | "unmet_needs" | "insufficient_evidence",
  "statedMotivation": "string | null", "motivationEvidence": "exact quote | null", "statedExpectation": "string | null", "expectationEvidence": "exact quote | null", "cashFlowConflict": "string | null", "cashFlowEvidence": "exact quote | null", "paymentTransactionIssue": "string | null", "paymentIssueEvidence": "exact quote | null", "confidenceConcern": "string | null", "confidenceEvidence": "exact quote | null", "continuationStatusReason": "string | null", "continuationEvidence": "exact quote | null", "triggerOrContext": "string | null", "emotionalSignal": "string | null", "existingWorkaround": "string | null", "workaroundEvidence": "exact quote | null", "potentialUnmetNeed": "string | null", "unmetNeedEvidence": "exact quote | null", "relevantTextSpan": "exact substring", "missingInformation": ["string"],
  "explicitlyStatedSegment": { "ageBand": "string | null", "incomeStability": "string | null", "investmentSource": "string | null", "startingInfluence": "string | null", "sipStatus": "continuer" | "paused" | "reduced" | "cancelled" | "failed_instalment" | "temporarily_inactive" | "unknown" },
  "segmentEvidence": { "ageBand": "exact source quote | null", "incomeStability": "exact source quote | null", "investmentSource": "exact source quote | null", "startingInfluence": "exact source quote | null", "sipStatus": "exact source quote | null" },
  "theme": { "name": "string", "isNewProposal": boolean, "subtheme": "string | null" } | null,
  "abstainReason": "string | null",
  "journeyStage": "discovery_intent" | "mandate_kyc_setup" | "first_instalment" | "market_dip_reaction" | "autopay_failure_recovery" | "continuation_milestone" | "pause_cancellation" | "unclear",
  "journeyPeriod": "before_start" | "registration" | "first_instalment" | "months_2_3" | "months_4_6" | "months_7_11" | "month_12" | "unspecified",
  "journeyPeriodEvidence": "exact supporting source quote | null",
  "checkingFrequency": "multiple_daily" | "daily" | "weekly" | "monthly" | "after_notifications" | "rarely" | "not_specified",
  "checkingFrequencyEvidence": "exact supporting source quote | null",
  "observedBehaviour": "string",
  "investorContext": { "status": "string", "supportingQuote": "string" } | null,
  "statedFriction": { "type": "concern" | "unmet_need" | "workaround" | "confusion" | "frustration", "description": "string", "supportingQuote": "string" } | null,
  "evidenceExcerpt": "string (MUST BE VERBATIM SUBSTRING)",
  "claims": [ { "text": "string", "type": "observation" | "inference", "groundingExcerpt": "string" } ],
  "uncertaintyAnalysis": "string",
  "sipContinuationHypothesis": { "hypothesisText": "string", "label": "HYPOTHESIS", "plausibleMechanism": "string" } | null,
  "followUpResearchQuestion": "string",
  "selfReportedConfidence": "low" | "medium" | "high"
}`;

    const userPrompt = `Analyze this investor feedback:
Source URL: ${record.sourceUrl}
Platform: ${record.platform}
Collection Date: ${record.collectedAt}
Investor Context (Recorded): ${record.investorContext || 'None stated'}
Journey Stage (Recorded): ${record.journeyStage || 'unclear'}
Original Verbatim Feedback:
"""
${record.originalText}
"""`;

    let rawOutput = '';
    let retryCount = 0;
    const maxRetries = 2;

    while (retryCount <= maxRetries) {
      try {
        const response = await this.client.interactions.create({
          model: this.modelName,
          input: `${systemPrompt}\n\n${userPrompt}`,
          response_format: {
            type: 'text',
            mime_type: 'application/json',
          },
        });

        rawOutput = response.output_text || '';
        break;
      } catch (err: unknown) {
        const error = err && typeof err === 'object' ? err as { status?: number; statusCode?: number; message?: string } : {};
        const status = error.status || error.statusCode;
        const msg = error.message || String(err);

        // Check for 429 rate limit
        if (status === 429 || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
          retryCount++;
          if (retryCount <= maxRetries) {
            // Exponential backoff
            const delay = Math.pow(2, retryCount) * 1000;
            await new Promise((res) => setTimeout(res, delay));
            continue;
          }
          throw new AIProviderError(
            `Gemini rate limit exceeded (429): ${msg}. Consider testing with FakeProvider or waiting a few moments.`,
            'RATE_LIMIT_429',
            true
          );
        }

        // Check for network timeout
        if (msg.includes('ETIMEDOUT') || msg.includes('timeout')) {
          throw new AIProviderError(`Gemini request timed out: ${msg}`, 'TIMEOUT', true);
        }

        throw new AIProviderError(
          `Gemini API execution error: ${msg}`,
          'PROVIDER_UNAVAILABLE',
          false
        );
      }
    }

    const latencyMs = Date.now() - startTime;

    // Parse and validate with Zod
    let parsedJson: unknown;
    try {
      // Clean potential markdown backticks if model wrapped JSON
      const cleaned = rawOutput.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
      parsedJson = JSON.parse(cleaned);
    } catch (parseError: unknown) {
      const message = parseError instanceof Error ? parseError.message : String(parseError);
      return {
        provider: this.providerName,
        model: this.modelName,
        modelVersion: this.modelVersion,
        promptVersion: this.promptVersion,
        schemaVersion: this.schemaVersion,
        rawOutput,
        validationStatus: 'invalid',
        validationErrors: [`Malformed JSON output from model: ${message}`],
        errorType: 'MALFORMED_OUTPUT',
        latencyMs,
      };
    }

    const zodResult = StructuredAnalysisOutputSchema.safeParse(parsedJson);
    if (!zodResult.success) {
      const validationErrors = zodResult.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`
      );
      return {
        provider: this.providerName,
        model: this.modelName,
        modelVersion: this.modelVersion,
        promptVersion: this.promptVersion,
        schemaVersion: this.schemaVersion,
        rawOutput,
        parsedOutput: parsedJson as StructuredAnalysisOutput,
        validationStatus: 'invalid',
        validationErrors,
        errorType: 'SCHEMA_VALIDATION_ERROR',
        latencyMs,
      };
    }

    const structuredData = zodResult.data;

    // Execute hallucination and safety guards
    const guardResult = validateOutputGuards(record.originalText, structuredData);

    return {
      provider: this.providerName,
      model: this.modelName,
      modelVersion: this.modelVersion,
      promptVersion: this.promptVersion,
      schemaVersion: this.schemaVersion,
      rawOutput,
      parsedOutput: structuredData,
      validationStatus: guardResult.isValid ? 'valid' : 'guard_failed',
      validationErrors: guardResult.guardErrors,
      errorType: guardResult.isValid ? undefined : 'GUARD_VIOLATION',
      latencyMs,
    };
  }
}
