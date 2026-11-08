'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { submitValidationAction } from '@/app/research-actions';
import { RESEARCH_CODES, codeLabel } from '@/lib/research/codebook';
import { Accordion, SuccessCheck, useErrorShake } from '@/components/motion';
import { HighlightedText, SourceLink, SourcePill, platformLabel } from './ui';

export interface ValidationItem {
  recordAnalysisId: string;
  evidenceId: string;
  platform: string;
  sourceUrl: string;
  originalText: string;
  model: string;
  aiCodes: Array<{ code: string; quote: string }>;
  aiTheme: string | null;
  aiFirstPerson: boolean | null;
  latestReview: null | { verdict: string; reviewer: string; createdAt: string; note: string | null; correctedCodes: string[] };
}

const VERDICTS = [
  { v: 'accurate', label: 'Accurate' },
  { v: 'partially_accurate', label: 'Partially accurate' },
  { v: 'inaccurate', label: 'Inaccurate' },
] as const;

function ReviewForm({ item }: { item: ValidationItem }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [verdict, setVerdict] = useState<(typeof VERDICTS)[number]['v'] | null>(null);
  const [codes, setCodes] = useState<string[]>(item.aiCodes.map((c) => c.code));
  const [note, setNote] = useState('');
  const [reviewer, setReviewer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const { wrapRef, inputRef, trigger: shakeTrigger } = useErrorShake();

  return (
    <form
      style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!verdict) {
          setError('Choose a verdict first.');
          shakeTrigger();
          return;
        }
        start(async () => {
          const r = await submitValidationAction({ recordAnalysisId: item.recordAnalysisId, verdict, correctedCodes: verdict === 'accurate' ? [] : codes, note, reviewer });
          if (!r.ok) {
            setError(r.error);
            shakeTrigger();
            return;
          }
          setSaved(true);
          router.refresh();
        });
      }}
    >
      <div className="rx-verdicts" role="group" aria-label="Verdict on the AI coding">
        {VERDICTS.map((v) => (
          <button key={v.v} type="button" className="rx-verdict" data-v={v.v} aria-pressed={verdict === v.v} onClick={() => setVerdict(v.v)}>
            {v.label}
          </button>
        ))}
      </div>
      {verdict && verdict !== 'accurate' ? (
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="rx-small" style={{ fontWeight: 600, marginBottom: 6 }}>Correct themes for this record (the AI output itself is kept unchanged)</legend>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
            {RESEARCH_CODES.map((c) => (
              <label key={c} className="rx-small" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={codes.includes(c)} onChange={(e) => setCodes((cs) => (e.target.checked ? [...cs, c] : cs.filter((x) => x !== c)))} />
                {codeLabel(c)}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className="t-input-wrap" ref={wrapRef} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="t-input" ref={inputRef} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="rx-field" style={{ flex: '1 1 260px' }}>
            <label htmlFor={`note-${item.recordAnalysisId}`}>What did the AI get wrong? {verdict === 'accurate' ? '(optional)' : ''}</label>
            <textarea id={`note-${item.recordAnalysisId}`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="rx-field">
            <label htmlFor={`rev-${item.recordAnalysisId}`}>Reviewer name</label>
            <input id={`rev-${item.recordAnalysisId}`} value={reviewer} onChange={(e) => setReviewer(e.target.value)} autoComplete="name" />
          </div>
          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save review'}
          </button>
          <SuccessCheck show={saved} />
        </div>
        <p className="t-error-msg" role="alert">{error ?? ' '}</p>
      </div>
    </form>
  );
}

/** `editable` is true only in the private workspace; the public site shows recorded verdicts read-only. */
export function ValidationWorkbench({ items, editable }: { items: ValidationItem[]; editable: boolean }) {
  return (
    <div className="rx-panel">
      {items.map((it, i) => (
        <Accordion
          key={it.recordAnalysisId}
          id={`val-${it.recordAnalysisId}`}
          className="rx-acc"
          head={
            <>
              <span style={{ gridColumn: 'span 2', minWidth: 0 }}>
                <span className="rx-muted rx-mono" style={{ marginRight: 8 }}>#{String(i + 1).padStart(2, '0')}</span>
                <span className="rx-small rx-muted">{platformLabel(it.platform)} · </span>
                {it.originalText.slice(0, 80)}…
              </span>
              <span className="rx-small rx-hide-sm">{it.aiCodes.map((c) => codeLabel(c.code)).join(', ') || 'no theme'}</span>
              <span>
                {it.latestReview ? (
                  <SourcePill kind={it.latestReview.verdict === 'accurate' ? 'public' : it.latestReview.verdict === 'inaccurate' ? 'warn' : 'survey'}>
                    {VERDICTS.find((v) => v.v === it.latestReview!.verdict)?.label}
                  </SourcePill>
                ) : (
                  <SourcePill kind="neutral">Pending</SourcePill>
                )}
              </span>
              <span className="rx-small rx-muted rx-hide-sm">{it.latestReview?.reviewer ?? ''}</span>
            </>
          }
        >
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="rx-record-meta">
                <SourcePill kind="public">Original text</SourcePill>
                <SourceLink href={it.sourceUrl} />
              </div>
              <div className="rx-quote" style={{ maxHeight: 300, overflowY: 'auto' }}>
                <HighlightedText text={it.originalText} quotes={it.aiCodes.map((c) => c.quote)} />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="rx-record-meta">
                <SourcePill kind="ai">AI classification (unchanged)</SourcePill>
                <span>{it.model}</span>
              </div>
              <dl className="rx-kv">
                <dt>Theme</dt>
                <dd>{it.aiTheme ?? 'abstained'}</dd>
                <dt>First-person</dt>
                <dd>{it.aiFirstPerson === null ? 'not stated' : it.aiFirstPerson ? 'yes' : 'no'}</dd>
                <dt>Codebook themes</dt>
                <dd>
                  {it.aiCodes.length ? (
                    <ul style={{ paddingLeft: 16 }}>
                      {it.aiCodes.map((c) => (
                        <li key={c.code}>
                          {codeLabel(c.code)}: <span className="rx-muted">“{c.quote}”</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    'none'
                  )}
                </dd>
              </dl>
              {it.latestReview ? (
                <p className="rx-small rx-muted">
                  Last review by {it.latestReview.reviewer} on {it.latestReview.createdAt.slice(0, 10)}
                  {it.latestReview.note ? `: “${it.latestReview.note}”` : ''}
                  {it.latestReview.correctedCodes.length ? ` · corrected themes: ${it.latestReview.correctedCodes.map(codeLabel).join(', ')}` : ''}
                </p>
              ) : null}
              {editable ? <ReviewForm item={it} /> : null}
            </div>
          </div>
        </Accordion>
      ))}
    </div>
  );
}
