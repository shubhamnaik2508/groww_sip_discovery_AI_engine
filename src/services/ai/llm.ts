import { geminiChatJson, geminiConfigured, geminiModel } from './gemini';
import { groqChatJson, groqConfigured, groqModel } from './groq';
import { AIProviderError } from './provider';
import type { ChatJsonResult } from './record-analysis';

/**
 * Live AI provider choice. The person running an analysis picks Gemini or Groq in the UI;
 * only providers with a server-side key are offered, and the server re-validates the choice.
 * Fallback order when nothing is chosen: AI_PROVIDER (if keyed) → Gemini → Groq.
 */
export type LiveProvider = 'gemini' | 'groq';
export const LIVE_PROVIDERS: LiveProvider[] = ['gemini', 'groq'];

export interface ProviderOption {
  id: LiveProvider;
  label: string;
  model: string;
  configured: boolean;
}

export function isLiveProvider(v: unknown): v is LiveProvider {
  return v === 'gemini' || v === 'groq';
}

export function providerConfigured(p: LiveProvider): boolean {
  return p === 'gemini' ? geminiConfigured() : groqConfigured();
}

export function providerModel(p: LiveProvider): string {
  return p === 'gemini' ? geminiModel() : groqModel();
}

/** Safe to send to the browser: names and models only, never keys. */
export function providerOptions(): ProviderOption[] {
  return LIVE_PROVIDERS.map((id) => ({ id, label: id === 'gemini' ? 'Gemini' : 'Groq', model: providerModel(id), configured: providerConfigured(id) }));
}

export function activeProvider(): LiveProvider | null {
  const forced = process.env.AI_PROVIDER;
  if (isLiveProvider(forced) && providerConfigured(forced)) return forced;
  if (geminiConfigured()) return 'gemini';
  if (groqConfigured()) return 'groq';
  return null;
}

/** The requested provider if it is configured; otherwise the default. Throws if the request is unusable. */
export function resolveProvider(requested?: string | null): LiveProvider {
  if (requested) {
    if (!isLiveProvider(requested)) throw new AIProviderError(`Unknown AI provider "${requested}".`, 'PROVIDER_UNAVAILABLE', false);
    if (!providerConfigured(requested)) throw new AIProviderError(`${requested === 'gemini' ? 'Gemini' : 'Groq'} is not configured on this server (no API key).`, 'MISSING_API_KEY', false);
    return requested;
  }
  const p = activeProvider();
  if (!p) throw new AIProviderError('No AI key (GEMINI_API_KEY or GROQ_API_KEY) is configured on this server, so live AI cannot run.', 'MISSING_API_KEY', false);
  return p;
}

export function llmConfigured(): boolean {
  return activeProvider() !== null;
}

export function llmModel(): string | null {
  const p = activeProvider();
  return p ? providerModel(p) : null;
}

export function llmLabel(p: LiveProvider | null = activeProvider()): string {
  return p ? `${p === 'gemini' ? 'Gemini' : 'Groq'} · ${providerModel(p)}` : 'not configured';
}

export async function chatJson(
  system: string,
  user: string,
  opts?: { maxTokens?: number; provider?: LiveProvider | null },
): Promise<ChatJsonResult & { provider: LiveProvider }> {
  const p = resolveProvider(opts?.provider);
  const r = p === 'gemini' ? await geminiChatJson(system, user, opts) : await groqChatJson(system, user, opts);
  return { ...r, provider: p };
}
