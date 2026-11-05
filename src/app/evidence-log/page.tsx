import Link from 'next/link';
import { db, initializeDatabase } from '@/db';
import { analysisRuns, evidenceRecords, evaluationRuns } from '@/db/schema';
import { EvaluationService } from '@/services/evaluation';
import { ReviewService } from '@/services/review';
import { ExportService } from '@/services/export';
import { isSyntheticFixture } from '@/lib/evidenceEligibility';
import { EvidenceLogPrintButton } from '@/components/EvidenceLogPrintButton';

export const dynamic = 'force-dynamic';

const formatDate = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString() : 'Not recorded';
const hasQuoteConsent = (value: string | null | undefined) => {
  try {
    const metadata = value ? JSON.parse(value) as Record<string, unknown> : {};
    return metadata.quoteConsent === true || (typeof metadata.quoteConsent === 'string' && ['yes', 'true', 'consented'].includes(metadata.quoteConsent.toLowerCase()));
  } catch { return false; }
};

export default async function EvidenceLogDocumentPage() {
  await initializeDatabase();
  const [data, records, labels, corrections, runs, analysisRunsList] = await Promise.all([
    ExportService.compileExportData(),
    db.select().from(evidenceRecords).all(),
    EvaluationService.listGoldenLabels(),
    ReviewService.listFailureCases(),
    db.select().from(evaluationRuns).all(),
    db.select().from(analysisRuns).all(),
  ]);
  const verifiedLabels = labels.filter((label) => !isSyntheticFixture(label));
  const shareablePublicLabels = verifiedLabels.filter((label) => !['user_interview', 'google_forms'].includes(label.platform));
  const shareableConsentedPrimaryLabels = verifiedLabels.filter((label) => ['user_interview', 'google_forms'].includes(label.platform) && hasQuoteConsent(label.sourceMetadata));
  const shareablePublicCorrections = corrections.filter((item) => !['user_interview', 'google_forms'].includes(item.platform));
  const shareableConsentedPrimaryCorrections = corrections.filter((item) => ['user_interview', 'google_forms'].includes(item.platform) && hasQuoteConsent(item.sourceMetadata));
  const shareableLabels = [...shareablePublicLabels, ...shareableConsentedPrimaryLabels];
  const shareableCorrections = [...shareablePublicCorrections, ...shareableConsentedPrimaryCorrections];
  const runById = new Map(analysisRunsList.map((run) => [run.id, run]));
  const genuineEvaluations = runs.filter((run) => {
    const provider = run.provider || runById.get(run.analysisRunId)?.provider;
    return !run.isSimulated && Boolean(provider) && provider !== 'fake';
  });
  const latestGenuineEvaluation = genuineEvaluations.sort((a, b) => b.evaluatedAt.localeCompare(a.evaluatedAt))[0] ?? null;
  const matched = latestGenuineEvaluation?.exactMatches ?? 0;
  const evaluated = latestGenuineEvaluation?.totalGoldenRecords ?? 0;
  const genuineRun = latestGenuineEvaluation ? runById.get(latestGenuineEvaluation.analysisRunId) : null;
  const inventory = data.summary.sourceBreakdown;
  const fixtures = records.filter(isSyntheticFixture).length;
  const eligible = data.summary.eligibleNonFixtureRecordsCount;

  return <main className="evidence-log-document">
    <div className="no-print document-actions">
      <EvidenceLogPrintButton />
      <Link href="/export" className="btn btn-secondary">Back to Exports</Link>
      <p>In the print dialog, choose “Save as PDF.” This creates a local PDF; it does not publish or share a link.</p>
    </div>
    <header className="document-cover">
      <p className="document-kicker">NEXTLEAP PRODUCT MANAGEMENT FELLOWSHIP · RESEARCH ARTIFACT</p>
      <h1>AI Evidence Log</h1>
      <p>Groww SIP Intelligence Lab · Independent academic product research prototype</p>
      <p>Generated {formatDate(data.metadata.exportDate)} · Evidence inventory as of this export</p>
      <p className="document-disclaimer">Not affiliated with Groww. This document reports evidence provenance and evaluation records; it is not investment advice and makes no claim that the product improves SIP retention.</p>
    </header>

    <section>
      <h2>1. Sources and volume analysed</h2>
      <p><strong>{records.length}</strong> stored records · <strong>{eligible}</strong> eligible genuine research records · <strong>{fixtures}</strong> illustrative/benchmark fixtures excluded · <strong>{data.summary.duplicateCount}</strong> linked duplicates.</p>
      <table><thead><tr><th>Source</th><th>Stored</th><th>Genuine eligible</th><th>Content verified</th><th>Link checked</th><th>Unverified/user-entered</th><th>Fixtures</th></tr></thead>
        <tbody>{inventory.length ? inventory.map((source) => <tr key={source.platform}><td>{source.platform}</td><td>{source.totalRecords}</td><td>{source.eligibleNonFixtureRecords}</td><td>{records.filter((r) => r.platform === source.platform && r.verificationStatus === 'content_verified' && !isSyntheticFixture(r)).length}</td><td>{records.filter((r) => r.platform === source.platform && r.verificationStatus === 'link_checked' && !isSyntheticFixture(r)).length}</td><td>{source.unverifiedRecords}</td><td>{source.fixturesExcluded}</td></tr>) : <tr><td colSpan={7}>No source records are stored.</td></tr>}</tbody>
      </table>
      <p>Date range among eligible evidence: {data.summary.dateRange}. Collection/import date does not establish publication date. Automated platform collection is not configured; data is entered through manual/CSV workflows. URL presence alone does not mean a source was verified.</p>
    </section>

    <section>
      <h2>2. Human-labelled examples</h2>
      <p>{verifiedLabels.length} genuine eligible human-labelled examples are currently available; the target is approximately 20. Synthetic/benchmark labels are excluded.</p>
      {shareableLabels.length ? <table><thead><tr><th>Record</th><th>Source</th><th>Evidence excerpt</th><th>Human label</th><th>Human rationale</th><th>Labelled</th></tr></thead><tbody>{shareableLabels.map((label) => <tr key={label.id}><td>{label.evidenceId.slice(0, 8)}</td><td><a href={label.sourceUrl}>{label.platform}</a></td><td>{label.evidenceText}</td><td>{label.themeName || label.specialLabel}</td><td>{label.rationale}</td><td>{formatDate(label.labelledAt)}</td></tr>)}</tbody></table> : <p className="empty-note">No shareable genuine human-labelled examples are available. Synthetic fixture labels are excluded. Primary-research excerpts are included only when the researcher recorded participant quote consent.</p>}
    </section>

    <section>
      <h2>3. AI evaluation</h2>
      {latestGenuineEvaluation ? <>
        <p>Provider: {genuineRun?.provider || latestGenuineEvaluation.provider || 'Not recorded'} · Model: {genuineRun?.model || latestGenuineEvaluation.model || 'Not recorded'} · Evaluation date: {formatDate(latestGenuineEvaluation.evaluatedAt)}.</p>
        <p>{matched} agreed labels / {evaluated} evaluated examples = {evaluated ? `${((matched / evaluated) * 100).toFixed(1)}%` : 'not calculable'} agreement. This limited agreement measure is not comprehensive model accuracy.</p>
      </> : <p className="empty-note">No genuine model evaluation is recorded. Simulated FakeAIProvider results are excluded from empirical evaluation. Genuine evaluation remains pending until verified evidence, human labels and a non-simulated model run are available.</p>}
      {data.latestEvaluation?.isSimulated && <p>Most recent evaluation in the application used the simulated provider ({data.latestEvaluation.provider}); it is not presented here as genuine model performance.</p>}
    </section>

    <section>
      <h2>4. Failure analysis and human corrections</h2>
      <p>{shareableCorrections.length} genuine corrected/rejected model outputs are available and cleared for this shareable document. Requirement: document 2–3 genuine corrections when available.</p>
      {shareableCorrections.length ? shareableCorrections.slice(0, 3).map((item) => <article className="correction" key={item.id}>
        <h3>{item.failureType} · {item.evidenceId.slice(0, 8)}</h3>
        <p><strong>Evidence:</strong> {item.evidenceText}</p>
        <p><strong>Original AI output:</strong> {JSON.stringify(item.originalPrediction)}</p>
        <p><strong>Human correction:</strong> {JSON.stringify(item.correctedOutput)}</p>
        <p><strong>Reason:</strong> {item.reviewerRationale}</p>
        <p><strong>Lesson:</strong> {item.lessonLearned}</p>
        <p><a href={item.sourceUrl}>{item.platform} source ↗</a></p>
      </article>) : <p className="empty-note">Pending: no genuine human correction history is currently available. Fixture-linked corrections are excluded and are not represented as real research.</p>}
    </section>

    <section>
      <h2>5. Limitations and next steps</h2>
      <ul>{[
        'The local evidence inventory currently contains illustrative fixtures only; verified public and primary research coverage must be collected before making investor findings.',
        'This application supports manual and CSV evidence entry. It does not currently run platform collectors for Play Store, App Store, Reddit, TradingQ&A, YouTube or public social media.',
        'Synthetic fixtures and simulated AI outputs demonstrate software workflows only and do not establish investor behaviour or model quality.',
        'Public feedback is cross-sectional and self-selected; it cannot establish the 12-month active SIP retention rate or causation.',
        'First-Paycheck segment coverage requires explicit participant qualification and primary research; age, salary source and employment stage are never inferred.',
        'Before sharing, review the exported document for consent, anonymisation and disclosure. The application does not publish it to Google Drive.',
        ...data.knownLimitations,
      ].map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
      <p>Business target definition: eligible first-time mutual fund investors who still have at least one active SIP 12 months after starting their first SIP, where active means at least one successful instalment in the prior 30 days. No cohort ledger data is available to calculate the rate.</p>
    </section>
    <footer>Generated from application records · Evidence counts follow provenance eligibility rules · {data.metadata.disclaimer}</footer>
  </main>;
}
