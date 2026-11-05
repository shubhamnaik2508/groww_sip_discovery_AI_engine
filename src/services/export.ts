import { db, initializeDatabase } from '@/db';
import {
  evidenceRecords,
  analysisRuns,
  recordAnalyses,
  reviews,
  failureCases,
  themes,
  researchQuestions,
  contradictions,
  opportunities,
  evidenceThemeLinks,
} from '@/db/schema';
import { EvidenceService } from './evidence';
import { EvaluationService } from './evaluation';
import { ReviewService } from './review';
import { OpportunityService } from './opportunity';
import { eq, desc } from 'drizzle-orm';
import { deduplicateEligibleEvidence, isSyntheticFixture } from '@/lib/evidenceEligibility';

export interface EvidenceLogExportData {
  metadata: {
    exportDate: string;
    engineVersion: string;
    productName: string;
    businessObjective: string;
    disclaimer: string;
  };
  summary: {
    totalEvidenceRecords: number;
    eligibleNonFixtureRecordsCount: number;
    /** @deprecated Compatibility alias; counts research-eligible records under provenance rules. */
    realRecordsCount: number;
    syntheticRecordsCount: number;
    distinctSourcePlatforms: string[];
    sourceBreakdown: Array<{
      platform: string;
      totalRecords: number;
      eligibleNonFixtureRecords: number;
      verifiedRecords: number;
      unverifiedRecords: number;
      primaryResearchRecords: number;
      fixturesExcluded: number;
      duplicatesExcluded: number;
    }>;
    dateRange: string;
    duplicateCount: number;
    provenanceBreakdown: {
      contentVerified: number;
      linkChecked: number;
      verifiedLive: number;
      curatedBenchmark: number;
      userEntered: number;
      unverified: number;
      syntheticFixture: number;
    };
    analysisRunsCount: number;
    totalGoldenLabels: number;
    documentedFailureCases: number;
  };
  latestAnalysisRun: any;
  latestEvaluation: any;
  failureCases: any[];
  opportunities: any[];
  contradictions: any[];
  openResearchQuestions: any[];
  knownLimitations: string[];
}

export class ExportService {
  /**
   * Compiles the complete dataset for Evidence Log export
   */
  static async compileExportData(): Promise<EvidenceLogExportData> {
    await initializeDatabase();

    const allRecords = await db.select().from(evidenceRecords).all();
    const eligibleRecords = deduplicateEligibleEvidence(allRecords);
    const syntheticRecords = allRecords.filter(isSyntheticFixture);
    const duplicateCount = allRecords.filter((r) => r.duplicateOfId).length;
    const sourceBreakdown = Array.from(new Set(allRecords.map((record) => record.platform))).sort().map((platform) => {
      const rows = allRecords.filter((record) => record.platform === platform);
      return {
        platform,
        totalRecords: rows.length,
        eligibleNonFixtureRecords: deduplicateEligibleEvidence(rows).length,
        verifiedRecords: rows.filter((record) => !isSyntheticFixture(record) && ['content_verified', 'link_checked', 'verified_live'].includes(record.verificationStatus)).length,
        unverifiedRecords: rows.filter((record) => !isSyntheticFixture(record) && !['content_verified', 'link_checked', 'verified_live'].includes(record.verificationStatus)).length,
        primaryResearchRecords: rows.filter((record) => ['google_forms', 'user_interview'].includes(record.platform) && !isSyntheticFixture(record)).length,
        fixturesExcluded: rows.filter(isSyntheticFixture).length,
        duplicatesExcluded: rows.filter((record) => !isSyntheticFixture(record) && Boolean(record.duplicateOfId)).length,
      };
    });

    const dates = eligibleRecords
      .map((r) => r.collectedAt)
      .filter(Boolean)
      .sort();
    const dateRange =
      dates.length > 0 ? `${dates[0]} to ${dates[dates.length - 1]}` : 'N/A';

    const platforms = Array.from(new Set(allRecords.map((r) => r.platform)));
    const runs = await db
      .select()
      .from(analysisRuns)
      .orderBy(desc(analysisRuns.startedAt))
      .limit(1);
    const latestRun = runs.length > 0 ? runs[0] : null;

    const latestEval = await EvaluationService.getLatestEvaluation();
    const failureList = await ReviewService.listFailureCases();
    const storedQuestions = await db.select().from(researchQuestions).all();
    const allLinks = await db.select().from(evidenceThemeLinks).all();
    const eligibleIds = new Set(eligibleRecords.map((record) => record.id));
    const eligibleThemeIds = new Set(allLinks.filter((link) => eligibleIds.has(link.evidenceId)).map((link) => link.themeId));
    const questions = storedQuestions.map((question) => question.relatedThemeId && eligibleThemeIds.has(question.relatedThemeId)
      ? question
      : { ...question, answerSummary: null });
    const contradictionList = (await db.select().from(contradictions).all())
      .filter((item) => eligibleIds.has(item.evidenceAId) && eligibleIds.has(item.evidenceBId));
    const oppList = await OpportunityService.listOpportunities();
    const provBreakdown = await EvidenceService.getProvenanceBreakdown();

    return {
      metadata: {
        exportDate: new Date().toISOString(),
        engineVersion: '2.0.0-fellowship-graduation',
        productName: 'Groww SIP Intelligence Lab (independent academic prototype)',
        businessObjective:
          'Increase percentage of first-time mutual fund investors who maintain an active SIP 12 months after inception (active = >=1 instalment in past 30 days).',
        disclaimer:
          'Independent student prototype for NextLeap PM Fellowship. Not an official Groww product. Does not provide investment advice.',
      },
      summary: {
        totalEvidenceRecords: allRecords.length,
        eligibleNonFixtureRecordsCount: eligibleRecords.length,
        realRecordsCount: eligibleRecords.length,
        syntheticRecordsCount: syntheticRecords.length,
        distinctSourcePlatforms: platforms,
        sourceBreakdown,
        dateRange,
        duplicateCount,
        provenanceBreakdown: provBreakdown,
        analysisRunsCount: (await db.select().from(analysisRuns).all()).length,
        totalGoldenLabels: (await EvaluationService.listGoldenLabels()).length,
        documentedFailureCases: failureList.length,
      },
      latestAnalysisRun: latestRun,
      latestEvaluation: latestEval,
      failureCases: failureList,
      opportunities: oppList,
      contradictions: contradictionList,
      openResearchQuestions: questions,
      knownLimitations: [
        'Absence of Long-Term Retention Data: Public store reviews and social discussions reflect point-in-time sentiments; actual 12-month active continuation must be verified with Groww internal ledger cohort data.',
        'Investor Persona Ambiguity: First-time investor status is rarely stated explicitly by users in app store reviews, necessitating careful handling of unverified context.',
        'Platform Selection Bias: Play Store and Reddit over-index on severe failures (e.g. unexpected bank mandate charges) while satisfied retained users rarely leave unsolicited reviews.',
        'Human Evaluation Coverage: Genuine human-label count may be zero or smaller than the intended evaluation sample; the report displays the eligible count, denominator, provider and date. Simulated evaluation is not model performance.',
      ],
    };
  }

  /**
   * Generates a formal Markdown Evidence Log Report
   */
  static async generateMarkdownReport(): Promise<string> {
    const data = await this.compileExportData();

    const lines: string[] = [];

    lines.push('# Groww SIP Intelligence Lab — Evidence Log & Diagnostic Report');
    lines.push('');
    lines.push(`> **Generated**: ${data.metadata.exportDate}  `);
    lines.push(`> **Engine**: ${data.metadata.engineVersion}  `);
    lines.push(`> **Target Product**: ${data.metadata.productName}  `);
    lines.push(`> **Objective**: ${data.metadata.businessObjective}  `);
    lines.push('');
    lines.push(`> [!WARNING]`);
    lines.push(`> **Academic Prototype Notice**: ${data.metadata.disclaimer}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    // Executive Summary & Provenance
    lines.push('## 1. Executive Summary & Provenance Audit');
    lines.push('');
    lines.push(`- **Total Persisted Evidence Records**: ${data.summary.totalEvidenceRecords}`);
    lines.push(`- **Genuine Research-Eligible Records**: ${data.summary.eligibleNonFixtureRecordsCount}`);
    lines.push(`- **Fixture Records Excluded from Research Metrics**: ${data.summary.syntheticRecordsCount}`);
    lines.push(`- **Collection Date Window**: ${data.summary.dateRange}`);
    lines.push(`- **Detected Duplicates**: ${data.summary.duplicateCount}`);
    lines.push(`- **Source Platforms Represented**: ${data.summary.distinctSourcePlatforms.join(', ') || 'None'}`);
    lines.push(`- **Golden-Set Labelled Examples**: ${data.summary.totalGoldenLabels}`);
    lines.push(`- **Audited Failure Cases**: ${data.summary.documentedFailureCases} ${data.summary.documentedFailureCases >= 3 ? '✅ (Meets Requirement)' : '⚠️ (Under >= 3 Requirement)'}`);
    lines.push('');
    lines.push('### Provenance Classification Breakdown');
    lines.push('');
    lines.push('| Provenance Tier | Count | Description |');
    lines.push('|---|---|---|');
    lines.push(`| **Content Verified** | ${data.summary.provenanceBreakdown.contentVerified} | Original quote and source context verified against primary public record. |`);
    lines.push(`| **Link Checked** | ${data.summary.provenanceBreakdown.linkChecked} | Source URL verified reachable via live HTTP check. |`);
    lines.push(`| **Curated Benchmark (Academic Fixture)** | ${data.summary.provenanceBreakdown.curatedBenchmark} | Benchmark fixture preserved for development & testing; not verified live. |`);
    lines.push(`| **Synthetic Fixture** | ${data.summary.provenanceBreakdown.syntheticFixture} | Synthetic/illustrative example generated for regression tests. |`);
    lines.push(`| **User-Entered** | ${data.summary.provenanceBreakdown.userEntered} | Ingested via user manual entry or CSV upload; awaiting verification audit. |`);
    lines.push(`| **Unverified** | ${data.summary.provenanceBreakdown.unverified} | Raw record with unverified source link. |`);
    lines.push('');
    lines.push('### Source Inventory (All Stored Records, Eligibility Shown Separately)');
    lines.push('');
    lines.push('| Platform | Stored | Genuine research eligible | Verified/link-checked | Unverified/user-entered | Primary research | Fixtures excluded | Duplicates excluded |');
    lines.push('|---|---:|---:|---:|---:|---:|---:|---:|');
    for (const source of data.summary.sourceBreakdown) {
      lines.push(`| ${source.platform} | ${source.totalRecords} | ${source.eligibleNonFixtureRecords} | ${source.verifiedRecords} | ${source.unverifiedRecords} | ${source.primaryResearchRecords} | ${source.fixturesExcluded} | ${source.duplicatesExcluded} |`);
    }
    lines.push('');

    // Latest Analysis Run
    lines.push('## 2. AI Analysis Run Metadata');
    lines.push('');
    if (data.latestAnalysisRun) {
      lines.push(`- **Run ID**: \`${data.latestAnalysisRun.id}\``);
      lines.push(`- **Provider**: \`${data.latestAnalysisRun.provider}\``);
      lines.push(`- **Model / Version**: \`${data.latestAnalysisRun.model}\` (\`${data.latestAnalysisRun.modelVersion}\`)`);
      lines.push(`- **Prompt Version**: \`${data.latestAnalysisRun.promptVersion}\``);
      lines.push(`- **Schema Version**: \`${data.latestAnalysisRun.schemaVersion}\``);
      lines.push(`- **Execution Status**: \`${data.latestAnalysisRun.status}\``);
      lines.push(`- **Successful Records**: ${data.latestAnalysisRun.successfulRecords} / ${data.latestAnalysisRun.totalRecords}`);
      lines.push(`- **Execution Timestamp**: ${data.latestAnalysisRun.startedAt}`);
    } else {
      lines.push('_No analysis runs executed yet._');
    }
    lines.push('');

    // Golden Set Evaluation & Error Breakdown
    lines.push('## 3. Golden-Set Diagnostic Evaluation');
    lines.push('');
    if (data.latestEvaluation) {
      if (data.latestEvaluation.isSimulated || data.latestEvaluation.provider === 'fake') {
        lines.push('> [!WARNING]');
        lines.push('> **SIMULATED TEST BENCHMARK**: Evaluated using FakeAIProvider rule engine test double. This reflects deterministic software test assertions, NOT real-world Gemini AI model accuracy.');
        lines.push('');
      }
      if (data.latestEvaluation.isIncomplete) {
        lines.push('> [!CAUTION]');
        lines.push(`> **INCOMPLETE EVALUATION**: ${data.latestEvaluation.missingDetails || 'Evaluation is missing independent labels or eligible predictions.'}`);
        lines.push('');
      }
      lines.push(`- **Evaluation Provider**: \`${data.latestEvaluation.provider || 'unknown'}\``);
      lines.push(`- **Model / Version**: \`${data.latestEvaluation.model || 'unknown'}\` (\`${data.latestEvaluation.modelVersion || 'unknown'}\`)`);
      lines.push(`- **Evaluation Date**: ${data.latestEvaluation.evaluatedAt || 'unknown'}`);
      lines.push(`- **Golden-Set Size**: ${data.latestEvaluation.totalGoldenRecords} records`);
      lines.push(`> [!NOTE]`);
      lines.push(`> **Diagnostic Sample Disclaimer (n = ${data.latestEvaluation.totalGoldenRecords})**: Evaluated against eligible manually labelled examples. This serves as a diagnostic benchmark to surface failure modes and classification alignment, not mathematical proof of broad model generalization.`);
      lines.push('');
      lines.push(`- **Exact Match Agreement**: **${(data.latestEvaluation.accuracy * 100).toFixed(1)}%** (${data.latestEvaluation.exactMatches}/${data.latestEvaluation.totalGoldenRecords})`);
      if (data.latestEvaluation.abstentionAccuracy !== null) {
        lines.push(`- **Abstention Accuracy**: **${(data.latestEvaluation.abstentionAccuracy * 100).toFixed(1)}%**`);
      }
      lines.push('');

      lines.push('### Per-Theme Classification Performance');
      lines.push('');
      lines.push('| Theme | Support | Precision | Recall | F1 | Statistically Meaningful? |');
      lines.push('|---|---|---|---|---|---|');
      for (const t of data.latestEvaluation.metricsByTheme) {
        const prec = t.precision !== null ? `${(t.precision * 100).toFixed(0)}%` : 'N/A';
        const rec = t.recall !== null ? `${(t.recall * 100).toFixed(0)}%` : 'N/A';
        const f1 = t.f1 !== null ? `${(t.f1 * 100).toFixed(0)}%` : 'N/A';
        const flag = t.statisticallyMeaningful ? 'Yes (n ≥ 3)' : '⚠️ Low Support (n < 3)';
        lines.push(`| ${t.themeName} | ${t.support} | ${prec} | ${rec} | ${f1} | ${flag} |`);
      }
      lines.push('');

      lines.push('### Failure Mode Taxonomy');
      lines.push('');
      lines.push('| Error Category | Instances | Description |');
      lines.push('|---|---|---|');
      const errCats = data.latestEvaluation.commonErrorCategories;
      lines.push(`| Wrong Theme | ${errCats.wrong_theme || 0} | Assigned to a different theme than golden ground truth |`);
      lines.push(`| Missed Abstention | ${errCats.missed_abstention || 0} | Fabricated theme on vague or insufficient evidence |`);
      lines.push(`| Unwarranted Abstention | ${errCats.unwarranted_abstention || 0} | Abstaining despite clear user journey evidence |`);
      lines.push(`| Unsupported Context | ${errCats.unsupported_context || 0} | Investor context hallucinated without source quote |`);
      lines.push(`| Excerpt Mismatch | ${errCats.excerpt_mismatch || 0} | Evidence excerpt was not a verbatim quote |`);
      lines.push(`| No Error (Correct) | ${errCats.none || 0} | Classification aligned with ground truth |`);
      lines.push('');

      if (data.latestEvaluation.items && data.latestEvaluation.items.length > 0) {
        lines.push(`### Complete Golden-Set Item Inspection (n=${data.latestEvaluation.items.length})`);
        lines.push('');
        lines.push('| # | Verbatim Quote Excerpt | Golden Label | AI Prediction | Agreement | Error Category |');
        lines.push('|---|---|---|---|---|---|');
        data.latestEvaluation.items.forEach((item: any, idx: number) => {
          const excerpt = item.evidenceText.slice(0, 60).replace(/\|/g, '-') + '…';
          const matchBadge = item.isMatch ? '✅ Match' : '❌ Mismatch';
          lines.push(`| ${idx + 1} | "${excerpt}" | ${item.actualTheme} | ${item.predictedTheme} | ${matchBadge} | ${item.errorCategory} |`);
        });
        lines.push('');
      }
      if (data.latestEvaluation.diagnostics) {
        const diagnostics = data.latestEvaluation.diagnostics;
        lines.push('### Structured Extraction Diagnostics');
        lines.push('');
        lines.push('| Measure | Numerator | Denominator | Result |');
        lines.push('|---|---:|---:|---:|');
        for (const [label, metric] of [
          ['Journey-stage agreement', diagnostics.journeyStageAgreement],
          ['Behaviour extraction coverage', diagnostics.behaviorExtractionCoverage],
          ['Literal evidence grounding', diagnostics.evidenceGroundingAccuracy],
          ['Unsupported inference claims', diagnostics.unsupportedInferenceRate],
          ['Abstention precision', diagnostics.abstentionPrecision],
          ['Abstention recall', diagnostics.abstentionRecall],
        ] as const) {
          const result = metric.denominator ? `${(metric.numerator / metric.denominator * 100).toFixed(1)}%` : 'N/A';
          lines.push(`| ${label} | ${metric.numerator} | ${metric.denominator} | ${result} |`);
        }
        lines.push('');
        lines.push('Behaviour extraction is coverage against a non-empty human behaviour label, not a semantic quality score. Literal grounding checks source substring matches. Unsupported inference claims count inferences without a matching quoted span; they are diagnostic flags, not adjudicated hallucination labels.');
        lines.push('');
      }
    } else {
      lines.push('_No golden-set evaluation runs executed yet._');
      lines.push('');
    }

    // Documented Failure Cases & Lessons Learned
    lines.push('## 4. Documented Failure Cases & Lessons Learned (RCA Log)');
    lines.push('');
    if (data.failureCases.length > 0) {
      data.failureCases.forEach((fc, idx) => {
        lines.push(`### Case ${idx + 1}: ${fc.failureType.replace(/_/g, ' ').toUpperCase()}`);
        lines.push(`- **Platform**: ${fc.platform}`);
        lines.push(`- **Source Link**: ${fc.sourceUrl}`);
        lines.push(`- **Verbatim Evidence**: "${fc.evidenceText}"`);
        lines.push(`- **Reviewer Rationale**: ${fc.reviewerRationale}`);
        lines.push(`- **Lesson Learned**: ${fc.lessonLearned}`);
        lines.push(`- **Active Prevention Guard**: ${fc.preventionStrategy}`);
        lines.push('');
      });
    } else {
      lines.push('_No genuine failure cases recorded yet. The requirement remains incomplete until >= 3 genuine corrected/rejected cases are documented._');
      lines.push('');
    }

    // Candidate Opportunities & 7-Criteria Prioritization
    lines.push('## 5. Candidate Opportunities & 7-Criteria Prioritization');
    lines.push('');
    if (data.opportunities && data.opportunities.length > 0) {
      data.opportunities.forEach((opp: any, idx: number) => {
        lines.push(`### Opportunity ${idx + 1}: ${opp.title} (Score: ${opp.compositeScore.toFixed(1)}/100)`);
        lines.push(`- **Problem Statement**: ${opp.problemStatement}`);
        lines.push(`- **Retention Hypothesis**: ${opp.hypothesisOnRetention}`);
        lines.push(`- **Provisional Status**: ${opp.status.toUpperCase()} (Decision aid, not predictive forecast)`);
        if (!opp.hasEligibleEvidence) {
          lines.push(`- **Evidence Eligibility**: Not ranked; no eligible evidence. Excluded fixtures: ${opp.excludedFixtureCount || 0}; excluded duplicates: ${opp.excludedDuplicateCount || 0}.`);
        } else {
          lines.push(`- **Eligible Supporting Evidence**: ${opp.eligibleEvidenceCount}`);
        }
        lines.push('');
        lines.push('#### 7-Criteria Scoring Matrix');
        lines.push('');
        lines.push('| Criterion | Raw Score | Normalized (0-100) | Weight | Basis | Score Rationale |');
        lines.push('|---|---|---|---|---|---|');
        (opp.scores || []).forEach((c: any) => {
          lines.push(`| ${c.criterion.replace(/_/g, ' ')} | ${c.rawScore} | ${Math.round(c.normalizedScore)}% | ${c.basis} | ${c.rationale} |`);
        });
        lines.push('');
        if (opp.scoreAudit?.length) {
          lines.push('#### Manual Score Override Audit Trail');
          lines.push('');
          lines.push('| Criterion | Previous | New | Reviewer | Rationale | Date |');
          lines.push('|---|---:|---:|---|---|---|');
          for (const audit of opp.scoreAudit) lines.push(`| ${audit.criterion} | ${audit.previousScore ?? 'unset'} | ${audit.newScore} | ${audit.scoredBy} | ${audit.rationale} | ${audit.createdAt} |`);
          lines.push('');
        }
        lines.push('#### Weight Sensitivity Scenarios');
        lines.push('');
        lines.push('| Preset Strategy | Weight Focus | Calculated Composite Score |');
        lines.push('|---|---|---|');
        opp.sensitivityScenarios.forEach((s: any) => {
          lines.push(`| ${s.name} | ${s.description} | **${s.score.toFixed(1)} / 100** |`);
        });
        lines.push('');
        if (opp.linkedEvidence && opp.linkedEvidence.length > 0) {
          lines.push('#### Grounding Evidence Lineage');
          lines.push('');
          opp.linkedEvidence.forEach((e: any) => {
            lines.push(`- "${e.originalText}" _(${e.platform} · Stage: ${e.journeyStage} · Provenance: ${e.provenance})_`);
          });
          lines.push('');
        }
        if (opp.missingInformation && opp.missingInformation.length > 0) {
          lines.push('#### Crucial Telemetry Gaps & Caveats');
          lines.push('');
          opp.missingInformation.forEach((gap: string) => {
            lines.push(`- ⚠️ ${gap}`);
          });
          lines.push('');
        }
      });
    } else {
      lines.push('_No candidate opportunities generated yet._');
      lines.push('');
    }

    // Open Research Questions & Data Gaps
    lines.push('## 6. Open Research Questions & Investigation Gaps');
    lines.push('');
    if (data.openResearchQuestions.length > 0) {
      data.openResearchQuestions.forEach((q) => {
        lines.push(`- **[${q.status.toUpperCase()}]** ${q.question} _(Origin: ${q.origin})_`);
      });
    } else {
      lines.push('_No open research questions recorded yet._');
    }
    lines.push('');

    // Known Limitations
    lines.push('## 7. Known Technical & Data Limitations');
    lines.push('');
    data.knownLimitations.forEach((lim) => {
      lines.push(`- **${lim.split(':')[0]}**: ${lim.split(':').slice(1).join(':').trim()}`);
    });
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Generates sanitized CSV log
   */
  static async generateCsvLog(): Promise<string> {
    return EvidenceService.exportToCsv({ excludeSynthetic: false });
  }
}


