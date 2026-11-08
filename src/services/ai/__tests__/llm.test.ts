import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// SDK test double: no network calls. `generateContent` behaviour is set per test.
const generateContent = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
  ThinkingLevel: { LOW: 'LOW' },
}));

import { activeProvider, llmLabel, chatJson, resolveProvider, providerOptions } from '../llm';
import { GeminiProvider, geminiChatJson } from '../gemini';

const KEYS = ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GROQ_API_KEY', 'AI_PROVIDER', 'GEMINI_MODEL'];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  generateContent.mockReset();
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('provider selection', () => {
  it('prefers Gemini when both keys exist, Groq as fallback, none when neither', () => {
    expect(activeProvider()).toBeNull();
    process.env.GROQ_API_KEY = 'groq-test';
    expect(activeProvider()).toBe('groq');
    process.env.GEMINI_API_KEY = 'gemini-test';
    expect(activeProvider()).toBe('gemini');
    expect(llmLabel()).toMatch(/^Gemini · /);
  });

  it('honours AI_PROVIDER only when that provider has a key', () => {
    process.env.GEMINI_API_KEY = 'gemini-test';
    process.env.GROQ_API_KEY = 'groq-test';
    process.env.AI_PROVIDER = 'groq';
    expect(activeProvider()).toBe('groq');
    delete process.env.GROQ_API_KEY;
    expect(activeProvider()).toBe('gemini');
  });

  it('lets the user choose a configured provider and rejects an unconfigured one', () => {
    process.env.GEMINI_API_KEY = 'gemini-test';
    process.env.GROQ_API_KEY = 'groq-test';
    expect(resolveProvider(null)).toBe('gemini'); // default
    expect(resolveProvider('groq')).toBe('groq'); // explicit choice wins
    delete process.env.GROQ_API_KEY;
    expect(() => resolveProvider('groq')).toThrow(/not configured/);
    expect(() => resolveProvider('openai')).toThrow(/Unknown AI provider/);
  });

  it('exposes provider names and models to the UI but never keys', () => {
    process.env.GEMINI_API_KEY = 'gemini-secret-value';
    const opts = providerOptions();
    expect(opts.map((o) => [o.id, o.configured])).toEqual([['gemini', true], ['groq', false]]);
    expect(JSON.stringify(opts)).not.toContain('gemini-secret-value');
  });

  it('routes a chosen provider through chatJson', async () => {
    process.env.GEMINI_API_KEY = 'gemini-test';
    generateContent.mockResolvedValueOnce({ text: '{"ok":true}' });
    const r = await chatJson('s', 'u', { provider: 'gemini' });
    expect(r.provider).toBe('gemini');
  });

  it('refuses live calls with no key', async () => {
    await expect(chatJson('s', 'u')).rejects.toMatchObject({ code: 'MISSING_API_KEY' });
  });
});

describe('Gemini provider', () => {
  const ORIGINAL = 'I reduced my SIP after an unexpected hospital bill.';
  const output = {
    researchDimension: 'pause_reduction_discontinuation',
    isFirstPersonExperience: true,
    theme: { name: 'Unexpected expense reduction', isNewProposal: true, subtheme: null },
    journeyStage: 'pause_cancellation',
    observedBehaviour: 'Reduced SIP after a medical bill',
    evidenceExcerpt: 'I reduced my SIP',
    triangulationCodes: [{ code: 'cash_flow_disruption', evidenceQuote: 'unexpected hospital bill' }],
    lifeflowSignals: [{ signal: 'unexpected_expense', evidenceQuote: 'unexpected hospital bill' }],
    claims: [{ text: 'Reduced SIP', type: 'observation', groundingExcerpt: 'I reduced my SIP' }],
    uncertaintyAnalysis: 'One sentence.',
    followUpResearchQuestion: 'How common are medical-bill reductions?',
    selfReportedConfidence: 'medium',
  };

  it('requests JSON output with a system instruction and records the served model', async () => {
    process.env.GEMINI_API_KEY = 'gemini-test';
    generateContent.mockResolvedValueOnce({ text: JSON.stringify(output), modelVersion: 'gemini-test-001' });
    const r = await new GeminiProvider('gemini-2.5-flash').analyzeRecord({ id: 'x', sourceUrl: 'https://example.test', platform: 'play_store', collectedAt: '2026-11-08', originalText: ORIGINAL }, []);
    expect(r.provider).toBe('gemini');
    expect(r.validationStatus).toBe('valid');
    expect(r.modelVersion).toBe('gemini-test-001');
    const call = generateContent.mock.calls[0][0];
    expect(call.config.responseMimeType).toBe('application/json');
    expect(call.config.systemInstruction).toMatch(/UNTRUSTED DATA/);
    expect(call.contents).toContain('<feedback>');
    expect(call.config.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });

  it('retries on 429 and maps auth errors to MISSING_API_KEY', async () => {
    process.env.GEMINI_API_KEY = 'gemini-test';
    generateContent.mockRejectedValueOnce(Object.assign(new Error('Resource exhausted. Please retry in 0.01s.'), { status: 429 })).mockResolvedValueOnce({ text: '{}' });
    const ok = await geminiChatJson('s', 'u', { model: 'gemini-3-flash' });
    expect(ok.rawOutput).toBe('{}');
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(generateContent.mock.calls[0][0].config.thinkingConfig).toEqual({ thinkingLevel: 'LOW' });

    generateContent.mockRejectedValueOnce(Object.assign(new Error('API key not valid'), { status: 400 }));
    await expect(geminiChatJson('s', 'u')).rejects.toMatchObject({ code: 'MISSING_API_KEY' });
  });
});
