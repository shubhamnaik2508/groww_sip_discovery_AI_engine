import { db, initializeDatabase } from '@/db';
import {
  opportunities,
  opportunityThemes,
  opportunityScores,
  opportunityScoreAudit,
  themes,
  evidenceThemeLinks,
  evidenceRecords,
  reviews,
  contradictions,
  analysisRuns,
  recordAnalyses,
} from '@/db/schema';
import { eq, inArray, desc, and } from 'drizzle-orm';
import crypto from 'crypto';
import { isGenuineResearchEvidence, isSyntheticFixture } from '@/lib/evidenceEligibility';

export interface OpportunityWeights {
  evidenceStrength: number; // 0 to 5, default 1
  independentRecords: number; // 0 to 5, default 1
  sourceDiversity: number; // 0 to 5, default 1
  userImpact: number; // 0 to 5, default 1
  businessMetricLink: number; // 0 to 5, default 1
  researchUncertainty: number; // 0 to 5, default 1 (inverted)
  potentialFeasibility: number; // 0 to 5, default 1
}

export const DEFAULT_OPPORTUNITY_WEIGHTS: OpportunityWeights = {
  evidenceStrength: 20,
  independentRecords: 15,
  sourceDiversity: 10,
  userImpact: 20,
  businessMetricLink: 15,
  researchUncertainty: 10,
  potentialFeasibility: 10,
};

export interface CreateOpportunityInput {
  title: string;
  problemStatement: string; // strictly a problem statement
  hypothesisOnRetention: string; // strictly framed as testable hypothesis on 12-month continuation
  themeIds: string[];
  humanScores?: {
    userImpact: { score: number; rationale: string; scoredBy: string };
    businessMetricLink: { score: number; rationale: string; scoredBy: string };
    researchUncertainty: { score: number; rationale: string; scoredBy: string };
    potentialFeasibility: { score: number; rationale: string; scoredBy: string };
  };
}

export class OpportunityService {
  static async updateHumanScore(input: {
    opportunityId: string;
    criterion: 'user_impact' | 'business_metric_link' | 'research_uncertainty' | 'potential_feasibility';
    score: number;
    rationale: string;
    scoredBy: string;
  }) {
    await initializeDatabase();
    const allowedCriteria = ['user_impact', 'business_metric_link', 'research_uncertainty', 'potential_feasibility'];
    if (!allowedCriteria.includes(input.criterion)) throw new Error('Unsupported human score criterion.');
    if (!Number.isFinite(input.score) || input.score < 0 || input.score > 5) throw new Error('Score must be between 0 and 5.');
    if (!input.rationale.trim() || !input.scoredBy.trim()) throw new Error('A rationale and reviewer name are required for score changes.');
    const existing = await db.select().from(opportunityScores)
      .where(and(eq(opportunityScores.opportunityId, input.opportunityId), eq(opportunityScores.criterion, input.criterion)))
      .limit(1);
    const previousScore = existing[0]?.rawScore ?? null;
    const values = {
      rawScore: input.score,
      normalizedScore: Number((input.score * 20).toFixed(1)),
      basis: 'human_judgement',
      rationale: input.rationale.trim(),
      scoredBy: input.scoredBy.trim(),
      updatedAt: new Date().toISOString(),
    };
    if (existing.length) await db.update(opportunityScores).set(values).where(eq(opportunityScores.id, existing[0].id));
    else await db.insert(opportunityScores).values({ id: crypto.randomUUID(), opportunityId: input.opportunityId, criterion: input.criterion, ...values });
    const auditId = crypto.randomUUID();
    await db.insert(opportunityScoreAudit).values({
      id: auditId, opportunityId: input.opportunityId, criterion: input.criterion,
      previousScore, newScore: input.score, rationale: input.rationale.trim(), scoredBy: input.scoredBy.trim(),
    });
    await this.recalculateOpportunityScore(input.opportunityId);
    return { previousScore, newScore: input.score, auditId };
  }

  /**
   * Creates a candidate opportunity strictly grounded in themes and problem statements
   */
  static async createOpportunity(input: CreateOpportunityInput) {
    await initializeDatabase();

    if (!input.title || !input.title.trim()) {
      throw new Error('Opportunity title is required.');
    }
    if (!input.problemStatement || !input.problemStatement.trim()) {
      throw new Error('Problem statement is required. Must define the user problem without predetermining a solution.');
    }
    if (!input.hypothesisOnRetention || !input.hypothesisOnRetention.trim()) {
      throw new Error('Hypothesis on 12-month active SIP continuation is required.');
    }

    const opportunityId = crypto.randomUUID();

    await db.insert(opportunities).values({
      id: opportunityId,
      title: input.title.trim(),
      problemStatement: input.problemStatement.trim(),
      hypothesisOnRetention: input.hypothesisOnRetention.trim(),
      status: 'under_evaluation',
      weightsSnapshot: JSON.stringify(DEFAULT_OPPORTUNITY_WEIGHTS),
      compositeScore: 0,
    });

    // Link themes
    for (const themeId of input.themeIds) {
      await db.insert(opportunityThemes).values({
        id: crypto.randomUUID(),
        opportunityId,
        themeId,
      });
    }

    // Insert human scores if provided
    if (input.humanScores) {
      const { userImpact, businessMetricLink, researchUncertainty, potentialFeasibility } =
        input.humanScores;

      const items = [
        {
          criterion: 'user_impact',
          rawScore: userImpact.score,
          normalizedScore: (userImpact.score / 5) * 100,
          basis: 'human_judgement',
          rationale: userImpact.rationale,
          scoredBy: userImpact.scoredBy,
        },
        {
          criterion: 'business_metric_link',
          rawScore: businessMetricLink.score,
          normalizedScore: (businessMetricLink.score / 5) * 100,
          basis: 'human_judgement',
          rationale: businessMetricLink.rationale,
          scoredBy: businessMetricLink.scoredBy,
        },
        {
          criterion: 'research_uncertainty',
          rawScore: researchUncertainty.score,
          normalizedScore: (researchUncertainty.score / 5) * 100,
          basis: 'human_judgement',
          rationale: researchUncertainty.rationale,
          scoredBy: researchUncertainty.scoredBy,
        },
        {
          criterion: 'potential_feasibility',
          rawScore: potentialFeasibility.score,
          normalizedScore: (potentialFeasibility.score / 5) * 100,
          basis: 'human_judgement',
          rationale: potentialFeasibility.rationale,
          scoredBy: potentialFeasibility.scoredBy,
        },
      ];

      for (const item of items) {
        await db.insert(opportunityScores).values({
          id: crypto.randomUUID(),
          opportunityId,
          ...item,
        });
      }
    }

    // Compute composite score
    await this.recalculateOpportunityScore(opportunityId, DEFAULT_OPPORTUNITY_WEIGHTS);

    return { opportunityId };
  }

  /**
   * Recalculates component and composite scores without double-counting duplicates
   */
  static async recalculateOpportunityScore(
    opportunityId: string,
    weights: OpportunityWeights = DEFAULT_OPPORTUNITY_WEIGHTS
  ) {
    await initializeDatabase();

    // 1. Fetch linked themes
    const linkedThemeRows = await db
      .select({ themeId: opportunityThemes.themeId })
      .from(opportunityThemes)
      .where(eq(opportunityThemes.opportunityId, opportunityId))
      .all();

    const themeIds = linkedThemeRows.map((r) => r.themeId);
    if (themeIds.length === 0) return null;

    // 2. Fetch all linked evidence records
    const linkedRows = await db
      .select()
      .from(evidenceThemeLinks)
      .where(inArray(evidenceThemeLinks.themeId, themeIds))
      .all();
    const [analysisRows, analysisRunsRows] = await Promise.all([db.select().from(recordAnalyses).all(), db.select().from(analysisRuns).all()]);
    const fakeRunIds = new Set(analysisRunsRows.filter((run) => run.provider === 'fake').map((run) => run.id));
    const fakeAnalysisIds = new Set(analysisRows.filter((analysis) => fakeRunIds.has(analysis.runId)).map((analysis) => analysis.id));
    const links = linkedRows.filter((link) => !(link.source === 'ai' && link.recordAnalysisId && fakeAnalysisIds.has(link.recordAnalysisId)));

    const evidenceIds = Array.from(new Set(links.map((l) => l.evidenceId)));
    if (evidenceIds.length === 0) {
      return {
        compositeScore: 0,
        independentRecordCount: 0,
        sourceDiversityCount: 0,
        isThinEvidence: true,
      };
    }

    const records = await db
      .select()
      .from(evidenceRecords)
      .where(inArray(evidenceRecords.id, evidenceIds))
      .all();

    // 3. Exclude synthetic fixtures and collapse duplicates before scoring.
    // Fixtures are useful for development but provide no evidence for an opportunity.
    const seenHashes = new Set<string>();
    const seenCanonicalIds = new Set<string>();
    const independentRecords: typeof records = [];
    let syntheticFixtureCount = 0;

    for (const record of records) {
      if (isSyntheticFixture(record)) {
        syntheticFixtureCount++;
        continue;
      }
      if (!isGenuineResearchEvidence(record)) continue;
      const canonicalId = record.duplicateOfId || record.id;
      if (seenCanonicalIds.has(canonicalId) || seenCanonicalIds.has(record.id)) {
        continue;
      }
      if (seenHashes.has(record.contentHash)) {
        continue;
      }
      seenHashes.add(record.contentHash);
      seenCanonicalIds.add(canonicalId);
      seenCanonicalIds.add(record.id);
      independentRecords.push(record);
    }
    const independentRecordCount = independentRecords.length;

    // 4. Source Diversity (distinct platforms among independent records)
    const distinctPlatforms = Array.from(new Set(independentRecords.map((r) => r.platform)));
    const sourceDiversityCount = distinctPlatforms.length;
    // Normalize source diversity: 1 platform = 20%, 2 = 50%, 3 = 80%, >=4 = 100%
    const normalizedDiversity = Math.min(100, sourceDiversityCount * 25);

    // 5. Evidence Strength: Proportion of independent records with verified source + human-confirmed review
    const allReviews = await db
      .select()
      .from(reviews)
      .where(inArray(reviews.evidenceId, independentRecords.map((r) => r.id)))
      .all();

    const confirmedEvidenceIds = new Set(
      allReviews.filter((r) => r.decision === 'confirmed').map((r) => r.evidenceId)
    );

    let weightedEvidencePoints = 0;
    let contentVerifiedCount = 0;
    let linkCheckedCount = 0;
    let userEnteredCount = 0;
    let unverifiedCount = 0;

    for (const r of independentRecords) {
      const prov = JSON.parse(r.fieldProvenance || '{}');
      const isConfirmed = confirmedEvidenceIds.has(r.id);
      const status = r.verificationStatus || prov.sourceUrl || 'unverified';

      if (status === 'content_verified' || status === 'verified_live' || status === 'verified') {
        contentVerifiedCount++;
        weightedEvidencePoints += isConfirmed ? 1.0 : 0.8;
      } else if (status === 'link_checked') {
        linkCheckedCount++;
        weightedEvidencePoints += isConfirmed ? 0.8 : 0.6;
      } else if (status === 'user_entered') {
        userEnteredCount++;
        weightedEvidencePoints += isConfirmed ? 0.4 : 0.2;
      } else {
        unverifiedCount++;
        weightedEvidencePoints += isConfirmed ? 0.2 : 0.0;
      }
    }

    const evidenceStrengthRatio =
      independentRecordCount > 0 ? weightedEvidencePoints / independentRecordCount : 0;
    const normalizedEvidenceStrength = Math.min(100, Number((evidenceStrengthRatio * 100).toFixed(1)));

    // Independent record score (diminishing returns log scale, 1 record = 20, 5 = 60, 10+ = 100)
    const normalizedRecordsScore = Math.min(100, Math.log10(independentRecordCount + 1) * 95);

    // Fetch existing human scores
    const existingScores = await db
      .select()
      .from(opportunityScores)
      .where(eq(opportunityScores.opportunityId, opportunityId))
      .all();

    const humanScoreMap = new Map(existingScores.map((s) => [s.criterion, s]));

    const userImpactNorm = humanScoreMap.get('user_impact')?.normalizedScore ?? 50;
    const businessLinkNorm = humanScoreMap.get('business_metric_link')?.normalizedScore ?? 50;
    const uncertaintyRaw = humanScoreMap.get('research_uncertainty')?.rawScore ?? 3;
    // Uncertainty is INVERTED for composite score (lower uncertainty = higher priority)
    const invertedUncertaintyNorm = Math.max(0, 100 - (uncertaintyRaw / 5) * 100);
    const feasibilityNorm = humanScoreMap.get('potential_feasibility')?.normalizedScore ?? 50;

    // Store or update computed scores
    const computedItems = [
      {
        criterion: 'evidence_strength',
        rawScore: Number((evidenceStrengthRatio * 5).toFixed(1)),
        normalizedScore: Number(normalizedEvidenceStrength.toFixed(1)),
        basis: 'computed',
        rationale: `Computed across ${independentRecordCount} independent non-synthetic records: ${contentVerifiedCount} content-verified, ${linkCheckedCount} link-checked, ${userEnteredCount} user-entered, ${unverifiedCount} unverified. Excluded ${syntheticFixtureCount} synthetic/benchmark fixture(s). Human confirmation rate: ${confirmedEvidenceIds.size}/${independentRecordCount}. Provenance-weighted strength: ${normalizedEvidenceStrength}%.`,
        scoredBy: 'System Engine',
      },
      {
        criterion: 'independent_records',
        rawScore: Math.min(5, Number((independentRecordCount / 2).toFixed(1))),
        normalizedScore: Number(normalizedRecordsScore.toFixed(1)),
        basis: 'computed',
        rationale: `Derived from ${independentRecordCount} distinct non-duplicate records (duplicates collapsed by content hash and canonical duplicateOfId).`,
        scoredBy: 'System Engine',
      },
      {
        criterion: 'source_diversity',
        rawScore: Math.min(5, sourceDiversityCount),
        normalizedScore: Number(normalizedDiversity.toFixed(1)),
        basis: 'computed',
        rationale: `Observed across ${sourceDiversityCount} distinct channel(s): ${distinctPlatforms.join(', ')}.`,
        scoredBy: 'System Engine',
      },
    ];

    for (const comp of computedItems) {
      const existing = existingScores.find((s) => s.criterion === comp.criterion);
      if (existing) {
        await db
          .update(opportunityScores)
          .set({
            rawScore: comp.rawScore,
            normalizedScore: comp.normalizedScore,
            rationale: comp.rationale,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(opportunityScores.id, existing.id));
      } else {
        await db.insert(opportunityScores).values({
          id: crypto.randomUUID(),
          opportunityId,
          ...comp,
        });
      }
    }

    // Helper to compute composite for arbitrary weights
    const computeForWeights = (w: OpportunityWeights) => {
      if (independentRecordCount === 0) return 0;
      const sumW =
        w.evidenceStrength +
        w.independentRecords +
        w.sourceDiversity +
        w.userImpact +
        w.businessMetricLink +
        w.researchUncertainty +
        w.potentialFeasibility;
      if (sumW <= 0) return 0;
      const score =
        (normalizedEvidenceStrength * w.evidenceStrength +
          normalizedRecordsScore * w.independentRecords +
          normalizedDiversity * w.sourceDiversity +
          userImpactNorm * w.userImpact +
          businessLinkNorm * w.businessMetricLink +
          invertedUncertaintyNorm * w.researchUncertainty +
          feasibilityNorm * w.potentialFeasibility) /
        sumW;
      return Number(score.toFixed(1));
    };

    const compositeScore = computeForWeights(weights);

    await db
      .update(opportunities)
      .set({
        compositeScore,
        weightsSnapshot: JSON.stringify(weights),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(opportunities.id, opportunityId));

    return {
      opportunityId,
      compositeScore,
      independentRecordCount,
      sourceDiversityCount,
      syntheticFixtureCount,
      isThinEvidence: independentRecordCount < 3,
      components: {
        evidenceStrength: normalizedEvidenceStrength,
        independentRecords: normalizedRecordsScore,
        sourceDiversity: normalizedDiversity,
        userImpact: userImpactNorm,
        businessMetricLink: businessLinkNorm,
        researchUncertaintyInverted: invertedUncertaintyNorm,
        potentialFeasibility: feasibilityNorm,
      },
    };
  }

  /**
   * Lists all candidate opportunities with component breakdowns, sensitivity analysis,
   * direct evidence lineage, and documented qualitative limitations.
   */
  static async listOpportunities() {
    await initializeDatabase();

    const opps = await db.select().from(opportunities).orderBy(desc(opportunities.compositeScore)).all();
    const scores = await db.select().from(opportunityScores).all();
    const oppThemes = await db.select().from(opportunityThemes).all();
    const allThemes = await db.select().from(themes).all();
    const storedLinks = await db.select().from(evidenceThemeLinks).all();
    const [allAnalyses, allRuns] = await Promise.all([db.select().from(recordAnalyses).all(), db.select().from(analysisRuns).all()]);
    const allLinks = storedLinks;
    const allRecords = await db.select().from(evidenceRecords).all();
    const allReviews = await db.select().from(reviews).all();
    const allContradictions = await db.select().from(contradictions).all();
    const scoreAuditRows = await db.select().from(opportunityScoreAudit).orderBy(desc(opportunityScoreAudit.createdAt)).all();
    const analysisByEvidence = new Map<string, Record<string, unknown>>();
    for (const analysis of [...allAnalyses].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
      if (analysisByEvidence.has(analysis.evidenceId) || analysis.validationStatus !== 'valid' || !analysis.parsedOutput) continue;
      try {
        const output = JSON.parse(analysis.parsedOutput) as Record<string, unknown>;
        analysisByEvidence.set(analysis.evidenceId, { ...output, _analysisProvider: allRuns.find((run) => run.id === analysis.runId)?.provider ?? 'unknown' });
      } catch { /* malformed historic outputs are not used for enrichment */ }
    }

    const themeMap = new Map(allThemes.map((t) => [t.id, t]));
    const recordMap = new Map(allRecords.map((r) => [r.id, r]));

    return opps.map((opp) => {
      const oppScores = scores.filter((s) => s.opportunityId === opp.id);
      const linkedThemeIds = oppThemes.filter((ot) => ot.opportunityId === opp.id).map((ot) => ot.themeId);
      const linkedThemes = linkedThemeIds.map((id) => themeMap.get(id)).filter(Boolean);

      // Find all evidence records supporting the linked themes
      const relevantEvidenceIds = Array.from(
        new Set(
          allLinks
            .filter((l) => linkedThemeIds.includes(l.themeId))
            .map((l) => l.evidenceId)
        )
      );

      const relevantRecords = relevantEvidenceIds.map((id) => recordMap.get(id)).filter(Boolean);
      const excludedFixtureCount = relevantRecords.filter((r) => isSyntheticFixture(r!)).length;
      const illustrativeEvidence = relevantRecords.filter((record) => record && isSyntheticFixture(record)).map((record) => ({
        id: record!.id, originalText: record!.originalText, sourceUrl: record!.sourceUrl, platform: record!.platform,
        verificationStatus: record!.verificationStatus, isSynthetic: true,
      }));
      const sourceDiversityCount = new Set(relevantRecords.map((record) => record?.platform).filter(Boolean)).size;
      let excludedDuplicateCount = relevantRecords.filter((r) => isSyntheticFixture(r!) === false && Boolean(r!.duplicateOfId)).length;
      const independentByHash = new Map<string, NonNullable<(typeof relevantRecords)[number]>>();
      for (const record of relevantRecords) {
        if (!record || !isGenuineResearchEvidence(record)) continue;
        const canonicalId = record.duplicateOfId || record.id;
        const key = `${canonicalId}:${record.contentHash}`;
        if (independentByHash.has(key)) excludedDuplicateCount++;
        else independentByHash.set(key, record);
      }
      const independentRecords = [...independentByHash.values()];
      const independentCount = independentRecords.length;
      const verifiedIndependentCount = independentRecords.filter((record) => ['content_verified', 'link_checked', 'verified_live', 'verified'].includes(record.verificationStatus)).length;
      const independentSourceCount = new Set(independentRecords.map((record) => record.platform)).size;
      const researchConfidence = independentCount >= 5 && verifiedIndependentCount >= 3 && independentSourceCount >= 3 ? 'High evidence support'
        : independentCount >= 3 && verifiedIndependentCount >= 2 && independentSourceCount >= 2 ? 'Moderate evidence support'
        : independentCount > 0 ? 'Limited evidence support' : 'Insufficient evidence';
      const linkedEvidence = independentRecords.map((r) => {
        const analysis = analysisByEvidence.get(r.id);
        const segment = analysis?.explicitlyStatedSegment && typeof analysis.explicitlyStatedSegment === 'object'
          ? analysis.explicitlyStatedSegment as Record<string, unknown> : {};
        const continuation = analysis?.sipContinuationHypothesis && typeof analysis.sipContinuationHypothesis === 'object'
          ? analysis.sipContinuationHypothesis as Record<string, unknown> : {};
        return ({
        id: r.id,
        originalText: r.originalText,
        sourceUrl: r.sourceUrl,
        platform: r.platform,
        journeyStage: r.journeyStage,
        verificationStatus: r.verificationStatus,
        isSynthetic: false,
        analysisProvider: typeof analysis?._analysisProvider === 'string' ? analysis._analysisProvider : 'not analysed',
        duplicateOfId: r.duplicateOfId,
        provenance: JSON.parse(r.fieldProvenance || '{}'),
        observedBehaviour: typeof analysis?.observedBehaviour === 'string' ? analysis.observedBehaviour : null,
        existingWorkaround: typeof analysis?.existingWorkaround === 'string' ? analysis.existingWorkaround : null,
        unmetNeed: typeof analysis?.potentialUnmetNeed === 'string' ? analysis.potentialUnmetNeed : null,
        triggerOrContext: typeof analysis?.triggerOrContext === 'string' ? analysis.triggerOrContext : null,
        causeHypothesis: typeof continuation.plausibleMechanism === 'string' ? continuation.plausibleMechanism : null,
        explicitlyStatedSegment: Object.fromEntries(Object.entries(segment).filter(([, value]) => typeof value === 'string' && value && value !== 'unknown')),
        });
      });
      const contradictoryEvidence = allContradictions
        .filter((item) => linkedThemeIds.includes(item.themeId || '') || relevantEvidenceIds.includes(item.evidenceAId) || relevantEvidenceIds.includes(item.evidenceBId))
        .map((item) => ({
          ...item,
          evidenceA: recordMap.get(item.evidenceAId)?.originalText ?? '',
          evidenceB: recordMap.get(item.evidenceBId)?.originalText ?? '',
          sourceA: recordMap.get(item.evidenceAId)?.sourceUrl ?? '',
          sourceB: recordMap.get(item.evidenceBId)?.sourceUrl ?? '',
          eligible: Boolean(recordMap.get(item.evidenceAId) && recordMap.get(item.evidenceBId) && isGenuineResearchEvidence(recordMap.get(item.evidenceAId)!) && isGenuineResearchEvidence(recordMap.get(item.evidenceBId)!)),
        }));

      const eligibleIds = new Set(independentRecords.map((r) => r.id));
      const confirmedIds = new Set(allReviews.filter((review) => eligibleIds.has(review.evidenceId) && review.decision === 'confirmed').map((review) => review.evidenceId));
      let evidencePoints = 0;
      for (const record of independentRecords) {
        const provenance = JSON.parse(record.fieldProvenance || '{}');
        const status = record.verificationStatus || provenance.sourceUrl || 'unverified';
        const confirmed = confirmedIds.has(record.id);
        if (['content_verified', 'verified_live', 'verified'].includes(status)) evidencePoints += confirmed ? 1 : 0.8;
        else if (status === 'link_checked') evidencePoints += confirmed ? 0.8 : 0.6;
        else if (status === 'user_entered') evidencePoints += confirmed ? 0.4 : 0.2;
        else evidencePoints += confirmed ? 0.2 : 0;
      }
      const evidenceStrengthScore = independentCount ? Math.min(100, evidencePoints / independentCount * 100) : 0;
      const independentRecordsScore = independentCount ? Math.min(100, Math.log10(independentCount + 1) * 95) : 0;
      const sourceDiversityScore = Math.min(100, new Set(independentRecords.map((r) => r.platform)).size * 25);
      const displayScores = independentCount === 0 ? [] : oppScores.map((score) => {
        if (score.criterion === 'evidence_strength') return { ...score, rawScore: Number((evidenceStrengthScore / 20).toFixed(1)), normalizedScore: Number(evidenceStrengthScore.toFixed(1)), rationale: 'Recomputed from eligible non-fixture evidence only.' };
        if (score.criterion === 'independent_records') return { ...score, rawScore: Math.min(5, Number((independentCount / 2).toFixed(1))), normalizedScore: Number(independentRecordsScore.toFixed(1)), rationale: `Recomputed from ${independentCount} eligible independent records; fixtures and duplicates excluded.` };
        if (score.criterion === 'source_diversity') return { ...score, rawScore: Math.min(5, new Set(independentRecords.map((r) => r.platform)).size), normalizedScore: Number(sourceDiversityScore.toFixed(1)), rationale: 'Recomputed from eligible non-fixture evidence only.' };
        return score;
      });

      // Extract components for sensitivity calculation
      const compMap = new Map(displayScores.map((s) => [s.criterion, s.normalizedScore]));
      const evStrength = compMap.get('evidence_strength') ?? 0;
      const indepRecords = compMap.get('independent_records') ?? 0;
      const srcDiv = compMap.get('source_diversity') ?? 0;
      const uImpact = compMap.get('user_impact') ?? 50;
      const bMetric = compMap.get('business_metric_link') ?? 50;
      const uncRaw = (oppScores.find((s) => s.criterion === 'research_uncertainty')?.rawScore ?? 3);
      const uncInverted = Math.max(0, 100 - (uncRaw / 5) * 100);
      const feas = compMap.get('potential_feasibility') ?? 50;

      const calcForW = (w: OpportunityWeights) => {
        if (independentCount === 0) return 0;
        const sum =
          w.evidenceStrength +
          w.independentRecords +
          w.sourceDiversity +
          w.userImpact +
          w.businessMetricLink +
          w.researchUncertainty +
          w.potentialFeasibility;
        if (sum <= 0) return 0;
        return Number(
          (
            (evStrength * w.evidenceStrength +
              indepRecords * w.independentRecords +
              srcDiv * w.sourceDiversity +
              uImpact * w.userImpact +
              bMetric * w.businessMetricLink +
              uncInverted * w.researchUncertainty +
              feas * w.potentialFeasibility) /
            sum
          ).toFixed(1)
        );
      };

      // Sensitivity Presets
      const sensitivityScenarios = [
        {
          id: 'balanced',
          name: 'Recommended Weights',
          description: 'Evidence strength 20%, independent records 15%, source diversity 10%, pain 20%, retention link 15%, research confidence 10%, feasibility 10%',
          score: calcForW(DEFAULT_OPPORTUNITY_WEIGHTS),
        },
        {
          id: 'evidence_first',
          name: 'Evidence-Heavy (High Verification)',
          description: 'Focuses heavily on independent non-duplicate records and provenance verification',
          score: calcForW({
            evidenceStrength: 3,
            independentRecords: 3,
            sourceDiversity: 2,
            userImpact: 1,
            businessMetricLink: 1,
            researchUncertainty: 2,
            potentialFeasibility: 1,
          }),
        },
        {
          id: 'impact_first',
          name: 'Impact-First (Strategic Potential)',
          description: 'Prioritizes immediate user severity and 12-month retention metric linkage',
          score: calcForW({
            evidenceStrength: 1,
            independentRecords: 1,
            sourceDiversity: 1,
            userImpact: 3,
            businessMetricLink: 3,
            researchUncertainty: 1,
            potentialFeasibility: 2,
          }),
        },
        {
          id: 'conservative',
          name: 'Conservative (Low Uncertainty)',
          description: 'Penalizes high research ambiguity and prioritizes immediate technical feasibility',
          score: calcForW({
            evidenceStrength: 2,
            independentRecords: 2,
            sourceDiversity: 1,
            userImpact: 1,
            businessMetricLink: 1,
            researchUncertainty: 3,
            potentialFeasibility: 3,
          }),
        },
      ];

      // Missing information & methodological caveats
      const missingInformation = [
        'Opportunity conclusions are testable hypotheses on 12-month retention, NOT proven causes of SIP churn.',
        'Backend bank ledger transaction drop-off logs are missing; signal is derived from qualitative app reviews and community threads.',
        'Public complaint frequency cannot be equated with cohort churn prevalence (vocal minority bias).',
        'Hypothesis on 12-month retention requires primary quantitative validation via a randomized controlled trial (A/B test).',
      ];

      return {
        ...opp,
        compositeScore: independentCount === 0 ? 0 : calcForW(JSON.parse(opp.weightsSnapshot || '{}') as OpportunityWeights),
        hasEligibleEvidence: independentCount > 0,
        eligibleEvidenceCount: independentCount,
        illustrativeEvidenceCount: illustrativeEvidence.length,
        totalLinkedEvidenceCount: relevantRecords.length,
        sourceDiversityCount,
        illustrativeEvidence,
        excludedFixtureCount,
        excludedDuplicateCount,
        weightsSnapshot: JSON.parse(opp.weightsSnapshot || '{}') as OpportunityWeights,
        linkedThemes,
        linkedEvidence,
        contradictoryEvidence,
        opportunityContext: {
          userScenarios: [...new Set(linkedEvidence.map((record) => record.observedBehaviour).filter((value): value is string => Boolean(value)))],
          existingWorkarounds: [...new Set(linkedEvidence.map((record) => record.existingWorkaround).filter((value): value is string => Boolean(value)))],
          candidateUnmetNeeds: [...new Set(linkedEvidence.map((record) => record.unmetNeed).filter((value): value is string => Boolean(value)))],
          candidateCauseHypotheses: [...new Set(linkedEvidence.map((record) => record.causeHypothesis).filter((value): value is string => Boolean(value)))],
          explicitlySupportedSegments: [...new Set(linkedEvidence.flatMap((record) => Object.entries(record.explicitlyStatedSegment).map(([key, value]) => `${key}: ${value}`)))],
          primaryResearchConfirmationCount: independentRecords.filter((record) => ['google_forms', 'user_interview'].includes(record.platform)).length,
          researchConfidence,
        },
        scores: displayScores,
        scoreAudit: scoreAuditRows.filter((row) => row.opportunityId === opp.id),
        sensitivityScenarios,
        missingInformation,
        isThinEvidence: independentCount < 3,
      };
    });
  }
}

