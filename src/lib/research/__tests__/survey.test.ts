import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import {
  parseGoogleFormsCsv,
  parseAnonymisedCsv,
  toAnonymisedCsv,
  computeHeadlineMetrics,
  computeQuestionStats,
  computeSurveyCodeEvidence,
  computeSegmentComparisons,
  findQuestion,
  splitMulti,
} from '../survey';
import { RESEARCH_CODES } from '../codebook';

const bundled = fs.readFileSync(path.join(process.cwd(), 'data/primary/google-forms-sip-survey.anonymized.csv'), 'utf8');

// Small synthetic Forms export used only to test parsing rules (not research data).
const RAW = `Timestamp,Your Full Name?,Your Age?,What best describes your current status?,"Have you ever considered reducing, pausing or stopping your SIP?"," If yes, what was the main reason?",Is there anything about your SIP experience that you wish your investment app handled better?
2026/11/07 1:00:00 AM GMT+5:30,Test Person A,24,Student,"Yes, I have reduced the amount",Unexpected expenses;Market fluctuations or losses,
2026/11/07 1:05:00 AM GMT+5:30,Test Person B,,Working Professional,No,Income or salary-related constraints,Explain market falls please
2026/11/07 1:05:00 AM GMT+5:30,Test Person C,,Working Professional,No,Income or salary-related constraints,Something else entirely`;

describe('Google Forms parsing (Pipeline A)', () => {
  it('drops personal identifiers and assigns pseudonymous respondent codes', () => {
    const s = parseGoogleFormsCsv(RAW);
    expect(s.excludedColumns).toEqual(['Your Full Name?']);
    expect(JSON.stringify(s.responses)).not.toContain('Test Person');
    expect(s.responses.map((r) => r.respondentCode)).toEqual(['R01', 'R02', 'R03']);
  });

  it('preserves exact question wording, including stray whitespace', () => {
    const s = parseGoogleFormsCsv(RAW);
    expect(s.questions.some((q) => q.wording === ' If yes, what was the main reason?')).toBe(true);
  });

  it('infers multi-select from the ; delimiter and keeps missing answers as blanks', () => {
    const s = parseGoogleFormsCsv(RAW);
    const reason = findQuestion(s, /main reason/i)!;
    expect(reason.type).toBe('multi_choice');
    expect(splitMulti('a;b; c')).toEqual(['a', 'b', 'c']);
    const age = findQuestion(s, /age/i)!;
    const stats = computeQuestionStats(s, age);
    expect(stats.answered).toBe(1);
    expect(stats.missing).toBe(2);
  });

  it('only flags duplicates when timestamp AND answers match', () => {
    const s = parseGoogleFormsCsv(RAW);
    expect(s.warnings.filter((w) => w.includes('duplicate'))).toHaveLength(0);
  });

  it('round-trips through the anonymised CSV with stable question ids', () => {
    const s = parseGoogleFormsCsv(RAW);
    const back = parseAnonymisedCsv(toAnonymisedCsv(s));
    expect(back.responses.map((r) => r.respondentCode)).toEqual(['R01', 'R02', 'R03']);
    expect(back.questions.map((q) => q.id)).toEqual(s.questions.map((q) => q.id));
    expect(back.sourceHash).toBe(s.sourceHash);
  });
});

describe('Bundled survey: recalculated headline figures', () => {
  const survey = parseAnonymisedCsv(bundled);
  const metrics = Object.fromEntries(computeHeadlineMetrics(survey).map((m) => [m.id, m]));

  it('has 42 respondents and no identifying columns', () => {
    expect(survey.responses).toHaveLength(42);
    expect(survey.questions.some((q) => /name|email|phone/i.test(q.wording))).toBe(false);
  });

  it('verifies 39/42 reduced, stopped or considered stopping', () => {
    expect(metrics.disrupted.count).toBe(39);
    expect(metrics.disrupted.denominator).toBe(42);
    expect(metrics.disrupted.status).toBe('matches_previous');
  });

  it('corrects the cash-flow figure: 30/42 overall, 28/39 within the disrupted subgroup', () => {
    expect(metrics.cash_flow_reason.count).toBe(30);
    expect(metrics.cash_flow_reason.status).toBe('differs_from_previous');
    expect(metrics.cash_flow_reason.subgroup).toMatchObject({ count: 28, denominator: 39 });
  });

  it('verifies 20/42 market-related and 38/42 Google/AI help-seeking', () => {
    expect(metrics.market_reason.count).toBe(20);
    expect(metrics.market_reason.status).toBe('matches_previous');
    expect(metrics.google_ai.count).toBe(38);
  });

  it('reports respondents who answered the conditional follow-up despite answering No', () => {
    expect(metrics.conditional_followup_answered_by_no.count).toBe(3);
  });

  it('uses per-question denominators and multi-select percentages that can exceed 100%', () => {
    const q = findQuestion(survey, /confusion or concern/i)!;
    const stats = computeQuestionStats(survey, q);
    expect(stats.multiSelect).toBe(true);
    const total = stats.options.reduce((a, o) => a + o.pctOfAnswered, 0);
    expect(total).toBeGreaterThan(100);
    expect(stats.options.find((o) => o.option === 'Understanding returns or market movements')?.count).toBe(26);
  });

  it('keeps experienced problems and stated wishes in separate counts', () => {
    const ev = computeSurveyCodeEvidence(survey, RESEARCH_CODES);
    const flex = ev.get('contribution_flexibility')!;
    expect(flex.experienced.count).toBe(0); // only asked as a wish
    expect(flex.statedNeed.count).toBeGreaterThan(0);
    const cash = ev.get('cash_flow_disruption')!;
    expect(cash.experienced.count).toBe(30);
    expect(cash.experienced.denominator).toBe(42);
    expect(ev.get('personalised_guidance_need')!.measured).toBe(false);
  });

  it('flags small segments', () => {
    const segs = computeSegmentComparisons(survey);
    const status = segs.find((s) => /status/i.test(s.segmentQuestion))!;
    expect(status.segments.find((g) => g.segment === 'Freelancer')?.smallSample).toBe(true);
    expect(status.segments.reduce((a, g) => a + g.n, 0)).toBe(42);
  });
});
