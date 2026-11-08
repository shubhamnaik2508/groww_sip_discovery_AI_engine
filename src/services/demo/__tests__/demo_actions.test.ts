import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

// Test doubles: request headers and the Gemini SDK (no network calls).
const requestHeaders = { current: new Headers({ 'x-vercel-forwarded-for': '198.51.100.7', 'user-agent': 'Mozilla/5.0 Chrome/140' }) };
vi.mock('next/headers', () => ({ headers: async () => requestHeaders.current }));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
const generateContent = vi.fn();
vi.mock('@google/genai', () => ({ GoogleGenAI: class { models = { generateContent }; }, ThinkingLevel: { LOW: 'LOW' } }));

import { initializeDatabase, db } from '@/db';
import { clearAllTables } from '@/db/test-utils';
import { recordAnalyses, aiSyntheses, evidenceRecords } from '@/db/schema';
import { ensureResearchData } from '@/services/research/datasets';
import { __setUsageStoreForTests, createMemoryStore } from '../usage-store';
import { runDemoAnalysisAction, runDemoSynthesisAction } from '@/app/demo-actions';
import { DEMO_RECORD_IDS } from '../demo';

const counts = async () => ({
  analyses: (await db.select().from(recordAnalyses).all()).length,
  syntheses: (await db.select().from(aiSyntheses).all()).length,
  records: (await db.select().from(evidenceRecords).all()).length,
});

describe('public live-AI demo actions', () => {
  beforeAll(async () => {
    await initializeDatabase();
    await clearAllTables();
    await ensureResearchData();
  });
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-double-key';
    __setUsageStoreForTests(createMemoryStore());
    generateContent.mockReset();
  });

  it('runs live analysis on demo records and never writes to the research record', async () => {
    const [id] = DEMO_RECORD_IDS;
    const text = (await db.select().from(evidenceRecords).all()).find((r) => r.id === id)!.originalText;
    const quote = text.slice(0, 40);
    generateContent.mockResolvedValue({
      text: JSON.stringify({
        researchDimension: 'pause_reduction_discontinuation',
        isFirstPersonExperience: true,
        theme: { name: 'Skip Controls', isNewProposal: false, subtheme: null },
        journeyStage: 'pause_cancellation',
        observedBehaviour: 'Tried to skip an instalment',
        evidenceExcerpt: quote,
        triangulationCodes: [{ code: 'contribution_flexibility', evidenceQuote: quote }],
        lifeflowSignals: [],
        claims: [{ text: 'Tried to skip', type: 'observation', groundingExcerpt: quote }],
        uncertaintyAnalysis: 'Single review.',
        followUpResearchQuestion: 'How often do users need to skip?',
        selfReportedConfidence: 'medium',
      }),
      modelVersion: 'gemini-test-double',
      usageMetadata: { totalTokenCount: 2100 },
    });
    const before = await counts();
    const r = await runDemoAnalysisAction({ recordIds: [id] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.results[0]).toMatchObject({ evidenceId: id, provider: 'gemini', status: 'valid', totalTokens: 2100 });
    expect(r.data.results[0].codes.map((c) => c.code)).toEqual(['contribution_flexibility']);
    expect(await counts()).toEqual(before);
  });

  it('rejects records outside the demo set and oversize batches', async () => {
    expect(await runDemoAnalysisAction({ recordIds: ['pub-not-a-demo-record'] })).toMatchObject({ ok: false });
    expect(await runDemoAnalysisAction({ recordIds: [...DEMO_RECORD_IDS] })).toMatchObject({ ok: false, error: expect.stringMatching(/at most 3/) });
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('stops before calling the provider once the visitor limit is reached', async () => {
    generateContent.mockResolvedValue({ text: '{}', usageMetadata: { totalTokenCount: 10 } });
    requestHeaders.current = new Headers({ 'x-vercel-forwarded-for': '198.51.100.99', 'user-agent': 'Mozilla/5.0 Chrome/140' });
    for (let i = 0; i < 2; i++) await runDemoAnalysisAction({ recordIds: DEMO_RECORD_IDS.slice(0, 3) });
    const callsSoFar = generateContent.mock.calls.length;
    const blocked = await runDemoAnalysisAction({ recordIds: DEMO_RECORD_IDS.slice(0, 1) });
    expect(blocked).toMatchObject({ ok: false, error: expect.stringMatching(/limit/) });
    expect(generateContent.mock.calls.length).toBe(callsSoFar);
  });

  it('generates a fresh synthesis without saving it', async () => {
    requestHeaders.current = new Headers({ 'x-vercel-forwarded-for': '198.51.100.20', 'user-agent': 'Mozilla/5.0 Chrome/140' });
    generateContent.mockResolvedValue({
      text: JSON.stringify({ convergentProblems: [], surveyProminentPubliclyRare: [], publicEmergentNotInSurvey: [], contradictions: [], strongestFindings: [{ statement: 'Mandate friction converges.', codes: ['payment_mandate_friction'], evidenceIds: [] }], needsMoreResearch: [], newOpportunities: [], lifeToSipAssessment: 'Mixed evidence so far.', marketPulseAssessment: 'Moderate evidence so far.', caveats: [] }),
      usageMetadata: { totalTokenCount: 5000 },
    });
    const before = await counts();
    const r = await runDemoSynthesisAction({});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.synthesis.output?.strongestFindings[0].statement).toMatch(/Mandate/);
    expect(await counts()).toEqual(before);
  });
});
