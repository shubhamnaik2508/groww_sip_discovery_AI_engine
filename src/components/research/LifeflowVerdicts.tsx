import React from 'react';
import type { OpportunityRow, SignalRow } from '@/lib/research/triangulation';
import { SourceLink, SourcePill, platformLabel } from './ui';

const STATUS_TEXT: Record<SignalRow['status'], { label: string; kind: 'public' | 'survey' | 'warn' | 'neutral' }> = {
  supported_by_both: { label: 'Supported by both', kind: 'public' },
  survey_only: { label: 'Survey only', kind: 'survey' },
  public_only: { label: 'Public only', kind: 'public' },
  not_measured_public_present: { label: 'Not asked in survey; seen publicly', kind: 'neutral' },
  not_measured_public_absent: { label: 'Assumption without evidence', kind: 'warn' },
  weak: { label: 'Weak in both', kind: 'warn' },
};

function FeatureCard({ name, feature, signals, opp, unresolved }: { name: string; feature: SignalRow['feature']; signals: SignalRow[]; opp?: OpportunityRow; unresolved: OpportunityRow[] }) {
  const own = signals.filter((s) => s.feature === feature);
  const supported = own.filter((s) => s.status === 'supported_by_both' || s.status === 'survey_only' || s.status === 'public_only' || s.status === 'not_measured_public_present');
  const unsupported = own.filter((s) => s.status === 'not_measured_public_absent' || s.status === 'weak');
  return (
    <div className="rx-panel rx-panel-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <h3 style={{ fontSize: 16 }}>{name}</h3>
        {opp ? (
          <span className="rx-small rx-num">
            Opportunity rank <strong>#{opp.rank}</strong> of 5 · score {opp.score}
          </span>
        ) : null}
      </div>
      <table className="rx-table">
        <thead>
          <tr>
            <th>Assumed problem</th>
            <th>Survey</th>
            <th>Public</th>
            <th>Verdict</th>
          </tr>
        </thead>
        <tbody>
          {own.map((s) => (
            <tr key={s.signal}>
              <td>
                {s.label}
                {s.public.quotes.slice(0, 1).map((q) => (
                  <div key={q.evidenceId} className="rx-small rx-muted" style={{ marginTop: 4 }}>
                    “{q.quote}” · {platformLabel(q.platform)} <SourceLink href={q.sourceUrl}>source</SourceLink>
                  </div>
                ))}
              </td>
              <td className="rx-num rx-small">
                {s.survey.measured ? (
                  <>
                    {s.survey.count}/{s.survey.denominator} ({s.survey.pct}%)
                    {s.survey.caveat ? <div className="rx-muted" style={{ marginTop: 3 }}>{s.survey.caveat}</div> : null}
                  </>
                ) : (
                  <span className="rx-muted">Not asked</span>
                )}
              </td>
              <td className="rx-num rx-small">{s.public.denominator ? `${s.public.count}/${s.public.denominator}` : 'awaiting'}</td>
              <td>
                <SourcePill kind={STATUS_TEXT[s.status].kind}>{STATUS_TEXT[s.status].label}</SourcePill>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="rx-small" style={{ display: 'flex', flexDirection: 'column', gap: 6, lineHeight: 1.5 }}>
        <p>
          <strong>Addresses:</strong> {supported.length ? supported.map((s) => s.label.toLowerCase()).join('; ') : 'no assumed problem currently has supporting evidence'}.
        </p>
        <p>
          <strong>Assumptions lacking evidence:</strong> {unsupported.length ? unsupported.map((s) => s.label.toLowerCase()).join('; ') : 'none of its assumed problems is unsupported'}.
        </p>
        {unresolved.length ? (
          <p>
            <strong>Left unresolved by both concepts:</strong> {unresolved.map((u) => `${u.title} (rank #${u.rank})`).join('; ')}.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function LifeflowVerdicts({ signals, opportunities }: { signals: SignalRow[]; opportunities: OpportunityRow[] }) {
  const lts = opportunities.find((o) => o.existingConcept === 'Life-to-SIP');
  const mp = opportunities.find((o) => o.existingConcept === 'MARKET PULSE');
  const unresolved = opportunities.filter((o) => !o.existingConcept && o.score > 0 && (!lts || o.rank < lts.rank || !mp || o.rank < mp.rank));
  return (
    <div className="rx-grid rx-grid-2">
      <FeatureCard name="Life-to-SIP" feature="life_to_sip" signals={signals} opp={lts} unresolved={unresolved} />
      <FeatureCard name="MARKET PULSE" feature="market_pulse" signals={signals} opp={mp} unresolved={unresolved} />
    </div>
  );
}
