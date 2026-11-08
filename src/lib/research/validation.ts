import crypto from 'crypto';

export const VALIDATION_SAMPLE_SIZE = 20;

/**
 * Deterministic validation sample: valid analyses, stratified round-robin by platform,
 * ordered within each platform by a stable hash of the record id. Reproducible: the
 * same records always produce the same sample.
 */
export function selectValidationSample<T extends { id: string; platform: string }>(records: T[], size = 20): T[] {
  const h = (id: string) => crypto.createHash('sha1').update(`validation-v1:${id}`).digest('hex');
  const byPlatform = new Map<string, T[]>();
  for (const r of [...records].sort((a, b) => h(a.id).localeCompare(h(b.id)))) {
    if (!byPlatform.has(r.platform)) byPlatform.set(r.platform, []);
    byPlatform.get(r.platform)!.push(r);
  }
  const queues = [...byPlatform.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, q]) => q);
  const out: T[] = [];
  while (out.length < size && queues.some((q) => q.length)) {
    for (const q of queues) {
      const next = q.shift();
      if (next && out.length < size) out.push(next);
    }
  }
  return out;
}

export interface ReviewLike {
  recordAnalysisId: string;
  verdict: string;
  correctedCodes: string | null;
  reviewer: string;
  createdAt: string;
}

export interface ValidationSummary {
  status: 'pending' | 'in_progress' | 'complete';
  sampleSize: number;
  reviewed: number;
  accurate: number;
  partial: number;
  inaccurate: number;
  strictAgreementPct: number | null; // accurate / reviewed
  lenientAgreementPct: number | null; // (accurate + partial) / reviewed
  reviewers: string[];
  codeErrors: Array<{ code: string; missed: number; wronglyAdded: number }>;
}

/** Uses each analysis's latest review only. Never invents labels: no reviews → pending. */
export function summariseValidation(sampleAnalysisIds: string[], reviews: ReviewLike[], aiCodesByAnalysis: Map<string, string[]>): ValidationSummary {
  const sample = new Set(sampleAnalysisIds);
  const latest = new Map<string, ReviewLike>();
  for (const r of reviews) {
    if (!sample.has(r.recordAnalysisId)) continue;
    const prev = latest.get(r.recordAnalysisId);
    if (!prev || r.createdAt > prev.createdAt) latest.set(r.recordAnalysisId, r);
  }
  const vals = [...latest.values()];
  const accurate = vals.filter((v) => v.verdict === 'accurate').length;
  const partial = vals.filter((v) => v.verdict === 'partially_accurate').length;
  const inaccurate = vals.filter((v) => v.verdict === 'inaccurate').length;
  const reviewed = vals.length;
  const pct = (n: number) => (reviewed ? Math.round((n / reviewed) * 1000) / 10 : null);
  const errs = new Map<string, { missed: number; wronglyAdded: number }>();
  for (const v of vals) {
    if (v.verdict === 'accurate' || !v.correctedCodes) continue;
    const corrected = new Set<string>(JSON.parse(v.correctedCodes));
    const ai = new Set(aiCodesByAnalysis.get(v.recordAnalysisId) ?? []);
    for (const c of corrected) if (!ai.has(c)) errs.set(c, { ...(errs.get(c) ?? { missed: 0, wronglyAdded: 0 }), missed: (errs.get(c)?.missed ?? 0) + 1 });
    for (const c of ai) if (!corrected.has(c)) errs.set(c, { ...(errs.get(c) ?? { missed: 0, wronglyAdded: 0 }), wronglyAdded: (errs.get(c)?.wronglyAdded ?? 0) + 1 });
  }
  return {
    status: reviewed === 0 ? 'pending' : reviewed < sample.size ? 'in_progress' : 'complete',
    sampleSize: sample.size,
    reviewed,
    accurate,
    partial,
    inaccurate,
    strictAgreementPct: pct(accurate),
    lenientAgreementPct: pct(accurate + partial),
    reviewers: [...new Set(vals.map((v) => v.reviewer))],
    codeErrors: [...errs.entries()].map(([code, e]) => ({ code, ...e })).sort((a, b) => b.missed + b.wronglyAdded - (a.missed + a.wronglyAdded)),
  };
}
