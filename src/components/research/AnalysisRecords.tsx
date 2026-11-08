'use client';

import React, { useMemo, useState } from 'react';
import { Accordion, SlidingTabs, SubtleNumber } from '@/components/motion';
import { HighlightedText, SourceLink, SourcePill, platformLabel } from './ui';
import { codeLabel } from '@/lib/research/codebook';

export interface AnalysisRecordView {
  id: string;
  platform: string;
  sourceUrl: string;
  title: string | null;
  originalText: string;
  publishedAt: string | null;
  collectionMethod: string | null;
  eligible: boolean;
  exclusionReason: string | null;
  analysis: null | {
    id: string;
    status: string;
    errors: string[];
    model: string;
    analysedAt: string;
    parsed: Record<string, unknown> | null;
    codes: Array<{ code: string; quote: string }>;
    signals: Array<{ signal: string; quote: string }>;
    firstPerson: boolean | null;
    themeName: string | null;
    raw?: string;
  };
}

type Filter = 'all' | 'valid' | 'failed' | 'pending' | 'excluded';

const FIELDS: Array<[string, string, string?]> = [
  ['statedMotivation', 'Investor motivation', 'motivationEvidence'],
  ['statedExpectation', 'SIP expectation', 'expectationEvidence'],
  ['continuationStatusReason', 'Behaviour / pause–stop trigger', 'continuationEvidence'],
  ['cashFlowConflict', 'Financial stressor', 'cashFlowEvidence'],
  ['paymentTransactionIssue', 'Payment / mandate issue', 'paymentIssueEvidence'],
  ['confidenceConcern', 'Confusion or low confidence', 'confidenceEvidence'],
  ['existingWorkaround', 'Help sought outside the app', 'workaroundEvidence'],
  ['potentialUnmetNeed', 'Unmet need', 'unmetNeedEvidence'],
  ['triggerOrContext', 'Market or life context'],
  ['emotionalSignal', 'Emotional signal'],
];

function val(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

export function AnalysisRecords({ records }: { records: AnalysisRecordView[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records.filter((r) => {
      const status = !r.eligible ? 'excluded' : !r.analysis ? 'pending' : r.analysis.status === 'valid' ? 'valid' : 'failed';
      if (filter !== 'all' && filter !== status) return false;
      return !q || r.originalText.toLowerCase().includes(q) || (r.title ?? '').toLowerCase().includes(q) || r.platform.includes(q);
    });
  }, [records, filter, query]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <SlidingTabs
          label="Filter by analysis status"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'valid', label: 'Valid' },
            { value: 'failed', label: 'Failed checks' },
            { value: 'pending', label: 'Not analysed' },
            { value: 'excluded', label: 'Excluded' },
          ]}
        />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input type="search" placeholder="Search text, title or platform" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search records" style={{ minWidth: 240 }} />
          <span className="rx-small rx-muted rx-num">
            <SubtleNumber value={visible.length} /> shown
          </span>
        </div>
      </div>
      <div className="rx-panel">
        {visible.map((r) => {
          const a = r.analysis;
          const p = a?.parsed ?? {};
          const quotes = [...(a?.codes.map((c) => c.quote) ?? []), ...(a?.signals.map((s) => s.quote) ?? []), val(p.evidenceExcerpt)].filter(Boolean) as string[];
          return (
            <Accordion
              key={r.id}
              id={`rec-${r.id}`}
              className="rx-acc"
              head={
                <>
                  <span style={{ gridColumn: 'span 2', minWidth: 0 }}>
                    <span className="rx-small rx-muted">{platformLabel(r.platform)} · </span>
                    <span style={{ fontWeight: 600 }}>{r.title ?? r.originalText.slice(0, 90)}</span>
                  </span>
                  <span className="rx-small rx-hide-sm" style={{ minWidth: 0 }}>
                    {a?.codes.length ? a.codes.map((c) => codeLabel(c.code)).join(', ') : a ? <span className="rx-muted">no codebook theme</span> : null}
                  </span>
                  <span>
                    {!r.eligible ? (
                      <SourcePill kind="neutral">Excluded</SourcePill>
                    ) : !a ? (
                      <SourcePill kind="neutral">Not analysed</SourcePill>
                    ) : a.status === 'valid' ? (
                      <SourcePill kind="public">Valid</SourcePill>
                    ) : (
                      <SourcePill kind="warn">{a.status === 'guard_failed' ? 'Failed grounding check' : 'Invalid output'}</SourcePill>
                    )}
                  </span>
                  <span className="rx-small rx-muted rx-hide-sm">{a ? (a.firstPerson ? 'first-person' : a.firstPerson === false ? 'not first-person' : '') : ''}</span>
                </>
              }
            >
              <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="rx-record-meta">
                    <SourcePill kind="public">Observation: original text</SourcePill>
                    {r.publishedAt ? <span>Published {r.publishedAt.slice(0, 10)}</span> : null}
                    <SourceLink href={r.sourceUrl} />
                  </div>
                  <div className="rx-quote" style={{ maxHeight: 340, overflowY: 'auto' }}>
                    <HighlightedText text={r.originalText} quotes={quotes} />
                  </div>
                  <p className="rx-small rx-muted">Collected: {r.collectionMethod ?? 'not recorded'}{r.exclusionReason ? ` · Excluded: ${r.exclusionReason}` : ''}</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {a ? (
                    <>
                      <div className="rx-record-meta">
                        <SourcePill kind="ai">AI extraction</SourcePill>
                        <span>{a.model} · {a.analysedAt.slice(0, 16).replace('T', ' ')}</span>
                      </div>
                      {a.status === 'valid' ? (
                        <dl className="rx-kv">
                          <dt>Theme</dt>
                          <dd>{a.themeName ?? <span className="rx-muted">abstained: {val(p.abstainReason) ?? 'no theme'}</span>}</dd>
                          <dt>Codebook themes</dt>
                          <dd>{a.codes.length ? a.codes.map((c) => `${codeLabel(c.code)} (“${c.quote}”)`).join('; ') : 'none'}</dd>
                          {a.signals.length ? (
                            <>
                              <dt>LifeFlow signals</dt>
                              <dd>{a.signals.map((s) => s.signal.replace(/_/g, ' ')).join(', ')}</dd>
                            </>
                          ) : null}
                          {FIELDS.map(([k, label, ev]) =>
                            val(p[k]) ? (
                              <React.Fragment key={k}>
                                <dt>{label}</dt>
                                <dd>
                                  {val(p[k])}
                                  {ev && val(p[ev]) ? <span className="rx-muted"> — “{val(p[ev])}”</span> : null}
                                </dd>
                              </React.Fragment>
                            ) : null,
                          )}
                          <dt>Characteristics</dt>
                          <dd>
                            {Object.entries((p.explicitlyStatedSegment as Record<string, unknown>) ?? {})
                              .filter(([, v]) => v && v !== 'unknown')
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(' · ') || 'unknown (not stated in the text)'}
                          </dd>
                          <dt>Uncertainty</dt>
                          <dd>{val(p.uncertaintyAnalysis)}</dd>
                          <dt>Model confidence</dt>
                          <dd>{val(p.selfReportedConfidence)} (self-reported, unvalidated)</dd>
                        </dl>
                      ) : null}
                      {a.errors.length ? (
                        <div className="rx-small" style={{ color: a.status === 'valid' ? 'var(--text-muted)' : 'var(--rx-warn)' }}>
                          <strong>{a.status === 'valid' ? 'Notes' : 'Why it failed'}:</strong>
                          <ul style={{ paddingLeft: 18 }}>
                            {a.errors.slice(0, 6).map((e, i) => (
                              <li key={i}>{e}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {a.raw ? (
                        <details className="rx-details">
                          <summary>Raw model output (unmodified)</summary>
                          <pre>{a.raw}</pre>
                        </details>
                      ) : null}
                    </>
                  ) : (
                    <p className="rx-small rx-muted">{r.eligible ? 'This record has not been analysed yet.' : 'Excluded records are never analysed or counted.'}</p>
                  )}
                </div>
              </div>
            </Accordion>
          );
        })}
        {visible.length === 0 ? <p className="rx-panel-pad rx-small rx-muted">No records match.</p> : null}
      </div>
    </div>
  );
}
