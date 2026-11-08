import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';

function getDatabaseConfig() {
  const isVercel = process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV);
  let url = process.env.DATABASE_URL;

  if (!url) {
    url = isVercel ? 'file:/tmp/groww_sip_lab.db' : 'file:groww_sip_lab.db';
  }

  const authToken = process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN;

  return { url, authToken };
}

const config = getDatabaseConfig();

export const client = createClient({
  url: config.url,
  authToken: config.authToken,
});

export const db = drizzle(client, { schema });

// Helper to ensure tables exist in SQLite/LibSQL without requiring external migration CLI
export async function initializeDatabase() {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS evidence_records (
      id TEXT PRIMARY KEY,
      source_url TEXT NOT NULL,
      platform TEXT NOT NULL,
      collected_at TEXT NOT NULL,
      original_text TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      investor_context TEXT,
      journey_stage TEXT NOT NULL DEFAULT 'unclear',
      source_metadata TEXT,
      field_provenance TEXT NOT NULL,
      entry_method TEXT NOT NULL DEFAULT 'manual',
      import_batch_id TEXT,
      duplicate_of_id TEXT,
      is_synthetic INTEGER NOT NULL DEFAULT 0,
      verification_status TEXT NOT NULL DEFAULT 'unverified',
      verified_at TEXT,
      verified_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS evidence_edits (
      id TEXT PRIMARY KEY,
      evidence_id TEXT NOT NULL REFERENCES evidence_records(id),
      field_name TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      edited_by TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS import_batches (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      total_rows INTEGER NOT NULL,
      accepted_rows INTEGER NOT NULL,
      rejected_rows INTEGER NOT NULL,
      duplicate_rows INTEGER NOT NULL,
      rejection_details TEXT,
      imported_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS analysis_runs (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      model_version TEXT NOT NULL,
      prompt_version TEXT NOT NULL,
      schema_version TEXT NOT NULL,
      parameters TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      total_records INTEGER NOT NULL DEFAULT 0,
      successful_records INTEGER NOT NULL DEFAULT 0,
      failed_records INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      finished_at TEXT,
      error_summary TEXT
    );

    CREATE TABLE IF NOT EXISTS record_analyses (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES analysis_runs(id),
      evidence_id TEXT NOT NULL REFERENCES evidence_records(id),
      raw_output TEXT NOT NULL,
      parsed_output TEXT,
      validation_status TEXT NOT NULL,
      validation_errors TEXT,
      error_type TEXT,
      latency_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS themes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      journey_stage TEXT NOT NULL,
      origin TEXT NOT NULL DEFAULT 'ai_proposed',
      status TEXT NOT NULL DEFAULT 'proposed',
      merged_into_id TEXT,
      parent_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS evidence_theme_links (
      id TEXT PRIMARY KEY,
      evidence_id TEXT NOT NULL REFERENCES evidence_records(id),
      theme_id TEXT NOT NULL REFERENCES themes(id),
      role TEXT NOT NULL DEFAULT 'supports',
      source TEXT NOT NULL DEFAULT 'ai',
      record_analysis_id TEXT,
      review_id TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      record_analysis_id TEXT NOT NULL REFERENCES record_analyses(id),
      evidence_id TEXT NOT NULL REFERENCES evidence_records(id),
      decision TEXT NOT NULL,
      revised_output TEXT,
      rationale TEXT NOT NULL,
      reviewer TEXT NOT NULL,
      analysis_version_snapshot TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS golden_labels (
      id TEXT PRIMARY KEY,
      evidence_id TEXT NOT NULL UNIQUE REFERENCES evidence_records(id),
      theme_id TEXT,
      special_label TEXT NOT NULL DEFAULT 'standard',
      journey_stage TEXT NOT NULL,
      observed_behaviour TEXT,
      labeller TEXT NOT NULL,
      rationale TEXT NOT NULL,
      labelled_blind INTEGER NOT NULL DEFAULT 1,
      labelled_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS evaluation_runs (
      id TEXT PRIMARY KEY,
      analysis_run_id TEXT NOT NULL REFERENCES analysis_runs(id),
      provider TEXT,
      model TEXT,
      model_version TEXT,
      is_simulated INTEGER NOT NULL DEFAULT 0,
      is_incomplete INTEGER NOT NULL DEFAULT 0,
      missing_details TEXT,
      evaluated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      total_golden_records INTEGER NOT NULL,
      exact_matches INTEGER NOT NULL,
      accuracy REAL NOT NULL,
      metrics_by_theme TEXT NOT NULL,
      confusion_matrix TEXT NOT NULL,
      abstention_accuracy REAL,
      common_error_categories TEXT NOT NULL,
      small_sample_warning INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS evaluation_items (
      id TEXT PRIMARY KEY,
      evaluation_run_id TEXT NOT NULL REFERENCES evaluation_runs(id),
      evidence_id TEXT NOT NULL REFERENCES evidence_records(id),
      golden_label_id TEXT NOT NULL REFERENCES golden_labels(id),
      record_analysis_id TEXT NOT NULL REFERENCES record_analyses(id),
      predicted_theme TEXT,
      actual_theme TEXT,
      is_match INTEGER NOT NULL,
      error_category TEXT NOT NULL DEFAULT 'none',
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS failure_cases (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL REFERENCES reviews(id),
      evidence_id TEXT NOT NULL REFERENCES evidence_records(id),
      failure_type TEXT NOT NULL,
      original_prediction TEXT NOT NULL,
      corrected_output TEXT NOT NULL,
      reviewer_rationale TEXT NOT NULL,
      lesson_learned TEXT NOT NULL,
      prevention_strategy TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS opportunities (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      problem_statement TEXT NOT NULL,
      hypothesis_on_retention TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      weights_snapshot TEXT NOT NULL,
      composite_score REAL NOT NULL DEFAULT 0,
      rank INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS opportunity_themes (
      id TEXT PRIMARY KEY,
      opportunity_id TEXT NOT NULL REFERENCES opportunities(id),
      theme_id TEXT NOT NULL REFERENCES themes(id)
    );

    CREATE TABLE IF NOT EXISTS opportunity_scores (
      id TEXT PRIMARY KEY,
      opportunity_id TEXT NOT NULL REFERENCES opportunities(id),
      criterion TEXT NOT NULL,
      raw_score REAL NOT NULL,
      normalized_score REAL NOT NULL,
      basis TEXT NOT NULL,
      rationale TEXT NOT NULL,
      scored_by TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS opportunity_score_audit (
      id TEXT PRIMARY KEY,
      opportunity_id TEXT NOT NULL REFERENCES opportunities(id),
      criterion TEXT NOT NULL,
      previous_score REAL,
      new_score REAL NOT NULL,
      rationale TEXT NOT NULL,
      scored_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS research_questions (
      id TEXT PRIMARY KEY,
      question TEXT NOT NULL,
      origin TEXT NOT NULL DEFAULT 'ai_analysis',
      related_journey_stage TEXT,
      related_theme_id TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      answer_summary TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contradictions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      evidence_a_id TEXT NOT NULL REFERENCES evidence_records(id),
      evidence_b_id TEXT NOT NULL REFERENCES evidence_records(id),
      theme_id TEXT REFERENCES themes(id),
      status TEXT NOT NULL DEFAULT 'open',
      resolution_notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS survey_datasets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      file_name TEXT NOT NULL,
      source_hash TEXT NOT NULL UNIQUE,
      imported_by TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      respondent_count INTEGER NOT NULL,
      question_schema TEXT NOT NULL,
      excluded_columns TEXT NOT NULL,
      warnings TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS survey_responses (
      id TEXT PRIMARY KEY,
      dataset_id TEXT NOT NULL REFERENCES survey_datasets(id),
      respondent_code TEXT NOT NULL,
      submitted_at TEXT,
      answers TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS survey_text_analyses (
      id TEXT PRIMARY KEY,
      dataset_id TEXT NOT NULL REFERENCES survey_datasets(id),
      respondent_code TEXT NOT NULL,
      question_id TEXT NOT NULL,
      text TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt_version TEXT NOT NULL,
      raw_output TEXT NOT NULL,
      parsed_output TEXT,
      validation_status TEXT NOT NULL,
      validation_errors TEXT,
      latency_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ai_syntheses (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt_version TEXT NOT NULL,
      input_hash TEXT NOT NULL,
      input_snapshot TEXT NOT NULL,
      raw_output TEXT NOT NULL,
      parsed_output TEXT,
      validation_status TEXT NOT NULL,
      validation_errors TEXT,
      latency_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS validation_reviews (
      id TEXT PRIMARY KEY,
      record_analysis_id TEXT NOT NULL,
      evidence_id TEXT NOT NULL,
      verdict TEXT NOT NULL,
      corrected_codes TEXT,
      correction_note TEXT,
      reviewer TEXT NOT NULL,
      ai_output_snapshot TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_survey_responses_dataset ON survey_responses(dataset_id);
    CREATE INDEX IF NOT EXISTS idx_validation_reviews_analysis ON validation_reviews(record_analysis_id);

    CREATE INDEX IF NOT EXISTS idx_evidence_content_hash ON evidence_records(content_hash);
    CREATE INDEX IF NOT EXISTS idx_evidence_platform ON evidence_records(platform);
    CREATE INDEX IF NOT EXISTS idx_evidence_journey_stage ON evidence_records(journey_stage);
    CREATE INDEX IF NOT EXISTS idx_record_analyses_evidence ON record_analyses(evidence_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_record_analysis ON reviews(record_analysis_id);
  `);

  // Migrate existing tables if columns are missing
  const alterStatements = [
    'ALTER TABLE evidence_records ADD COLUMN verification_status TEXT NOT NULL DEFAULT "unverified"',
    'ALTER TABLE evidence_records ADD COLUMN verified_at TEXT',
    'ALTER TABLE evidence_records ADD COLUMN verified_by TEXT',
    'ALTER TABLE evaluation_runs ADD COLUMN provider TEXT',
    'ALTER TABLE evaluation_runs ADD COLUMN model TEXT',
    'ALTER TABLE evaluation_runs ADD COLUMN model_version TEXT',
    'ALTER TABLE evaluation_runs ADD COLUMN is_simulated INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE evaluation_runs ADD COLUMN is_incomplete INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE evaluation_runs ADD COLUMN missing_details TEXT',
  ];

  for (const stmt of alterStatements) {
    try {
      await client.execute(stmt);
    } catch {
      // Column already exists or table not yet created
    }
  }
}
