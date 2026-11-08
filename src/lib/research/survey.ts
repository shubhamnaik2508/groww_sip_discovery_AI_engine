import Papa from 'papaparse';
import crypto from 'crypto';
import {
  EXPERIENCE_ROLES,
  ResearchCode,
  SURVEY_CODE_MAPPINGS,
  SurveyQuestionMapping,
} from './codebook';

/**
 * Pipeline A — Primary research (Google Forms).
 * Pure, deterministic functions: parsing, anonymisation and statistics.
 * Nothing here calls a model.
 */

export type SurveyQuestionType = 'timestamp' | 'numeric_demographic' | 'single_choice' | 'multi_choice' | 'open_text';

export interface SurveyQuestion {
  id: string; // stable id derived from the exact wording, so it survives re-export/anonymisation
  order: number; // display order among retained questions
  wording: string; // exact header text from the export, untrimmed
  type: SurveyQuestionType;
  /** Options observed in the export. Options that nobody selected cannot be recovered from a Forms export. */
  observedOptions: string[];
  isDemographic: boolean;
}

export interface SurveyResponse {
  respondentCode: string; // R01..Rnn, assigned by row order in the export
  submittedAt: string | null; // original Forms timestamp string, preserved verbatim
  answers: Record<string, string>; // questionId -> raw answer ('' when missing)
}

export interface ParsedSurvey {
  questions: SurveyQuestion[];
  responses: SurveyResponse[];
  excludedColumns: string[]; // PII headers removed before storage
  warnings: string[];
  sourceHash: string; // hash of the anonymised content, used for idempotent import
}

export const MULTI_SELECT_DELIMITER = ';';
const PII_HEADER = /(full name|your name|^\s*name\s*\??\s*$|e-?mail|phone|mobile|contact number|whatsapp|address|pan\b|aadhaar)/i;
const TIMESTAMP_HEADER = /^\s*timestamp\s*$/i;
const DEMOGRAPHIC_HEADER = /(\bage\b|current status|occupation|gender|city|income)/i;

export function splitMulti(answer: string): string[] {
  return answer
    .split(MULTI_SELECT_DELIMITER)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function questionId(wording: string): string {
  return 'q_' + crypto.createHash('sha1').update(wording.trim().toLowerCase()).digest('hex').slice(0, 8);
}

function inferType(header: string, values: string[]): SurveyQuestionType {
  if (TIMESTAMP_HEADER.test(header)) return 'timestamp';
  const nonEmpty = values.filter((v) => v.trim());
  if (/\bage\b/i.test(header)) return 'numeric_demographic';
  if (nonEmpty.some((v) => v.includes(MULTI_SELECT_DELIMITER))) return 'multi_choice';
  const distinct = new Set(nonEmpty.map((v) => v.trim()));
  // Free text: (almost) every answer is unique and the column is not a short option list.
  if (nonEmpty.length > 0 && distinct.size / nonEmpty.length > 0.8 && distinct.size > 2) return 'open_text';
  return 'single_choice';
}

/**
 * Parses a Google Forms CSV export. Personally identifying columns (names, emails,
 * phone numbers) are dropped before anything is stored. Respondents get stable
 * pseudonymous codes by export row order.
 */
export function parseGoogleFormsCsv(csvText: string): ParsedSurvey {
  const text = csvText.replace(/^﻿/, '');
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' });
  const rows = parsed.data;
  if (rows.length < 2) throw new Error('The survey export has no response rows.');
  const header = rows[0];
  const body = rows.slice(1);
  const warnings: string[] = [];
  if (parsed.errors.length) warnings.push(...parsed.errors.slice(0, 5).map((e) => `CSV parse issue on row ${e.row}: ${e.message}`));

  const excludedColumns: string[] = [];
  const questions: SurveyQuestion[] = [];
  const keptIndexes: Array<{ index: number; id: string }> = [];

  header.forEach((h, index) => {
    const id = questionId(h);
    if (PII_HEADER.test(h)) {
      excludedColumns.push(h);
      return;
    }
    const values = body.map((r) => r[index] ?? '');
    const type = inferType(h, values);
    const observed = new Set<string>();
    for (const v of values) {
      if (!v.trim()) continue;
      if (type === 'multi_choice') splitMulti(v).forEach((o) => observed.add(o));
      else if (type === 'single_choice') observed.add(v.trim());
    }
    questions.push({
      id,
      order: questions.length + 1,
      wording: h,
      type,
      observedOptions: [...observed].sort(),
      isDemographic: DEMOGRAPHIC_HEADER.test(h),
    });
    keptIndexes.push({ index, id });
  });

  const timestampQ = questions.find((q) => q.type === 'timestamp');
  const responses: SurveyResponse[] = body.map((row, i) => {
    const answers: Record<string, string> = {};
    for (const { index, id } of keptIndexes) answers[id] = (row[index] ?? '').trim();
    return {
      respondentCode: `R${String(i + 1).padStart(2, '0')}`,
      submittedAt: timestampQ ? answers[timestampQ.id] || null : null,
      answers,
    };
  });

  // Possible duplicate submissions: same timestamp AND identical non-PII answers.
  const seen = new Map<string, string>();
  for (const r of responses) {
    const key = JSON.stringify(r.answers);
    const prior = seen.get(key);
    if (prior) warnings.push(`${r.respondentCode} has the same timestamp and answers as ${prior}; possible duplicate submission (kept, not removed).`);
    else seen.set(key, r.respondentCode);
  }

  return { questions, responses, excludedColumns, warnings, sourceHash: computeSourceHash(questions, responses) };
}

/** Content hash over retained question wording and answers (PII excluded), stable across anonymisation. */
export function computeSourceHash(questions: SurveyQuestion[], responses: SurveyResponse[]): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ q: questions.map((q) => q.wording), r: responses.map((r) => questions.map((q) => r.answers[q.id] ?? '')) }))
    .digest('hex');
}

/** Serialises an anonymised dataset back to CSV (PII columns already removed). */
export function toAnonymisedCsv(survey: ParsedSurvey): string {
  const qs = survey.questions;
  const rows = survey.responses.map((r) => [r.respondentCode, ...qs.map((q) => r.answers[q.id] ?? '')]);
  return Papa.unparse({ fields: ['Respondent', ...qs.map((q) => q.wording)], data: rows });
}

/** Parses the anonymised CSV written by toAnonymisedCsv (keeps the respondent codes). */
export function parseAnonymisedCsv(csvText: string): ParsedSurvey {
  const parsed = parseGoogleFormsCsv(csvText);
  const respondentQ = parsed.questions.find((q) => q.wording === 'Respondent');
  if (!respondentQ) return parsed;
  const questions = parsed.questions.filter((q) => q !== respondentQ).map((q, i) => ({ ...q, order: i + 1 }));
  const responses = parsed.responses.map((r) => {
    const { [respondentQ.id]: code, ...rest } = r.answers;
    return { ...r, respondentCode: code || r.respondentCode, answers: rest };
  });
  return { ...parsed, questions, responses, sourceHash: computeSourceHash(questions, responses) };
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

export interface OptionCount {
  option: string;
  count: number;
  pctOfAnswered: number; // count / respondents who answered this question
  pctOfTotal: number; // count / all respondents
  respondentCodes: string[];
}

export interface QuestionStats {
  question: SurveyQuestion;
  totalRespondents: number;
  answered: number;
  missing: number;
  options: OptionCount[];
  multiSelect: boolean;
  meanSelections?: number;
  openTextAnswers?: Array<{ respondentCode: string; text: string }>;
  note?: string;
}

const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10);

export function computeQuestionStats(survey: ParsedSurvey, question: SurveyQuestion): QuestionStats {
  const total = survey.responses.length;
  const answeredResponses = survey.responses.filter((r) => (r.answers[question.id] ?? '').trim());
  const answered = answeredResponses.length;
  const base: QuestionStats = {
    question,
    totalRespondents: total,
    answered,
    missing: total - answered,
    options: [],
    multiSelect: question.type === 'multi_choice',
  };

  if (question.type === 'open_text') {
    return {
      ...base,
      openTextAnswers: answeredResponses.map((r) => ({ respondentCode: r.respondentCode, text: r.answers[question.id] })),
    };
  }
  if (question.type === 'timestamp') return base;

  const counts = new Map<string, string[]>();
  let selections = 0;
  for (const r of answeredResponses) {
    const raw = r.answers[question.id];
    const chosen = question.type === 'multi_choice' ? splitMulti(raw) : [raw];
    selections += chosen.length;
    for (const option of new Set(chosen)) {
      if (!counts.has(option)) counts.set(option, []);
      counts.get(option)!.push(r.respondentCode);
    }
  }
  const options = [...counts.entries()]
    .map(([option, codes]) => ({
      option,
      count: codes.length,
      pctOfAnswered: pct(codes.length, answered),
      pctOfTotal: pct(codes.length, total),
      respondentCodes: codes,
    }))
    .sort((a, b) => b.count - a.count || a.option.localeCompare(b.option));

  return {
    ...base,
    options,
    meanSelections: question.type === 'multi_choice' && answered ? Math.round((selections / answered) * 100) / 100 : undefined,
    note: question.type === 'multi_choice' ? 'Multiple selection: percentages can sum to more than 100%.' : undefined,
  };
}

export function findQuestion(survey: ParsedSurvey, match: RegExp): SurveyQuestion | undefined {
  return survey.questions.find((q) => match.test(q.wording));
}

function answerIncludes(survey: ParsedSurvey, r: SurveyResponse, q: SurveyQuestion, predicate: (option: string) => boolean): boolean {
  const raw = r.answers[q.id] ?? '';
  if (!raw) return false;
  const options = q.type === 'multi_choice' ? splitMulti(raw) : [raw];
  return options.some(predicate);
}

export interface VerifiedMetric {
  id: string;
  label: string;
  definition: string;
  count: number;
  denominator: number;
  denominatorLabel: string;
  pct: number;
  respondentCodes: string[];
  previouslyReported?: { count: number; denominator: number };
  status: 'matches_previous' | 'differs_from_previous' | 'new';
  subgroup?: { count: number; denominator: number; pct: number; label: string };
}

/**
 * Recomputes the headline figures previously reported in the presentation, from
 * the raw answers. Each figure records whether it matches the earlier claim.
 */
export function computeHeadlineMetrics(survey: ParsedSurvey): VerifiedMetric[] {
  const total = survey.responses.length;
  const qDisrupt = findQuestion(survey, /considered reducing, pausing or stopping/i);
  const qReason = findQuestion(survey, /what was the main reason/i);
  const qHelp = findQuestion(survey, /feeling unsure about your SIP/i);
  const metrics: VerifiedMetric[] = [];

  const disrupted = qDisrupt ? survey.responses.filter((r) => /^yes/i.test(r.answers[qDisrupt.id] ?? '')) : [];

  const build = (
    id: string,
    label: string,
    definition: string,
    matching: SurveyResponse[],
    previous?: { count: number; denominator: number },
    subgroupBase?: SurveyResponse[],
  ): VerifiedMetric => {
    const m: VerifiedMetric = {
      id,
      label,
      definition,
      count: matching.length,
      denominator: total,
      denominatorLabel: 'all respondents',
      pct: pct(matching.length, total),
      respondentCodes: matching.map((r) => r.respondentCode),
      previouslyReported: previous,
      status: previous ? (previous.count === matching.length && previous.denominator === total ? 'matches_previous' : 'differs_from_previous') : 'new',
    };
    if (subgroupBase) {
      const inSub = matching.filter((r) => subgroupBase.includes(r));
      m.subgroup = {
        count: inSub.length,
        denominator: subgroupBase.length,
        pct: pct(inSub.length, subgroupBase.length),
        label: 'respondents who reduced, stopped or considered stopping',
      };
    }
    return m;
  };

  if (qDisrupt) {
    metrics.push(build('disrupted', 'Reduced, stopped or considered stopping a SIP', `Answer to "${qDisrupt.wording.trim()}" begins with "Yes".`, disrupted, { count: 39, denominator: 42 }));
  }
  if (qReason) {
    const cash = survey.responses.filter((r) => answerIncludes(survey, r, qReason, (o) => /income|salary|unexpected expense/i.test(o)));
    metrics.push(build('cash_flow_reason', 'Income, salary or unexpected-expense reason', `Selected "Income or salary-related constraints" or "Unexpected expenses" in "${qReason.wording.trim()}".`, cash, { count: 28, denominator: 42 }, disrupted));
    const market = survey.responses.filter((r) => answerIncludes(survey, r, qReason, (o) => /market fluctuation/i.test(o)));
    metrics.push(build('market_reason', 'Market-related reason', `Selected "Market fluctuations or losses" in "${qReason.wording.trim()}".`, market, { count: 20, denominator: 42 }, disrupted));
    const notDisruptedButAnswered = survey.responses.filter((r) => !disrupted.includes(r) && (r.answers[qReason.id] ?? '').trim());
    if (notDisruptedButAnswered.length) {
      metrics.push({
        id: 'conditional_followup_answered_by_no',
        label: 'Answered the "If yes" follow-up despite answering No',
        definition: `Respondents who did not answer "Yes" to the disruption question but still answered "${qReason.wording.trim()}". Their reasons are counted in the all-respondent figures and excluded from the subgroup figures.`,
        count: notDisruptedButAnswered.length,
        denominator: total,
        denominatorLabel: 'all respondents',
        pct: pct(notDisruptedButAnswered.length, total),
        respondentCodes: notDisruptedButAnswered.map((r) => r.respondentCode),
        status: 'new',
      });
    }
  }
  if (qHelp) {
    const google = survey.responses.filter((r) => answerIncludes(survey, r, qHelp, (o) => /google or use ai/i.test(o)));
    metrics.push(build('google_ai', 'Search Google or use AI when unsure', `Selected "Search on Google or use AI" in "${qHelp.wording.trim()}".`, google, { count: 38, denominator: 42 }));
  }
  return metrics;
}

export interface SurveyCodeEvidence {
  code: ResearchCode;
  /** Respondents with ≥1 experience-type answer mapped to this code. */
  experienced: { count: number; denominator: number; pct: number; respondentCodes: string[] };
  /** Respondents with ≥1 stated-need answer mapped to this code (reported separately). */
  statedNeed: { count: number; denominator: number; pct: number; respondentCodes: string[] };
  sources: Array<{ questionId: string; wording: string; option: string; role: SurveyQuestionMapping['role']; count: number }>;
  measured: boolean;
}

/** Deterministic code counts for the survey via the explicit codebook mapping. */
export function computeSurveyCodeEvidence(survey: ParsedSurvey, codes: readonly ResearchCode[]): Map<ResearchCode, SurveyCodeEvidence> {
  const result = new Map<ResearchCode, SurveyCodeEvidence>();
  for (const code of codes) {
    const experienced = new Set<string>();
    const stated = new Set<string>();
    let expDenominator = new Set<string>();
    let needDenominator = new Set<string>();
    const sources: SurveyCodeEvidence['sources'] = [];
    let measured = false;
    for (const mapping of SURVEY_CODE_MAPPINGS) {
      const q = findQuestion(survey, mapping.questionMatch);
      if (!q) continue;
      const options = Object.entries(mapping.options).filter(([, cs]) => cs.includes(code)).map(([o]) => o);
      if (!options.length) continue;
      measured = true;
      const answeredCodes = survey.responses.filter((r) => (r.answers[q.id] ?? '').trim()).map((r) => r.respondentCode);
      const isExperience = EXPERIENCE_ROLES.has(mapping.role);
      if (isExperience) expDenominator = new Set([...expDenominator, ...answeredCodes]);
      else needDenominator = new Set([...needDenominator, ...answeredCodes]);
      for (const option of options) {
        const hits = survey.responses.filter((r) => answerIncludes(survey, r, q, (o) => o === option));
        sources.push({ questionId: q.id, wording: q.wording, option, role: mapping.role, count: hits.length });
        for (const r of hits) (isExperience ? experienced : stated).add(r.respondentCode);
      }
    }
    result.set(code, {
      code,
      experienced: { count: experienced.size, denominator: expDenominator.size, pct: pct(experienced.size, expDenominator.size), respondentCodes: [...experienced].sort() },
      statedNeed: { count: stated.size, denominator: needDenominator.size, pct: pct(stated.size, needDenominator.size), respondentCodes: [...stated].sort() },
      sources,
      measured,
    });
  }
  return result;
}

export interface SegmentComparison {
  segmentQuestion: string;
  segments: Array<{
    segment: string;
    n: number;
    disrupted: { count: number; pct: number };
    cashFlow: { count: number; pct: number };
    market: { count: number; pct: number };
    smallSample: boolean;
  }>;
}

/** Segment comparisons for demographic attributes actually collected. n < 10 is flagged. */
export function computeSegmentComparisons(survey: ParsedSurvey): SegmentComparison[] {
  const qDisrupt = findQuestion(survey, /considered reducing, pausing or stopping/i);
  const qReason = findQuestion(survey, /what was the main reason/i);
  const segmentQs = [findQuestion(survey, /current status/i), findQuestion(survey, /start your first SIP/i)].filter(Boolean) as SurveyQuestion[];
  return segmentQs.map((sq) => {
    const groups = new Map<string, SurveyResponse[]>();
    for (const r of survey.responses) {
      const key = r.answers[sq.id] || '(no answer)';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    return {
      segmentQuestion: sq.wording.trim(),
      segments: [...groups.entries()]
        .map(([segment, rs]) => {
          const d = qDisrupt ? rs.filter((r) => /^yes/i.test(r.answers[qDisrupt.id] ?? '')).length : 0;
          const c = qReason ? rs.filter((r) => answerIncludes(survey, r, qReason, (o) => /income|salary|unexpected expense/i.test(o))).length : 0;
          const m = qReason ? rs.filter((r) => answerIncludes(survey, r, qReason, (o) => /market fluctuation/i.test(o))).length : 0;
          return {
            segment,
            n: rs.length,
            disrupted: { count: d, pct: pct(d, rs.length) },
            cashFlow: { count: c, pct: pct(c, rs.length) },
            market: { count: m, pct: pct(m, rs.length) },
            smallSample: rs.length < 10,
          };
        })
        .sort((a, b) => b.n - a.n),
    };
  });
}

export interface AgeSummary {
  answered: number;
  missing: number;
  nonNumeric: string[];
  min: number | null;
  max: number | null;
  median: number | null;
  distribution: Array<{ age: string; count: number }>;
}

export function computeAgeSummary(survey: ParsedSurvey): AgeSummary | null {
  const q = findQuestion(survey, /\bage\b/i);
  if (!q) return null;
  const raw = survey.responses.map((r) => r.answers[q.id] ?? '');
  const answered = raw.filter(Boolean);
  const nums = answered.filter((v) => /^\d+$/.test(v)).map(Number).sort((a, b) => a - b);
  const dist = new Map<string, number>();
  answered.forEach((v) => dist.set(v, (dist.get(v) ?? 0) + 1));
  return {
    answered: answered.length,
    missing: raw.length - answered.length,
    nonNumeric: answered.filter((v) => !/^\d+$/.test(v)),
    min: nums[0] ?? null,
    max: nums[nums.length - 1] ?? null,
    median: nums.length ? (nums.length % 2 ? nums[(nums.length - 1) / 2] : (nums[nums.length / 2 - 1] + nums[nums.length / 2]) / 2) : null,
    distribution: [...dist.entries()].map(([age, count]) => ({ age, count })).sort((a, b) => a.age.localeCompare(b.age)),
  };
}
