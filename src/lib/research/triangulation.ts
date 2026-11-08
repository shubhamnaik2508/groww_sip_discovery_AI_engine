import {
  CODE_DEFINITIONS,
  LIFEFLOW_SIGNAL_DEFINITIONS,
  LifeflowSignal,
  OPPORTUNITY_DEFINITIONS,
  RESEARCH_CODES,
  ResearchCode,
  isLifeflowSignal,
  isResearchCode,
} from './codebook';
import { ParsedSurvey, computeSurveyCodeEvidence, findQuestion, splitMulti, SurveyCodeEvidence } from './survey';

/**
 * Research Triangulation Engine (pure, deterministic).
 * Compares Pipeline A (survey respondents) with Pipeline B (AI-coded public records)
 * theme by theme. The two sources are never pooled: each keeps its own unit and denominator.
 */

export const THRESHOLDS = {
  surveyPresentPct: 20, // ≥20% of respondents who answered the mapped questions
  publicPresentPct: 10, // ≥10% of validly analysed public records…
  publicPresentMinRecords: 3, // …and at least 3 records
  surveyNearZeroPct: 10,
  publicNearZeroPct: 3,
  divergentRankGap: 4,
} as const;

export interface PublicCodedRecord {
  evidenceId: string;
  recordAnalysisId: string;
  platform: string;
  sourceUrl: string;
  title: string | null;
  originalText: string;
  publishedAt: string | null;
  firstPerson: boolean | null;
  codes: Array<{ code: ResearchCode; quote: string }>;
  signals: Array<{ signal: LifeflowSignal; quote: string }>;
  themeName: string | null;
  model: string;
  analysedAt: string;
}

export interface PublicDatasetSummary {
  totalRecords: number; // all public evidence records stored
  eligibleRecords: number; // genuine, content-verified, non-duplicate
  excludedRecords: Array<{ evidenceId: string; reason: string }>;
  analysedValid: number; // denominator for public percentages
  analysedFailed: number;
  notAnalysed: number;
  firstPersonValid: number;
  platforms: Record<string, number>; // eligible records by platform
  models: string[];
}

export interface SurveyOpenTextCoding {
  respondentCode: string;
  questionId: string;
  text: string;
  codes: Array<{ code: ResearchCode; quote: string }>;
  model: string;
}

export type Relationship = 'convergent' | 'divergent' | 'survey_only' | 'public_only' | 'not_measured_in_survey' | 'insufficient';
export type Strength = 'strong' | 'moderate' | 'limited';

export interface CodeRow {
  code: ResearchCode;
  label: string;
  definition: string;
  kind: 'problem' | 'behaviour' | 'motivation';
  survey: SurveyCodeEvidence & { basis: 'experienced' | 'stated_need' | 'not_measured'; primaryPct: number; openText: Array<{ respondentCode: string; quote: string }> };
  public: { count: number; denominator: number; pct: number; firstPersonCount: number; platforms: string[]; records: Array<{ evidenceId: string; platform: string; sourceUrl: string; title: string | null; quote: string; firstPerson: boolean | null }> };
  surveyRank: number | null;
  publicRank: number | null;
  relationship: Relationship;
  relationshipReason: string;
  strength: Strength;
  strengthReason: string;
}

export interface OpportunityRow {
  id: string;
  title: string;
  problemStatement: string;
  existingConcept?: string;
  codes: ResearchCode[];
  surveyRespondents: {
    count: number;
    denominator: number;
    pct: number;
    respondentCodes: string[];
    basis: 'experienced' | 'stated_need';
    statedNeedCount: number; // respondents who asked for this kind of help (reported separately)
    countedCodes: ResearchCode[];
  };
  publicRecords: { count: number; denominator: number; pct: number; platforms: string[]; evidenceIds: string[]; firstPersonCount: number };
  convergence: number; // share of the opportunity's codes that converge
  sourceDiversity: number; // distinct public platforms / platforms in dataset
  score: number;
  scoreParts: { survey: number; public: number; diversity: number; convergence: number };
  rank: number;
  rankSurveyOnly: number;
  rankPublicOnly: number;
  evidenceQuality: Strength;
  verdict: string;
}

export interface SignalRow {
  signal: LifeflowSignal;
  label: string;
  feature: 'life_to_sip' | 'market_pulse';
  survey: { measured: boolean; count: number; denominator: number; pct: number; question?: string; option?: string; caveat?: string };
  public: { count: number; denominator: number; pct: number; evidenceIds: string[]; quotes: Array<{ evidenceId: string; quote: string; sourceUrl: string; platform: string }> };
  status: 'supported_by_both' | 'survey_only' | 'public_only' | 'not_measured_public_absent' | 'not_measured_public_present' | 'weak';
}

export interface TriangulationResult {
  generatedAt: string;
  thresholds: typeof THRESHOLDS;
  surveyRespondents: number;
  publicSummary: PublicDatasetSummary;
  rows: CodeRow[];
  opportunities: OpportunityRow[];
  signals: SignalRow[];
  scoringFormula: string;
}

const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10);

function rankBy<T>(items: T[], value: (t: T) => number, eligible: (t: T) => boolean): Map<T, number> {
  const sorted = items.filter(eligible).sort((a, b) => value(b) - value(a));
  const ranks = new Map<T, number>();
  let lastVal: number | null = null;
  let lastRank = 0;
  sorted.forEach((item, i) => {
    const v = value(item);
    const rank = lastVal !== null && v === lastVal ? lastRank : i + 1;
    ranks.set(item, rank);
    lastVal = v;
    lastRank = rank;
  });
  return ranks;
}

export function classifyRelationship(
  s: { measured: boolean; pct: number },
  p: { pct: number; count: number; denominator: number },
  rankGap: number | null,
): { relationship: Relationship; reason: string } {
  const T = THRESHOLDS;
  if (p.denominator === 0) {
    return { relationship: s.measured && s.pct >= T.surveyPresentPct ? 'survey_only' : 'insufficient', reason: 'Public feedback has not been analysed yet, so no cross-source comparison is possible.' };
  }
  const surveyPresent = s.measured && s.pct >= T.surveyPresentPct;
  const publicPresent = p.pct >= T.publicPresentPct && p.count >= T.publicPresentMinRecords;
  if (!s.measured) {
    return publicPresent
      ? { relationship: 'not_measured_in_survey', reason: `Appears in ${p.count} public records (${p.pct}%), but the survey never asked about it. This is absence of evidence, not evidence of absence.` }
      : { relationship: 'insufficient', reason: `Not measured in the survey and below the public threshold (${p.count} records, ${p.pct}%).` };
  }
  if (surveyPresent && publicPresent) {
    if (rankGap !== null && rankGap >= T.divergentRankGap) {
      return { relationship: 'divergent', reason: `Present in both sources, but its prominence differs sharply (rank gap ${rankGap}).` };
    }
    return { relationship: 'convergent', reason: `Survey ${s.pct}% ≥ ${T.surveyPresentPct}% and public ${p.pct}% (${p.count} records) ≥ ${T.publicPresentPct}%.` };
  }
  if (surveyPresent && !publicPresent) {
    if (s.pct >= T.surveyPresentPct * 2 && p.pct < T.publicNearZeroPct) {
      return { relationship: 'divergent', reason: `Prominent in the survey (${s.pct}%) but almost absent in public feedback (${p.count} records, ${p.pct}%).` };
    }
    return { relationship: 'survey_only', reason: `Survey ${s.pct}% meets the threshold; public ${p.pct}% (${p.count} records) does not.` };
  }
  if (!surveyPresent && publicPresent) {
    if (p.pct >= T.publicPresentPct * 2 && s.pct < T.surveyNearZeroPct) {
      return { relationship: 'divergent', reason: `Prominent in public feedback (${p.pct}%) but rarely chosen in the survey (${s.pct}%).` };
    }
    return { relationship: 'public_only', reason: `Public ${p.pct}% (${p.count} records) meets the threshold; survey ${s.pct}% does not.` };
  }
  return { relationship: 'insufficient', reason: `Below both thresholds (survey ${s.pct}%, public ${p.pct}% / ${p.count} records).` };
}

function strengthFor(rel: Relationship, surveyPct: number, surveyN: number, publicCount: number, platformCount: number): { strength: Strength; reason: string } {
  if (rel === 'convergent' && platformCount >= 2 && surveyN >= 10) {
    return { strength: 'strong', reason: `Both sources, ${surveyN} respondents and ${publicCount} public records across ${platformCount} platforms.` };
  }
  if (rel === 'convergent' || (rel === 'survey_only' && surveyPct >= 40) || ((rel === 'public_only' || rel === 'not_measured_in_survey') && platformCount >= 2 && publicCount >= 5)) {
    return { strength: 'moderate', reason: rel === 'convergent' ? `Both sources agree, but public support comes from ${platformCount} platform(s).` : 'Strong in one source only; needs confirmation from the other.' };
  }
  return { strength: 'limited', reason: 'Thin or single-source evidence.' };
}

export function computeTriangulation(input: {
  survey: ParsedSurvey | null;
  surveyOpenText: SurveyOpenTextCoding[];
  publicRecords: PublicCodedRecord[]; // validly analysed, eligible public records only
  publicSummary: PublicDatasetSummary;
}): TriangulationResult {
  const { survey, publicRecords, publicSummary } = input;
  const surveyEvidence = survey ? computeSurveyCodeEvidence(survey, RESEARCH_CODES) : new Map<ResearchCode, SurveyCodeEvidence>();
  const publicDenominator = publicSummary.analysedValid;
  const totalPlatforms = Object.keys(publicSummary.platforms).length || 1;

  const baseRows = RESEARCH_CODES.map((code) => {
    const se: SurveyCodeEvidence = surveyEvidence.get(code) ?? {
      code,
      experienced: { count: 0, denominator: 0, pct: 0, respondentCodes: [] },
      statedNeed: { count: 0, denominator: 0, pct: 0, respondentCodes: [] },
      sources: [],
      measured: false,
    };
    const basis: CodeRow['survey']['basis'] = !se.measured ? 'not_measured' : se.experienced.denominator > 0 ? 'experienced' : 'stated_need';
    const primaryPct = basis === 'experienced' ? se.experienced.pct : basis === 'stated_need' ? se.statedNeed.pct : 0;
    const openText = input.surveyOpenText.flatMap((o) => o.codes.filter((c) => c.code === code).map((c) => ({ respondentCode: o.respondentCode, quote: c.quote })));
    const hits = publicRecords.filter((r) => r.codes.some((c) => c.code === code));
    const platforms = [...new Set(hits.map((h) => h.platform))].sort();
    return {
      code,
      survey: { ...se, basis, primaryPct, openText },
      public: {
        count: hits.length,
        denominator: publicDenominator,
        pct: pct(hits.length, publicDenominator),
        firstPersonCount: hits.filter((h) => h.firstPerson).length,
        platforms,
        records: hits.map((h) => ({
          evidenceId: h.evidenceId,
          platform: h.platform,
          sourceUrl: h.sourceUrl,
          title: h.title,
          quote: h.codes.find((c) => c.code === code)!.quote,
          firstPerson: h.firstPerson,
        })),
      },
    };
  });

  type Base = (typeof baseRows)[number];
  const surveyRanks = rankBy<Base>(baseRows, (r) => r.survey.primaryPct, (r) => r.survey.measured && CODE_DEFINITIONS[r.code].kind !== 'motivation');
  const publicRanks = rankBy<Base>(baseRows, (r) => r.public.pct, (r) => r.public.count > 0 && CODE_DEFINITIONS[r.code].kind !== 'motivation');

  const rows: CodeRow[] = baseRows.map((r) => {
    const def = CODE_DEFINITIONS[r.code];
    const sr = surveyRanks.get(r) ?? null;
    const pr = publicRanks.get(r) ?? null;
    const gap = sr !== null && pr !== null ? Math.abs(sr - pr) : null;
    const { relationship, reason } = classifyRelationship({ measured: r.survey.measured, pct: r.survey.primaryPct }, { pct: r.public.pct, count: r.public.count, denominator: r.public.denominator }, gap);
    const surveyN = r.survey.basis === 'experienced' ? r.survey.experienced.count : r.survey.statedNeed.count;
    const { strength, reason: sReason } = strengthFor(relationship, r.survey.primaryPct, surveyN, r.public.count, r.public.platforms.length);
    return {
      ...r,
      label: def.label,
      definition: def.definition,
      kind: def.kind,
      surveyRank: sr,
      publicRank: pr,
      relationship,
      relationshipReason: reason,
      strength,
      strengthReason: sReason,
    };
  });
  const rowByCode = new Map(rows.map((r) => [r.code, r]));

  // Opportunities: union of evidence across member codes (no double counting).
  const totalRespondents = survey?.responses.length ?? 0;
  const oppBase = OPPORTUNITY_DEFINITIONS.map((o) => {
    // Survey support counts PROBLEM themes only (behaviours such as help-seeking are
    // context, not a problem). Experienced problems are preferred; stated needs are
    // used only when no member theme was measured as an experience.
    const problemCodes = o.codes.filter((c) => CODE_DEFINITIONS[c].kind === 'problem');
    const surveyCodes = problemCodes.length ? problemCodes : o.codes;
    const useExperienced = surveyCodes.some((c) => rowByCode.get(c)!.survey.basis === 'experienced');
    const respondents = new Set<string>();
    const stated = new Set<string>();
    let surveyDenominator = 0;
    for (const c of surveyCodes) {
      const row = rowByCode.get(c)!;
      row.survey.statedNeed.respondentCodes.forEach((x) => stated.add(x));
      const ev = useExperienced ? row.survey.experienced : row.survey.statedNeed;
      ev.respondentCodes.forEach((x) => respondents.add(x));
      surveyDenominator = Math.max(surveyDenominator, ev.denominator);
    }
    if (surveyDenominator === 0) surveyDenominator = totalRespondents;
    const recs = publicRecords.filter((r) => r.codes.some((c) => o.codes.includes(c.code)));
    const platforms = [...new Set(recs.map((r) => r.platform))].sort();
    const relWeight = (c: ResearchCode) => ({ convergent: 1, divergent: 0.5 } as Record<string, number>)[rowByCode.get(c)!.relationship] ?? 0;
    const convergenceShare = o.codes.reduce((acc, c) => acc + relWeight(c), 0) / o.codes.length;
    return {
      def: o,
      surveyRespondents: {
        count: respondents.size,
        denominator: surveyDenominator,
        pct: pct(respondents.size, surveyDenominator),
        respondentCodes: [...respondents].sort(),
        basis: (useExperienced ? 'experienced' : 'stated_need') as 'experienced' | 'stated_need',
        statedNeedCount: stated.size,
        countedCodes: surveyCodes,
      },
      publicRecords: {
        count: recs.length,
        denominator: publicDenominator,
        pct: pct(recs.length, publicDenominator),
        platforms,
        evidenceIds: recs.map((r) => r.evidenceId),
        firstPersonCount: recs.filter((r) => r.firstPerson).length,
      },
      convergence: Math.round(convergenceShare * 100) / 100,
      sourceDiversity: Math.round((platforms.length / totalPlatforms) * 100) / 100,
    };
  });
  const maxSurvey = Math.max(0.0001, ...oppBase.map((o) => o.surveyRespondents.pct));
  const maxPublic = Math.max(0.0001, ...oppBase.map((o) => o.publicRecords.pct));
  const scored = oppBase.map((o) => {
    const parts = {
      survey: Math.round((o.surveyRespondents.pct / maxSurvey) * 40 * 10) / 10,
      public: Math.round((o.publicRecords.pct / maxPublic) * 40 * 10) / 10,
      diversity: Math.round(o.sourceDiversity * 10 * 10) / 10,
      convergence: Math.round(o.convergence * 10 * 10) / 10,
    };
    return { ...o, parts, score: Math.round((parts.survey + parts.public + parts.diversity + parts.convergence) * 10) / 10 };
  });
  const rankMap = rankBy(scored, (o) => o.score, () => true);
  const rankSurvey = rankBy(scored, (o) => o.surveyRespondents.pct, () => true);
  const rankPublic = rankBy(scored, (o) => o.publicRecords.pct, () => true);
  const opportunities: OpportunityRow[] = scored
    .map((o) => {
      const rels = o.def.codes.map((c) => rowByCode.get(c)!);
      const strengths = rels.map((r) => r.strength);
      const evidenceQuality: Strength = strengths.includes('strong') ? 'strong' : strengths.includes('moderate') ? 'moderate' : 'limited';
      const both = o.surveyRespondents.count > 0 && o.publicRecords.count > 0;
      const verdict = !both
        ? o.surveyRespondents.count > 0
          ? 'Supported by the survey only. Public feedback does not yet corroborate it.'
          : o.publicRecords.count > 0
            ? 'Supported by public feedback only. The survey did not measure or capture it.'
            : 'No supporting evidence in either source.'
        : evidenceQuality === 'strong'
          ? 'Corroborated by both sources across multiple public platforms.'
          : 'Present in both sources; corroboration is partial.';
      return {
        id: o.def.id,
        title: o.def.title,
        problemStatement: o.def.problemStatement,
        existingConcept: o.def.existingConcept,
        codes: o.def.codes,
        surveyRespondents: o.surveyRespondents,
        publicRecords: o.publicRecords,
        convergence: o.convergence,
        sourceDiversity: o.sourceDiversity,
        score: o.score,
        scoreParts: o.parts,
        rank: rankMap.get(o)!,
        rankSurveyOnly: rankSurvey.get(o)!,
        rankPublicOnly: rankPublic.get(o)!,
        evidenceQuality,
        verdict,
      };
    })
    .sort((a, b) => a.rank - b.rank);

  // LifeFlow concept signals.
  const signals: SignalRow[] = LIFEFLOW_SIGNAL_DEFINITIONS.map((d) => {
    let surveyPart: SignalRow['survey'] = { measured: false, count: 0, denominator: 0, pct: 0 };
    if (d.survey && survey) {
      const q = findQuestion(survey, d.survey.questionMatch);
      if (q) {
        const answered = survey.responses.filter((r) => (r.answers[q.id] ?? '').trim());
        const hit = answered.filter((r) => (q.type === 'multi_choice' ? splitMulti(r.answers[q.id]) : [r.answers[q.id]]).includes(d.survey!.option));
        surveyPart = { measured: true, count: hit.length, denominator: answered.length, pct: pct(hit.length, answered.length), question: q.wording.trim(), option: d.survey.option, caveat: d.survey.caveat };
      }
    }
    const hits = publicRecords.filter((r) => r.signals.some((s) => s.signal === d.signal));
    const publicPart = {
      count: hits.length,
      denominator: publicDenominator,
      pct: pct(hits.length, publicDenominator),
      evidenceIds: hits.map((h) => h.evidenceId),
      quotes: hits.map((h) => ({ evidenceId: h.evidenceId, quote: h.signals.find((s) => s.signal === d.signal)!.quote, sourceUrl: h.sourceUrl, platform: h.platform })),
    };
    const sPresent = surveyPart.measured && surveyPart.pct >= THRESHOLDS.surveyPresentPct;
    // Same public threshold as the theme matrix, so the concept checks never contradict it.
    const pPresent = publicPart.pct >= THRESHOLDS.publicPresentPct && publicPart.count >= THRESHOLDS.publicPresentMinRecords;
    const status: SignalRow['status'] = !surveyPart.measured
      ? pPresent
        ? 'not_measured_public_present'
        : 'not_measured_public_absent'
      : sPresent && pPresent
        ? 'supported_by_both'
        : sPresent
          ? 'survey_only'
          : pPresent
            ? 'public_only'
            : 'weak';
    return { signal: d.signal, label: d.label, feature: d.feature, survey: surveyPart, public: publicPart, status };
  });

  return {
    generatedAt: new Date().toISOString(),
    thresholds: THRESHOLDS,
    surveyRespondents: totalRespondents,
    publicSummary,
    rows,
    opportunities,
    signals,
    scoringFormula:
      'Score (0–100) = 40 × (survey share ÷ highest survey share) + 40 × (public share ÷ highest public share) + 10 × (public platforms ÷ platforms in dataset) + 10 × (share of the opportunity’s themes that converge; divergent counts half). Shares are computed per source with their own denominators and are never pooled.',
  };
}

/** Extracts coded evidence from a parsed analysis output (codes already verbatim-checked at analysis time). */
export function codedFromParsed(parsed: unknown): { codes: PublicCodedRecord['codes']; signals: PublicCodedRecord['signals']; firstPerson: boolean | null; themeName: string | null } {
  const p = (parsed ?? {}) as Record<string, unknown>;
  const codes = Array.isArray(p.triangulationCodes)
    ? (p.triangulationCodes as Array<{ code?: unknown; evidenceQuote?: unknown }>)
        .filter((c) => isResearchCode(c.code) && typeof c.evidenceQuote === 'string')
        .map((c) => ({ code: c.code as ResearchCode, quote: c.evidenceQuote as string }))
    : [];
  const signals = Array.isArray(p.lifeflowSignals)
    ? (p.lifeflowSignals as Array<{ signal?: unknown; evidenceQuote?: unknown }>)
        .filter((s) => isLifeflowSignal(s.signal) && typeof s.evidenceQuote === 'string')
        .map((s) => ({ signal: s.signal as LifeflowSignal, quote: s.evidenceQuote as string }))
    : [];
  const theme = p.theme as { name?: unknown } | null | undefined;
  return {
    codes,
    signals,
    firstPerson: typeof p.isFirstPersonExperience === 'boolean' ? p.isFirstPersonExperience : null,
    themeName: theme && typeof theme.name === 'string' ? theme.name : null,
  };
}
