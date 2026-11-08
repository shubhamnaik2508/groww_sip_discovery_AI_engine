/**
 * Runs the real AI research pipeline locally and exports the outputs so every
 * deployment shows the same, reproducible evidence.
 *
 *   1. Loads the bundled datasets (anonymised survey + public feedback) into the DB.
 *   2. Pipeline B: codes every eligible public record not yet validly analysed (Groq).
 *   3. Pipeline A: codes the open-ended survey answers (Groq).
 *   4. Computes the deterministic triangulation matrix and asks the model for a
 *      guarded synthesis (AI inference, stored with its exact input).
 *   5. Writes data/analysis/analysis-snapshot.json (raw model outputs unmodified).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/run-research-analysis.ts [--provider gemini|groq] [--skip-records] [--skip-synthesis] [--max N]
 * Uses DATABASE_URL (default here: file:research.db, gitignored).
 */
process.env.DATABASE_URL ||= 'file:research.db';

import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const args = process.argv.slice(2);
  const max = args.includes('--max') ? Number(args[args.indexOf('--max') + 1]) : undefined;
  const { resolveProvider, llmLabel } = await import('../src/services/ai/llm');
  // --provider gemini|groq (default: Gemini when its key exists, else Groq)
  const requested = args.includes('--provider') ? args[args.indexOf('--provider') + 1] : null;
  const provider = resolveProvider(requested);
  console.log(`AI provider: ${llmLabel(provider)}`);

  const { ensureResearchData, buildAnalysisSnapshot, loadActiveSurvey } = await import('../src/services/research/datasets');
  const { loadResearchState } = await import('../src/services/research/triangulation-service');
  const { AnalysisOrchestrator } = await import('../src/services/ai');
  const { analyseSurveyOpenText, runTriangulationSynthesis } = await import('../src/services/research/ai-research');

  await ensureResearchData();
  let state = await loadResearchState();
  console.log(`survey respondents=${state.survey?.survey.responses.length} public eligible=${state.triangulation.publicSummary.eligibleRecords} valid=${state.triangulation.publicSummary.analysedValid}`);

  if (!args.includes('--skip-records')) {
    const todo = state.publicRecords.filter((r) => r.eligible && r.analysis?.status !== 'valid').map((r) => r.id);
    console.log(`Pipeline B: analysing ${max ? Math.min(max, todo.length) : todo.length} public records with ${llmLabel(provider)}…`);
    const summary = await AnalysisOrchestrator.executeRun({ providerName: provider, recordIds: todo, maxRecords: max });
    console.log(`  run ${summary.runId}: ${summary.successfulRecords} valid, ${summary.failedRecords} failed (model ${summary.model})`);
  }

  const survey = await loadActiveSurvey();
  if (survey && !state.surveyOpenText.length) {
    console.log('Pipeline A: coding open-ended survey answers…');
    console.log('  ', await analyseSurveyOpenText(survey, provider));
  }

  state = await loadResearchState();
  if (!args.includes('--skip-synthesis')) {
    console.log('Triangulation synthesis…');
    const s = await runTriangulationSynthesis(state.triangulation, provider);
    console.log(`  synthesis ${s.id}: ${s.validationStatus}${s.validationErrors ? ' ' + s.validationErrors : ''}`);
  }

  const snapshot = await buildAnalysisSnapshot();
  const out = path.resolve('data/analysis/analysis-snapshot.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(snapshot, null, 1));
  console.log(`Snapshot: ${snapshot.runs.length} runs, ${snapshot.recordAnalyses.length} record analyses, ${snapshot.surveyTextAnalyses.length} survey codings, ${snapshot.syntheses.length} syntheses → ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
