import Link from 'next/link';
import { loadResearchState } from '@/services/research/triangulation-service';
import { TriangulationMatrix } from '@/components/research/TriangulationMatrix';
import { Callout, PageHead, SourcePill, Stat, fmtDate, platformLabel } from '@/components/research/ui';
import { RunAiButton } from '@/components/research/ActionForms';
import { providerOptions } from '@/services/ai/llm';
import { liveAiAllowed } from '@/lib/research/access';
import { headers } from 'next/headers';
import { getDemoStatus } from '@/services/demo/guard';
import { LiveSynthesisDemo } from '@/components/research/LiveDemo';
import { codeLabel } from '@/lib/research/codebook';
import type { SynthesisOutput } from '@/services/research/ai-research';
import type { SignalRow } from '@/lib/research/triangulation';
import { LifeflowVerdicts } from '@/components/research/LifeflowVerdicts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SYNTHESIS_QUESTIONS: Array<[keyof SynthesisOutput, string]> = [
  ['convergentProblems', 'Which investor problems appear in both sources?'],
  ['surveyProminentPubliclyRare', 'Which problems are prominent in the survey but rare in public feedback?'],
  ['publicEmergentNotInSurvey', 'Which problems emerge publicly but were not captured by the survey?'],
  ['contradictions', 'Where do the two sources contradict each other?'],
  ['strongestFindings', 'Which findings have the strongest support?'],
  ['needsMoreResearch', 'Which findings need interviews or more research?'],
  ['newOpportunities', 'What new opportunities emerge from combining the sources?'],
];

export default async function TriangulationPage() {
  const state = await loadResearchState();
  const t = state.triangulation;
  const ps = t.publicSummary;
  const synthesis = state.synthesis;
  const parsed: SynthesisOutput | null = synthesis?.parsedOutput ? JSON.parse(synthesis.parsedOutput) : null;
  const synthErrors: string[] = synthesis?.validationErrors ? JSON.parse(synthesis.validationErrors) : [];
  const evidenceUrl = new Map(state.publicRecords.map((r) => [r.id, r.sourceUrl]));
  const counts = t.rows.reduce<Record<string, number>>((acc, r) => ((acc[r.relationship] = (acc[r.relationship] ?? 0) + 1), acc), {});
  const reviewed = new Set(state.validation.reviews.map((r) => r.recordAnalysisId)).size;

  return (
    <div className="rx-page">
      <PageHead
        title="Research triangulation: where evidence converges"
        description="Each research theme is measured twice, independently: by survey respondents (primary research) and by AI-coded public feedback (secondary research). The two are compared, never pooled. Agreement strengthens a finding; disagreement or silence tells us what to research next."
      />

      <div className="rx-grid rx-grid-2">
        <div className="rx-panel rx-panel-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SourcePill kind="survey">Pipeline A · Primary research</SourcePill>
          <div className="rx-stat-strip" style={{ border: 0 }}>
            <Stat label="Survey respondents" value={t.surveyRespondents} note="Google Forms, self-reported, forced-choice" />
            <Stat label="Unit & denominator" value="Respondents" note="% of respondents who answered the mapped question" />
          </div>
        </div>
        <div className="rx-panel rx-panel-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SourcePill kind="public">Pipeline B · Public feedback</SourcePill>
          <div className="rx-stat-strip" style={{ border: 0 }}>
            <Stat label="Validly AI-analysed" value={ps.analysedValid} unit={`/ ${ps.eligibleRecords}`} note={`${ps.notAnalysed} awaiting · ${ps.analysedFailed} failed validation`} />
            <Stat label="Platforms" value={Object.keys(ps.platforms).length} note={Object.entries(ps.platforms).map(([p, n]) => `${platformLabel(p)} ${n}`).join(' · ')} />
          </div>
        </div>
      </div>

      <Callout tone="info">
        Survey percentages come from forced-choice options, which inflate prevalence compared with things people mention unprompted in public posts. Compare each theme’s <em>relative prominence</em> within its own source, not the raw percentages across sources. Thresholds: survey ≥ {t.thresholds.surveyPresentPct}% of respondents; public ≥ {t.thresholds.publicPresentPct}% of analysed records and at least {t.thresholds.publicPresentMinRecords} records. “Divergent” means present in one source and almost absent in the other, or a rank gap of {t.thresholds.divergentRankGap}+ places.
      </Callout>

      {ps.analysedValid === 0 ? (
        <Callout tone="warn">
          Public feedback has not been AI-analysed on this deployment yet, so every comparison below is one-sided. Run the analysis on <Link className="rx-link" href="/analysis">AI analysis</Link>.
        </Callout>
      ) : null}

      <section className="rx-section">
        <header>
          <h2>Theme comparison matrix</h2>
          <p className="rx-num">
            {counts.convergent ?? 0} convergent · {counts.divergent ?? 0} divergent · {(counts.survey_only ?? 0) + (counts.public_only ?? 0) + (counts.not_measured_in_survey ?? 0)} one source only · {counts.insufficient ?? 0} insufficient. Expand a theme to see the underlying answers and source records.
          </p>
        </header>
        <TriangulationMatrix rows={t.rows} />
      </section>

      <section className="rx-section">
        <header>
          <h2>Do the two existing concepts hold up?</h2>
          <p>Life-to-SIP and MARKET PULSE were already built. Here they are tested against the evidence rather than assumed. “Not measured” means the survey never asked, which is different from finding nothing.</p>
        </header>
        <LifeflowVerdicts signals={t.signals as SignalRow[]} opportunities={t.opportunities} />
      </section>

      <section className="rx-section">
        <header>
          <h2>AI synthesis of the comparison</h2>
          <p>A language model reads the deterministic matrix above and answers the research questions. Every statement must cite themes and record ids from its input; the guard rejects anything else. Treat this as interpretation, not observation.</p>
        </header>
        {synthesis ? (
          <div className="rx-panel rx-panel-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <SourcePill kind="ai">AI inference</SourcePill>
              <span className="rx-small rx-muted">
                {synthesis.model} · {fmtDate(synthesis.createdAt)} · prompt {synthesis.promptVersion} · validation: <strong>{synthesis.validationStatus}</strong>
              </span>
            </div>
            {synthErrors.length ? <Callout tone="warn">Guard findings: {synthErrors.slice(0, 5).join('; ')}</Callout> : null}
            {parsed ? (
              <>
                <div className="rx-grid rx-grid-2">
                  {SYNTHESIS_QUESTIONS.map(([key, q]) => {
                    const items = parsed[key] as SynthesisOutput['convergentProblems'];
                    return (
                      <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <h3 style={{ fontSize: 14 }}>{q}</h3>
                        {items.length === 0 ? <p className="rx-small rx-muted">The model found nothing for this question.</p> : null}
                        <ul style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {items.map((it, i) => (
                            <li key={i} className="rx-small" style={{ lineHeight: 1.5 }}>
                              {it.statement}{' '}
                              {it.codes.length ? <span className="rx-muted">[{it.codes.map(codeLabel).join(', ')}]</span> : null}{' '}
                              {it.evidenceIds.map((id) =>
                                evidenceUrl.get(id) ? (
                                  <a key={id} className="rx-link rx-mono" href={evidenceUrl.get(id)} target="_blank" rel="noopener noreferrer" style={{ marginRight: 6 }}>
                                    {id.replace(/^pub-/, '')}
                                  </a>
                                ) : null,
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
                <div className="rx-grid rx-grid-2">
                  <Callout tone="ai">
                    <strong>Life-to-SIP (AI view):</strong> {parsed.lifeToSipAssessment}
                  </Callout>
                  <Callout tone="ai">
                    <strong>MARKET PULSE (AI view):</strong> {parsed.marketPulseAssessment}
                  </Callout>
                </div>
                {parsed.caveats.length ? (
                  <ul className="rx-small rx-muted" style={{ paddingLeft: 18 }}>
                    {parsed.caveats.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <p className="rx-small">The stored synthesis did not pass schema validation; the raw output is preserved in the AI Evidence Log.</p>
            )}
          </div>
        ) : (
          <Callout tone="warn">No AI synthesis has been generated yet. It needs analysed public feedback and a configured model.</Callout>
        )}
        <h3 style={{ fontSize: 15, marginTop: 6 }}>Try it live</h3>
        <LiveSynthesisDemo providers={providerOptions()} initialStatus={await getDemoStatus(await headers())} />
        {liveAiAllowed() ? <RunAiButton kind="synthesis" providers={providerOptions()} label={synthesis ? 'Researcher: regenerate and save synthesis' : 'Researcher: generate and save synthesis'} /> : null}
      </section>

      <section className="rx-section">
        <header>
          <h2>Evidence limits</h2>
        </header>
        <ul className="rx-small" style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6, maxWidth: '90ch', lineHeight: 1.55 }}>
          <li>The survey is a convenience sample of {t.surveyRespondents} people, mostly aged 22–27 and within their first year of SIPs. It cannot estimate population prevalence or the 12-month retention metric.</li>
          <li>Public records are self-selected: app reviews skew to complaints, forum posts skew to questions. Absence in public feedback does not mean a problem is rare.</li>
          <li>The two sources do not share participants, so agreement between them is independent corroboration. Within the survey, one respondent can appear in several themes, and theme counts overlap.</li>
          <li>Public theme coding is done by a language model and is {reviewed ? `human-reviewed for ${reviewed} record(s) so far` : 'not yet human-validated'} (see <Link className="rx-link" href="/validation">Validation</Link>).</li>
          <li>Reddit could not be collected in this round (automated access is blocked), so forum evidence comes from TradingQ&A only.</li>
        </ul>
      </section>
    </div>
  );
}
