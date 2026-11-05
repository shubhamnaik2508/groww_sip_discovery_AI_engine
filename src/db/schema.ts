import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// 1. Evidence Records
export const evidenceRecords = sqliteTable('evidence_records', {
  id: text('id').primaryKey(),
  sourceUrl: text('source_url').notNull(),
  platform: text('platform').notNull(), // 'play_store' | 'app_store' | 'reddit' | 'twitter_x' | 'youtube' | 'community_forum' | 'user_interview' | 'other'
  collectedAt: text('collected_at').notNull(), // ISO timestamp
  originalText: text('original_text').notNull(), // Immutable original verbatim feedback
  contentHash: text('content_hash').notNull(), // Normalized text hash for duplicate detection
  investorContext: text('investor_context'), // Only if explicitly stated in text
  journeyStage: text('journey_stage').notNull().default('unclear'),
  sourceMetadata: text('source_metadata'), // JSON: { author, rating, upvotes, threadUrl, datePosted }
  fieldProvenance: text('field_provenance').notNull(), // JSON: { [fieldName]: 'verified' | 'user_entered' | 'unverified' }
  entryMethod: text('entry_method').notNull().default('manual'), // 'csv' | 'manual' | 'fixture'
  importBatchId: text('import_batch_id'),
  duplicateOfId: text('duplicate_of_id'),
  isSynthetic: integer('is_synthetic', { mode: 'boolean' }).notNull().default(false), // Watermark for synthetic tests
  verificationStatus: text('verification_status').notNull().default('unverified'), // 'content_verified' | 'link_checked' | 'user_entered' | 'unverified' | 'synthetic_fixture'
  verifiedAt: text('verified_at'),
  verifiedBy: text('verified_by'),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

// 2. Evidence Edits (Audit log for non-original_text metadata edits)
export const evidenceEdits = sqliteTable('evidence_edits', {
  id: text('id').primaryKey(),
  evidenceId: text('evidence_id').notNull().references(() => evidenceRecords.id),
  fieldName: text('field_name').notNull(),
  oldValue: text('old_value'),
  newValue: text('new_value'),
  editedBy: text('edited_by').notNull(),
  reason: text('reason').notNull(),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

// 3. Import Batches
export const importBatches = sqliteTable('import_batches', {
  id: text('id').primaryKey(),
  fileName: text('file_name').notNull(),
  totalRows: integer('total_rows').notNull(),
  acceptedRows: integer('accepted_rows').notNull(),
  rejectedRows: integer('rejected_rows').notNull(),
  duplicateRows: integer('duplicate_rows').notNull(),
  rejectionDetails: text('rejection_details'), // JSON array of { rowNumber, errors }
  importedBy: text('imported_by').notNull(),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

// 4. Analysis Runs
export const analysisRuns = sqliteTable('analysis_runs', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(), // 'gemini' | 'openai' | 'fake'
  model: text('model').notNull(),
  modelVersion: text('model_version').notNull(),
  promptVersion: text('prompt_version').notNull(),
  schemaVersion: text('schema_version').notNull(),
  parameters: text('parameters'), // JSON
  status: text('status').notNull().default('running'), // 'running' | 'completed' | 'failed' | 'cancelled'
  totalRecords: integer('total_records').notNull().default(0),
  successfulRecords: integer('successful_records').notNull().default(0),
  failedRecords: integer('failed_records').notNull().default(0),
  startedAt: text('started_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  finishedAt: text('finished_at'),
  errorSummary: text('error_summary'),
});

// 5. Record Analyses (Immutable AI outputs)
export const recordAnalyses = sqliteTable('record_analyses', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => analysisRuns.id),
  evidenceId: text('evidence_id').notNull().references(() => evidenceRecords.id),
  rawOutput: text('raw_output').notNull(),
  parsedOutput: text('parsed_output'), // JSON structured output validated by Zod
  validationStatus: text('validation_status').notNull(), // 'valid' | 'invalid' | 'guard_failed'
  validationErrors: text('validation_errors'), // JSON array
  errorType: text('error_type'), // 'timeout' | 'rate_limit' | 'malformed' | 'refused' | 'missing_key' | 'guard_violation' | 'provider_error'
  latencyMs: integer('latency_ms'),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

// 6. Themes
export const themes = sqliteTable('themes', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
  description: text('description').notNull(),
  journeyStage: text('journey_stage').notNull(),
  origin: text('origin').notNull().default('ai_proposed'), // 'ai_proposed' | 'human_created'
  status: text('status').notNull().default('proposed'), // 'proposed' | 'accepted' | 'merged' | 'retired'
  mergedIntoId: text('merged_into_id'),
  parentId: text('parent_id'),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

// 7. Evidence to Theme Links
export const evidenceThemeLinks = sqliteTable('evidence_theme_links', {
  id: text('id').primaryKey(),
  evidenceId: text('evidence_id').notNull().references(() => evidenceRecords.id),
  themeId: text('theme_id').notNull().references(() => themes.id),
  role: text('role').notNull().default('supports'), // 'supports' | 'contradicts' | 'adjacent'
  source: text('source').notNull().default('ai'), // 'ai' | 'human_review'
  recordAnalysisId: text('record_analysis_id'),
  reviewId: text('review_id'),
  notes: text('notes'),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

// 8. Reviews (Append-only human decisions)
export const reviews = sqliteTable('reviews', {
  id: text('id').primaryKey(),
  recordAnalysisId: text('record_analysis_id').notNull().references(() => recordAnalyses.id),
  evidenceId: text('evidence_id').notNull().references(() => evidenceRecords.id),
  decision: text('decision').notNull(), // 'confirmed' | 'corrected' | 'rejected'
  revisedOutput: text('revised_output'), // JSON of corrected classification
  rationale: text('rationale').notNull(), // Mandatory explanation
  reviewer: text('reviewer').notNull(),
  analysisVersionSnapshot: text('analysis_version_snapshot').notNull(),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

// 9. Golden Labels
export const goldenLabels = sqliteTable('golden_labels', {
  id: text('id').primaryKey(),
  evidenceId: text('evidence_id').notNull().unique().references(() => evidenceRecords.id),
  themeId: text('theme_id'), // can be null if insufficient_evidence or ambiguous
  specialLabel: text('special_label').notNull().default('standard'), // 'standard' | 'insufficient_evidence' | 'ambiguous'
  journeyStage: text('journey_stage').notNull(),
  observedBehaviour: text('observed_behaviour'),
  labeller: text('labeller').notNull(),
  rationale: text('rationale').notNull(),
  labelledBlind: integer('labelled_blind', { mode: 'boolean' }).notNull().default(true),
  labelledAt: text('labelled_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

// 10. Evaluation Runs
export const evaluationRuns = sqliteTable('evaluation_runs', {
  id: text('id').primaryKey(),
  analysisRunId: text('analysis_run_id').notNull().references(() => analysisRuns.id),
  provider: text('provider'), // 'gemini' | 'fake'
  model: text('model'),
  modelVersion: text('model_version'),
  isSimulated: integer('is_simulated', { mode: 'boolean' }).notNull().default(false),
  isIncomplete: integer('is_incomplete', { mode: 'boolean' }).notNull().default(false),
  missingDetails: text('missing_details'), // JSON string: { missingPredictions: number, missingGoldens: number }
  evaluatedAt: text('evaluated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  totalGoldenRecords: integer('total_golden_records').notNull(),
  exactMatches: integer('exact_matches').notNull(),
  accuracy: real('accuracy').notNull(),
  metricsByTheme: text('metrics_by_theme').notNull(), // JSON
  confusionMatrix: text('confusion_matrix').notNull(), // JSON
  abstentionAccuracy: real('abstention_accuracy'),
  commonErrorCategories: text('common_error_categories').notNull(), // JSON
  smallSampleWarning: integer('small_sample_warning', { mode: 'boolean' }).notNull().default(true),
});

// 11. Evaluation Items
export const evaluationItems = sqliteTable('evaluation_items', {
  id: text('id').primaryKey(),
  evaluationRunId: text('evaluation_run_id').notNull().references(() => evaluationRuns.id),
  evidenceId: text('evidence_id').notNull().references(() => evidenceRecords.id),
  goldenLabelId: text('golden_label_id').notNull().references(() => goldenLabels.id),
  recordAnalysisId: text('record_analysis_id').notNull().references(() => recordAnalyses.id),
  predictedTheme: text('predicted_theme'),
  actualTheme: text('actual_theme'),
  isMatch: integer('is_match', { mode: 'boolean' }).notNull(),
  errorCategory: text('error_category').notNull().default('none'), // 'none' | 'wrong_theme' | 'missed_abstention' | 'unwarranted_abstention' | 'unsupported_context' | 'excerpt_mismatch' | 'inference_as_observation'
  notes: text('notes'),
});

// 12. Failure Cases (Genuine corrected/rejected examples with lessons learned)
export const failureCases = sqliteTable('failure_cases', {
  id: text('id').primaryKey(),
  reviewId: text('review_id').notNull().references(() => reviews.id),
  evidenceId: text('evidence_id').notNull().references(() => evidenceRecords.id),
  failureType: text('failure_type').notNull(), // 'hallucinated_context' | 'unwarranted_causal_leap' | 'theme_misclassification' | 'missed_sarcasm' | 'overconfidence_on_vague_text' | 'excerpt_mismatch'
  originalPrediction: text('original_prediction').notNull(), // JSON
  correctedOutput: text('corrected_output').notNull(), // JSON
  reviewerRationale: text('reviewer_rationale').notNull(),
  lessonLearned: text('lesson_learned').notNull(),
  preventionStrategy: text('prevention_strategy').notNull(),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

// 13. Opportunities (Strict problem statements, no predetermined solution)
export const opportunities = sqliteTable('opportunities', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  problemStatement: text('problem_statement').notNull(),
  hypothesisOnRetention: text('hypothesis_on_retention').notNull(),
  status: text('status').notNull().default('draft'), // 'draft' | 'under_evaluation' | 'prioritized' | 'deprioritized'
  weightsSnapshot: text('weights_snapshot').notNull(), // JSON
  compositeScore: real('composite_score').notNull().default(0),
  rank: integer('rank'),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

// 14. Opportunity Themes
export const opportunityThemes = sqliteTable('opportunity_themes', {
  id: text('id').primaryKey(),
  opportunityId: text('opportunity_id').notNull().references(() => opportunities.id),
  themeId: text('theme_id').notNull().references(() => themes.id),
});

// 15. Opportunity Scores (7 explicit criteria)
export const opportunityScores = sqliteTable('opportunity_scores', {
  id: text('id').primaryKey(),
  opportunityId: text('opportunity_id').notNull().references(() => opportunities.id),
  criterion: text('criterion').notNull(), // 'evidence_strength' | 'independent_records' | 'source_diversity' | 'user_impact' | 'business_metric_link' | 'research_uncertainty' | 'potential_feasibility'
  rawScore: real('raw_score').notNull(), // 0 to 5
  normalizedScore: real('normalized_score').notNull(), // 0 to 100
  basis: text('basis').notNull(), // 'computed' | 'human_judgement'
  rationale: text('rationale').notNull(),
  scoredBy: text('scored_by').notNull(),
  updatedAt: text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

export const opportunityScoreAudit = sqliteTable('opportunity_score_audit', {
  id: text('id').primaryKey(),
  opportunityId: text('opportunity_id').notNull().references(() => opportunities.id),
  criterion: text('criterion').notNull(),
  previousScore: real('previous_score'),
  newScore: real('new_score').notNull(),
  rationale: text('rationale').notNull(),
  scoredBy: text('scored_by').notNull(),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

// 16. Research Questions
export const researchQuestions = sqliteTable('research_questions', {
  id: text('id').primaryKey(),
  question: text('question').notNull(),
  origin: text('origin').notNull().default('ai_analysis'), // 'ai_analysis' | 'human_researcher' | 'gap_tracker'
  relatedJourneyStage: text('related_journey_stage'),
  relatedThemeId: text('related_theme_id'),
  status: text('status').notNull().default('open'), // 'open' | 'investigating' | 'answered' | 'deferred'
  answerSummary: text('answer_summary'),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

// 17. Contradictions
export const contradictions = sqliteTable('contradictions', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  evidenceAId: text('evidence_a_id').notNull().references(() => evidenceRecords.id),
  evidenceBId: text('evidence_b_id').notNull().references(() => evidenceRecords.id),
  themeId: text('theme_id').references(() => themes.id),
  status: text('status').notNull().default('open'), // 'open' | 'explained' | 'resolved'
  resolutionNotes: text('resolution_notes'),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
});
