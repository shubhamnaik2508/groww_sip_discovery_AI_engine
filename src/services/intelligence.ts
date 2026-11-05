import { ResearchDimensionSchema } from './ai/schema';
import { deduplicateEligibleEvidence, isGenuineResearchEvidence, isSyntheticFixture } from '@/lib/evidenceEligibility';

export const RESEARCH_DIMENSIONS = [
  ['sip_starting_motivation', 'SIP starting motivation'],
  ['behavioural_evolution', 'Behavioural evolution'],
  ['pause_reduction_discontinuation', 'Pause, reduction & discontinuation'],
  ['checking_monitoring', 'Checking & monitoring'],
  ['in_app_confusion_anxiety', 'In-app confusion & anxiety'],
  ['external_workarounds', 'External workarounds'],
  ['continuer_vs_dropoff', 'Continuers vs drop-offs'],
  ['investor_segmentation', 'Investor segmentation'],
  ['unmet_needs', 'Unmet needs'],
] as const;
export const JOURNEY_PERIODS = ['before_start', 'registration', 'first_instalment', 'months_2_3', 'months_4_6', 'months_7_11', 'month_12'] as const;
export const CHECKING_FREQUENCIES = ['multiple_daily', 'daily', 'weekly', 'monthly', 'after_notifications', 'rarely', 'not_specified'] as const;

type SegmentField = 'ageBand' | 'incomeStability' | 'investmentSource' | 'startingInfluence' | 'sipStatus';
type ParsedAnalysis = {
  researchDimension?: unknown;
  theme?: { name?: string } | null;
  journeyStage?: string;
  journeyPeriod?: string;
  journeyPeriodEvidence?: string | null;
  checkingFrequency?: string;
  checkingFrequencyEvidence?: string | null;
  observedBehaviour?: string;
  relevantTextSpan?: string;
  evidenceExcerpt?: string;
  statedMotivation?: string | null;
  motivationEvidence?: string | null;
  statedExpectation?: string | null;
  expectationEvidence?: string | null;
  cashFlowConflict?: string | null;
  cashFlowEvidence?: string | null;
  paymentTransactionIssue?: string | null;
  paymentIssueEvidence?: string | null;
  confidenceConcern?: string | null;
  confidenceEvidence?: string | null;
  continuationStatusReason?: string | null;
  continuationEvidence?: string | null;
  triggerOrContext?: string | null;
  emotionalSignal?: string | null;
  existingWorkaround?: string | null;
  workaroundEvidence?: string | null;
  potentialUnmetNeed?: string | null;
  unmetNeedEvidence?: string | null;
  investorContext?: { status?: string; supportingQuote?: string } | null;
  missingInformation?: string[];
  explicitlyStatedSegment?: Partial<Record<SegmentField, string | null>>;
  segmentEvidence?: Partial<Record<SegmentField, string | null>>;
  statedFriction?: { description?: string; type?: string; supportingQuote?: string } | null;
  claims?: Array<{ text?: string; type?: string; groundingExcerpt?: string }>;
  abstainReason?: string | null;
  sipContinuationHypothesis?: { hypothesisText?: string; label?: string } | null;
};

export type IntelligenceRecord = {
  id: string;
  platform: string;
  sourceUrl: string;
  originalText: string;
  journeyStage?: string;
  duplicateOfId: string | null;
  isSynthetic: boolean;
  verificationStatus: string;
  entryMethod?: string | null;
  fieldProvenance?: string | Record<string, unknown> | null;
  sourceMetadata?: string | Record<string, unknown> | null;
  contentHash?: string | null;
  analysisStatus?: string | null;
  analysisProvider?: string | null;
  parsedOutput: unknown;
};

const SEGMENT_FIELDS: Array<{ key: SegmentField; label: string }> = [
  { key: 'ageBand', label: 'Age' },
  { key: 'incomeStability', label: 'Income stability' },
  { key: 'investmentSource', label: 'Investment source' },
  { key: 'startingInfluence', label: 'Starting influence' },
  { key: 'sipStatus', label: 'SIP status' },
];

function asAnalysis(value: unknown): ParsedAnalysis | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as ParsedAnalysis;
}

function sourceHasSpan(source: string, span: string | null | undefined) {
  const normalize = (value: string) => value.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  return Boolean(span?.trim() && normalize(source).includes(normalize(span)));
}

function confidenceFor(items: Array<{ verificationStatus: string; platform: string }>) {
  const verified = items.filter((item) => ['content_verified', 'verified_live', 'verified'].includes(item.verificationStatus)).length;
  const sourceCount = new Set(items.map((item) => item.platform)).size;
  const confidence = items.length >= 5 && verified >= 3 && sourceCount >= 3 ? 'High evidence support'
    : items.length >= 3 && verified >= 2 && sourceCount >= 2 ? 'Moderate evidence support'
    : items.length > 0 ? 'Limited evidence support' : 'Insufficient evidence';
  return { verifiedCount: verified, sourceCount, confidence };
}

export function summarizeIntelligence(records: IntelligenceRecord[], storedContradictions: Array<{ title: string; description: string; evidenceAId: string; evidenceBId: string }> = []) {
  const eligibleEvidence = deduplicateEligibleEvidence(records);
  const eligible = eligibleEvidence.filter((record) => (!record.analysisStatus || record.analysisStatus === 'valid') && record.analysisProvider !== 'fake');
  const byId = new Map(eligible.map((record) => [record.id, record]));
  const evidenceById = new Map(eligibleEvidence.map((record) => [record.id, record]));
  const analyzed = eligible.flatMap((record) => {
    const analysis = asAnalysis(record.parsedOutput);
    return analysis ? [{ record, analysis }] : [];
  });

  const exactSpan = (source: string, span: string | null | undefined) => sourceHasSpan(source, span);
  const firstTimeContext = (record: IntelligenceRecord, analysis: ParsedAnalysis) =>
    Boolean(analysis.investorContext?.status && /first.?time|first sip|new investor/i.test(analysis.investorContext.status) && exactSpan(record.originalText, analysis.investorContext.supportingQuote));
  const questionSpecs = [
    { key: 'Q1', question: 'Why do people start a SIP, and what do they expect to happen?', dimension: 'sip_starting_motivation', stages: ['discovery_intent'], findings: (a: ParsedAnalysis) => [{ value: a.statedMotivation, quote: a.motivationEvidence, category: 'Stated motivation' }, { value: a.statedExpectation, quote: a.expectationEvidence, category: 'Stated expectation' }] },
    { key: 'Q2', question: 'What changes in investor behaviour in the months after starting?', dimension: 'behavioural_evolution', stages: ['discovery_intent', 'mandate_kyc_setup', 'first_instalment', 'market_dip_reaction', 'autopay_failure_recovery', 'continuation_milestone', 'pause_cancellation'], findings: (a: ParsedAnalysis) => [{ value: a.observedBehaviour, quote: a.relevantTextSpan || a.evidenceExcerpt || a.journeyPeriodEvidence, category: a.journeyPeriod && a.journeyPeriod !== 'unspecified' ? a.journeyPeriod : 'Timing not established', requirePeriod: true }] },
    { key: 'Q3', question: 'What leads investors to pause, reduce or stop a SIP?', dimension: 'pause_reduction_discontinuation', stages: ['autopay_failure_recovery', 'pause_cancellation', 'continuation_milestone'], findings: (a: ParsedAnalysis) => [{ value: a.continuationStatusReason, quote: a.continuationEvidence, category: a.explicitlyStatedSegment?.sipStatus ?? 'Status unknown' }] },
    { key: 'Q4', question: 'What do investors check, and how often, after starting?', dimension: 'checking_monitoring', stages: [], findings: (a: ParsedAnalysis) => [{ value: a.checkingFrequency && a.checkingFrequency !== 'not_specified' ? `Checks ${a.checkingFrequency.replace(/_/g, ' ')}` : null, quote: a.checkingFrequencyEvidence, category: 'Checking frequency' }] },
    { key: 'Q5', question: 'What confuses or worries investors inside the app?', dimension: 'in_app_confusion_anxiety', stages: ['mandate_kyc_setup', 'first_instalment', 'autopay_failure_recovery', 'market_dip_reaction'], findings: (a: ParsedAnalysis) => [{ value: a.paymentTransactionIssue, quote: a.paymentIssueEvidence, category: 'Payment / transaction' }, { value: a.confidenceConcern, quote: a.confidenceEvidence, category: 'Concern' }] },
    { key: 'Q6', question: 'What do investors do outside the app when they feel unsure?', dimension: 'external_workarounds', stages: [], findings: (a: ParsedAnalysis) => [{ value: a.existingWorkaround, quote: a.workaroundEvidence, category: 'Workaround' }] },
    { key: 'Q7', question: 'What separates investors who continue from those who quietly drop off?', dimension: 'continuer_vs_dropoff', stages: ['continuation_milestone', 'pause_cancellation'], findings: (a: ParsedAnalysis) => [{ value: a.continuationStatusReason, quote: a.continuationEvidence || a.segmentEvidence?.sipStatus, category: a.explicitlyStatedSegment?.sipStatus ?? 'Status unknown' }] },
    { key: 'Q8', question: 'How do patterns differ by income stability, age, investment source and starting influence?', dimension: 'investor_segmentation', stages: [], findings: (a: ParsedAnalysis) => SEGMENT_FIELDS.filter(({ key }) => key !== 'sipStatus').map(({ key, label }) => ({ value: a.explicitlyStatedSegment?.[key], quote: a.segmentEvidence?.[key], category: label })) },
    { key: 'Q9', question: 'What unmet needs emerge consistently across conversations?', dimension: 'unmet_needs', stages: [], findings: (a: ParsedAnalysis) => [{ value: a.potentialUnmetNeed, quote: a.unmetNeedEvidence, category: 'Unmet need' }] },
  ] as const;
  const questionCoverage = questionSpecs.map((spec) => {
    const evidence = analyzed.flatMap(({ record, analysis }) => {
      return spec.findings(analysis).flatMap((finding) => {
        const value = finding.value?.trim();
        const quote = finding.quote?.trim();
        if (!value || !exactSpan(record.originalText, quote) || ('requirePeriod' in finding && finding.requirePeriod && (!analysis.journeyPeriod || analysis.journeyPeriod === 'unspecified' || !exactSpan(record.originalText, analysis.journeyPeriodEvidence))) || (['Q3', 'Q7'].includes(spec.key) && (!analysis.explicitlyStatedSegment?.sipStatus || analysis.explicitlyStatedSegment.sipStatus === 'unknown' || !exactSpan(record.originalText, analysis.segmentEvidence?.sipStatus)))) return [];
        if (spec.key === 'Q1' && !firstTimeContext(record, analysis)) return [];
        return [{ id: record.id, platform: record.platform, url: record.sourceUrl, excerpt: quote!, interpretation: value, category: finding.category, verificationStatus: record.verificationStatus, analysisProvider: record.analysisProvider ?? 'unknown' }];
      });
    });
    const uniqueEvidenceRecords = [...new Map(evidence.map((item) => [item.id, item])).values()];
    const sources = new Set(uniqueEvidenceRecords.map((item) => item.platform));
    const verifiedCount = uniqueEvidenceRecords.filter((item) => ['content_verified', 'verified_live', 'verified'].includes(item.verificationStatus)).length;
    const confidence = uniqueEvidenceRecords.length >= 5 && verifiedCount >= 3 && sources.size >= 3 ? 'High evidence support'
      : uniqueEvidenceRecords.length >= 3 && verifiedCount >= 2 && sources.size >= 2 ? 'Moderate evidence support'
      : uniqueEvidenceRecords.length > 0 ? 'Limited evidence support' : 'Insufficient evidence';
    const status = confidence === 'High evidence support' ? 'SUPPORTED'
      : uniqueEvidenceRecords.length > 0 ? 'PARTIALLY SUPPORTED'
      : eligibleEvidence.length > 0 && analyzed.length === 0 ? 'NOT TESTED' : 'NOT SUPPORTED';
    const evidenceIds = new Set(evidence.map((row) => row.id));
    const contradictionCount = storedContradictions.filter((item) => evidenceIds.has(item.evidenceAId) && evidenceIds.has(item.evidenceBId)).length;
    const illustrativeEvidence = records.filter(isSyntheticFixture).flatMap((record) => {
      const analysis = asAnalysis(record.parsedOutput);
      if (!analysis) return [];
      return spec.findings(analysis).flatMap((finding) => {
        const value = finding.value?.trim();
        const proposedQuote = finding.quote?.trim();
        if (!value || !exactSpan(record.originalText, proposedQuote) || ('requirePeriod' in finding && finding.requirePeriod && (!analysis.journeyPeriod || analysis.journeyPeriod === 'unspecified' || !exactSpan(record.originalText, analysis.journeyPeriodEvidence))) || (['Q3', 'Q7'].includes(spec.key) && (!analysis.explicitlyStatedSegment?.sipStatus || analysis.explicitlyStatedSegment.sipStatus === 'unknown' || !exactSpan(record.originalText, analysis.segmentEvidence?.sipStatus)))) return [];
        if (spec.key === 'Q1' && !firstTimeContext(record, analysis)) return [];
        return [{ id: record.id, platform: record.platform, url: record.sourceUrl, excerpt: proposedQuote!, interpretation: value, category: finding.category, analysisProvider: record.analysisProvider ?? 'unknown' }];
      });
    });
    const illustrativeContext = records.filter((record) => isSyntheticFixture(record) && Boolean(record.journeyStage && (spec.stages as readonly string[]).includes(record.journeyStage))).flatMap((record) => {
      const analysis = asAnalysis(record.parsedOutput);
      if (!analysis || !record.journeyStage) return [];
      return [{ id: record.id, platform: record.platform, url: record.sourceUrl, excerpt: record.originalText, journeyStage: record.journeyStage, theme: analysis.theme?.name ?? null }];
    });
    const unverifiedEvidence = records.filter((record) => !isSyntheticFixture(record) && !record.duplicateOfId && !isGenuineResearchEvidence(record)).flatMap((record) => {
      const analysis = asAnalysis(record.parsedOutput);
      if (!analysis || (record.analysisStatus && record.analysisStatus !== 'valid')) return [];
      return spec.findings(analysis).flatMap((finding) => {
        const value = finding.value?.trim();
        const quote = finding.quote?.trim();
        if (!value || !exactSpan(record.originalText, quote) || ('requirePeriod' in finding && finding.requirePeriod && (!analysis.journeyPeriod || analysis.journeyPeriod === 'unspecified' || !exactSpan(record.originalText, analysis.journeyPeriodEvidence))) || (['Q3', 'Q7'].includes(spec.key) && (!analysis.explicitlyStatedSegment?.sipStatus || analysis.explicitlyStatedSegment.sipStatus === 'unknown' || !exactSpan(record.originalText, analysis.segmentEvidence?.sipStatus)))) return [];
        if (spec.key === 'Q1' && !firstTimeContext(record, analysis)) return [];
        return [{ id: record.id, platform: record.platform, url: record.sourceUrl, excerpt: quote!, interpretation: value, category: finding.category, verificationStatus: record.verificationStatus, analysisProvider: record.analysisProvider ?? 'unknown' }];
      });
    });
    const illustrativeIds = new Set(illustrativeEvidence.map((row) => row.id));
    const illustrativeCount = illustrativeIds.size;
    const unverifiedCount = new Set(unverifiedEvidence.map((row) => row.id)).size;
    const relevantIds = new Set([...evidence.map((row) => row.id), ...illustrativeIds, ...unverifiedEvidence.map((row) => row.id)]);
    const totalRelevantCount = relevantIds.size;
    const sourceCounts = (rows: Array<{ platform: string }>) => Object.entries(rows.reduce<Record<string, number>>((counts, row) => { counts[row.platform] = (counts[row.platform] ?? 0) + 1; return counts; }, {})).map(([platform, count]) => ({ platform, count }));
    const groupCounts = (rows: Array<{ category: string; id: string }>) => [...new Set(rows.map((row) => row.category))].map((category) => ({ category, count: new Set(rows.filter((row) => row.category === category).map((row) => row.id)).size }));
    return { ...spec, count: uniqueEvidenceRecords.length, genuineCount: uniqueEvidenceRecords.length, demoCount: illustrativeCount, illustrativeCount, unverifiedCount, totalRelevantCount, illustrativeContextCount: new Set(illustrativeContext.map((row) => row.id)).size, illustrativeContext, sources: [...sources], sourceCount: sources.size, sourceBreakdown: { genuine: sourceCounts(uniqueEvidenceRecords), illustrative: sourceCounts([...new Map(illustrativeEvidence.map((item) => [item.id, item])).values()]), unverified: sourceCounts([...new Map(unverifiedEvidence.map((item) => [item.id, item])).values()]) }, groupCounts: { genuine: groupCounts(uniqueEvidenceRecords), illustrative: groupCounts([...new Map(illustrativeEvidence.map((item) => [item.id, item])).values()]) }, verifiedCount, confidence, status, evidence, demoEvidence: illustrativeEvidence, illustrativeEvidence, unverifiedEvidence, contradictionCount };
  });

  const dimensions = RESEARCH_DIMENSIONS.map(([key, label]) => {
    const evidence = analyzed.flatMap(({ record, analysis }) => {
      if (!ResearchDimensionSchema.safeParse(analysis.researchDimension).success || analysis.researchDimension !== key) return [];
      return [{ id: record.id, platform: record.platform, sourceUrl: record.sourceUrl, excerpt: record.originalText, theme: analysis.theme?.name ?? null, behaviour: analysis.observedBehaviour ?? null, verificationStatus: record.verificationStatus }];
    });
    return { key, label, count: evidence.length, ...confidenceFor(evidence), evidence };
  });

  const themes = new Map<string, Array<{ id: string; platform: string; url: string; excerpt: string; behaviour: string | null }>>();
  const unmetNeeds = new Map<string, Array<{ id: string; platform: string; url: string; excerpt: string }>>();
  const chains: Array<{ id: string; platform: string; url: string; trigger: string; interpretation: string; behaviour: string; workaround: string; consequence: string }> = [];
  const segmentMaps = new Map<SegmentField, Map<string, string[]>>(SEGMENT_FIELDS.map(({ key }) => [key, new Map()]));
  const segmentThemeMaps = new Map<SegmentField, Map<string, Map<string, Set<string>>>>(SEGMENT_FIELDS.map(({ key }) => [key, new Map()]));
  const explicitSegmentIds = new Set<string>();
  const unanswered = new Map<string, number>();
  let groundedObservations = 0;
  let ungroundedObservations = 0;
  let abstentions = 0;

  for (const { record, analysis } of analyzed) {
    if (analysis.abstainReason || analysis.researchDimension === 'insufficient_evidence') abstentions++;
    const themeName = analysis.theme?.name?.trim();
    if (themeName) {
      const rows = themes.get(themeName) ?? [];
      rows.push({ id: record.id, platform: record.platform, url: record.sourceUrl, excerpt: record.originalText, behaviour: analysis.observedBehaviour ?? null });
      themes.set(themeName, rows);
    }
    const need = analysis.potentialUnmetNeed?.trim();
    if (need) {
      const rows = unmetNeeds.get(need) ?? [];
      rows.push({ id: record.id, platform: record.platform, url: record.sourceUrl, excerpt: record.originalText });
      unmetNeeds.set(need, rows);
    }
    if (analysis.triggerOrContext && analysis.statedFriction?.description && analysis.observedBehaviour && analysis.existingWorkaround && (analysis.potentialUnmetNeed || analysis.sipContinuationHypothesis?.hypothesisText)) {
      chains.push({ id: record.id, platform: record.platform, url: record.sourceUrl, trigger: analysis.triggerOrContext, interpretation: analysis.statedFriction.description, behaviour: analysis.observedBehaviour, workaround: analysis.existingWorkaround, consequence: analysis.potentialUnmetNeed || analysis.sipContinuationHypothesis?.hypothesisText || '' });
    }
    for (const missing of analysis.missingInformation ?? []) unanswered.set(missing, (unanswered.get(missing) ?? 0) + 1);
    for (const claim of analysis.claims ?? []) {
      const excerpt = claim.groundingExcerpt?.trim();
      const grounded = Boolean(excerpt && record.originalText.toLocaleLowerCase().includes(excerpt.toLocaleLowerCase()));
      if (claim.type === 'observation') {
        if (grounded) groundedObservations++;
        else ungroundedObservations++;
      }
    }
    const segments = analysis.explicitlyStatedSegment;
    if (!segments) continue;
    for (const { key } of SEGMENT_FIELDS) {
      const rawValue = segments[key]?.trim();
      const quote = analysis.segmentEvidence?.[key]?.trim();
      const quoteIsSourceText = sourceHasSpan(record.originalText, quote);
      const value = rawValue && rawValue.toLocaleLowerCase() !== 'unknown' && quoteIsSourceText ? rawValue : null;
      const map = segmentMaps.get(key)!;
      const normalized = value || 'Unknown / not stated';
      if (value) explicitSegmentIds.add(record.id);
      const ids = map.get(normalized) ?? [];
      ids.push(record.id);
      map.set(normalized, ids);
      const themeMap = segmentThemeMaps.get(key)!;
      const themeGroups = themeMap.get(normalized) ?? new Map<string, Set<string>>();
      if (analysis.theme?.name) {
        const themeRecordIds = themeGroups.get(analysis.theme.name) ?? new Set<string>();
        themeRecordIds.add(record.id);
        themeGroups.set(analysis.theme.name, themeRecordIds);
      }
      themeMap.set(normalized, themeGroups);
    }
  }

  const patterns = [...themes.entries()].map(([label, rows]) => ({
    label,
    count: rows.length,
    confidence: confidenceFor(rows.map((row) => ({ verificationStatus: byId.get(row.id)?.verificationStatus ?? 'unverified', platform: row.platform })).filter(Boolean)).confidence,
    evidence: rows,
  })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const repeatedNeeds = [...unmetNeeds.entries()].map(([label, rows]) => ({ label, count: rows.length, evidence: rows }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const segments = SEGMENT_FIELDS.map(({ key, label }) => {
    const groups = [...segmentMaps.get(key)!.entries()].map(([value, ids]) => ({ value, count: new Set(ids).size }));
    const known = groups.filter((group) => group.value !== 'Unknown / not stated').reduce((sum, group) => sum + group.count, 0);
    const total = eligibleEvidence.length;
    const comparisons = groups.map((group) => ({
      ...group,
      evidence: [...new Set(segmentMaps.get(key)!.get(group.value) ?? [])].map((id) => ({ id, url: byId.get(id)?.sourceUrl ?? '', quote: (asAnalysis(byId.get(id)?.parsedOutput)?.segmentEvidence?.[key] ?? null) })),
      themes: [...(segmentThemeMaps.get(key)!.get(group.value)?.entries() ?? [])]
        .map(([name, ids]) => ({ name, count: ids.size, evidence: [...ids].map((id) => ({ id, url: byId.get(id)?.sourceUrl ?? '' })) }))
        .sort((a, b) => b.count - a.count),
    }));
    return { key, label, knownCount: known, unknownCount: Math.max(0, total - known), groups: comparisons.sort((a, b) => b.count - a.count) };
  });

  const gaps = [
    ...dimensions.filter((dimension) => dimension.count === 0).map((dimension) => `No eligible stored analysis currently covers ${dimension.label.toLowerCase()}.`),
    ...[...unanswered.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([text, count]) => `${text} (flagged in ${count} analysis record${count === 1 ? '' : 's'}).`),
    ...(explicitSegmentIds.size < eligible.length ? [`${eligible.length - explicitSegmentIds.size} of ${eligible.length} eligible records have no explicit segment value; unknown values are not inferred.`] : []),
  ];

  return {
    eligibleRecordCount: eligibleEvidence.length,
    analyzedRecordCount: analyzed.length,
    allAnalyzedRecordCount: new Set(records.filter((record) => asAnalysis(record.parsedOutput) && (!record.analysisStatus || record.analysisStatus === 'valid')).map((record) => record.id)).size,
    illustrativeAnalyzedRecordCount: new Set(records.filter((record) => isSyntheticFixture(record) && asAnalysis(record.parsedOutput) && (!record.analysisStatus || record.analysisStatus === 'valid')).map((record) => record.id)).size,
    syntheticExcluded: records.filter(isSyntheticFixture).length,
    simulatedAnalysisExcluded: records.filter((record) => record.analysisProvider === 'fake' && !isSyntheticFixture(record)).length,
    duplicatesExcluded: records.filter((record) => !isSyntheticFixture(record) && Boolean(record.duplicateOfId)).length,
    dimensions,
    questionCoverage,
    journeyStages: [...new Set(analyzed.map(({ analysis }) => analysis.journeyStage).filter((value): value is string => Boolean(value)))].map((stage) => ({ stage, count: analyzed.filter(({ analysis }) => analysis.journeyStage === stage).length })),
    journeyPeriods: JOURNEY_PERIODS.map((period) => ({ period, count: analyzed.filter(({ record, analysis }) => analysis.journeyPeriod === period && sourceHasSpan(record.originalText, analysis.journeyPeriodEvidence)).length, evidence: analyzed.filter(({ record, analysis }) => analysis.journeyPeriod === period && sourceHasSpan(record.originalText, analysis.journeyPeriodEvidence)).map(({ record, analysis }) => ({ id: record.id, url: record.sourceUrl, quote: analysis.journeyPeriodEvidence! })) })),
    journeyPeriodUnspecifiedCount: analyzed.length - analyzed.filter(({ record, analysis }) => JOURNEY_PERIODS.includes(analysis.journeyPeriod as typeof JOURNEY_PERIODS[number]) && sourceHasSpan(record.originalText, analysis.journeyPeriodEvidence)).length,
    checkingFrequencies: CHECKING_FREQUENCIES.map((frequency) => {
      const rows = frequency === 'not_specified'
        ? analyzed.filter(({ record, analysis }) => analysis.researchDimension === 'checking_monitoring' && !(CHECKING_FREQUENCIES.some((specified) => specified !== 'not_specified' && analysis.checkingFrequency === specified && sourceHasSpan(record.originalText, analysis.checkingFrequencyEvidence))))
        : analyzed.filter(({ record, analysis }) => analysis.checkingFrequency === frequency && sourceHasSpan(record.originalText, analysis.checkingFrequencyEvidence));
      return { frequency, count: rows.length, evidence: frequency === 'not_specified' ? [] : rows.map(({ record, analysis }) => ({ id: record.id, url: record.sourceUrl, quote: analysis.checkingFrequencyEvidence! })) };
    }),
    recurringPatterns: patterns,
    unmetNeeds: repeatedNeeds,
    behaviouralChains: chains,
    segments,
    contradictions: storedContradictions.flatMap((item) => {
      const a = evidenceById.get(item.evidenceAId);
      const b = evidenceById.get(item.evidenceBId);
      return a && b ? [{ ...item, evidenceAUrl: a.sourceUrl, evidenceBUrl: b.sourceUrl }] : [];
    }),
    evidenceGaps: gaps,
    evidenceQuality: {
      observationClaimsGrounded: groundedObservations,
      observationClaimsUngrounded: ungroundedObservations,
      abstentions,
      abstentionRate: analyzed.length ? abstentions / analyzed.length : null,
    },
  };
}
