import Link from 'next/link';
import { db, initializeDatabase } from '@/db';
import {
  evidenceRecords,
  recordAnalyses,
  analysisRuns,
  reviews,
  goldenLabels,
  themes,
  evidenceThemeLinks,
  evaluationRuns,
} from '@/db/schema';
import { desc } from 'drizzle-orm';
import { SeedButton } from '@/components/SeedButton';
import { EvidenceService } from '@/services/evidence';
import { OpportunityService } from '@/services/opportunity';
import { classifyEvidenceProvenance, deduplicateEligibleEvidence, isGenuineResearchEvidence, isSyntheticFixture } from '@/lib/evidenceEligibility';

export const dynamic = 'force-dynamic';

export default async function IntelligenceOverviewPage() {
  await initializeDatabase();

  const allRecords = await db.select().from(evidenceRecords).all();
  const eligibleRecords = deduplicateEligibleEvidence(allRecords);
  const eligibleRecordIds = new Set(eligibleRecords.map((r) => r.id));
  const fixtureCount = allRecords.filter(isSyntheticFixture).length;
  const genuineById = new Set(eligibleRecords.map((record) => record.id));
  const provBreakdown = await EvidenceService.getProvenanceBreakdown();
  const provenanceCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();
  for (const record of allRecords) {
    const category = classifyEvidenceProvenance(record);
    provenanceCounts.set(category, (provenanceCounts.get(category) ?? 0) + 1);
    sourceCounts.set(record.platform, (sourceCounts.get(record.platform) ?? 0) + 1);
  }

  const [storedAnalyses, storedReviews, storedGoldens, storedThemes, themeLinks, runs, evaluationHistory] = await Promise.all([
    db.select().from(recordAnalyses).all(),
    db.select().from(reviews).all(),
    db.select().from(goldenLabels).all(),
    db.select().from(themes).all(),
    db.select().from(evidenceThemeLinks).all(),
    db.select().from(analysisRuns).all(),
    db.select().from(evaluationRuns).all(),
  ]);
  const fakeRunIds = new Set(runs.filter((run) => run.provider === 'fake').map((run) => run.id));
  const fakeAnalysisIds = new Set(storedAnalyses.filter((analysis) => fakeRunIds.has(analysis.runId)).map((analysis) => analysis.id));
  const analyzedRecordIds = new Set(storedAnalyses.filter((analysis) => analysis.validationStatus === 'valid').map((analysis) => analysis.evidenceId));
  const genuineAnalyzedIds = new Set([...analyzedRecordIds].filter((id) => genuineById.has(id) && storedAnalyses.some((analysis) => analysis.evidenceId === id && analysis.validationStatus === 'valid' && !fakeRunIds.has(analysis.runId))));
  const allReviews = storedReviews;
  const goldens = storedGoldens;
  const allThemes = storedThemes;
  const allOpps = await OpportunityService.listOpportunities();
  const genuineThemeIds = new Set(themeLinks.filter((link) => eligibleRecordIds.has(link.evidenceId) && !(link.source === 'ai' && link.recordAnalysisId && fakeAnalysisIds.has(link.recordAnalysisId))).map((link) => link.themeId));
  const illustrativeThemeIds = new Set(themeLinks.filter((link) => allRecords.some((record) => record.id === link.evidenceId && isSyntheticFixture(record))).map((link) => link.themeId));
  const genuineBackedOpportunities = allOpps.filter((opp) => opp.hasEligibleEvidence).length;
  const reviewedIds = new Set(allReviews.map((review) => review.evidenceId));
  const genuineReviewedCount = [...reviewedIds].filter((id) => eligibleRecordIds.has(id)).length;
  const illustrativeReviewedCount = [...reviewedIds].filter((id) => allRecords.some((record) => record.id === id && isSyntheticFixture(record))).length;
  const unverifiedReviewedCount = Math.max(0, reviewedIds.size - genuineReviewedCount - illustrativeReviewedCount);
  const runProvider = new Map(runs.map((run) => [run.id, run.provider]));
  const genuineEvaluationCount = evaluationHistory.filter((evaluation) => !evaluation.isSimulated && evaluation.provider !== 'fake' && runProvider.get(evaluation.analysisRunId) !== 'fake').length;

  const confirmedCount = allReviews.filter((r) => r.decision === 'confirmed').length;
  const correctedCount = allReviews.filter((r) => r.decision === 'corrected').length;
  const rejectedCount = allReviews.filter((r) => r.decision === 'rejected').length;

  const recentRecords = allRecords
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Top Banner / Hero */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span className="badge badge-emerald">Discovery Engine Active</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Evidence-First Problem Space Formulation</span>
          </div>
          <h1>Intelligence Overview</h1>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '720px', marginTop: '6px', fontSize: '14px' }}>
            Exploring reported investor experiences that may relate to continued SIP use. Evidence summaries describe the available sample and do not establish root causes or cohort retention.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <SeedButton hasData={allRecords.length > 0} />
          <Link href="/evidence" className="btn btn-primary">
            + Ingest New Feedback
          </Link>
        </div>
      </div>

      {/* Business Objective & Metric Definition Card */}
      <div className="card" style={{ borderColor: 'var(--emerald-border)', background: 'linear-gradient(180deg, var(--emerald-glow) 0%, var(--bg-surface) 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span style={{ color: 'var(--emerald-400)', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            🎯 NextLeap Fellowship Business Target
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          <div>
            <h3 style={{ fontSize: '18px', color: 'var(--text-primary)' }}>12-Month Active SIP Retention</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
              Percentage of eligible first-time mutual fund investors who still have at least one active SIP 12 months after starting their first SIP.
            </p>
          </div>
          <div style={{ borderLeft: '1px solid var(--border-subtle)', paddingLeft: '16px' }}>
            <span style={{ fontSize: '11px', color: 'var(--emerald-400)', fontWeight: 600, textTransform: 'uppercase' }}>
              Canonical Active Definition
            </span>
            <p style={{ color: 'var(--text-primary)', fontSize: '13px', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
              &quot;At least one successful instalment in the last 30 days.&quot;
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '4px' }}>
              Calculation requires cohort and successful-instalment data that this research prototype does not contain. A failed instalment alone is not treated as churn.
            </p>
          </div>
        </div>
      </div>

      {/* Evidence Provenance & Audit Status Banner */}
      <div
        className="card"
        style={{
          background: 'var(--bg-canvas)',
          border: '1px solid var(--border-subtle)',
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="badge badge-amber" style={{ fontSize: '11px' }}>Provenance Audit</span>
          <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
            <strong>Evidence Status:</strong> {allRecords.length} total · {eligibleRecords.length} genuine eligible · {provBreakdown.contentVerified} content-verified public · {provBreakdown.linkChecked} link-checked · {provBreakdown.unverified + provBreakdown.userEntered} unverified/user-entered · {provBreakdown.syntheticFixture} illustrative
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', fontSize: '11px', flexWrap: 'wrap' }}>
          <span className="badge badge-emerald">Content verified: {provBreakdown.contentVerified}</span>
          <span className="badge badge-amber">Link checked only: {provBreakdown.linkChecked}</span>
          <span className="badge badge-neutral">Pending / user-entered: {provBreakdown.unverified + provBreakdown.userEntered}</span>
          <span className="badge badge-zinc">Illustrative: {provBreakdown.syntheticFixture}</span>
        </div>
      </div>

      <section className="card" aria-label="Evidence coverage by source and provenance">
        <h2 style={{ fontSize: 15 }}>Evidence coverage by source and provenance</h2>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Record counts, not unique investors. Illustrative and duplicate records remain visible and are excluded from genuine research support.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginTop: 12 }}>
          <div><strong style={{ fontSize: 12 }}>Provenance</strong>{[...provenanceCounts.entries()].map(([label, count]) => <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 6 }}><span>{label.replace(/_/g, ' ')}</span><strong>{count}</strong></div>)}</div>
          <div><strong style={{ fontSize: 12 }}>Source platform</strong>{[...sourceCounts.entries()].map(([label, count]) => <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 6 }}><span>{label.replace(/_/g, ' ')}</span><strong>{count}</strong></div>)}</div>
        </div>
      </section>

      {/* Pipeline Funnel Metrics */}
      <div>
        <h2 style={{ fontSize: '16px', marginBottom: '14px', color: 'var(--text-secondary)' }}>
          Discovery Pipeline Progress
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
          <div className="card">
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>1. Records Stored</span>
            <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
              {allRecords.length}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {allRecords.length - allRecords.filter((r) => r.duplicateOfId).length} available for analysis · {eligibleRecords.length} genuine eligible · {allRecords.filter((r) => r.duplicateOfId).length} duplicates
            </div>
          </div>

          <div className="card">
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>2. AI Analyzed</span>
            <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--blue-400)', marginTop: '4px' }}>
              {analyzedRecordIds.size}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {genuineAnalyzedIds.size} genuine analyzed · includes illustrative analyses
            </div>
          </div>

          <div className="card">
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>3. Human Reviewed</span>
            <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--purple-400)', marginTop: '4px' }}>
              {reviewedIds.size}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {genuineReviewedCount} genuine · {illustrativeReviewedCount} illustrative · {unverifiedReviewedCount} other/ineligible · {confirmedCount} confirmed · {correctedCount} corrected · {rejectedCount} rejected
            </div>
          </div>

          <div className="card">
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>4. Golden-Set Evaluations</span>
            <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--emerald-400)', marginTop: '4px' }}>
              {evaluationHistory.length}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {goldens.length} stored labels ({storedGoldens.filter((label) => eligibleRecordIds.has(label.evidenceId)).length} genuine) · {genuineEvaluationCount} genuine evaluations · {evaluationHistory.length - genuineEvaluationCount} simulated / legacy illustrative
            </div>
          </div>

          <div className="card">
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Discovered Themes</span>
            <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--amber-400)', marginTop: '4px' }}>
              {allThemes.length}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {genuineThemeIds.size} genuine-backed · {illustrativeThemeIds.size} illustrative themes · {allOpps.length} opportunities ({genuineBackedOpportunities} genuine-backed)
            </div>
          </div>
        </div>
      </div>

      {/* Honest Empty State Check */}
      {allRecords.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px 20px', borderStyle: 'dashed' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>📂</div>
          <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>No Evidence Records Yet</h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '520px', margin: '0 auto 24px', fontSize: '13px' }}>
            {fixtureCount > 0 ? `${fixtureCount} synthetic or curated benchmark records are available for exploration and excluded from genuine research support. ` : ''}Import public evidence or primary research through CSV or manual entry to expand discovery.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
            <SeedButton hasData={false} />
            <Link href="/evidence" className="btn btn-secondary">
              Upload CSV or Add Manually
            </Link>
          </div>
        </div>
      ) : (
        /* Discovery Highlights Grid */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '20px' }}>
          {/* Recent Verbatim Feed */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '15px' }}>Recent Evidence Feed</h3>
              <Link href="/evidence" style={{ fontSize: '12px', color: 'var(--emerald-400)' }}>
              View All ({allRecords.length}) →
              </Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {recentRecords.length === 0 ? <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>No evidence has been imported yet.</p> : recentRecords.map((rec) => (
                <div
                  key={rec.id}
                  style={{
                    padding: '12px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-canvas)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span className="badge badge-neutral" style={{ fontSize: '10px' }}>{rec.platform}</span>
                      <span className={`badge ${isSyntheticFixture(rec) ? 'badge-amber' : isGenuineResearchEvidence(rec) ? 'badge-emerald' : 'badge-neutral'}`} style={{ fontSize: 10 }}>{classifyEvidenceProvenance(rec).replace(/_/g, ' ')}</span>
                      <span className="badge badge-emerald" style={{ fontSize: '10px' }}>{rec.journeyStage.replace(/_/g, ' ')}</span>
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{rec.collectedAt}</span>
                  </div>
                  <p className="editorial-quote" style={{ fontSize: '13px', padding: '6px 10px', margin: '6px 0' }}>
                    &ldquo;{rec.originalText}&rdquo;
                  </p>
                  {rec.investorContext && (
                    <div style={{ fontSize: '11px', color: 'var(--emerald-400)', marginTop: '4px' }}>
                      Context: {rec.investorContext}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Discovered Themes & Candidate Opportunities */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ fontSize: '15px' }}>Discovered Friction Themes</h3>
                <Link href="/themes" style={{ fontSize: '12px', color: 'var(--emerald-400)' }}>
                  Theme Map →
                </Link>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {allThemes.slice(0, 4).map((theme) => (
                  <div
                    key={theme.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 12px',
                      background: 'var(--bg-canvas)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>{theme.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Stage: {theme.journeyStage.replace(/_/g, ' ')} · Origin: {theme.origin}
                      </div>
                    </div>
                    <span className="badge badge-emerald">{theme.status}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div>
                  <h3 style={{ fontSize: '15px' }}>Candidate Opportunities</h3>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>7-Criteria Transparent Prioritization</div>
                </div>
                <Link href="/opportunities" style={{ fontSize: '12px', color: 'var(--emerald-400)' }}>
                  Opportunity Explorer →
                </Link>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {allOpps.slice(0, 3).map((opp) => (
                  <div
                    key={opp.id}
                    style={{
                      padding: '12px',
                      background: 'var(--bg-canvas)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>{opp.title}</div>
                      <span className="badge badge-purple" style={{ fontSize: '12px', fontWeight: 700 }}>
                        {opp.compositeScore} / 100
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      {opp.problemStatement}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

