import { computeHeadlineMetrics } from '@/lib/research/survey';
import { CODE_DEFINITIONS, codeLabel } from '@/lib/research/codebook';
import { selectValidationSample, summariseValidation, VALIDATION_SAMPLE_SIZE } from '@/lib/research/validation';
import { RECORD_PROMPT_VERSION } from '@/services/ai/groq';
import type { SynthesisOutput } from './ai-research';
import type { ResearchState } from './triangulation-service';

const PLATFORM: Record<string, string> = { play_store: 'Google Play reviews', trading_qa: 'TradingQ&A forum', youtube: 'YouTube comments', reddit: 'Reddit' };

/** Builds the AI Evidence Log from live data. Every number here is computed, not written in. */
export function buildEvidenceLog(state: ResearchState) {
  const t = state.triangulation;
  const ps = t.publicSummary;
  const survey = state.survey?.survey ?? null;
  const metrics = survey ? computeHeadlineMetrics(survey) : [];
  const valid = state.publicRecords.filter((r) => r.eligible && r.analysis?.status === 'valid');
  const sample = selectValidationSample(valid, VALIDATION_SAMPLE_SIZE);
  const validation = summariseValidation(
    sample.map((r) => r.analysis!.id),
    state.validation.reviews,
    new Map(sample.map((r) => [r.analysis!.id, r.analysis!.coded.codes.map((c) => c.code as string)])),
  );
  const corrections = state.validation.reviews.filter((r) => r.verdict !== 'accurate').slice(0, 5).map((r) => ({
    evidenceId: r.evidenceId,
    verdict: r.verdict,
    reviewer: r.reviewer,
    note: r.correctionNote,
    correctedCodes: r.correctedCodes ? (JSON.parse(r.correctedCodes) as string[]).map(codeLabel) : [],
    sourceUrl: state.publicRecords.find((p) => p.id === r.evidenceId)?.sourceUrl ?? null,
  }));
  const synthesis: SynthesisOutput | null = state.synthesis?.parsedOutput ? JSON.parse(state.synthesis.parsedOutput) : null;
  const byRel = (rel: string) => t.rows.filter((r) => r.relationship === rel);
  const lts = t.opportunities.find((o) => o.existingConcept === 'Life-to-SIP');
  const mp = t.opportunities.find((o) => o.existingConcept === 'MARKET PULSE');
  const sig = (f: string) => t.signals.filter((s) => s.feature === f);
  const unsupported = (f: string) => sig(f).filter((s) => s.status === 'not_measured_public_absent' || s.status === 'weak').map((s) => s.label);
  const supported = (f: string) => sig(f).filter((s) => s.status === 'supported_by_both').map((s) => s.label);

  const implications: string[] = [];
  if (t.opportunities[0]) implications.push(`Highest evidence score: “${t.opportunities[0].title}” (score ${t.opportunities[0].score}; survey ${t.opportunities[0].surveyRespondents.count}/${t.opportunities[0].surveyRespondents.denominator}, public ${t.opportunities[0].publicRecords.count}/${t.opportunities[0].publicRecords.denominator}).`);
  if (lts) implications.push(`Life-to-SIP ranks #${lts.rank}. Supported by both sources: ${supported('life_to_sip').join(', ') || 'none'}. Unsupported assumptions: ${unsupported('life_to_sip').join(', ') || 'none'}.`);
  if (mp) implications.push(`MARKET PULSE ranks #${mp.rank}. Supported by both sources: ${supported('market_pulse').join(', ') || 'none'}. Unsupported assumptions: ${unsupported('market_pulse').join(', ') || 'none'}.`);
  const gaps = [...byRel('survey_only'), ...byRel('not_measured_in_survey'), ...byRel('divergent')];
  if (gaps.length) implications.push(`Needs interviews before investment: ${gaps.map((g) => `${g.label} (${g.relationship.replace(/_/g, ' ')})`).join('; ')}.`);

  return {
    generatedAt: new Date().toISOString(),
    objectives: [
      'Why do people start a SIP, and what do they expect?',
      'How does behaviour change after starting; why do investors pause, reduce or stop?',
      'What do investors monitor, what confuses them in apps, and where do they seek help outside the app?',
      'What separates continuers from drop-offs, and how do patterns differ by circumstance?',
      'Which unmet needs recur, and which product opportunities (including Life-to-SIP and MARKET PULSE) does the evidence support?',
    ],
    primary: survey
      ? {
          label: 'Primary research (Google Forms survey)',
          respondents: survey.responses.length,
          questions: survey.questions.filter((q) => q.type !== 'timestamp').length,
          excludedColumns: state.survey!.excludedColumns,
          fileName: state.survey!.fileName,
          collectedFrom: survey.responses[0]?.submittedAt ?? null,
          collectedTo: survey.responses[survey.responses.length - 1]?.submittedAt ?? null,
          method: 'Self-administered Google Form distributed by the researcher; convenience sample; forced-choice and multi-select questions plus one optional open-ended question. Counts computed deterministically; open-ended answers AI-coded and labelled.',
          metrics: metrics.map((m) => ({ label: m.label, value: `${m.count}/${m.denominator} (${m.pct}%)`, previous: m.previouslyReported ? `${m.previouslyReported.count}/${m.previouslyReported.denominator}` : null, status: m.status, subgroup: m.subgroup ? `${m.subgroup.count}/${m.subgroup.denominator}` : null })),
        }
      : null,
    secondary: {
      label: 'Secondary research (public feedback)',
      totalRecords: ps.totalRecords,
      eligibleRecords: ps.eligibleRecords,
      analysedValid: ps.analysedValid,
      analysedFailed: ps.analysedFailed,
      notAnalysed: ps.notAnalysed,
      firstPerson: ps.firstPersonValid,
      platforms: Object.entries(ps.platforms).map(([p, n]) => ({ platform: PLATFORM[p] ?? p, records: n })),
      methods: [
        'TradingQ&A: scripted collection through the forum’s public Discourse JSON API (search + post endpoints, robots.txt respected, first posts only, staff/editorial posts filtered). Script: scripts/collect-tradingqna.mjs.',
        'Google Play and YouTube: manual reading of public pages; text copied verbatim; reviewer and commenter names not stored. Spot-checked against the live pages (4/4 matched exactly).',
        'Reddit: not collected. Scripted access is blocked and the built-in browser refuses the site; no workaround was attempted.',
        'Every record keeps its source URL, platform, collection timestamp, publication date where shown, and collection method. Content hashes de-duplicate records.',
      ],
    },
    ai: {
      models: ps.models,
      runs: state.runs.filter((r) => r.totalRecords > 0).map((r) => ({ id: r.id, provider: r.provider, model: r.model, prompt: r.promptVersion, startedAt: r.startedAt, total: r.totalRecords, valid: r.successfulRecords, failed: r.failedRecords })),
      promptVersion: RECORD_PROMPT_VERSION,
      method: [
        'Each public record is sent to the model with a fixed codebook; public text is wrapped as untrusted data to blunt prompt injection.',
        'Outputs are validated against a Zod schema. Every populated field and every codebook theme must carry a quote that is a verbatim substring of the source; ungrounded themes are pruned and logged.',
        'Demographics and financial circumstances stay unknown unless quoted. Links to SIP continuation are labelled HYPOTHESIS.',
        'Failed outputs are stored with the reason and excluded from counts. Raw outputs are stored unmodified.',
      ],
    },
    themes: {
      approach: 'Deductive codebook of 12 themes shared by both pipelines (survey options are mapped by an explicit table; public records are coded by the model with verbatim evidence), plus inductive AI-proposed theme names for discovery. A record can carry several themes, so theme counts overlap and are never summed.',
      codebook: Object.values(CODE_DEFINITIONS).map((c) => ({ code: c.code, label: c.label, definition: c.definition })),
    },
    triangulation: {
      method: `Each theme is compared across sources using its own denominator. Thresholds: survey ≥ ${t.thresholds.surveyPresentPct}% of respondents; public ≥ ${t.thresholds.publicPresentPct}% of analysed records and ≥ ${t.thresholds.publicPresentMinRecords} records. Divergent = strong in one source and near-absent in the other, or a rank gap of ≥ ${t.thresholds.divergentRankGap}. Not measured in survey is reported as absence of evidence.`,
      rows: t.rows.map((r) => ({
        theme: r.label,
        survey: r.survey.measured ? `${r.survey.basis === 'stated_need' ? r.survey.statedNeed.count : r.survey.experienced.count}/${r.survey.basis === 'stated_need' ? r.survey.statedNeed.denominator : r.survey.experienced.denominator} (${r.survey.primaryPct}%)${r.survey.basis === 'stated_need' ? ' stated wish' : ''}` : 'not measured',
        public: ps.analysedValid ? `${r.public.count}/${r.public.denominator} (${r.public.pct}%), ${r.public.platforms.length} platform(s)` : 'awaiting analysis',
        relationship: r.relationship,
        strength: r.strength,
      })),
      convergent: byRel('convergent').map((r) => r.label),
      divergent: byRel('divergent').map((r) => r.label),
      oneSource: [...byRel('survey_only'), ...byRel('public_only'), ...byRel('not_measured_in_survey')].map((r) => `${r.label} (${r.relationship.replace(/_/g, ' ')})`),
      synthesis: synthesis ? { model: state.synthesis!.model, createdAt: state.synthesis!.createdAt, status: state.synthesis!.validationStatus, output: synthesis } : null,
    },
    opportunities: {
      formula: t.scoringFormula,
      rows: t.opportunities.map((o) => ({ rank: o.rank, title: o.title, concept: o.existingConcept ?? null, survey: `${o.surveyRespondents.count}/${o.surveyRespondents.denominator}`, public: `${o.publicRecords.count}/${o.publicRecords.denominator}`, score: o.score, quality: o.evidenceQuality, rankSurveyOnly: o.rankSurveyOnly, rankPublicOnly: o.rankPublicOnly })),
    },
    validation: {
      method: `Reproducible sample of ${sample.length} validly analysed public records, stratified round-robin by platform and ordered by a stable hash. A named person marks each AI coding accurate, partially accurate or inaccurate and records corrections. AI outputs are never edited. Agreement uses each record's latest review only.`,
      summary: validation,
      corrections,
    },
    implications,
    limitations: [
      `Survey: convenience sample of ${survey?.responses.length ?? 0}, mostly aged 22–27 and early in their SIP journey; forced-choice options inflate prevalence; self-reported; cannot estimate population rates or the 12-month retention metric.`,
      'Survey option wording conflates some constructs (e.g. salary timing vs income level; market-movement vs returns confusion).',
      'Public feedback is self-selected and cross-sectional (complaints and questions dominate) and may over-represent one app (Groww Play reviews).',
      'Reddit and App Store were not collected in this round.',
      `AI coding is ${validation.reviewed ? `human-reviewed for ${validation.reviewed}/${validation.sampleSize} sampled records` : 'not yet human-validated'}; model self-reported confidence is not calibrated.`,
      'Opportunity scores are a transparent heuristic over evidence breadth, not a measure of severity or business impact, which neither source measures.',
      'Bundled datasets reload on each Vercel cold start; data imported through the UI persists only with a durable database (DATABASE_URL).',
    ],
    simulated: 'The 20 curated benchmark fixtures and the simulated rule-engine runs (including the earlier 17/20 agreement) are synthetic. They are kept for software testing, labelled separately, and excluded from every research count above.',
  };
}

export type EvidenceLog = ReturnType<typeof buildEvidenceLog>;

export function evidenceLogToMarkdown(log: EvidenceLog): string {
  const L: string[] = [];
  const p = (s = '') => L.push(s);
  p('# AI Evidence Log: Groww SIP Discovery Engine');
  p(`Generated ${log.generatedAt}. Independent NextLeap research prototype; not affiliated with Groww; not investment advice.`);
  p('\n## 1. Research objectives');
  log.objectives.forEach((o) => p(`- ${o}`));
  p('\n## 2. Primary research (Google Forms survey)');
  if (log.primary) {
    p(`- Respondents: ${log.primary.respondents}; questions retained: ${log.primary.questions}; identifying columns removed: ${log.primary.excludedColumns.join(', ') || 'none'}`);
    p(`- Collected: ${log.primary.collectedFrom} to ${log.primary.collectedTo}`);
    p(`- Method: ${log.primary.method}`);
    p('\n| Finding | Recalculated | Previously reported | Status | Within disrupted subgroup |\n|---|---|---|---|---|');
    log.primary.metrics.forEach((m) => p(`| ${m.label} | ${m.value} | ${m.previous ?? 'n/a'} | ${m.status.replace(/_/g, ' ')} | ${m.subgroup ?? 'n/a'} |`));
  } else p('No survey dataset loaded.');
  p('\n## 3. Secondary research (public feedback)');
  p(`- Records: ${log.secondary.totalRecords} stored; ${log.secondary.eligibleRecords} eligible; ${log.secondary.analysedValid} validly AI-analysed; ${log.secondary.analysedFailed} failed checks; ${log.secondary.notAnalysed} not analysed; ${log.secondary.firstPerson} first-person accounts.`);
  log.secondary.platforms.forEach((x) => p(`- ${x.platform}: ${x.records}`));
  log.secondary.methods.forEach((m) => p(`- ${m}`));
  p('\n## 4. AI model and processing');
  p(`- Models: ${log.ai.models.join(', ') || 'none run yet'}; record prompt: ${log.ai.promptVersion}`);
  log.ai.method.forEach((m) => p(`- ${m}`));
  log.ai.runs.forEach((r) => p(`- Run ${r.id.slice(0, 8)} (${r.provider}/${r.model}, ${r.prompt}, ${r.startedAt}): ${r.valid} valid, ${r.failed} failed of ${r.total}`));
  p('\n## 5. Theme extraction');
  p(log.themes.approach);
  p('\n## 6. Research triangulation');
  p(log.triangulation.method);
  p('\n| Theme | Survey | Public | Relationship | Strength |\n|---|---|---|---|---|');
  log.triangulation.rows.forEach((r) => p(`| ${r.theme} | ${r.survey} | ${r.public} | ${r.relationship.replace(/_/g, ' ')} | ${r.strength} |`));
  p(`\n- Convergent: ${log.triangulation.convergent.join(', ') || 'none'}`);
  p(`- Divergent: ${log.triangulation.divergent.join(', ') || 'none'}`);
  p(`- One source only: ${log.triangulation.oneSource.join('; ') || 'none'}`);
  if (log.triangulation.synthesis) {
    const s = log.triangulation.synthesis;
    p(`\n### AI synthesis (inference; ${s.model}, ${s.createdAt}, validation ${s.status})`);
    for (const [k, items] of Object.entries(s.output)) {
      if (!Array.isArray(items) || k === 'caveats') continue;
      p(`**${k}**`);
      (items as Array<{ statement: string }>).forEach((i) => p(`- ${i.statement}`));
    }
    p(`- Life-to-SIP: ${s.output.lifeToSipAssessment}`);
    p(`- MARKET PULSE: ${s.output.marketPulseAssessment}`);
  }
  p('\n## 7. Opportunity ranking');
  p(log.opportunities.formula);
  p('\n| Rank | Opportunity | Concept | Survey | Public | Score | Evidence | Rank (survey only) | Rank (public only) |\n|---|---|---|---|---|---|---|---|---|');
  log.opportunities.rows.forEach((o) => p(`| ${o.rank} | ${o.title} | ${o.concept ?? ''} | ${o.survey} | ${o.public} | ${o.score} | ${o.quality} | ${o.rankSurveyOnly} | ${o.rankPublicOnly} |`));
  p('\n## 8. Validation');
  p(log.validation.method);
  const v = log.validation.summary;
  p(v.reviewed ? `- Reviewed ${v.reviewed}/${v.sampleSize}: ${v.accurate} accurate, ${v.partial} partially accurate, ${v.inaccurate} inaccurate. Strict agreement ${v.strictAgreementPct}%; lenient ${v.lenientAgreementPct}%. Reviewers: ${v.reviewers.join(', ')}.` : '- Status: PENDING. No human review has been recorded; no agreement figure is reported.');
  log.validation.corrections.forEach((c) => p(`- Correction (${c.verdict}, ${c.reviewer}): ${c.note ?? ''} ${c.correctedCodes.length ? `→ ${c.correctedCodes.join(', ')}` : ''} ${c.sourceUrl ?? ''}`));
  p('\n## 9. Product implications');
  log.implications.forEach((i) => p(`- ${i}`));
  p('\n## 10. Limitations');
  log.limitations.forEach((l) => p(`- ${l}`));
  p('\n## Simulated evidence (kept separate)');
  p(log.simulated);
  return L.join('\n');
}
