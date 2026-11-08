import Link from 'next/link';
import { loadResearchState } from '@/services/research/triangulation-service';
import { computeHeadlineMetrics } from '@/lib/research/survey';
import { selectValidationSample, summariseValidation, VALIDATION_SAMPLE_SIZE } from '@/lib/research/validation';
import { Callout, RelTag, SourcePill, Stat, platformLabel } from './ui';
import { IconArrowRight } from '@/components/icons';

const STEPS = [
  { href: '/primary-research', label: 'Survey findings' },
  { href: '/evidence', label: 'Public evidence' },
  { href: '/analysis', label: 'AI analysis' },
  { href: '/themes', label: 'Themes' },
  { href: '/triangulation', label: 'Triangulation' },
  { href: '/opportunities', label: 'Opportunities & trace' },
  { href: '/validation', label: 'Validation' },
  { href: '/evidence-log', label: 'Evidence log' },
];

/** Research command-center summary. Every number is read from stored data. */
export async function ResearchOverview() {
  const state = await loadResearchState();
  const t = state.triangulation;
  const ps = t.publicSummary;
  const metrics = state.survey ? computeHeadlineMetrics(state.survey.survey) : [];
  const disrupted = metrics.find((m) => m.id === 'disrupted');
  const valid = state.publicRecords.filter((r) => r.eligible && r.analysis?.status === 'valid');
  const sample = selectValidationSample(valid, VALIDATION_SAMPLE_SIZE);
  const v = summariseValidation(sample.map((r) => r.analysis!.id), state.validation.reviews, new Map());
  const convergent = t.rows.filter((r) => r.relationship === 'convergent' && r.kind !== 'motivation');
  const top = t.opportunities.slice(0, 3);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <header className="rx-head">
        <div>
          <h1>Why first-time investors pause, reduce or stop SIPs</h1>
          <p>
            Two independent sources, compared rather than pooled: a Google Forms survey of {t.surveyRespondents} SIP investors and {ps.eligibleRecords} genuine public posts, reviews and comments coded by a language model. Every insight traces back to an anonymised respondent or a linked public source.
          </p>
        </div>
        <Link href="/triangulation" className="btn btn-primary" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          Open triangulation <IconArrowRight size={15} />
        </Link>
      </header>

      <div className="rx-stat-strip">
        <Stat label="Survey respondents" value={t.surveyRespondents} note={disrupted ? `${disrupted.count}/${disrupted.denominator} reduced, stopped or considered stopping` : 'Primary research'} />
        <Stat label="Public records" value={ps.eligibleRecords} note={Object.entries(ps.platforms).map(([p, n]) => `${platformLabel(p)} ${n}`).join(' · ')} />
        <Stat label="AI-analysed (valid)" value={ps.analysedValid} unit={`/ ${ps.eligibleRecords}`} note={ps.models.length ? ps.models.join(', ') : 'No stored run yet'} />
        <Stat label="Convergent themes" value={convergent.length} unit={`/ ${t.rows.filter((r) => r.kind !== 'motivation').length}`} note="Supported by both sources" />
        <Stat label="Validation" value={<span style={{ fontSize: 18 }}>{v.status === 'pending' ? 'Pending' : `${v.reviewed}/${v.sampleSize} reviewed`}</span>} note={v.strictAgreementPct !== null ? `${v.strictAgreementPct}% accurate` : 'No human review yet'} />
      </div>

      <div className="rx-grid rx-grid-2">
        <div className="rx-panel rx-panel-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 style={{ fontSize: 16 }}>Where the sources agree</h2>
          {convergent.length ? (
            <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {convergent.map((r) => (
                <li key={r.code} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                  <span>{r.label}</span>
                  <span className="rx-small rx-num" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <SourcePill kind="survey">{r.survey.primaryPct}%</SourcePill>
                    <SourcePill kind="public">{r.public.count} records</SourcePill>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rx-small rx-muted">{ps.analysedValid ? 'No theme meets both thresholds yet.' : 'Public feedback has not been analysed yet, so convergence cannot be assessed.'}</p>
          )}
          <p className="rx-small rx-muted">
            Other themes: {t.rows.filter((r) => r.relationship !== 'convergent' && r.kind !== 'motivation').map((r) => r.label).slice(0, 6).join(', ')}. <Link className="rx-link" href="/triangulation">See all</Link>
          </p>
        </div>
        <div className="rx-panel rx-panel-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 style={{ fontSize: 16 }}>Top opportunities by evidence</h2>
          <ol style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {top.map((o) => (
              <li key={o.id}>
                <strong>{o.title}</strong>
                {o.existingConcept ? <span className="rx-small" style={{ color: 'var(--rx-ai)', fontWeight: 600 }}> · {o.existingConcept}</span> : null}
                <div className="rx-small rx-muted rx-num">
                  Score {o.score} · survey {o.surveyRespondents.count}/{o.surveyRespondents.denominator} · public {o.publicRecords.count}/{o.publicRecords.denominator}
                </div>
              </li>
            ))}
          </ol>
          <p className="rx-small">
            <Link className="rx-link" href="/opportunities">Trace any opportunity to its evidence</Link>
          </p>
        </div>
      </div>

      {t.rows.some((r) => r.relationship === 'divergent') ? (
        <Callout tone="warn">
          Sources disagree on: {t.rows.filter((r) => r.relationship === 'divergent').map((r) => r.label).join(', ')}. <RelTag rel="divergent" /> themes need interviews before they justify product investment.
        </Callout>
      ) : null}

      <nav aria-label="Mentor walkthrough" className="rx-panel rx-panel-pad">
        <h2 style={{ fontSize: 15, marginBottom: 10 }}>Walkthrough</h2>
        <ol style={{ display: 'flex', flexWrap: 'wrap', gap: 8, listStyle: 'none', padding: 0 }}>
          {STEPS.map((s, i) => (
            <li key={s.href}>
              <Link href={s.href} className="btn btn-secondary" style={{ fontSize: 12.5, display: 'inline-flex', gap: 6 }}>
                <span className="rx-mono rx-muted">{i + 1}</span> {s.label}
              </Link>
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}
