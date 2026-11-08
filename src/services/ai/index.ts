import { AIProvider, AnalysisInputRecord, KnownThemePromptItem, AIAnalysisResult } from './provider';
import { GeminiProvider } from './gemini';
import { GroqProvider } from './groq';
import { activeProvider } from './llm';
import { FakeAIProvider } from './fake';
import { db, initializeDatabase } from '@/db';
import {
  analysisRuns,
  recordAnalyses,
  evidenceRecords,
  themes,
  evidenceThemeLinks,
  researchQuestions,
} from '@/db/schema';
import { eq, sql, inArray } from 'drizzle-orm';
import crypto from 'crypto';

export function getAIProvider(preferredName?: string): AIProvider {
  // Default: Gemini when its key is configured, Groq as fallback (see llm.ts).
  const providerType = preferredName || process.env.AI_PROVIDER || activeProvider() || 'gemini';

  if (providerType === 'fake') {
    return new FakeAIProvider();
  }
  if (providerType === 'groq') {
    return new GroqProvider();
  }

  // Default to GeminiProvider
  return new GeminiProvider();
}

export interface RunAnalysisOptions {
  providerName?: string;
  recordIds?: string[];
  maxRecords?: number;
  skipAlreadyAnalyzed?: boolean;
}

export interface AnalysisRunSummary {
  runId: string;
  provider: string;
  model: string;
  totalRecords: number;
  successfulRecords: number;
  failedRecords: number;
  startedAt: string;
  finishedAt: string;
}

export class AnalysisOrchestrator {
  /**
   * Executes a managed AI analysis run across selected or unanalyzed records
   */
  static async executeRun(options?: RunAnalysisOptions): Promise<AnalysisRunSummary> {
    await initializeDatabase();
    const provider = getAIProvider(options?.providerName);
    const runId = crypto.randomUUID();
    const startedAt = new Date().toISOString();

    // 1. Fetch records to analyze
    let recordsQuery = db.select().from(evidenceRecords);

    let targetRecords = await recordsQuery.all();

    if (options?.recordIds && options.recordIds.length > 0) {
      targetRecords = targetRecords.filter((r) => options.recordIds!.includes(r.id));
    }

    if (options?.skipAlreadyAnalyzed) {
      const existingAnalyses = await db
        .select({ evidenceId: recordAnalyses.evidenceId })
        .from(recordAnalyses)
        .all();
      const analyzedIds = new Set(existingAnalyses.map((a) => a.evidenceId));
      targetRecords = targetRecords.filter((r) => !analyzedIds.has(r.id));
    }

    if (options?.maxRecords && options.maxRecords > 0) {
      targetRecords = targetRecords.slice(0, options.maxRecords);
    }

    // 2. Fetch existing known themes
    const existingThemes = await db.select().from(themes).all();
    const knownThemeItems: KnownThemePromptItem[] = existingThemes.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      journeyStage: t.journeyStage,
    }));

    // 3. Register analysis run
    await db.insert(analysisRuns).values({
      id: runId,
      provider: provider.providerName,
      model: provider.modelName,
      modelVersion: provider.modelVersion,
      promptVersion: provider.promptVersion,
      schemaVersion: provider.schemaVersion,
      parameters: JSON.stringify({
        maxRecords: options?.maxRecords,
        skipAlreadyAnalyzed: options?.skipAlreadyAnalyzed,
      }),
      status: 'running',
      totalRecords: targetRecords.length,
      successfulRecords: 0,
      failedRecords: 0,
      startedAt,
    });

    let successfulRecords = 0;
    let failedRecords = 0;

    // 4. Process records sequentially to avoid overwhelming rate limits
    for (const record of targetRecords) {
      const analysisInput: AnalysisInputRecord = {
        id: record.id,
        sourceUrl: record.sourceUrl,
        platform: record.platform,
        collectedAt: record.collectedAt,
        originalText: record.originalText,
        investorContext: record.investorContext,
        journeyStage: record.journeyStage,
        sourceMetadata: record.sourceMetadata ? JSON.parse(record.sourceMetadata) : null,
      };

      try {
        const result = await provider.analyzeRecord(analysisInput, knownThemeItems);
        const recordAnalysisId = crypto.randomUUID();

        // Persist immutable analysis output
        await db.insert(recordAnalyses).values({
          id: recordAnalysisId,
          runId,
          evidenceId: record.id,
          rawOutput: result.rawOutput,
          parsedOutput: result.parsedOutput ? JSON.stringify(result.parsedOutput) : null,
          validationStatus: result.validationStatus,
          validationErrors: result.validationErrors ? JSON.stringify(result.validationErrors) : null,
          errorType: result.errorType || null,
          latencyMs: result.latencyMs,
        });

        if (result.validationStatus === 'valid' && result.parsedOutput) {
          successfulRecords++;

          // Auto-register theme if proposed
          if (result.parsedOutput.theme) {
            const themeName = result.parsedOutput.theme.name.trim();
            const themeSlug = themeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

            let themeRecord = await db.select().from(themes).where(eq(themes.slug, themeSlug)).limit(1);

            let themeId: string;
            if (themeRecord.length === 0) {
              themeId = crypto.randomUUID();
              await db.insert(themes).values({
                id: themeId,
                name: themeName,
                slug: themeSlug,
                description: `Discovered from investor feedback: "${result.parsedOutput.observedBehaviour.slice(0, 100)}"`,
                journeyStage: result.parsedOutput.journeyStage,
                origin: 'ai_proposed',
                status: 'proposed',
              });

              // Add to known theme list for subsequent iterations
              knownThemeItems.push({
                id: themeId,
                name: themeName,
                description: `Discovered from investor feedback`,
                journeyStage: result.parsedOutput.journeyStage,
              });
            } else {
              themeId = themeRecord[0].id;
            }

            // Link evidence to theme
            await db.insert(evidenceThemeLinks).values({
              id: crypto.randomUUID(),
              evidenceId: record.id,
              themeId,
              role: 'supports',
              source: 'ai',
              recordAnalysisId,
            });
          }

          // Register follow-up research question if generated
          if (result.parsedOutput.followUpResearchQuestion) {
            await db.insert(researchQuestions).values({
              id: crypto.randomUUID(),
              question: result.parsedOutput.followUpResearchQuestion,
              origin: 'ai_analysis',
              relatedJourneyStage: result.parsedOutput.journeyStage,
              status: 'open',
            });
          }
        } else {
          failedRecords++;
        }
      } catch (err: any) {
        failedRecords++;
        await db.insert(recordAnalyses).values({
          id: crypto.randomUUID(),
          runId,
          evidenceId: record.id,
          rawOutput: '',
          validationStatus: 'invalid',
          validationErrors: JSON.stringify([err.message || 'Execution error']),
          errorType: err.code || 'PROVIDER_UNAVAILABLE',
          latencyMs: 0,
        });
      }
    }

    const finishedAt = new Date().toISOString();

    // 5. Update run status
    await db
      .update(analysisRuns)
      .set({
        status: failedRecords > 0 && successfulRecords === 0 ? 'failed' : 'completed',
        successfulRecords,
        failedRecords,
        finishedAt,
      })
      .where(eq(analysisRuns.id, runId));

    return {
      runId,
      provider: provider.providerName,
      model: provider.modelName,
      totalRecords: targetRecords.length,
      successfulRecords,
      failedRecords,
      startedAt,
      finishedAt,
    };
  }
}
