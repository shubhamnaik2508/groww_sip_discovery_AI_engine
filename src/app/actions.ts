'use server';

import { EvidenceService } from '@/services/evidence';
import { AnalysisOrchestrator } from '@/services/ai';
import { ReviewService, SubmitReviewInput } from '@/services/review';
import { EvaluationService, AddGoldenLabelInput } from '@/services/evaluation';
import { OpportunityService, OpportunityWeights } from '@/services/opportunity';
import { revalidatePath } from 'next/cache';
import { eq, desc } from 'drizzle-orm';
import { db, initializeDatabase } from '@/db';
import {
  evidenceRecords,
  themes,
  evidenceThemeLinks,
  contradictions,
  researchQuestions,
  recordAnalyses,
} from '@/db/schema';
import crypto from 'crypto';

export async function uploadEvidenceCsvAction(formData: FormData) {
  try {
    const file = formData.get('file') as File | null;
    const importedBy = (formData.get('importedBy') as string) || 'Researcher';

    if (!file) {
      return { success: false, error: 'No CSV file was provided.' };
    }

    const text = await file.text();
    const result = await EvidenceService.ingestCsv(text, file.name, importedBy);

    revalidatePath('/evidence');
    revalidatePath('/');
    return { success: true, result };
  } catch (err: any) {
    return { success: false, error: err.message || 'CSV ingestion failed.' };
  }
}

export async function addManualEvidenceAction(formData: FormData) {
  try {
    const sourceUrl = (formData.get('sourceUrl') as string)?.trim();
    const platform = (formData.get('platform') as string)?.trim() as any;
    const collectedAt = (formData.get('collectedAt') as string)?.trim() || new Date().toISOString().split('T')[0];
    const originalText = (formData.get('originalText') as string)?.trim();
    const investorContext = (formData.get('investorContext') as string)?.trim() || null;
    const journeyStage = (formData.get('journeyStage') as string)?.trim() as any || 'unclear';
    const enteredBy = (formData.get('enteredBy') as string)?.trim() || 'Researcher';
    const sourceMetadata: Record<string, string | boolean | undefined> = {
      authorId: (formData.get('authorId') as string)?.trim() || undefined,
      publishedAt: (formData.get('publishedAt') as string)?.trim() || undefined,
      language: (formData.get('language') as string)?.trim() || undefined,
      evidenceType: (formData.get('evidenceType') as string)?.trim() || undefined,
      participantId: (formData.get('participantId') as string)?.trim() || undefined,
      segmentQualification: (formData.get('segmentQualification') as string)?.trim() || undefined,
      employmentStage: (formData.get('employmentStage') as string)?.trim() || undefined,
      sipStartingContext: (formData.get('sipStartingContext') as string)?.trim() || undefined,
      motivationExpectations: (formData.get('motivationExpectations') as string)?.trim() || undefined,
      cashFlowConflict: (formData.get('cashFlowConflict') as string)?.trim() || undefined,
      sipBehaviour: (formData.get('sipBehaviour') as string)?.trim() || undefined,
      externalWorkaround: (formData.get('externalWorkaround') as string)?.trim() || undefined,
      unmetNeed: (formData.get('unmetNeed') as string)?.trim() || undefined,
      researchDate: (formData.get('researchDate') as string)?.trim() || undefined,
      researcherNotes: (formData.get('researcherNotes') as string)?.trim() || undefined,
      quoteConsent: formData.get('quoteConsent') === 'yes',
    };
    Object.keys(sourceMetadata).forEach((key) => {
      if (!sourceMetadata[key as keyof typeof sourceMetadata]) delete sourceMetadata[key as keyof typeof sourceMetadata];
    });

    if (!sourceUrl || !originalText) {
      return { success: false, error: 'Source URL and feedback text are required.' };
    }

    const result = await EvidenceService.createManualRecord(
      {
        sourceUrl,
        platform,
        collectedAt,
        originalText,
        investorContext,
        sourceMetadata: Object.keys(sourceMetadata).length ? sourceMetadata as Record<string, string | boolean> : null,
        journeyStage,
        fieldProvenance: {
          sourceUrl: 'user_entered',
          platform: 'user_entered',
          collectedAt: 'user_entered',
          originalText: 'user_entered',
          investorContext: investorContext ? 'user_entered' : 'unverified',
          journeyStage: journeyStage !== 'unclear' ? 'user_entered' : 'unverified',
          ...(Object.keys(sourceMetadata).length ? { sourceMetadata: 'user_entered' as const } : {}),
        },
        entryMethod: 'manual',
        isSynthetic: false,
        verificationStatus: 'user_entered',
      },
      enteredBy
    );

    revalidatePath('/evidence');
    revalidatePath('/');
    return { success: true, result };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to add record.' };
  }
}

export async function updateEvidenceMetadataAction(
  id: string,
  edits: {
    journeyStage?: string;
    investorContext?: string | null;
  },
  reason: string,
  editedBy: string = 'Researcher'
) {
  try {
    await EvidenceService.updateRecordMetadata(id, edits, editedBy, reason);
    revalidatePath('/evidence');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update metadata.' };
  }
}

export async function runBatchAnalysisAction(options?: {
  providerName?: string;
  recordIds?: string[];
  maxRecords?: number;
  skipAlreadyAnalyzed?: boolean;
}) {
  try {
    const summary = await AnalysisOrchestrator.executeRun(options);
    revalidatePath('/evidence');
    revalidatePath('/themes');
    revalidatePath('/intelligence');
    revalidatePath('/graph');
    revalidatePath('/opportunities');
    revalidatePath('/');
    return { success: true, summary };
  } catch (err: any) {
    return { success: false, error: err.message || 'Analysis run failed.' };
  }
}

export async function submitReviewAction(input: SubmitReviewInput) {
  try {
    const result = await ReviewService.submitReview(input);
    revalidatePath('/evidence');
    revalidatePath('/reliability');
    revalidatePath('/opportunities');
    revalidatePath('/');
    return { success: true, result };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to submit review.' };
  }
}

export async function addGoldenLabelAction(input: AddGoldenLabelInput) {
  try {
    const result = await EvaluationService.addGoldenLabel(input);
    revalidatePath('/reliability');
    return { success: true, result };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to save golden label.' };
  }
}

export async function runEvaluationAction(analysisRunId: string) {
  try {
    const result = await EvaluationService.evaluateAnalysisRun(analysisRunId);
    revalidatePath('/reliability');
    revalidatePath('/export');
    revalidatePath('/');
    return { success: true, result };
  } catch (err: any) {
    return { success: false, error: err.message || 'Evaluation run failed.' };
  }
}

export async function recalculateOpportunityAction(
  opportunityId: string,
  weights: OpportunityWeights
) {
  try {
    const result = await OpportunityService.recalculateOpportunityScore(opportunityId, weights);
    revalidatePath('/opportunities');
    return { success: true, result };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to recalculate scores.' };
  }
}

export async function createOpportunityAction(input: any) {
  try {
    const result = await OpportunityService.createOpportunity(input);
    revalidatePath('/opportunities');
    return { success: true, result };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create opportunity.' };
  }
}

export async function updateOpportunityHumanScoreAction(input: {
  opportunityId: string;
  criterion: 'user_impact' | 'business_metric_link' | 'research_uncertainty' | 'potential_feasibility';
  score: number;
  rationale: string;
  scoredBy: string;
}) {
  try {
    const result = await OpportunityService.updateHumanScore(input);
    revalidatePath('/opportunities');
    revalidatePath('/export');
    return { success: true, result };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to save score override.' };
  }
}

/** Adds synthetic development fixtures and simulated labels. Never counts as investor evidence. */
export async function seedBenchmarkDatasetAction() {
  const { seedBenchmarkData } = await import('@/db/seed');
  const result = await seedBenchmarkData();

  revalidatePath('/');
  revalidatePath('/evidence');
  revalidatePath('/themes');
  revalidatePath('/opportunities');
  revalidatePath('/reliability');
  revalidatePath('/tracker');
  revalidatePath('/export');

  return result;
}

/**
 * Explicit development-only destructive reset action.
 * Strictly requires confirmation string 'CONFIRM_DESTRUCTIVE_RESET'.
 */
export async function dangerousResetDatabaseAction(confirmation: string) {
  try {
    const { dangerousResetDatabase } = await import('@/db/seed');
    const result = await dangerousResetDatabase({ confirmation });

    revalidatePath('/');
    revalidatePath('/evidence');
    revalidatePath('/themes');
    revalidatePath('/opportunities');
    revalidatePath('/reliability');
    revalidatePath('/tracker');
    revalidatePath('/export');

    return { success: true, result };
  } catch (err: any) {
    return { success: false, error: err.message || 'Reset failed.' };
  }
}

/**
 * Manually update verification status of an evidence record with reviewer audit trail
 */
export async function verifyEvidenceAction(
  evidenceId: string,
  status: 'content_verified' | 'link_checked' | 'unverified',
  reviewer: string = 'Researcher',
  notes?: string
) {
  try {
    await EvidenceService.verifyEvidenceRecord(evidenceId, status, reviewer, notes);
    revalidatePath('/evidence');
    revalidatePath('/');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Verification failed.' };
  }
}

export async function updateThemeStatusAction(
  themeId: string,
  status: 'proposed' | 'accepted' | 'retired'
) {
  try {
    await db
      .update(themes)
      .set({ status, updatedAt: new Date().toISOString() })
      .where(eq(themes.id, themeId));
    revalidatePath('/themes');
    revalidatePath('/opportunities');
    revalidatePath('/');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update theme status.' };
  }
}

export async function mergeThemesAction(sourceThemeId: string, targetThemeId: string) {
  try {
    if (sourceThemeId === targetThemeId) {
      return { success: false, error: 'Cannot merge a theme into itself.' };
    }

    // 1. Point links from source to target
    await db
      .update(evidenceThemeLinks)
      .set({ themeId: targetThemeId })
      .where(eq(evidenceThemeLinks.themeId, sourceThemeId));

    // 2. Mark source as merged
    await db
      .update(themes)
      .set({
        status: 'merged',
        mergedIntoId: targetThemeId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(themes.id, sourceThemeId));

    revalidatePath('/themes');
    revalidatePath('/opportunities');
    revalidatePath('/');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to merge themes.' };
  }
}

export async function createThemeAction(name: string, description: string, journeyStage: string) {
  try {
    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const newId = crypto.randomUUID();
    await db.insert(themes).values({
      id: newId,
      name: name.trim(),
      slug,
      description: description.trim(),
      journeyStage,
      origin: 'human_created',
      status: 'accepted',
    });

    revalidatePath('/themes');
    return { success: true, themeId: newId };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create theme.' };
  }
}

export async function updateContradictionStatusAction(
  id: string,
  status: 'open' | 'explained' | 'resolved',
  resolutionNotes?: string
) {
  try {
    await db
      .update(contradictions)
      .set({
        status,
        resolutionNotes: resolutionNotes || null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(contradictions.id, id));

    revalidatePath('/tracker');
    revalidatePath('/');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update contradiction.' };
  }
}

export async function updateResearchQuestionAction(
  id: string,
  status: 'open' | 'investigating' | 'answered' | 'deferred',
  answerSummary?: string
) {
  try {
    await db
      .update(researchQuestions)
      .set({
        status,
        answerSummary: answerSummary || null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(researchQuestions.id, id));

    revalidatePath('/tracker');
    revalidatePath('/');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update research question.' };
  }
}

export async function createResearchQuestionAction(
  question: string,
  relatedJourneyStage?: string,
  relatedThemeId?: string
) {
  try {
    const id = crypto.randomUUID();
    await db.insert(researchQuestions).values({
      id,
      question: question.trim(),
      origin: 'human_researcher',
      relatedJourneyStage: relatedJourneyStage || null,
      relatedThemeId: relatedThemeId || null,
      status: 'open',
    });

    revalidatePath('/tracker');
    revalidatePath('/');
    return { success: true, id };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create research question.' };
  }
}

export async function createContradictionAction(
  title: string,
  description: string,
  evidenceAId: string,
  evidenceBId: string,
  themeId?: string
) {
  try {
    const id = crypto.randomUUID();
    await db.insert(contradictions).values({
      id,
      title: title.trim(),
      description: description.trim(),
      evidenceAId,
      evidenceBId,
      themeId: themeId || null,
      status: 'open',
    });

    revalidatePath('/tracker');
    revalidatePath('/');
    return { success: true, id };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create contradiction.' };
  }
}


