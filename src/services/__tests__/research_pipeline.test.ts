import { describe, it, expect, beforeAll, vi } from 'vitest';
import { initializeDatabase, db } from '@/db';
import { clearAllTables } from '@/db/test-utils';
import { evidenceRecords, surveyResponses, validationReviews } from '@/db/schema';
import { ensureResearchData, readBundledPublicFeedback, upsertPublicFeedback, importSurveyCsvText } from '@/services/research/datasets';
import { loadResearchState } from '@/services/research/triangulation-service';
import { buildEvidenceLog, evidenceLogToMarkdown } from '@/services/research/evidence-log';

vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

describe('research pipeline (bundled genuine datasets)', () => {
  beforeAll(async () => {
    await initializeDatabase();
    await clearAllTables();
    await ensureResearchData();
  });

  it('imports the 42 anonymised survey responses into their own tables', async () => {
    const rows = await db.select().from(surveyResponses).all();
    expect(rows).toHaveLength(42);
    const state = await loadResearchState();
    expect(state.survey?.excludedColumns).toEqual(['Your Full Name?']);
  });

  it('imports every bundled public record with source URL and verification provenance', async () => {
    const bundled = readBundledPublicFeedback();
    expect(bundled.length).toBeGreaterThanOrEqual(50);
    const pub = (await db.select().from(evidenceRecords).all()).filter((r) => r.id.startsWith('pub-'));
    expect(pub).toHaveLength(bundled.length);
    for (const r of pub) {
      expect(r.sourceUrl).toMatch(/^https:\/\//);
      expect(r.verificationStatus).toBe('content_verified');
      expect(r.isSynthetic).toBe(false);
    }
  });

  it('is idempotent and de-duplicates by content hash', async () => {
    const before = (await db.select().from(evidenceRecords).all()).length;
    const again = await upsertPublicFeedback(readBundledPublicFeedback());
    expect(again.inserted).toBe(0);
    const [first] = readBundledPublicFeedback();
    const dup = await upsertPublicFeedback([{ ...first, externalId: 'dup-test' }]);
    expect(dup.duplicates).toBe(1);
    const state = await loadResearchState();
    expect(state.publicRecords.find((r) => r.id === 'pub-dup-test')?.eligible).toBe(false);
    expect((await db.select().from(evidenceRecords).all()).length).toBe(before + 1);
  });

  it('never pools survey respondents and public records into one denominator', async () => {
    const state = await loadResearchState();
    const t = state.triangulation;
    expect(t.surveyRespondents).toBe(42);
    for (const row of t.rows) {
      if (row.survey.measured) expect([42, 0]).toContain(row.survey.basis === 'stated_need' ? row.survey.statedNeed.denominator : row.survey.experienced.denominator);
      expect(row.public.denominator).toBe(t.publicSummary.analysedValid);
    }
  });

  it('keeps validation pending and the evidence log honest when no human review exists', async () => {
    expect(await db.select().from(validationReviews).all()).toHaveLength(0);
    const log = buildEvidenceLog(await loadResearchState());
    expect(log.validation.summary.status).toBe('pending');
    const md = evidenceLogToMarkdown(log);
    expect(md).toContain('PENDING');
    expect(md).toContain('30/42');
    expect(md).toContain('Simulated evidence (kept separate)');
  });

  it('rejects a file that is not a Google Forms export', async () => {
    await expect(importSurveyCsvText('a,b\n1,2\n', 'bad.csv', 'test')).rejects.toThrow(/Google Forms/);
  });

  it('serves the evidence log and review sheet through the export route', async () => {
    const { GET } = await import('@/app/api/research/export/route');
    const md = await GET(new Request('http://localhost/api/research/export?type=evidence-log-md'));
    expect(md.headers.get('content-disposition')).toMatch(/ai-evidence-log/);
    expect(await md.text()).toContain('# AI Evidence Log');
    const bad = await GET(new Request('http://localhost/api/research/export?type=nope'));
    expect(bad.status).toBe(400);
  });

  it('gates paid AI runs and mutations behind the passcode in production', async () => {
    const { runPublicAnalysisAction, submitValidationAction } = await import('@/app/research-actions');
    process.env.VERCEL_ENV = 'production';
    delete process.env.RESEARCH_ADMIN_PASSCODE;
    expect((await runPublicAnalysisAction({ passcode: 'x' })).ok).toBe(false);
    process.env.RESEARCH_ADMIN_PASSCODE = 'correct-horse';
    const wrong = await submitValidationAction({ passcode: 'nope', recordAnalysisId: 'x', verdict: 'accurate', reviewer: 'Tester' });
    expect(wrong).toMatchObject({ ok: false, error: 'Incorrect research passcode.' });
    delete process.env.VERCEL_ENV;
    delete process.env.RESEARCH_ADMIN_PASSCODE;
  });

  it('requires a correction for non-accurate verdicts and a reviewer name', async () => {
    const { submitValidationAction } = await import('@/app/research-actions');
    expect((await submitValidationAction({ recordAnalysisId: 'x', verdict: 'inaccurate', reviewer: 'Tester' })).ok).toBe(false);
    expect((await submitValidationAction({ recordAnalysisId: 'x', verdict: 'accurate', reviewer: '' })).ok).toBe(false);
  });
});
