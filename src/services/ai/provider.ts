import { StructuredAnalysisOutput } from './schema';

export type AIErrorCode =
  | 'MISSING_API_KEY'
  | 'RATE_LIMIT_429'
  | 'TIMEOUT'
  | 'MALFORMED_OUTPUT'
  | 'GUARD_VIOLATION'
  | 'PROVIDER_UNAVAILABLE'
  | 'SCHEMA_VALIDATION_ERROR';

export class AIProviderError extends Error {
  code: AIErrorCode;
  retryable: boolean;
  rawResponse?: string;

  constructor(message: string, code: AIErrorCode, retryable: boolean = false, rawResponse?: string) {
    super(message);
    this.name = 'AIProviderError';
    this.code = code;
    this.retryable = retryable;
    this.rawResponse = rawResponse;
  }
}

export interface AnalysisInputRecord {
  id: string;
  sourceUrl: string;
  platform: string;
  collectedAt: string;
  originalText: string;
  investorContext?: string | null;
  journeyStage?: string;
  sourceMetadata?: Record<string, any> | null;
}

export interface KnownThemePromptItem {
  id: string;
  name: string;
  description: string;
  journeyStage: string;
}

export interface AIAnalysisResult {
  provider: string;
  model: string;
  modelVersion: string;
  promptVersion: string;
  schemaVersion: string;
  rawOutput: string;
  parsedOutput?: StructuredAnalysisOutput;
  validationStatus: 'valid' | 'invalid' | 'guard_failed';
  validationErrors?: string[];
  errorType?: AIErrorCode;
  latencyMs: number;
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface AIProvider {
  readonly providerName: string;
  readonly modelName: string;
  readonly modelVersion: string;
  readonly promptVersion: string;
  readonly schemaVersion: string;

  analyzeRecord(
    record: AnalysisInputRecord,
    knownThemes: KnownThemePromptItem[]
  ): Promise<AIAnalysisResult>;
}
