import Link from 'next/link';
import { loadResearchState } from '@/services/research/triangulation-service';
import { computeAgeSummary, computeHeadlineMetrics, computeQuestionStats, computeSegmentComparisons } from '@/lib/research/survey';
import { SURVEY_CODE_MAPPINGS, codeLabel } from '@/lib/research/codebook';
import { providerOptions } from '@/services/ai/llm';
import { needsPasscode } from '@/lib/research/access';
import { Accordion } from '@/components/motion';
import { SurveyImportForm, RunAiButton } from '@/components/research/ActionForms';
import { Callout, PageHead, SourcePill, Stat, fmtDate } from '@/components/research/ui';
import { IconDownload } from '@/components/icons';

export const dynamic = 'force-dynamic';

export default async function PrimaryResearchPage() {
  const state = await loadResearchState();
  const stored = state.survey;
  if (!stored) {
    return (
      <div className="rx-page">
        <PageHead title="Primary research: Google Forms survey" description="No survey dataset is loaded yet. Import the Google Forms CSV export to calculate verified statistics." />
        <SurveyImportForm needsPasscode={needsPasscode()} />
      </div>
    );
  }
  const survey = stored.survey;
  const metrics = computeHeadlineMetrics(survey);
  const segments = computeSegmentComparisons(survey);
  const age = computeAgeSummary(survey);
  const questions = survey.questions.filter((q) => q.type !== 'timestamp');
  const timestamps = survey.responses.map((r) => r.submittedAt).filter(Boolean) as string[];
  const openText = state.surveyOpenText;

  return (
    <div className="rx-page">
      <PageHead
        title="Primary research: Google Forms SIP investor survey"
        description={
          <>
            Self-reported answers from <strong className="rx-num">{survey.responses.length}</strong> respondents. Every count below is calculated deterministically from the stored export; no AI is involved except where an open-ended answer is labelled as AI-coded. This dataset is kept separate from public feedback and from the synthetic benchmark.
          </>
        }
        actions={
          <a className="btn btn-secondary" href="/api/research/export?type=survey-csv" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <IconDownload size={15} /> Anonymised CSV
          </a>
        }
      />

      <div className="rx-stat-strip">
        <Stat label="Respondents" value={survey.responses.length} note="Unit: one respondent" />
        <Stat label="Questions retained" value={questions.length} note={`${stored.excludedColumns.length} identifying column(s) removed`} />
        <Stat label="Responses collected" value={timestamps.length ? `${timestamps[0].slice(0, 10)} → ${timestamps[timestamps.length - 1].slice(0, 10)}` : 'not stated'} note="Google Forms timestamps (IST)" />
        <Stat label="Dataset" value={<SourcePill kind="survey">Primary research</SourcePill>} note={`${stored.fileName} · imported ${fmtDate(stored.importedAt)}`} />
      </div>

      {stored.excludedColumns.length ? (
        <Callout tone="info">
          Privacy: the column{stored.excludedColumns.length > 1 ? 's' : ''} {stored.excludedColumns.map((c) => `“${c.trim()}”`).join(', ')} {stored.excludedColumns.length > 1 ? 'were' : 'was'} removed at import. Respondents are identified only as R01–R{String(survey.responses.length).padStart(2, '0')} in export order.
        </Callout>
      ) : null}
      {survey.warnings.map((w) => (
        <Callout key={w} tone="warn">{w}</Callout>
      ))}

      <section className="rx-section">
        <header>
          <h2>Previously reported figures, recalculated</h2>
          <p>Each figure is recomputed from the raw answers and compared with the number reported in the earlier presentation.</p>
        </header>
        <div className="rx-table-wrap">
          <table className="rx-table">
            <thead>
              <tr>
                <th>Finding</th>
                <th className="rx-right">Recalculated</th>
                <th className="rx-right">Previously reported</th>
                <th>Status</th>
                <th>Within the 39 who reduced, stopped or considered stopping</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.id}>
                  <td>
                    <strong>{m.label}</strong>
                    <div className="rx-small rx-muted" style={{ marginTop: 3, maxWidth: '62ch' }}>{m.definition}</div>
                  </td>
                  <td className="rx-right rx-num" style={{ whiteSpace: 'nowrap' }}>
                    <strong>{m.count}/{m.denominator}</strong> <span className="rx-muted">({m.pct}%)</span>
                  </td>
                  <td className="rx-right rx-num">{m.previouslyReported ? `${m.previouslyReported.count}/${m.previouslyReported.denominator}` : 'n/a'}</td>
                  <td>
                    {m.status === 'matches_previous' ? <SourcePill kind="public">Matches</SourcePill> : m.status === 'differs_from_previous' ? <SourcePill kind="warn">Differs</SourcePill> : <SourcePill kind="neutral">New check</SourcePill>}
                  </td>
                  <td className="rx-num rx-small">{m.subgroup ? `${m.subgroup.count}/${m.subgroup.denominator} (${m.subgroup.pct}%)` : 'n/a'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {metrics.some((m) => m.status === 'differs_from_previous') ? (
          <Callout tone="warn">
            The income/salary/unexpected-expense figure was previously reported as 28/42. Recalculated across all respondents it is{' '}
            {metrics.find((m) => m.id === 'cash_flow_reason')?.count}/42. The figure 28 is the count among the 39 respondents who reduced, stopped or considered stopping (28/39). The difference comes from respondents who answered the “If yes” follow-up despite answering No.
          </Callout>
        ) : null}
      </section>

      <section className="rx-section">
        <header>
          <h2>Question-by-question results</h2>
          <p>Exact question wording from the form. Percentages use respondents who answered that question; multi-select questions can sum to more than 100%. Options nobody selected cannot be recovered from a Forms export.</p>
        </header>
        <div className="rx-panel">
          {questions.map((q, qi) => {
            const s = computeQuestionStats(survey, q);
            return (
              <Accordion
                key={q.id}
                id={`q-${q.id}`}
                className="rx-acc"
                head={
                  <>
                    <span style={{ fontWeight: 600, gridColumn: 'span 3' }}>
                      <span className="rx-muted rx-mono" style={{ marginRight: 8 }}>Q{qi + 1}</span>
                      {q.wording.trim()}
                    </span>
                    <span className="rx-small rx-muted rx-hide-sm">{q.type.replace('_', ' ')}</span>
                    <span className="rx-small rx-num">{s.answered}/{s.totalRespondents} answered</span>
                  </>
                }
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {q.wording !== q.wording.trim() ? <p className="rx-small rx-muted">Exact header in the export includes surrounding whitespace: “{q.wording}”.</p> : null}
                  {s.note ? <p className="rx-small rx-muted">{s.note} Mean selections per respondent: {s.meanSelections}.</p> : null}
                  {s.missing ? <p className="rx-small" style={{ color: 'var(--rx-warn)' }}>{s.missing} respondent(s) left this blank; they are excluded from this question’s denominator.</p> : null}
                  {s.options.length ? (
                    <div className="rx-scroll">
                    <table className="rx-table">
                      <thead>
                        <tr>
                          <th>Option (exact text)</th>
                          <th className="rx-right">Respondents</th>
                          <th className="rx-right">% of answered</th>
                          <th style={{ width: '30%' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.options.map((o) => (
                          <tr key={o.option}>
                            <td>{o.option}</td>
                            <td className="rx-right rx-num">{o.count}</td>
                            <td className="rx-right rx-num">{o.pctOfAnswered}%</td>
                            <td>
                              <div className="rx-bar rx-bar-survey"><span style={{ width: `${o.pctOfAnswered}%` }} /></div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  ) : null}
                  {s.openTextAnswers ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {s.openTextAnswers.map((a) => {
                        const coded = openText.find((o) => o.respondentCode === a.respondentCode && o.questionId === q.id);
                        return (
                          <div className="rx-record" key={a.respondentCode}>
                            <div className="rx-record-meta">
                              <SourcePill kind="survey">{a.respondentCode}</SourcePill>
                              {coded ? (
                                <SourcePill kind="ai">AI-coded: {coded.codes.length ? coded.codes.map((c) => codeLabel(c.code)).join(', ') : 'no codebook theme'} · {coded.model}</SourcePill>
                              ) : (
                                <SourcePill kind="neutral">Not yet AI-coded</SourcePill>
                              )}
                            </div>
                            <div className="rx-quote">“{a.text}”</div>
                          </div>
                        );
                      })}
                      <p className="rx-small rx-muted">Only {s.answered} of {s.totalRespondents} respondents answered this optional question, so it cannot support prevalence claims.</p>
                      {!openText.length ? <RunAiButton kind="survey_text" needsPasscode={needsPasscode()} providers={providerOptions()} label="AI-code open-ended answers" /> : null}
                    </div>
                  ) : null}
                </div>
              </Accordion>
            );
          })}
        </div>
      </section>

      <section className="rx-section">
        <header>
          <h2>Segments actually collected</h2>
          <p>Only attributes the form asked about. Groups under 10 respondents are flagged and should not be compared.</p>
        </header>
        <div className="rx-grid rx-grid-2">
          {segments.map((seg) => (
            <div className="rx-table-wrap" key={seg.segmentQuestion}>
              <table className="rx-table">
                <thead>
                  <tr>
                    <th>{seg.segmentQuestion}</th>
                    <th className="rx-right">n</th>
                    <th className="rx-right">Reduced / stopped / considered</th>
                    <th className="rx-right">Cash-flow reason</th>
                    <th className="rx-right">Market reason</th>
                  </tr>
                </thead>
                <tbody>
                  {seg.segments.map((g) => (
                    <tr key={g.segment}>
                      <td>
                        {g.segment} {g.smallSample ? <span className="rx-small" style={{ color: 'var(--rx-warn)' }}>· small n</span> : null}
                      </td>
                      <td className="rx-right rx-num">{g.n}</td>
                      <td className="rx-right rx-num">{g.disrupted.count} ({g.disrupted.pct}%)</td>
                      <td className="rx-right rx-num">{g.cashFlow.count} ({g.cashFlow.pct}%)</td>
                      <td className="rx-right rx-num">{g.market.count} ({g.market.pct}%)</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        {age ? (
          <p className="rx-small rx-muted">
            Age: {age.answered} answered, {age.missing} missing{age.nonNumeric.length ? `, ${age.nonNumeric.length} gave a range (${age.nonNumeric.join(', ')})` : ''}. Numeric answers range {age.min}–{age.max} (median {age.median}). The sample is concentrated in early-career respondents and is not representative of Indian SIP investors.
          </p>
        ) : null}
      </section>

      <section className="rx-section">
        <header>
          <h2>How survey options map to shared research themes</h2>
          <p>This explicit table is the only link between survey answers and the triangulation themes. Experienced problems and stated wishes (“what would make you more comfortable”) are counted separately.</p>
        </header>
        <div className="rx-table-wrap">
          <table className="rx-table">
            <thead>
              <tr>
                <th>Question</th>
                <th>Option</th>
                <th>Theme</th>
                <th>Counted as</th>
              </tr>
            </thead>
            <tbody>
              {SURVEY_CODE_MAPPINGS.flatMap((m) =>
                Object.entries(m.options).map(([option, codes]) => (
                  <tr key={`${m.role}-${option}`}>
                    <td className="rx-small">{survey.questions.find((q) => m.questionMatch.test(q.wording))?.wording.trim() ?? m.questionMatch.source}</td>
                    <td>{option}</td>
                    <td>{codes.map(codeLabel).join(', ')}</td>
                    <td className="rx-small">{m.role === 'stated_need' ? 'Stated wish' : m.role === 'motivation' ? 'Motivation' : m.role === 'help_seeking' ? 'Behaviour' : 'Experienced problem'}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </section>

      <SurveyImportForm needsPasscode={needsPasscode()} />
      <p className="rx-small rx-muted">
        Next: compare these findings with public feedback in <Link className="rx-link" href="/triangulation">Triangulation</Link>.
      </p>
    </div>
  );
}
