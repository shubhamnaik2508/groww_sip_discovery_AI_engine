import Link from 'next/link';
import { desc } from 'drizzle-orm';
import { db, initializeDatabase } from '@/db';
import { analysisRuns, contradictions, evidenceRecords, recordAnalyses } from '@/db/schema';
import { summarizeIntelligence } from '@/services/intelligence';

export const dynamic = 'force-dynamic';

export default async function InvestorIntelligencePage() {
  await initializeDatabase();
  const [records, analyses, storedContradictions, runs] = await Promise.all([
    db.select().from(evidenceRecords).all(),
    db.select().from(recordAnalyses).orderBy(desc(recordAnalyses.createdAt)).all(),
    db.select().from(contradictions).all(),
    db.select().from(analysisRuns).all(),
  ]);
  const runProvider = new Map(runs.map((run) => [run.id, run.provider]));
  const latestByEvidence = new Map<string, { parsedOutput: unknown; analysisStatus: string; analysisProvider: string }>();
  for (const analysis of analyses) {
    if (!latestByEvidence.has(analysis.evidenceId)) {
      try { latestByEvidence.set(analysis.evidenceId, { parsedOutput: analysis.parsedOutput ? JSON.parse(analysis.parsedOutput) : null, analysisStatus: analysis.validationStatus, analysisProvider: runProvider.get(analysis.runId) ?? 'unknown' }); }
      catch { latestByEvidence.set(analysis.evidenceId, { parsedOutput: null, analysisStatus: 'invalid', analysisProvider: runProvider.get(analysis.runId) ?? 'unknown' }); }
    }
  }
  const summary = summarizeIntelligence(records.map((record) => ({
    id: record.id, platform: record.platform, sourceUrl: record.sourceUrl,
    originalText: record.originalText, journeyStage: record.journeyStage, duplicateOfId: record.duplicateOfId,
    isSynthetic: Boolean(record.isSynthetic), verificationStatus: record.verificationStatus,
    entryMethod: record.entryMethod, fieldProvenance: record.fieldProvenance,
    sourceMetadata: record.sourceMetadata,
    contentHash: record.contentHash,
    parsedOutput: latestByEvidence.get(record.id)?.parsedOutput ?? null,
    analysisStatus: latestByEvidence.get(record.id)?.analysisStatus ?? null,
    analysisProvider: latestByEvidence.get(record.id)?.analysisProvider ?? null,
  })), storedContradictions.map(({ title, description, evidenceAId, evidenceBId }) => ({ title, description, evidenceAId, evidenceBId })));

  return <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
    <header>
      <span className="badge badge-emerald">Evidence-linked analysis</span>
      <h1 style={{ marginTop: 8 }}>Investor Intelligence</h1>
      <p style={{ color: 'var(--text-secondary)', maxWidth: 780, marginTop: 6 }}>
        All records and analyses remain visible in this discovery view. Synthetic fixtures, benchmarks and simulated analyses can show illustrative patterns but never count as genuine evidence or genuine support.
      </p>
      <p style={{ color: 'var(--text-muted)', maxWidth: 780, fontSize: 12, marginTop: 6 }}>
        Target metric: eligible first-time mutual fund investors with at least one successful SIP instalment in the 30 days after the 12-month mark, divided by eligible first-time investors who started their first SIP. This prototype does not have cohort ledger data to calculate that rate.
      </p>
    </header>
    <div className="card" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13 }}>
      <span><strong>{records.length}</strong> total records</span>
      <span><strong>{summary.eligibleRecordCount}</strong> genuine eligible research records</span>
      <span><strong>{summary.syntheticExcluded}</strong> synthetic / benchmark illustrative records</span>
      <span><strong>{summary.allAnalyzedRecordCount}</strong> records with a valid analysis</span>
      <span><strong>{summary.illustrativeAnalyzedRecordCount}</strong> analyzed fixtures/benchmarks (illustrative)</span>
      <span><strong>{summary.duplicatesExcluded}</strong> duplicates excluded</span>
      <Link href="/evidence" style={{ color: 'var(--emerald-400)' }}>Open Evidence Explorer →</Link>
    </div>
    <section className="card" style={{ overflowX: 'auto' }}>
      <h2 style={{ fontSize: 18 }}>Nine-question coverage audit</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 5 }}>
        The nine rows mirror the product research questions. Record counts are unique evidence records, not extracted claims. Genuine counts require eligible provenance, a valid non-simulated analysis and an exact supporting quote. Illustrative records never change genuine support status.
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 14, minWidth: 860, fontSize: 12 }}>
        <thead><tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
          {['Question', 'Direct relevant records', 'Genuine eligible', 'Illustrative', 'Unverified', 'Sources', 'Confidence', 'Support status', 'Findings / traceable evidence'].map((heading) => <th key={heading} style={{ padding: '10px 8px', borderBottom: '1px solid var(--border-subtle)' }}>{heading}</th>)}
        </tr></thead>
        <tbody>{summary.questionCoverage.map((item) => <tr key={item.key}>
          <td style={{ padding: '10px 8px', maxWidth: 260 }}><strong>{item.key}</strong> {item.question}</td>
          <td style={{ padding: '10px 8px' }}>{item.totalRelevantCount}</td>
          <td style={{ padding: '10px 8px' }}>{item.count}</td>
          <td style={{ padding: '10px 8px' }}>{item.illustrativeCount} <span style={{ color: 'var(--text-muted)' }}>(never genuine support)</span></td>
          <td style={{ padding: '10px 8px' }}>{item.unverifiedCount}</td>
          <td style={{ padding: '10px 8px' }}>{item.sourceBreakdown.genuine.length ? item.sourceBreakdown.genuine.map((source) => `${source.platform} ${source.count}`).join(', ') : 'No genuine sources'}{item.sourceBreakdown.illustrative.length > 0 && <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>Illustrative: {item.sourceBreakdown.illustrative.map((source) => `${source.platform} ${source.count}`).join(', ')}</div>}{item.sourceBreakdown.unverified.length > 0 && <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>Unverified: {item.sourceBreakdown.unverified.map((source) => `${source.platform} ${source.count}`).join(', ')}</div>}</td>
          <td style={{ padding: '10px 8px' }}>{item.confidence}</td>
          <td style={{ padding: '10px 8px' }}><span className={`badge ${item.status === 'SUPPORTED' ? 'badge-emerald' : item.status === 'PARTIALLY SUPPORTED' ? 'badge-amber' : 'badge-neutral'}`}>{item.status}</span></td>
          <td style={{ padding: '10px 8px', maxWidth: 360 }}>
            {[...item.evidence.slice(0, 2).map((row) => ({ ...row, basis: 'GENUINE' })), ...item.illustrativeEvidence.slice(0, 2).map((row) => ({ ...row, basis: 'ILLUSTRATIVE' })), ...item.unverifiedEvidence.slice(0, 2).map((row) => ({ ...row, basis: 'UNVERIFIED PUBLIC' }))].map((evidence) => <div key={`${evidence.basis}-${evidence.id}-${'category' in evidence ? evidence.category : ''}`} style={{ marginBottom: 6 }}><span className={`badge ${evidence.basis === 'GENUINE' ? 'badge-emerald' : 'badge-amber'}`}>{evidence.basis}</span><div><strong>Source text:</strong> “{evidence.excerpt}”</div>{'category' in evidence && <div><strong>Classification:</strong> {evidence.category}</div>}{'interpretation' in evidence && <div><strong>Analysis ({evidence.analysisProvider}):</strong> {evidence.interpretation}</div>}<a href={evidence.url} target="_blank" rel="noreferrer" style={{ color: 'var(--emerald-400)', fontSize: 11 }}>{evidence.id.slice(0, 8)} · {evidence.platform} ↗</a></div>)}
            {item.illustrativeContextCount > 0 && <details style={{ marginTop: 6 }}><summary style={{ cursor: 'pointer', color: 'var(--text-muted)' }}>{item.illustrativeContextCount} illustrative record(s) at related journey stages — context only, not question-specific evidence</summary>{item.illustrativeContext.slice(0, 3).map((context) => <div key={context.id} style={{ marginTop: 6, fontSize: 11 }}><span className="badge badge-amber">STAGE CONTEXT</span> {context.journeyStage.replace(/_/g, ' ')}{context.theme ? ` · ${context.theme}` : ''}<p>“{context.excerpt.slice(0, 180)}{context.excerpt.length > 180 ? '…' : ''}”</p><a href={context.url} target="_blank" rel="noreferrer">{context.id.slice(0, 8)} · {context.platform} ↗</a></div>)}</details>}
            {item.key === 'Q7' && (item.groupCounts.genuine.length > 0 || item.groupCounts.illustrative.length > 0) && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>Explicit status groups — genuine: {item.groupCounts.genuine.map((group) => `${group.category} ${group.count}`).join(', ') || 'none'}; illustrative: {item.groupCounts.illustrative.map((group) => `${group.category} ${group.count}`).join(', ') || 'none'}. These groups are descriptive and do not establish why investors continue or discontinue.</div>}
            {item.totalRelevantCount === 0 && <span style={{ color: 'var(--text-muted)' }}>No question-specific finding is available yet.</span>}
            {item.contradictionCount > 0 && <span className="badge badge-amber">{item.contradictionCount} recorded contradiction(s)</span>}
          </td>
        </tr>)}</tbody>
      </table>
    </section>
    <section className="card">
      <h2 style={{ fontSize: 18 }}>Nine-question evidence coverage</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 5 }}>Record counts by evidence basis. The bars show available records, not investor prevalence or retention impact. Related-stage context is excluded from the direct finding counts.</p>
      <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
        {summary.questionCoverage.map((item) => {
          const total = Math.max(1, item.count + item.illustrativeCount + item.unverifiedCount);
          return <div key={item.key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, marginBottom: 5 }}><strong>{item.key} · {item.question}</strong><span>{item.count + item.illustrativeCount + item.unverifiedCount} direct record(s)</span></div>
            <div aria-label={`${item.key} evidence basis`} style={{ height: 12, display: 'flex', overflow: 'hidden', borderRadius: 8, background: 'var(--surface-secondary)' }}>
              <span title={`Genuine eligible: ${item.count}`} style={{ width: `${item.count / total * 100}%`, background: 'var(--emerald-400)' }} />
              <span title={`Illustrative: ${item.illustrativeCount}`} style={{ width: `${item.illustrativeCount / total * 100}%`, background: '#f59e0b' }} />
              <span title={`Unverified: ${item.unverifiedCount}`} style={{ width: `${item.unverifiedCount / total * 100}%`, background: '#94a3b8' }} />
            </div>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>Genuine {item.count} · Illustrative {item.illustrativeCount} · Unverified {item.unverifiedCount}{item.illustrativeContextCount ? ` · Related journey-stage context ${item.illustrativeContextCount} (not direct evidence)` : ''}</p>
          </div>;
        })}
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>Legend: <span style={{ color: 'var(--emerald-400)' }}>■ Genuine eligible</span> · <span style={{ color: '#f59e0b' }}>■ Illustrative</span> · <span style={{ color: '#94a3b8' }}>■ Unverified</span></p>
    </section>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
      {summary.dimensions.map((dimension) => <section className="card" key={dimension.key}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}>
          <h2 style={{ fontSize: 16 }}>{dimension.label}</h2>
          <span className="badge badge-neutral">{dimension.count} records</span>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>
          {dimension.confidence} · {dimension.verifiedCount} verified/link-checked · {dimension.sourceCount} source types
        </p>
        {dimension.evidence.length === 0 ? <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 14 }}>
          No current-schema analyses are classified here. Run or rerun analysis to populate coverage; earlier analyses are not retroactively classified.
        </p> : <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
          {dimension.evidence.slice(0, 3).map((item) => <article key={item.id} style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
            <p style={{ fontSize: 12, color: 'var(--text-primary)' }}>“{item.excerpt.slice(0, 220)}{item.excerpt.length > 220 ? '…' : ''}”</p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>{item.platform} · {item.verificationStatus}{item.theme ? ` · ${item.theme}` : ''}</p>
            <a href={item.sourceUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--emerald-400)' }}>Open source · {item.id.slice(0, 8)} ↗</a>
          </article>)}
          {dimension.count > 3 && <p style={{ color: 'var(--text-muted)', fontSize: 11 }}>Showing 3 of {dimension.count} linked records.</p>}
        </div>}
      </section>)}
    </div>
    <section className="card">
      <h2 style={{ fontSize: 18 }}>Recurring patterns and unmet needs</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 5 }}>Grouped by the theme or need recorded in each eligible AI analysis. Repeated entries are descriptive counts, not prevalence estimates.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 18, marginTop: 16 }}>
        <div><h3 style={{ fontSize: 14 }}>Repeated themes</h3>{summary.recurringPatterns.length ? summary.recurringPatterns.slice(0, 8).map((item) => <div key={item.label} style={{ fontSize: 13, marginTop: 8 }}><p><strong>{item.label}</strong> · {item.count} record(s) · {item.confidence}</p><p style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 3 }}>{item.evidence.slice(0, 3).map((evidence) => <a key={evidence.id} href={evidence.url} target="_blank" rel="noreferrer" style={{ color: 'var(--emerald-400)', fontSize: 11 }}>Source {evidence.id.slice(0, 8)} ↗</a>)}</p></div>) : <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>No eligible analyzed theme data yet.</p>}</div>
        <div><h3 style={{ fontSize: 14 }}>Candidate unmet needs</h3>{summary.unmetNeeds.length ? summary.unmetNeeds.slice(0, 8).map((item) => <div key={item.label} style={{ fontSize: 13, marginTop: 8 }}><p><strong>{item.label}</strong> · {item.count} record(s)</p><p style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 3 }}>{item.evidence.slice(0, 3).map((evidence) => <a key={evidence.id} href={evidence.url} target="_blank" rel="noreferrer" style={{ color: 'var(--emerald-400)', fontSize: 11 }}>Source {evidence.id.slice(0, 8)} ↗</a>)}</p></div>) : <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>No unmet needs recorded in eligible analyses.</p>}</div>
      </div>
    </section>
    <section className="card">
      <h2 style={{ fontSize: 18 }}>Monitoring frequency</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 5 }}>Only explicit frequency statements are classified; missing or unstated frequency remains not specified.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginTop: 12 }}>{summary.checkingFrequencies.map((item) => <div key={item.frequency} style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 10 }}><p style={{ fontSize: 11 }}>{item.frequency.replace(/_/g, ' ')}</p><strong>{item.count}</strong>{item.evidence.slice(0, 2).map((evidence) => <div key={evidence.id}><p style={{ fontSize: 10, marginTop: 4 }}>“{evidence.quote}”</p><a href={evidence.url} target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: 10, color: 'var(--emerald-400)' }}>Source {evidence.id.slice(0, 6)} ↗</a></div>)}</div>)}</div>
    </section>
    <section className="card">
      <h2 style={{ fontSize: 18 }}>First-year journey coverage</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 5 }}>Journey stages come from individual source analyses; the timeline does not imply a common progression. {summary.journeyPeriodUnspecifiedCount} analyzed record(s) have no source-grounded month window.</p>
      {summary.journeyStages.length ? <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>{summary.journeyStages.map((stage) => <div key={stage.stage} className="badge badge-neutral">{stage.stage.replace(/_/g, ' ')} · {stage.count}</div>)}</div> : <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 10 }}>No eligible journey-stage analyses are available.</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginTop: 14 }}>{summary.journeyPeriods.map((period) => <div key={period.period} style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 10 }}><p style={{ fontSize: 11, textTransform: 'capitalize' }}>{period.period.replace(/_/g, ' ')}</p><strong style={{ fontSize: 16 }}>{period.count}</strong><p style={{ fontSize: 10, color: 'var(--text-muted)' }}>explicit timing evidence</p>{period.evidence.slice(0, 2).map((evidence) => <div key={evidence.id}><p style={{ fontSize: 10, marginTop: 4 }}>“{evidence.quote}”</p><a href={evidence.url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', fontSize: 10, color: 'var(--emerald-400)', marginRight: 5 }}>source {evidence.id.slice(0, 5)} ↗</a></div>)}</div>)}</div>
      {summary.behaviouralChains.length > 0 && <div style={{ display: 'grid', gap: 12, marginTop: 18 }}>{summary.behaviouralChains.slice(0, 5).map((chain) => <article key={chain.id} style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}><p style={{ fontSize: 12 }}><strong>Trigger</strong> {chain.trigger} → <strong>Interpretation</strong> {chain.interpretation} → <strong>Behaviour</strong> {chain.behaviour} → <strong>Workaround</strong> {chain.workaround} → <strong>Potential need / hypothesis</strong> {chain.consequence}</p><a href={chain.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--emerald-400)' }}>Source · {chain.id.slice(0, 8)} ↗</a></article>)}</div>}
    </section>
    <section className="card">
      <h2 style={{ fontSize: 18 }}>Explicit segment coverage</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 5 }}>Demographics and financial circumstances are counted only when explicitly recorded by analysis. Unknown remains visible.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginTop: 14 }}>{summary.segments.map((segment) => <div key={segment.key} style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, padding: 12 }}><h3 style={{ fontSize: 13 }}>{segment.label}</h3><p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>Known: {segment.knownCount} · Unknown: {segment.unknownCount}</p>{segment.groups.slice(0, 5).map((group) => <div key={group.value} style={{ fontSize: 12, marginTop: 8 }}><strong>{group.value}: {group.count}</strong>{group.themes.slice(0, 2).map((theme) => <p key={theme.name} style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{theme.name} · {theme.count} · {theme.evidence.slice(0, 2).map((evidence) => <a key={evidence.id} href={evidence.url} target="_blank" rel="noreferrer" style={{ color: 'var(--emerald-400)', marginLeft: 5 }}>source {evidence.id.slice(0, 6)} ↗</a>)}</p>)}</div>)}</div>)}</div>
    </section>
    {summary.contradictions.length > 0 && <section className="card"><h2 style={{ fontSize: 18 }}>Recorded contradictions</h2><p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 5 }}>Only saved contradictions with both evidence endpoints eligible are shown.</p><div style={{ display: 'grid', gap: 12, marginTop: 12 }}>{summary.contradictions.map((item) => <article key={`${item.evidenceAId}:${item.evidenceBId}`}><strong style={{ fontSize: 13 }}>{item.title}</strong><p style={{ fontSize: 12, marginTop: 4 }}>{item.description}</p><p style={{ display: 'flex', gap: 12, fontSize: 11, marginTop: 5 }}><a href={item.evidenceAUrl} target="_blank" rel="noreferrer">Evidence A ↗</a><a href={item.evidenceBUrl} target="_blank" rel="noreferrer">Evidence B ↗</a></p></article>)}</div></section>}
    <section className="card">
      <h2 style={{ fontSize: 18 }}>Evidence gaps and extraction diagnostics</h2>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 5 }}>Grounding checks count only observation claims with quoted spans that match original text; a grounded quote alone does not prove the interpretation is correct.</p>
      <p style={{ fontSize: 12, marginTop: 10 }}>Grounded observation claims: {summary.evidenceQuality.observationClaimsGrounded} · Ungrounded or unquoted: {summary.evidenceQuality.observationClaimsUngrounded} · Explicit abstentions: {summary.evidenceQuality.abstentions}{summary.evidenceQuality.abstentionRate === null ? '' : ` (${(summary.evidenceQuality.abstentionRate * 100).toFixed(1)}% of analyzed records)`}</p>
      {summary.evidenceGaps.length ? <ul style={{ marginTop: 10, paddingLeft: 20, color: 'var(--text-secondary)', fontSize: 12 }}>{summary.evidenceGaps.map((gap) => <li key={gap} style={{ marginTop: 5 }}>{gap}</li>)}</ul> : <p style={{ fontSize: 12, marginTop: 8 }}>No missing-information flags were returned; this does not establish complete research coverage.</p>}
    </section>
    <section className="card">
      <h2 style={{ fontSize: 16 }}>Interpretation limits</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 8 }}>
        Segment fields and SIP continuation status remain unknown unless explicitly supported by source text. Public feedback and manually supplied records do not establish investor-level retention or causal effects. Confidence labels summarize evidence volume, source diversity, and verification status only.
      </p>
    </section>
  </div>;
}
