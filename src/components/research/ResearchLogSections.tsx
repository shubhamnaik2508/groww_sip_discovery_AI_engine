import React from 'react';
import type { EvidenceLog } from '@/services/research/evidence-log';

/** Print-ready rendering of the AI Evidence Log (styles from .evidence-log-document). */
export function ResearchLogSections({ log }: { log: EvidenceLog }) {
  const v = log.validation.summary;
  return (
    <>
      <section>
        <h2>1. Research objectives</h2>
        <ul>{log.objectives.map((o) => <li key={o}>{o}</li>)}</ul>
      </section>

      <section>
        <h2>2. Primary research: Google Forms survey</h2>
        {log.primary ? (
          <>
            <p>
              <strong>{log.primary.respondents}</strong> respondents · {log.primary.questions} questions retained · identifying columns removed: {log.primary.excludedColumns.join(', ') || 'none'} · collected {log.primary.collectedFrom} to {log.primary.collectedTo}.
            </p>
            <p>{log.primary.method}</p>
            <table>
              <thead><tr><th>Finding</th><th>Recalculated</th><th>Previously reported</th><th>Status</th><th>Within disrupted subgroup</th></tr></thead>
              <tbody>{log.primary.metrics.map((m) => <tr key={m.label}><td>{m.label}</td><td>{m.value}</td><td>{m.previous ?? 'n/a'}</td><td>{m.status.replace(/_/g, ' ')}</td><td>{m.subgroup ?? 'n/a'}</td></tr>)}</tbody>
            </table>
          </>
        ) : <p className="empty-note">No survey dataset loaded.</p>}
      </section>

      <section>
        <h2>3. Secondary research: public feedback</h2>
        <p>
          {log.secondary.totalRecords} records stored · {log.secondary.eligibleRecords} eligible · <strong>{log.secondary.analysedValid}</strong> validly AI-analysed · {log.secondary.analysedFailed} failed checks · {log.secondary.notAnalysed} not analysed · {log.secondary.firstPerson} first-person accounts.
        </p>
        <table><thead><tr><th>Source</th><th>Records</th></tr></thead><tbody>{log.secondary.platforms.map((x) => <tr key={x.platform}><td>{x.platform}</td><td>{x.records}</td></tr>)}</tbody></table>
        <ul>{log.secondary.methods.map((m) => <li key={m}>{m}</li>)}</ul>
      </section>

      <section>
        <h2>4. AI model and processing</h2>
        <p>Models: {log.ai.models.join(', ') || 'no model run stored yet'} · record prompt {log.ai.promptVersion}</p>
        <ul>{log.ai.method.map((m) => <li key={m}>{m}</li>)}</ul>
        {log.ai.runs.length ? (
          <table><thead><tr><th>Run</th><th>Provider / model</th><th>Prompt</th><th>Started</th><th>Valid</th><th>Failed</th><th>Total</th></tr></thead>
            <tbody>{log.ai.runs.map((r) => <tr key={r.id}><td>{r.id.slice(0, 8)}</td><td>{r.provider} / {r.model}</td><td>{r.prompt}</td><td>{r.startedAt}</td><td>{r.valid}</td><td>{r.failed}</td><td>{r.total}</td></tr>)}</tbody></table>
        ) : <p className="empty-note">No genuine AI run is stored on this deployment.</p>}
      </section>

      <section>
        <h2>5. Theme extraction</h2>
        <p>{log.themes.approach}</p>
        <table><thead><tr><th>Theme</th><th>Definition</th></tr></thead><tbody>{log.themes.codebook.map((c) => <tr key={c.code}><td>{c.label}</td><td>{c.definition}</td></tr>)}</tbody></table>
      </section>

      <section>
        <h2>6. Research triangulation (primary vs secondary)</h2>
        <p>{log.triangulation.method}</p>
        <table><thead><tr><th>Theme</th><th>Survey</th><th>Public</th><th>Relationship</th><th>Strength</th></tr></thead>
          <tbody>{log.triangulation.rows.map((r) => <tr key={r.theme}><td>{r.theme}</td><td>{r.survey}</td><td>{r.public}</td><td>{r.relationship.replace(/_/g, ' ')}</td><td>{r.strength}</td></tr>)}</tbody></table>
        <p><strong>Convergent:</strong> {log.triangulation.convergent.join(', ') || 'none'} · <strong>Divergent:</strong> {log.triangulation.divergent.join(', ') || 'none'} · <strong>One source only:</strong> {log.triangulation.oneSource.join('; ') || 'none'}</p>
        {log.triangulation.synthesis ? (
          <>
            <h3>AI synthesis: interpretation, not observation ({log.triangulation.synthesis.model}, {log.triangulation.synthesis.createdAt.slice(0, 10)}, validation {log.triangulation.synthesis.status})</h3>
            <ul>
              {log.triangulation.synthesis.output.convergentProblems.map((s, i) => <li key={`c${i}`}>Convergent: {s.statement}</li>)}
              {log.triangulation.synthesis.output.contradictions.map((s, i) => <li key={`d${i}`}>Contradiction: {s.statement}</li>)}
              {log.triangulation.synthesis.output.needsMoreResearch.map((s, i) => <li key={`n${i}`}>Needs research: {s.statement}</li>)}
              <li>Life-to-SIP: {log.triangulation.synthesis.output.lifeToSipAssessment}</li>
              <li>MARKET PULSE: {log.triangulation.synthesis.output.marketPulseAssessment}</li>
            </ul>
          </>
        ) : <p className="empty-note">No AI synthesis stored yet.</p>}
      </section>

      <section>
        <h2>7. Opportunity ranking rationale</h2>
        <p>{log.opportunities.formula}</p>
        <table><thead><tr><th>Rank</th><th>Opportunity</th><th>Existing concept</th><th>Survey</th><th>Public</th><th>Score</th><th>Evidence</th><th>Rank: survey only</th><th>Rank: public only</th></tr></thead>
          <tbody>{log.opportunities.rows.map((o) => <tr key={o.title}><td>{o.rank}</td><td>{o.title}</td><td>{o.concept ?? ''}</td><td>{o.survey}</td><td>{o.public}</td><td>{o.score}</td><td>{o.quality}</td><td>{o.rankSurveyOnly}</td><td>{o.rankPublicOnly}</td></tr>)}</tbody></table>
      </section>

      <section>
        <h2>8. Validation methodology and results</h2>
        <p>{log.validation.method}</p>
        {v.reviewed ? (
          <p>Reviewed <strong>{v.reviewed}/{v.sampleSize}</strong>: {v.accurate} accurate, {v.partial} partially accurate, {v.inaccurate} inaccurate. Strict agreement {v.strictAgreementPct}% · accurate-or-partial {v.lenientAgreementPct}%. Reviewer(s): {v.reviewers.join(', ')}.</p>
        ) : <p className="empty-note">Validation status: PENDING. No human review has been recorded, so no agreement figure is reported.</p>}
        {log.validation.corrections.map((c, i) => (
          <article className="correction" key={i}>
            <p><strong>{c.verdict.replace(/_/g, ' ')}</strong> · reviewer {c.reviewer} · {c.sourceUrl ? <a href={c.sourceUrl}>source</a> : null}</p>
            {c.note ? <p>{c.note}</p> : null}
            {c.correctedCodes.length ? <p>Corrected themes: {c.correctedCodes.join(', ')}</p> : null}
          </article>
        ))}
      </section>

      <section>
        <h2>9. Product implications</h2>
        <ul>{log.implications.map((i) => <li key={i}>{i}</li>)}</ul>
      </section>

      <section>
        <h2>10. Limitations</h2>
        <ul>{log.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
        <p className="document-disclaimer"><strong>Simulated evidence, kept separate:</strong> {log.simulated}</p>
      </section>
    </>
  );
}
