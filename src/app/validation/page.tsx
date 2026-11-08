import { loadResearchState } from '@/services/research/triangulation-service';
import { selectValidationSample, summariseValidation, VALIDATION_SAMPLE_SIZE } from '@/lib/research/validation';
import { ValidationWorkbench, ValidationItem } from '@/components/research/ValidationWorkbench';
import { ValidationSheetImport } from '@/components/research/ValidationSheetImport';
import { Callout, PageHead, Stat } from '@/components/research/ui';
import { dataChangesAllowed } from '@/lib/research/access';
import { codeLabel } from '@/lib/research/codebook';
import { IconDownload } from '@/components/icons';

export const dynamic = 'force-dynamic';

export default async function ValidationPage() {
  const state = await loadResearchState();
  const valid = state.publicRecords.filter((r) => r.eligible && r.analysis?.status === 'valid');
  const sample = selectValidationSample(valid, VALIDATION_SAMPLE_SIZE);
  const reviews = state.validation.reviews;
  const aiCodes = new Map(sample.map((r) => [r.analysis!.id, r.analysis!.coded.codes.map((c) => c.code as string)]));
  const summary = summariseValidation(sample.map((r) => r.analysis!.id), reviews, aiCodes);

  const items: ValidationItem[] = sample.map((r) => {
    const latest = reviews.filter((v) => v.recordAnalysisId === r.analysis!.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return {
      recordAnalysisId: r.analysis!.id,
      evidenceId: r.id,
      platform: r.platform,
      sourceUrl: r.sourceUrl,
      originalText: r.originalText,
      model: r.analysis!.model,
      aiCodes: r.analysis!.coded.codes,
      aiTheme: r.analysis!.coded.themeName,
      aiFirstPerson: r.analysis!.coded.firstPerson,
      latestReview: latest
        ? { verdict: latest.verdict, reviewer: latest.reviewer, createdAt: latest.createdAt, note: latest.correctionNote, correctedCodes: latest.correctedCodes ? JSON.parse(latest.correctedCodes) : [] }
        : null,
    };
  });

  return (
    <div className="rx-page">
      <PageHead
        title="Insight validation"
        description={`A person checks the AI's coding of a fixed, reproducible sample of ${sample.length} genuine public records, stratified across platforms. Agreement is calculated only from saved human decisions. The AI output is never edited; corrections are stored beside it.`}
        actions={
          <>
            <a className="btn btn-secondary" href="/api/research/export?type=review-sheet" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <IconDownload size={15} /> Review sheet (CSV)
            </a>
            <a className="btn btn-secondary" href="/api/research/export?type=validation-json" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <IconDownload size={15} /> Saved reviews (JSON)
            </a>
          </>
        }
      />

      <div className="rx-stat-strip">
        <Stat label="Validation status" value={<span style={{ fontSize: 18 }}>{summary.status === 'pending' ? 'Pending' : summary.status === 'in_progress' ? 'In progress' : 'Complete'}</span>} note={summary.reviewers.length ? `Reviewer(s): ${summary.reviewers.join(', ')}` : 'No human review recorded yet'} />
        <Stat label="Reviewed" value={summary.reviewed} unit={`/ ${summary.sampleSize}`} />
        <Stat label="Accurate" value={summary.strictAgreementPct === null ? '—' : `${summary.strictAgreementPct}%`} note={`${summary.accurate} accurate`} />
        <Stat label="Accurate or partially" value={summary.lenientAgreementPct === null ? '—' : `${summary.lenientAgreementPct}%`} note={`${summary.partial} partial · ${summary.inaccurate} inaccurate`} />
      </div>

      {summary.status === 'pending' ? (
        <Callout tone="warn">
          Validation is pending: no person has reviewed the AI coding yet, so no agreement figure is reported. The earlier “17/20 agreement” came from a simulated rule engine on synthetic fixtures and is not shown as validation here.
        </Callout>
      ) : null}
      {sample.length === 0 ? <Callout tone="info">The sample appears once public records have valid AI analyses.</Callout> : null}

      {summary.codeErrors.length ? (
        <section className="rx-section">
          <header>
            <h2>Where reviewers corrected the AI</h2>
          </header>
          <div className="rx-table-wrap">
            <table className="rx-table">
              <thead>
                <tr>
                  <th>Theme</th>
                  <th className="rx-right">Missed by AI</th>
                  <th className="rx-right">Wrongly added by AI</th>
                </tr>
              </thead>
              <tbody>
                {summary.codeErrors.map((e) => (
                  <tr key={e.code}>
                    <td>{codeLabel(e.code)}</td>
                    <td className="rx-right rx-num">{e.missed}</td>
                    <td className="rx-right rx-num">{e.wronglyAdded}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="rx-section">
        <header>
          <h2>Review sample</h2>
          <p>
            {dataChangesAllowed()
              ? 'Read the original, compare the AI’s themes, and mark it accurate, partially accurate or inaccurate. For anything less than accurate, record the correct themes or what went wrong.'
              : 'Expand any record to compare the original text, the AI’s classification and the reviewer’s recorded verdict. The validation record is locked so it always reflects the completed review.'}
          </p>
        </header>
        <ValidationWorkbench items={items} editable={dataChangesAllowed()} />
      </section>

      {dataChangesAllowed() ? (
        <section className="rx-section">
          <header>
            <h2>Offline review in a spreadsheet</h2>
            <p>Download the review sheet, fill in the verdict, corrected_codes (semicolon-separated theme ids), correction_note and reviewer columns, then import it. Rows without a verdict are skipped.</p>
          </header>
          <ValidationSheetImport />
        </section>
      ) : null}
    </div>
  );
}
