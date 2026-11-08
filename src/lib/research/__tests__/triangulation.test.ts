import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { classifyRelationship, computeTriangulation, PublicCodedRecord, PublicDatasetSummary, codedFromParsed } from '../triangulation';
import { parseAnonymisedCsv } from '../survey';
import { selectValidationSample, summariseValidation } from '../validation';

const survey = parseAnonymisedCsv(fs.readFileSync(path.join(process.cwd(), 'data/primary/google-forms-sip-survey.anonymized.csv'), 'utf8'));

// Test doubles for coded public records (software tests only; not research data).
function rec(id: string, platform: string, codes: string[], signals: string[] = []): PublicCodedRecord {
  return {
    evidenceId: id,
    recordAnalysisId: `ra-${id}`,
    platform,
    sourceUrl: `https://example.test/${id}`,
    title: null,
    originalText: 'text',
    publishedAt: null,
    firstPerson: true,
    codes: codes.map((c) => ({ code: c as never, quote: 'quote' })),
    signals: signals.map((s) => ({ signal: s as never, quote: 'quote' })),
    themeName: null,
    model: 'test-double',
    analysedAt: '2026-11-08',
  };
}
function summary(n: number, platforms: Record<string, number>): PublicDatasetSummary {
  return { totalRecords: n, eligibleRecords: n, excludedRecords: [], analysedValid: n, analysedFailed: 0, notAnalysed: 0, firstPersonValid: n, platforms, models: ['test-double'] };
}

describe('classifyRelationship', () => {
  it('distinguishes all relationship types', () => {
    expect(classifyRelationship({ measured: true, pct: 50 }, { pct: 20, count: 5, denominator: 25 }, 1).relationship).toBe('convergent');
    expect(classifyRelationship({ measured: true, pct: 50 }, { pct: 20, count: 5, denominator: 25 }, 5).relationship).toBe('divergent');
    expect(classifyRelationship({ measured: true, pct: 60 }, { pct: 0, count: 0, denominator: 25 }, null).relationship).toBe('divergent');
    expect(classifyRelationship({ measured: true, pct: 25 }, { pct: 4, count: 1, denominator: 25 }, null).relationship).toBe('survey_only');
    expect(classifyRelationship({ measured: true, pct: 12 }, { pct: 12, count: 3, denominator: 25 }, null).relationship).toBe('public_only');
    expect(classifyRelationship({ measured: false, pct: 0 }, { pct: 20, count: 5, denominator: 25 }, null).relationship).toBe('not_measured_in_survey');
    expect(classifyRelationship({ measured: true, pct: 5 }, { pct: 1, count: 1, denominator: 100 }, null).relationship).toBe('insufficient');
  });

  it('never calls anything divergent before public feedback is analysed', () => {
    const r = classifyRelationship({ measured: true, pct: 70 }, { pct: 0, count: 0, denominator: 0 }, null);
    expect(r.relationship).toBe('survey_only');
    expect(r.reason).toMatch(/not been analysed/);
  });

  it('requires a minimum number of public records, not just a percentage', () => {
    expect(classifyRelationship({ measured: true, pct: 50 }, { pct: 50, count: 2, denominator: 4 }, 0).relationship).not.toBe('convergent');
  });
});

describe('computeTriangulation', () => {
  const publicRecords = [
    rec('a', 'play_store', ['cash_flow_disruption', 'contribution_flexibility'], ['unexpected_expense']),
    rec('b', 'trading_qa', ['cash_flow_disruption']),
    rec('c', 'youtube', ['market_volatility_anxiety'], ['market_volatility_anxiety']),
    rec('d', 'trading_qa', ['cash_flow_disruption', 'payment_mandate_friction']),
    rec('e', 'trading_qa', []),
  ];
  const t = computeTriangulation({ survey, surveyOpenText: [], publicRecords, publicSummary: summary(5, { play_store: 1, trading_qa: 3, youtube: 1 }) });
  const row = (c: string) => t.rows.find((r) => r.code === c)!;

  it('keeps separate units and denominators for each source', () => {
    expect(row('cash_flow_disruption').survey.experienced).toMatchObject({ count: 30, denominator: 42 });
    expect(row('cash_flow_disruption').public).toMatchObject({ count: 3, denominator: 5, pct: 60 });
    expect(row('cash_flow_disruption').relationship).toBe('convergent');
    expect(row('cash_flow_disruption').public.platforms).toEqual(['play_store', 'trading_qa']);
  });

  it('marks themes the survey never asked about as not measured', () => {
    expect(row('personalised_guidance_need').survey.measured).toBe(false);
  });

  it('counts opportunity public support as a union, never a sum', () => {
    const cash = t.opportunities.find((o) => o.id === 'opp-cash-flow')!;
    expect(cash.publicRecords.count).toBe(3); // a, b, d (a has two member themes but counts once)
    expect(cash.surveyRespondents.basis).toBe('experienced');
    expect(cash.surveyRespondents.count).toBe(30);
  });

  it('excludes behaviour themes (help-seeking) from opportunity survey support', () => {
    const decision = t.opportunities.find((o) => o.id === 'opp-decision-support')!;
    expect(decision.surveyRespondents.countedCodes).not.toContain('external_help_seeking');
    expect(decision.surveyRespondents.count).toBeLessThan(42);
  });

  it('produces contiguous ranks and sensitivity ranks', () => {
    expect(t.opportunities.map((o) => o.rank)[0]).toBe(1);
    for (const o of t.opportunities) {
      expect(o.rankSurveyOnly).toBeGreaterThanOrEqual(1);
      expect(o.rankPublicOnly).toBeGreaterThanOrEqual(1);
      expect(o.score).toBeCloseTo(o.scoreParts.survey + o.scoreParts.public + o.scoreParts.diversity + o.scoreParts.convergence, 0);
    }
  });

  it('reports LifeFlow signals the survey did not measure as not measured', () => {
    const debit = t.signals.find((s) => s.signal === 'debit_date_liquidity')!;
    expect(debit.survey.measured).toBe(false);
    expect(debit.status).toBe('not_measured_public_absent');
    const unexpected = t.signals.find((s) => s.signal === 'unexpected_expense')!;
    expect(unexpected.survey.measured).toBe(true);
    expect(unexpected.public.count).toBe(1);
  });

  it('extracts only codebook codes from parsed model output', () => {
    const c = codedFromParsed({ triangulationCodes: [{ code: 'cash_flow_disruption', evidenceQuote: 'x y z' }, { code: 'made_up', evidenceQuote: 'q' }], isFirstPersonExperience: true });
    expect(c.codes.map((x) => x.code)).toEqual(['cash_flow_disruption']);
    expect(c.firstPerson).toBe(true);
  });
});

describe('validation sampling and agreement', () => {
  const items = Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, platform: ['play_store', 'trading_qa', 'youtube'][i % 3] }));

  it('is deterministic and stratified by platform', () => {
    const a = selectValidationSample(items, 9);
    const b = selectValidationSample([...items].reverse(), 9);
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
    const counts = a.reduce<Record<string, number>>((acc, x) => ((acc[x.platform] = (acc[x.platform] ?? 0) + 1), acc), {});
    expect(Object.values(counts)).toEqual([3, 3, 3]);
  });

  it('stays pending with no human reviews and never invents agreement', () => {
    const s = summariseValidation(['x', 'y'], [], new Map());
    expect(s.status).toBe('pending');
    expect(s.strictAgreementPct).toBeNull();
  });

  it('uses the latest review per analysis and computes strict and lenient agreement', () => {
    const reviews = [
      { recordAnalysisId: 'x', verdict: 'inaccurate', correctedCodes: '["cash_flow_disruption"]', reviewer: 'A', createdAt: '2026-11-08T10:00:00Z' },
      { recordAnalysisId: 'x', verdict: 'accurate', correctedCodes: null, reviewer: 'A', createdAt: '2026-11-08T11:00:00Z' },
      { recordAnalysisId: 'y', verdict: 'partially_accurate', correctedCodes: '["cash_flow_disruption"]', reviewer: 'A', createdAt: '2026-11-08T11:00:00Z' },
      { recordAnalysisId: 'not-in-sample', verdict: 'accurate', correctedCodes: null, reviewer: 'A', createdAt: '2026-11-08T11:00:00Z' },
    ];
    const s = summariseValidation(['x', 'y'], reviews, new Map([['y', ['market_volatility_anxiety']]]));
    expect(s).toMatchObject({ status: 'complete', reviewed: 2, accurate: 1, partial: 1, strictAgreementPct: 50, lenientAgreementPct: 100 });
    expect(s.codeErrors.find((e) => e.code === 'cash_flow_disruption')?.missed).toBe(1);
    expect(s.codeErrors.find((e) => e.code === 'market_volatility_anxiety')?.wronglyAdded).toBe(1);
  });
});
