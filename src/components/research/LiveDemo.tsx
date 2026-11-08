'use client';

import React, { useState, useTransition } from 'react';
import { runDemoAnalysisAction, runDemoSynthesisAction, LiveSynthesis } from '@/app/demo-actions';
import type { DemoStatus } from '@/services/demo/guard';
import type { LiveDemoResult } from '@/services/demo/demo';
import type { LiveProvider, ProviderOption } from '@/services/ai/llm';
import { PanelReveal, SlidingTabs, SubtleNumber, SuccessCheck, TextSwap } from '@/components/motion';
import { IconSpark } from '@/components/icons';
import { codeLabel } from '@/lib/research/codebook';
import { HighlightedText, SourceLink, SourcePill, platformLabel } from './ui';

export interface DemoRecordView {
  id: string;
  platform: string;
  sourceUrl: string;
  originalText: string;
  stored: { model: string; analysedAt: string; codes: Array<{ code: string; quote: string }>; themeName: string | null; status: string } | null;
}

type RunState = { state: 'idle' | 'running' | 'done' | 'error'; text: string };

function Allowance({ status }: { status: DemoStatus }) {
  if (!status.available) return <span className="rx-small rx-muted">{status.message ?? 'Live AI is unavailable right now.'} Stored results below are complete.</span>;
  return (
    <span className="rx-small rx-muted rx-num">
      Shared allowance today: <SubtleNumber value={status.callsRemainingToday ?? 0} /> of {status.limits.dailyCalls} AI calls left · you can run{' '}
      <SubtleNumber value={Math.min(status.visitorRemainingToday ?? 0, status.callsRemainingToday ?? 0)} /> more today
    </span>
  );
}

function Picker({ providers, value, onChange }: { providers: ProviderOption[]; value: LiveProvider; onChange: (p: LiveProvider) => void }) {
  const available = providers.filter((p) => p.configured);
  if (available.length < 2) return <span className="rx-small"><strong>{available[0]?.label ?? 'Gemini'}</strong> · {available[0]?.model}</span>;
  return <SlidingTabs label="AI model" options={available.map((p) => ({ value: p.id, label: p.label }))} value={value} onChange={onChange} />;
}

function defaultProvider(providers: ProviderOption[]): LiveProvider {
  return providers.find((p) => p.id === 'gemini' && p.configured)?.id ?? providers.find((p) => p.configured)?.id ?? 'gemini';
}

/** Live AI analysis on the controlled demo set. Results stay in this browser tab only. */
export function LiveAnalysisDemo({ records, providers, initialStatus }: { records: DemoRecordView[]; providers: ProviderOption[]; initialStatus: DemoStatus }) {
  const [status, setStatus] = useState(initialStatus);
  const [selected, setSelected] = useState<string[]>(records.slice(0, 2).map((r) => r.id));
  const [provider, setProvider] = useState<LiveProvider>(defaultProvider(providers));
  const [results, setResults] = useState<LiveDemoResult[]>([]);
  const [run, setRun] = useState<RunState>({ state: 'idle', text: 'Choose up to 3 records, then run live analysis' });
  const [pending, start] = useTransition();
  const max = status.limits.maxRecordsPerRun;

  return (
    <div className="rx-panel rx-panel-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ fontSize: 16 }}>Try the AI analysis live</h3>
          <p className="rx-small rx-muted" style={{ marginTop: 4, maxWidth: '72ch', lineHeight: 1.5 }}>
            Re-run the same model, prompt and grounding checks on genuine records from the demo set, then compare with the stored official result. Live results are not saved and never change the research record.
          </p>
        </div>
        <SourcePill kind="ai">Live · not saved</SourcePill>
      </div>

      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }} role="group" aria-label="Demo records">
        {records.map((r) => {
          const on = selected.includes(r.id);
          return (
            <label key={r.id} className="rx-opp" aria-pressed={on} style={{ cursor: 'pointer', padding: '10px 12px' }}>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!on && selected.length >= max}
                  onChange={(e) => setSelected((s) => (e.target.checked ? [...s, r.id] : s.filter((x) => x !== r.id)))}
                />
                <span className="rx-small rx-muted">{platformLabel(r.platform)}</span>
              </span>
              <span className="rx-small" style={{ fontFamily: 'var(--font-serif)', fontSize: 14, lineHeight: 1.45 }}>
                “{r.originalText.length > 150 ? `${r.originalText.slice(0, 150)}…` : r.originalText}”
              </span>
            </label>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <Picker providers={providers} value={provider} onChange={setProvider} />
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending || !status.available || selected.length === 0}
          style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
          onClick={() => {
            setRun({ state: 'running', text: `Analysing ${selected.length} record${selected.length > 1 ? 's' : ''} live…` });
            start(async () => {
              const r = await runDemoAnalysisAction({ recordIds: selected, provider });
              if (!r.ok) {
                setRun({ state: 'error', text: r.error });
                return;
              }
              setResults(r.data.results);
              setStatus(r.data.status);
              const ok = r.data.results.filter((x) => x.status === 'valid').length;
              setRun({ state: 'done', text: `${ok} of ${r.data.results.length} passed the grounding checks` });
            });
          }}
        >
          <IconSpark size={15} /> {pending ? 'Running…' : `Run live analysis (${selected.length})`}
        </button>
        <div className="rx-status" data-state={run.state} role="status">
          {run.state === 'done' ? <SuccessCheck show /> : <span className="rx-pulse" aria-hidden="true" />}
          <TextSwap text={run.text} />
        </div>
      </div>
      <Allowance status={status} />

      {results.length ? (
        <PanelReveal open key={results.map((r) => r.generatedAt).join()}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {results.map((res) => {
              const rec = records.find((r) => r.id === res.evidenceId)!;
              return (
                <div key={res.evidenceId} className="rx-record">
                  <div className="rx-record-meta">
                    <SourcePill kind="public">{platformLabel(rec.platform)}</SourcePill>
                    <SourceLink href={rec.sourceUrl} />
                  </div>
                  <div className="rx-quote">
                    <HighlightedText text={rec.originalText} quotes={res.codes.map((c) => c.quote)} />
                  </div>
                  <div className="rx-grid rx-grid-2">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <SourcePill kind="ai">Live result · not saved</SourcePill>
                      <span className="rx-small rx-muted">
                        {res.model || res.provider} · {new Date(res.generatedAt).toLocaleTimeString('en-IN')} · {(res.latencyMs / 1000).toFixed(1)}s{res.totalTokens ? ` · ${res.totalTokens.toLocaleString('en-IN')} tokens` : ''}
                      </span>
                      {res.status === 'valid' ? (
                        <>
                          <span className="rx-small"><strong>Themes:</strong> {res.codes.length ? res.codes.map((c) => codeLabel(c.code)).join(', ') : 'none'}</span>
                          <span className="rx-small"><strong>Theme name:</strong> {res.themeName ?? 'abstained'}</span>
                          {res.uncertainty ? <span className="rx-small rx-muted">{res.uncertainty}</span> : null}
                        </>
                      ) : (
                        <span className="rx-small" style={{ color: 'var(--rx-warn)' }}>
                          {res.status === 'error' ? res.messages[0] : 'Held back by the quality guard: a cited quote was not verbatim in the source, so this output would not count.'}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <SourcePill kind="neutral">Stored official result</SourcePill>
                      {rec.stored ? (
                        <>
                          <span className="rx-small rx-muted">{rec.stored.model} · {rec.stored.analysedAt.slice(0, 10)}</span>
                          <span className="rx-small"><strong>Themes:</strong> {rec.stored.codes.length ? rec.stored.codes.map((c) => codeLabel(c.code)).join(', ') : 'none'}</span>
                          <span className="rx-small"><strong>Theme name:</strong> {rec.stored.themeName ?? 'abstained'}</span>
                        </>
                      ) : (
                        <span className="rx-small rx-muted">No stored result for this record.</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </PanelReveal>
      ) : null}
    </div>
  );
}

/** Generates a fresh synthesis live from the current matrix. Not saved. */
export function LiveSynthesisDemo({ providers, initialStatus }: { providers: ProviderOption[]; initialStatus: DemoStatus }) {
  const [status, setStatus] = useState(initialStatus);
  const [provider, setProvider] = useState<LiveProvider>(defaultProvider(providers));
  const [result, setResult] = useState<LiveSynthesis | null>(null);
  const [run, setRun] = useState<RunState>({ state: 'idle', text: 'Generate a fresh synthesis from the matrix above' });
  const [pending, start] = useTransition();
  return (
    <div className="rx-panel rx-panel-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <SourcePill kind="ai">Live · not saved</SourcePill>
        <Picker providers={providers} value={provider} onChange={setProvider} />
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending || !status.available}
          style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
          onClick={() => {
            setRun({ state: 'running', text: 'Generating a fresh synthesis…' });
            start(async () => {
              const r = await runDemoSynthesisAction({ provider });
              if (!r.ok) {
                setRun({ state: 'error', text: r.error });
                return;
              }
              setResult(r.data.synthesis);
              setStatus(r.data.status);
              setRun({ state: 'done', text: r.data.synthesis.status === 'valid' ? 'Fresh synthesis ready (passed the evidence guard)' : 'Fresh synthesis ready (guard flagged some citations)' });
            });
          }}
        >
          <IconSpark size={15} /> {pending ? 'Generating…' : 'Generate fresh synthesis'}
        </button>
        <div className="rx-status" data-state={run.state} role="status">
          {run.state === 'done' ? <SuccessCheck show /> : <span className="rx-pulse" aria-hidden="true" />}
          <TextSwap text={run.text} />
        </div>
      </div>
      <Allowance status={status} />
      {result?.output ? (
        <PanelReveal open key={result.generatedAt}>
          <div className="rx-callout rx-callout-ai" style={{ flexDirection: 'column', gap: 8 }}>
            <span className="rx-small">
              {result.model} · {new Date(result.generatedAt).toLocaleTimeString('en-IN')} · live, not saved
            </span>
            <p><strong>Strongest findings:</strong> {result.output.strongestFindings.map((s) => s.statement).join(' ')}</p>
            <p><strong>Life-to-SIP:</strong> {result.output.lifeToSipAssessment}</p>
            <p><strong>MARKET PULSE:</strong> {result.output.marketPulseAssessment}</p>
            <p><strong>New opportunities:</strong> {result.output.newOpportunities.map((s) => s.statement).join(' ')}</p>
          </div>
        </PanelReveal>
      ) : null}
    </div>
  );
}
