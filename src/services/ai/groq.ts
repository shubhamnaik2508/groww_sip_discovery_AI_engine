import {
  AIProvider,
  AnalysisInputRecord,
  KnownThemePromptItem,
  AIAnalysisResult,
  AIProviderError,
} from './provider';
import { analyzeRecordWith, RECORD_PROMPT_VERSION, RECORD_SCHEMA_VERSION } from './record-analysis';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// Verified against GET /openai/v1/models for this project's key (Nov 2026).
export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b';

export function groqConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

export function groqModel(): string {
  return process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL;
}

export interface GroqJsonResult {
  rawOutput: string;
  servedModel: string;
  latencyMs: number;
}

export function isReasoningModel(model: string): boolean {
  return model.startsWith('openai/gpt-oss') || model.includes('qwen3');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Minimal Groq chat-completions client (OpenAI-compatible API) returning JSON text.
 * Honours retry-after on 429 and retries transient 5xx; never logs the key.
 */
export async function groqChatJson(
  system: string,
  user: string,
  opts?: { maxTokens?: number; model?: string; maxRateLimitWaitMs?: number },
): Promise<GroqJsonResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new AIProviderError('GROQ_API_KEY is not configured on the server, so live AI analysis cannot run.', 'MISSING_API_KEY', false);
  }
  const model = opts?.model || groqModel();
  const maxWait = opts?.maxRateLimitWaitMs ?? 65_000;
  const started = Date.now();
  let attempt = 0;
  while (true) {
    attempt++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    let res: Response;
    try {
      res = await fetch(GROQ_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: 0,
          // Reasoning models spend completion tokens on reasoning first: keep effort low and budget headroom.
          max_completion_tokens: (opts?.maxTokens ?? 2000) + (isReasoningModel(model) ? 2000 : 0),
          ...(isReasoningModel(model) ? { reasoning_effort: 'low' } : {}),
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });
    } catch (err) {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < 3) continue;
      throw new AIProviderError(`Groq request failed: ${msg}`, /abort/i.test(msg) ? 'TIMEOUT' : 'PROVIDER_UNAVAILABLE', true);
    }
    clearTimeout(timer);

    if (res.status === 429 && attempt <= 6) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000;
      if (waitMs > maxWait) {
        throw new AIProviderError(`Groq rate limit reached; retry after ${Math.ceil(waitMs / 1000)}s.`, 'RATE_LIMIT_429', true);
      }
      await sleep(waitMs);
      continue;
    }
    if (res.status >= 500 && attempt < 3) {
      await sleep(2000 * attempt);
      continue;
    }
    const bodyText = await res.text();
    if (!res.ok) {
      let detail = bodyText.slice(0, 300);
      try {
        detail = JSON.parse(bodyText)?.error?.message ?? detail;
      } catch {
        /* keep raw text */
      }
      const code = res.status === 401 ? 'MISSING_API_KEY' : res.status === 429 ? 'RATE_LIMIT_429' : 'PROVIDER_UNAVAILABLE';
      throw new AIProviderError(`Groq API error ${res.status}: ${detail}`, code, res.status === 429);
    }
    const json = JSON.parse(bodyText);
    return {
      rawOutput: json?.choices?.[0]?.message?.content ?? '',
      servedModel: json?.model ?? model,
      latencyMs: Date.now() - started,
    };
  }
}

export { RECORD_PROMPT_VERSION, RECORD_SCHEMA_VERSION, MAX_INPUT_CHARS, buildRecordSystemPrompt, buildRecordUserPrompt } from './record-analysis';

export class GroqProvider implements AIProvider {
  readonly providerName = 'groq';
  readonly modelName: string;
  readonly modelVersion: string;
  readonly promptVersion = RECORD_PROMPT_VERSION;
  readonly schemaVersion = RECORD_SCHEMA_VERSION;

  constructor(modelName?: string) {
    this.modelName = modelName || groqModel();
    this.modelVersion = this.modelName;
  }

  analyzeRecord(record: AnalysisInputRecord, knownThemes: KnownThemePromptItem[]): Promise<AIAnalysisResult> {
    return analyzeRecordWith((sys, user, o) => groqChatJson(sys, user, { ...o, model: this.modelName }), { provider: this.providerName, model: this.modelName }, record, knownThemes);
  }
}
