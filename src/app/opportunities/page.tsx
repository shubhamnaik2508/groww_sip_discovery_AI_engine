import { db } from '@/db';
import { themes } from '@/db/schema';
import { OpportunityService } from '@/services/opportunity';
import { OpportunityView } from '@/components/OpportunityView';
import { loadResearchState } from '@/services/research/triangulation-service';
import { OpportunityTrace, TraceRecord } from '@/components/research/OpportunityTrace';
import { Accordion } from '@/components/motion';
import { Callout, PageHead, SourcePill, StrengthTag, platformLabel } from '@/components/research/ui';
import { codeLabel } from '@/lib/research/codebook';

export const dynamic = 'force-dynamic';

export default async function OpportunitiesPage() {
  const state = await loadResearchState();
  const t = state.triangulation;
  const opps = await OpportunityService.listOpportunities();
  const allThemes = await db.select().from(themes).all();

  const traceRecords: Record<string, TraceRecord> = {};
  for (const r of state.publicRecords) {
    if (r.analysis?.status !== 'valid') continue;
    traceRecords[r.id] = { id: r.id, platform: r.platform, sourceUrl: r.sourceUrl, title: r.title, originalText: r.originalText, publishedAt: r.publishedAt, model: r.analysis.model };
  }
  const conceptRanks = t.opportunities.filter((o) => o.existingConcept);
  const leader = t.opportunities[0];

  return (
    <div className="rx-page">
      <PageHead
        title="Opportunity matrix"
        description="Candidate product opportunities, ranked from the evidence rather than from what has already been built. Survey and public support are computed separately, with their own denominators, and combined only through the transparent score below."
      />

      {leader ? (
        <Callout tone={leader.existingConcept ? 'ok' : 'warn'}>
          Current leader: <strong>{leader.title}</strong>
          {leader.existingConcept ? ` (the existing ${leader.existingConcept} concept)` : ' (not one of the existing LifeFlow concepts)'}.{' '}
          {conceptRanks.map((c) => `${c.existingConcept} ranks #${c.rank}`).join('; ')}. The ranking changes as new evidence is imported or analysed.
        </Callout>
      ) : null}

      <section className="rx-section">
        <header>
          <h2>Ranking</h2>
          <p>{t.scoringFormula} The two right-hand columns show how the order would change using a single source, as a sensitivity check.</p>
        </header>
        <div className="rx-table-wrap">
          <table className="rx-table">
            <thead>
              <tr>
                <th className="rx-right">Rank</th>
                <th style={{ minWidth: 240 }}>Opportunity</th>
                <th className="rx-right">Survey support</th>
                <th className="rx-right">Public support</th>
                <th title="survey + public + diversity + convergence">Score parts</th>
                <th className="rx-right">Score</th>
                <th>Evidence</th>
                <th className="rx-right">Survey-only rank</th>
                <th className="rx-right">Public-only rank</th>
              </tr>
            </thead>
            <tbody>
              {t.opportunities.map((o) => (
                <tr key={o.id}>
                  <td className="rx-right rx-num"><strong>#{o.rank}</strong></td>
                  <td>
                    <strong>{o.title}</strong>
                    {o.existingConcept ? <div className="rx-small" style={{ color: 'var(--rx-ai)', fontWeight: 600 }}>Existing concept: {o.existingConcept}</div> : null}
                    <div className="rx-small rx-muted">{o.codes.map(codeLabel).join(' · ')}</div>
                  </td>
                  <td className="rx-right rx-num">
                    {o.surveyRespondents.count}/{o.surveyRespondents.denominator}
                    <div className="rx-small rx-muted">{o.surveyRespondents.pct}% {o.surveyRespondents.basis === 'stated_need' ? 'wished' : 'reported'}</div>
                  </td>
                  <td className="rx-right rx-num">
                    {o.publicRecords.count}/{o.publicRecords.denominator}
                    <div className="rx-small rx-muted">{o.publicRecords.pct}% · {o.publicRecords.platforms.map(platformLabel).join(', ') || 'none'}</div>
                  </td>
                  <td className="rx-num rx-small">
                    {o.scoreParts.survey} + {o.scoreParts.public} + {o.scoreParts.diversity} + {o.scoreParts.convergence}
                  </td>
                  <td className="rx-right rx-num"><strong>{o.score}</strong></td>
                  <td><StrengthTag strength={o.evidenceQuality} /></td>
                  <td className="rx-right rx-num">#{o.rankSurveyOnly}</td>
                  <td className="rx-right rx-num">#{o.rankPublicOnly}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="rx-small rx-muted">
          Severity and business impact are not scored: neither source measures them. Problem themes count toward survey support; help-seeking is a behaviour and is shown as context only. Records can support several themes, so counts are unions, never sums.
        </p>
      </section>

      <section className="rx-section">
        <header>
          <h2>Evidence-to-opportunity trace</h2>
          <p>Pick an opportunity and follow it back: opportunity → supporting theme → survey answers and public quotes → the original record and its source link.</p>
        </header>
        <OpportunityTrace opportunities={t.opportunities} rows={t.rows} records={traceRecords} />
      </section>

      <section className="rx-section">
        <Accordion
          id="legacy-opps"
          className="rx-panel rx-acc"
          head={
            <>
              <span style={{ gridColumn: 'span 4' }}>
                <strong>Manual opportunity workspace (earlier version)</strong>
                <span className="rx-small rx-muted"> · seven-criterion human scoring, kept for continuity</span>
              </span>
              <SourcePill kind="neutral">{opps.length} saved</SourcePill>
            </>
          }
        >
          <OpportunityView initialOpportunities={opps as never} availableThemes={allThemes} />
        </Accordion>
      </section>
    </div>
  );
}
