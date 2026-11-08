import { GoogleGenAI, ThinkingLevel, type GenerateContentConfig } from '@google/genai';
import { AIProvider, AnalysisInputRecord, KnownThemePromptItem, AIAnalysisResult, AIProviderError } from './provider';
import { analyzeRecordWith, ChatJsonResult, RECORD_PROMPT_VERSION, RECORD_SCHEMA_VERSION } from './record-analysis';

/**
 * Gemini provider (default when GEMINI_API_KEY is set). Uses the same v5 prompt,
 * schema and grounding guards as Groq via analyzeRecordWith().
 */
// Verified against GET /v1beta/models for this project's key (Nov 2026): newest stable Flash.
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

export function geminiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || undefined;
}
export function geminiConfigured(): boolean {
  return Boolean(geminiKey());
}
export function geminiModel(): string {
  return process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
}

let cachedClient: { key: string; client: GoogleGenAI } | null = null;
function client(): GoogleGenAI {
  const key = geminiKey();
  if (!key) throw new AIProviderError('GEMINI_API_KEY is not configured on the server, so Gemini analysis cannot run.', 'MISSING_API_KEY', false);
  if (!cachedClient || cachedClient.key !== key) cachedClient = { key, client: new GoogleGenAI({ apiKey: key }) };
  return cachedClient.client;
}

/** Keep reasoning short for extraction tasks: Gemini 3 uses thinkingLevel, 2.5 uses a token budget. */
function thinkingFor(model: string): GenerateContentConfig['thinkingConfig'] | undefined {
  if (/gemini-3/.test(model)) return { thinkingLevel: ThinkingLevel.LOW };
  if (/gemini-2\.5-pro/.test(model)) return { thinkingBudget: 512 };
  if (/gemini-2\.5/.test(model)) return { thinkingBudget: 0 };
  return undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function geminiChatJson(system: string, user: string, opts?: { maxTokens?: number; model?: string }): Promise<ChatJsonResult> {
  const model = opts?.model || geminiModel();
  const ai = client();
  const started = Date.now();
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: user,
        config: {
          systemInstruction: system,
          temperature: 0,
          responseMimeType: 'application/json',
          // Thinking tokens count against the output budget on thinking models.
          maxOutputTokens: (opts?.maxTokens ?? 2000) + 2000,
          thinkingConfig: thinkingFor(model),
        },
      });
      return { rawOutput: res.text ?? '', servedModel: res.modelVersion || model, latencyMs: Date.now() - started, totalTokens: res.usageMetadata?.totalTokenCount };
    } catch (err) {
      const e = err as { status?: number; message?: string };
      const status = e.status ?? 0;
      const msg = e.message ?? String(err);
      if ((status === 429 || status === 503 || status === 500) && attempt < 5) {
        const hinted = /retry in ([\d.]+)s/i.exec(msg);
        await sleep(Math.min(60_000, hinted ? Number(hinted[1]) * 1000 + 250 : 2 ** attempt * 1000));
        continue;
      }
      if (status === 400 && /API key/i.test(msg)) throw new AIProviderError(`Gemini rejected the API key: ${msg}`, 'MISSING_API_KEY', false);
      if (status === 401 || status === 403) throw new AIProviderError(`Gemini authorisation failed (${status}): ${msg}`, 'MISSING_API_KEY', false);
      if (status === 429) throw new AIProviderError(`Gemini rate limit reached: ${msg}`, 'RATE_LIMIT_429', true);
      if (/timeout|ETIMEDOUT|aborted/i.test(msg)) throw new AIProviderError(`Gemini request timed out: ${msg}`, 'TIMEOUT', true);
      throw new AIProviderError(`Gemini API error${status ? ` ${status}` : ''}: ${msg}`, 'PROVIDER_UNAVAILABLE', false);
    }
  }
}

export class GeminiProvider implements AIProvider {
  readonly providerName = 'gemini';
  readonly modelName: string;
  readonly modelVersion: string;
  readonly promptVersion = RECORD_PROMPT_VERSION;
  readonly schemaVersion = RECORD_SCHEMA_VERSION;

  constructor(modelName?: string) {
    this.modelName = modelName || geminiModel();
    this.modelVersion = this.modelName;
  }

  analyzeRecord(record: AnalysisInputRecord, knownThemes: KnownThemePromptItem[]): Promise<AIAnalysisResult> {
    return analyzeRecordWith((sys, user, o) => geminiChatJson(sys, user, { ...o, model: this.modelName }), { provider: this.providerName, model: this.modelName }, record, knownThemes);
  }
}
