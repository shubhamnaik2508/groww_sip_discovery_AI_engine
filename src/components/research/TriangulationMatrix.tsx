'use client';

import React, { useMemo, useState } from 'react';
import type { CodeRow, Relationship } from '@/lib/research/triangulation';
import { Accordion, SlidingTabs, SubtleNumber } from '@/components/motion';
import { RelTag, ShareBar, SourceLink, SourcePill, StrengthTag, platformLabel } from './ui';

type Filter = 'all' | 'convergent' | 'divergent' | 'one_source' | 'gaps';
const FILTERS: Array<{ value: Filter; label: string; match: (r: Relationship) => boolean }> = [
  { value: 'all', label: 'All themes', match: () => true },
  { value: 'convergent', label: 'Convergent', match: (r) => r === 'convergent' },
  { value: 'divergent', label: 'Divergent', match: (r) => r === 'divergent' },
  { value: 'one_source', label: 'One source only', match: (r) => r === 'survey_only' || r === 'public_only' || r === 'not_measured_in_survey' },
  { value: 'gaps', label: 'Insufficient', match: (r) => r === 'insufficient' },
];

export function TriangulationMatrix({ rows }: { rows: CodeRow[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [kind, setKind] = useState<'problem' | 'all'>('problem');
  const visible = useMemo(
    () => rows.filter((r) => FILTERS.find((f) => f.value === filter)!.match(r.relationship) && (kind === 'all' || r.kind !== 'motivation')),
    [rows, filter, kind],
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <SlidingTabs label="Filter by relationship" options={FILTERS.map(({ value, label }) => ({ value, label }))} value={filter} onChange={setFilter} />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <SlidingTabs
            label="Theme kinds"
            options={[
              { value: 'problem', label: 'Problems & behaviours' },
              { value: 'all', label: 'Include motivations' },
            ]}
            value={kind}
            onChange={setKind}
          />
          <span className="rx-small rx-muted rx-num" aria-live="polite">
            <SubtleNumber value={visible.length} /> of {rows.length} themes
          </span>
        </div>
      </div>
      <div className="rx-panel">
        <div className="rx-acc" aria-hidden="true">
          <div className="t-acc-head" style={{ cursor: 'default', fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, paddingBlock: 10 }}>
            <span>Theme</span>
            <span className="rx-hide-sm">Survey (respondents)</span>
            <span className="rx-hide-sm">Public feedback (records)</span>
            <span>Relationship</span>
            <span className="rx-hide-sm">Strength</span>
            <span />
          </div>
        </div>
        {visible.map((r) => (
          <Accordion
            key={r.code}
            id={`theme-${r.code}`}
            className="rx-acc"
            head={
              <>
                <span>
                  <strong>{r.label}</strong>
                  {r.kind !== 'problem' ? <span className="rx-small rx-muted"> · {r.kind}</span> : null}
                </span>
                <span className="rx-hide-sm">
                  {r.survey.measured ? (
                    <ShareBar
                      kind="survey"
                      pct={r.survey.primaryPct}
                      label={`${r.survey.basis === 'stated_need' ? r.survey.statedNeed.count : r.survey.experienced.count}/${r.survey.basis === 'stated_need' ? r.survey.statedNeed.denominator : r.survey.experienced.denominator}${r.survey.basis === 'stated_need' ? ' wished' : ''}`}
                    />
                  ) : (
                    <span className="rx-small rx-muted">Not asked in survey</span>
                  )}
                </span>
                <span className="rx-hide-sm">
                  {r.public.denominator ? (
                    <ShareBar kind="public" pct={r.public.pct} label={`${r.public.count}/${r.public.denominator} · ${r.public.platforms.length} platform${r.public.platforms.length === 1 ? '' : 's'}`} />
                  ) : (
                    <span className="rx-small rx-muted">Awaiting AI analysis</span>
                  )}
                </span>
                <RelTag rel={r.relationship} />
                <span className="rx-hide-sm">
                  <StrengthTag strength={r.strength} />
                </span>
              </>
            }
          >
            <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p className="rx-small">{r.definition}</p>
                <p className="rx-small">
                  <strong>Why “{r.relationship.replace(/_/g, ' ')}”:</strong> {r.relationshipReason}
                </p>
                <p className="rx-small">
                  <strong>Strength:</strong> {r.strengthReason}
                </p>
                <p className="rx-small rx-muted">
                  Rank among problem themes: survey {r.surveyRank ?? 'n/a'} · public {r.publicRank ?? 'n/a'}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <SourcePill kind="survey">Google Forms evidence</SourcePill>
                  {r.survey.sources.length ? (
                    <ul className="rx-small" style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {r.survey.sources.map((s) => (
                        <li key={s.questionId + s.option}>
                          <span className="rx-num">{s.count}</span> chose “{s.option}” in “{s.wording.trim()}” <span className="rx-muted">({s.role === 'stated_need' ? 'stated wish' : 'experience'})</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="rx-small rx-muted">The survey did not ask about this, so it is absence of evidence, not evidence of absence.</p>
                  )}
                  {r.survey.measured && r.survey.basis === 'experienced' && r.survey.statedNeed.count ? (
                    <p className="rx-small rx-muted rx-num">
                      Separately, {r.survey.statedNeed.count}/{r.survey.statedNeed.denominator} ({r.survey.statedNeed.pct}%) said a related change would make them more comfortable continuing.
                    </p>
                  ) : null}
                  {r.survey.openText.map((o) => (
                    <p key={o.respondentCode} className="rx-small">
                      <SourcePill kind="ai">AI-coded open answer</SourcePill> {o.respondentCode}: “{o.quote}”
                    </p>
                  ))}
                  {r.survey.measured ? (
                    <p className="rx-small rx-muted">
                      Respondents: {(r.survey.basis === 'stated_need' ? r.survey.statedNeed.respondentCodes : r.survey.experienced.respondentCodes).join(', ') || 'none'}
                    </p>
                  ) : null}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <SourcePill kind="public">Public feedback evidence ({r.public.count})</SourcePill>
                {r.public.records.length === 0 ? <p className="rx-small rx-muted">No validly analysed public record was coded with this theme.</p> : null}
                {r.public.records.slice(0, 6).map((rec) => (
                  <div key={rec.evidenceId} className="rx-record">
                    <div className="rx-record-meta">
                      <span>{platformLabel(rec.platform)}</span>
                      {rec.firstPerson ? <span>· first-person</span> : <span>· not first-person</span>}
                      <SourceLink href={rec.sourceUrl} />
                    </div>
                    <div className="rx-quote">“{rec.quote}”</div>
                  </div>
                ))}
                {r.public.records.length > 6 ? <p className="rx-small rx-muted">+{r.public.records.length - 6} more records in the Opportunity trace and AI analysis pages.</p> : null}
              </div>
            </div>
          </Accordion>
        ))}
        {visible.length === 0 ? <p className="rx-panel-pad rx-small rx-muted">No themes match this filter.</p> : null}
      </div>
    </div>
  );
}
