import { client } from './index';

export async function clearAllTables() {
  await client.execute('PRAGMA foreign_keys = OFF;');
  await client.executeMultiple(`
    DELETE FROM validation_reviews;
    DELETE FROM ai_syntheses;
    DELETE FROM survey_text_analyses;
    DELETE FROM survey_responses;
    DELETE FROM survey_datasets;
    DELETE FROM evaluation_items;
    DELETE FROM evaluation_runs;
    DELETE FROM golden_labels;
    DELETE FROM failure_cases;
    DELETE FROM reviews;
    DELETE FROM opportunity_scores;
    DELETE FROM opportunity_score_audit;
    DELETE FROM opportunity_themes;
    DELETE FROM opportunities;
    DELETE FROM evidence_theme_links;
    DELETE FROM record_analyses;
    DELETE FROM analysis_runs;
    DELETE FROM themes;
    DELETE FROM research_questions;
    DELETE FROM contradictions;
    DELETE FROM evidence_edits;
    DELETE FROM evidence_records;
    DELETE FROM import_batches;
  `);
  await client.execute('PRAGMA foreign_keys = ON;');
}
