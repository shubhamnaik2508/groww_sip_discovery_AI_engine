import Papa from 'papaparse';
import { loadResearchState } from '@/services/research/triangulation-service';
import { buildAnalysisSnapshot } from '@/services/research/datasets';
import { buildEvidenceLog, evidenceLogToMarkdown } from '@/services/research/evidence-log';
import { selectValidationSample, VALIDATION_SAMPLE_SIZE } from '@/lib/research/validation';
import { toAnonymisedCsv } from '@/lib/research/survey';
import { sanitizeForCsvExport } from '@/lib/csv';

export const dynamic = 'force-dynamic';

function file(body: string, name: string, type: string) {
  return new Response(body, {
    headers: {
      'Content-Type': `${type}; charset=utf-8`,
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  });
}

const csv = (rows: Array<Record<string, unknown>>) =>
  Papa.unparse(rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, sanitizeForCsvExport(v)]))));

export async function GET(request: Request) {
  const type = new URL(request.url).searchParams.get('type');
  const state = await loadResearchState();
  const stamp = new Date().toISOString().slice(0, 10);

  switch (type) {
    case 'survey-csv':
      if (!state.survey) return new Response('No survey dataset loaded.', { status: 404 });
      return file(toAnonymisedCsv(state.survey.survey), 'google-forms-sip-survey.anonymized.csv', 'text/csv');
    case 'snapshot':
      return file(JSON.stringify(await buildAnalysisSnapshot(), null, 1), `analysis-snapshot-${stamp}.json`, 'application/json');
    case 'validation-json':
      return file(JSON.stringify({ exportedAt: new Date().toISOString(), note: 'Human validation decisions. Commit as data/validation/validation-reviews.json to persist across deployments.', reviews: state.validation.reviews }, null, 1), 'validation-reviews.json', 'application/json');
    case 'review-sheet': {
      const valid = state.publicRecords.filter((r) => r.eligible && r.analysis?.status === 'valid');
      const sample = selectValidationSample(valid, VALIDATION_SAMPLE_SIZE);
      return file(
        csv(
          sample.map((r, i) => ({
            item: i + 1,
            record_analysis_id: r.analysis!.id,
            platform: r.platform,
            source_url: r.sourceUrl,
            original_text: r.originalText,
            ai_model: r.analysis!.model,
            ai_theme: r.analysis!.coded.themeName ?? '',
            ai_codes: r.analysis!.coded.codes.map((c) => c.code).join('; '),
            ai_quotes: r.analysis!.coded.codes.map((c) => `${c.code}: ${c.quote}`).join(' | '),
            verdict: '',
            corrected_codes: '',
            correction_note: '',
            reviewer: '',
          })),
        ),
        `validation-review-sheet-${stamp}.csv`,
        'text/csv',
      );
    }
    case 'evidence-log-md':
      return file(evidenceLogToMarkdown(buildEvidenceLog(state)), `ai-evidence-log-${stamp}.md`, 'text/markdown');
    case 'evidence-log-json':
      return file(JSON.stringify(buildEvidenceLog(state), null, 1), `ai-evidence-log-${stamp}.json`, 'application/json');
    default:
      return new Response('Unknown export type.', { status: 400 });
  }
}
