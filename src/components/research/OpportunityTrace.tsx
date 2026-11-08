'use client';

import React, { useMemo, useState } from 'react';
import type { CodeRow, OpportunityRow } from '@/lib/research/triangulation';
import { PanelReveal, SlidingTabs } from '@/components/motion';
import { HighlightedText, RelTag, SourceLink, SourcePill, StrengthTag, platformLabel } from './ui';

export interface TraceRecord {
  id: string;
  platform: string;
  sourceUrl: string;
  title: string | null;
  originalText: string;
  publishedAt: string | null;
  model: string;
}

export function OpportunityTrace({ opportunities, rows, records }: { opportunities: OpportunityRow[]; rows: CodeRow[]; records: Record<string, TraceRecord> }) {
  const [oppId, setOppId] = useState(opportunities[0]?.id);
  const opp = opportunities.find((o) => o.id === oppId) ?? opportunities[0];
  const themes = useMemo(() => rows.filter((r) => opp?.codes.includes(r.code)), [rows, opp]);
  const [themeCode, setThemeCode] = useState<string>('');
  const theme = themes.find((t) => t.code === themeCode) ?? themes[0];
  const [recordId, setRecordId] = useState<string | null>(null);
  const [interacted, setInteracted] = useState(false);
  const record = recordId ? records[recordId] : null;
  const recordQuotes = theme?.public.records.filter((r) => r.evidenceId === recordId).map((r) => r.quote) ?? [];

  if (!opp) return null;
  return (
    <div className="rx-trace">
      <div className="rx-opp-list" role="group" aria-label="Choose an opportunity to trace">
        {opportunities.map((o) => (
          <button
            key={o.id}
            type="button"
            className="rx-opp"
            aria-pressed={o.id === opp.id}
            onClick={() => {
              setInteracted(true);
              setOppId(o.id);
              setThemeCode('');
              setRecordId(null);
            }}
          >
            <span className="rx-small rx-muted rx-num">
              Rank #{o.rank} · score {o.score}
            </span>
            <strong style={{ fontSize: 14 }}>{o.title}</strong>
            {o.existingConcept ? <span className="rx-small" style={{ color: 'var(--rx-ai)', fontWeight: 600 }}>Existing concept: {o.existingConcept}</span> : null}
            <span className="rx-small rx-num" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--rx-survey)' }}>
                Survey {o.surveyRespondents.count}/{o.surveyRespondents.denominator}
              </span>
              <span style={{ color: 'var(--rx-public)' }}>
                Public {o.publicRecords.count}/{o.publicRecords.denominator}
              </span>
            </span>
          </button>
        ))}
      </div>

      <PanelReveal open appear={interacted} key={opp.id}>
        <div className="rx-panel rx-panel-pad rx-chain" aria-live="polite">
          <div className="rx-chain-step">
            <span className="rx-chain-node"><span /></span>
            <div className="rx-chain-label">Opportunity</div>
            <h3 style={{ fontSize: 17 }}>{opp.title}</h3>
            <p className="rx-small" style={{ marginTop: 4, maxWidth: '75ch', lineHeight: 1.5 }}>{opp.problemStatement}</p>
            <p className="rx-small rx-muted" style={{ marginTop: 6 }}>{opp.verdict}</p>
          </div>

          <div className="rx-chain-step">
            <span className="rx-chain-node"><span /></span>
            <div className="rx-chain-label">Supporting themes</div>
            {themes.length > 1 ? (
              <SlidingTabs
                label="Supporting themes"
                options={themes.map((t) => ({ value: t.code, label: t.label }))}
                value={theme?.code ?? ''}
                onChange={(v) => {
                  setThemeCode(v);
                  setRecordId(null);
                }}
              />
            ) : null}
            {theme ? (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
                <strong>{theme.label}</strong>
                <RelTag rel={theme.relationship} />
                <StrengthTag strength={theme.strength} />
                <span className="rx-small rx-muted">{theme.relationshipReason}</span>
              </div>
            ) : null}
          </div>

          {theme ? (
            <div className="rx-chain-step">
              <span className="rx-chain-node"><span /></span>
              <div className="rx-chain-label">Evidence from each source (separate denominators)</div>
              <div className="rx-grid rx-grid-2">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <SourcePill kind="survey">Google Forms survey</SourcePill>
                  {theme.survey.measured ? (
                    <>
                      <p className="rx-small rx-num">
                        <strong>
                          {theme.survey.basis === 'stated_need' ? theme.survey.statedNeed.count : theme.survey.experienced.count}/
                          {theme.survey.basis === 'stated_need' ? theme.survey.statedNeed.denominator : theme.survey.experienced.denominator}
                        </strong>{' '}
                        respondents ({theme.survey.primaryPct}%) {theme.survey.basis === 'stated_need' ? 'asked for this' : 'reported this'}
                      </p>
                      <ul className="rx-small" style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {theme.survey.sources.map((s) => (
                          <li key={s.questionId + s.option}>
                            <span className="rx-num">{s.count}</span> × “{s.option}”
                          </li>
                        ))}
                      </ul>
                      <p className="rx-small rx-muted">
                        Anonymised respondents: {(theme.survey.basis === 'stated_need' ? theme.survey.statedNeed.respondentCodes : theme.survey.experienced.respondentCodes).join(', ')}
                      </p>
                    </>
                  ) : (
                    <p className="rx-small rx-muted">Not asked in the survey (absence of evidence).</p>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <SourcePill kind="public">Public feedback</SourcePill>
                  <p className="rx-small rx-num">
                    <strong>
                      {theme.public.count}/{theme.public.denominator}
                    </strong>{' '}
                    analysed records ({theme.public.pct}%) across {theme.public.platforms.map(platformLabel).join(', ') || 'no platforms'}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
                    {theme.public.records.map((r) => (
                      <button
                        key={r.evidenceId}
                        type="button"
                        className="rx-opp"
                        aria-pressed={recordId === r.evidenceId}
                        onClick={() => {
                          setInteracted(true);
                          setRecordId(r.evidenceId);
                        }}
                        style={{ padding: '8px 10px' }}
                      >
                        <span className="rx-small rx-muted">{platformLabel(r.platform)}{r.firstPerson ? ' · first-person' : ''}</span>
                        <span className="rx-small" style={{ fontFamily: 'var(--font-serif)', fontSize: 14 }}>“{r.quote}”</span>
                      </button>
                    ))}
                    {theme.public.records.length === 0 ? <p className="rx-small rx-muted">No public record supports this theme yet.</p> : null}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="rx-chain-step">
            <span className="rx-chain-node"><span /></span>
            <div className="rx-chain-label">Original research record</div>
            {record ? (
              <PanelReveal open appear={interacted} key={record.id}>
                <div className="rx-record">
                  <div className="rx-record-meta">
                    <SourcePill kind="public">{platformLabel(record.platform)}</SourcePill>
                    {record.publishedAt ? <span>Published {record.publishedAt.slice(0, 10)}</span> : null}
                    <span>AI: {record.model}</span>
                    <SourceLink href={record.sourceUrl}>Open original</SourceLink>
                  </div>
                  {record.title ? <strong className="rx-small">{record.title}</strong> : null}
                  <div className="rx-quote" style={{ maxHeight: 280, overflowY: 'auto' }}>
                    <HighlightedText text={record.originalText} quotes={recordQuotes} />
                  </div>
                  <p className="rx-small rx-muted">Highlighted: the exact span the AI cited for this theme, verified as a verbatim substring before it was counted.</p>
                </div>
              </PanelReveal>
            ) : (
              <p className="rx-small rx-muted">Select a public quote above to open the full original record and its source link. Survey respondents are shown only by anonymised code.</p>
            )}
          </div>
        </div>
      </PanelReveal>
    </div>
  );
}
