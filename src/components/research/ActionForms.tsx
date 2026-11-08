'use client';

/**
 * Researcher controls for the private workspace: replacing the survey and running official
 * (saved) AI analyses. Pages render these only when the server allows changes
 * (access.ts); the server actions enforce the same rule independently.
 */
import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { importSurveyAction, runPublicAnalysisAction, runSurveyTextAnalysisAction, runSynthesisAction } from '@/app/research-actions';
import { SlidingTabs, SuccessCheck, TextSwap, useErrorShake } from '@/components/motion';
import type { LiveProvider, ProviderOption } from '@/services/ai/llm';
import { IconSpark, IconUpload } from '@/components/icons';

type Status = { state: 'idle' | 'running' | 'done' | 'error'; text: string };

function StatusLine({ status }: { status: Status }) {
  return (
    <div className="rx-status" data-state={status.state} role="status">
      {status.state === 'done' ? <SuccessCheck show /> : <span className="rx-pulse" aria-hidden="true" />}
      <TextSwap text={status.text} />
    </div>
  );
}

export function SurveyImportForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<Status>({ state: 'idle', text: 'Waiting for a CSV export' });
  const { wrapRef, inputRef, trigger: shakeTrigger } = useErrorShake();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="rx-panel rx-panel-pad"
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        setStatus({ state: 'running', text: 'Parsing export and removing personal identifiers…' });
        start(async () => {
          const r = await importSurveyAction(fd);
          if (!r.ok) {
            setError(r.error);
            setStatus({ state: 'error', text: 'Import failed' });
            shakeTrigger();
            return;
          }
          setStatus({
            state: 'done',
            text: `${r.data.created ? 'Imported' : 'Already imported; re-activated'} ${r.data.respondents} responses${r.data.excludedColumns.length ? ` · removed ${r.data.excludedColumns.length} identifying column(s)` : ''}`,
          });
          router.refresh();
        });
      }}
    >
      <div>
        <h3 style={{ fontSize: 15 }}>Import or replace the Google Forms export</h3>
        <p className="rx-small rx-muted" style={{ marginTop: 4 }}>
          Upload the CSV from Google Sheets (File → Download → CSV). Name, email and phone columns are dropped before anything is stored. Statistics recalculate from the new file.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="t-input-wrap rx-field" ref={wrapRef}>
          <label htmlFor="rx-survey-file">CSV file</label>
          <div className="t-input" ref={inputRef}>
            <input id="rx-survey-file" name="file" type="file" accept=".csv,text/csv" required />
          </div>
        </div>
        <button className="btn btn-primary" type="submit" disabled={pending} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <IconUpload size={15} /> {pending ? 'Importing…' : 'Import survey'}
        </button>
      </div>
      <StatusLine status={status} />
      {error ? <p className="t-error-msg" style={{ opacity: 1, visibility: 'visible' }}>{error}</p> : null}
    </form>
  );
}

/** Model choice for official runs; Gemini is pre-selected whenever it is configured. */
export function ProviderPicker({ providers, value, onChange }: { providers: ProviderOption[]; value: LiveProvider | null; onChange: (p: LiveProvider) => void }) {
  const available = providers.filter((p) => p.configured);
  if (!available.length) return null;
  const current = available.find((p) => p.id === value) ?? available[0];
  return (
    <div className="rx-field">
      <span style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: 12.5 }}>AI model</span>
      {available.length > 1 ? (
        <SlidingTabs label="AI provider" options={available.map((p) => ({ value: p.id, label: p.label }))} value={current.id} onChange={onChange} />
      ) : (
        <span className="rx-small" style={{ fontWeight: 600 }}>{current.label}</span>
      )}
      <span className="rx-small rx-muted">{current.model}</span>
    </div>
  );
}

function defaultProvider(providers: ProviderOption[]): LiveProvider | null {
  return providers.find((p) => p.id === 'gemini' && p.configured)?.id ?? providers.find((p) => p.configured)?.id ?? null;
}

/** Official, saved analysis of unanalysed records (private workspace). */
export function RunAnalysisPanel({ providers, pendingCount }: { providers: ProviderOption[]; pendingCount: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [provider, setProvider] = useState<LiveProvider | null>(defaultProvider(providers));
  const [status, setStatus] = useState<Status>({
    state: 'idle',
    text: pendingCount ? `${pendingCount} eligible record(s) awaiting analysis` : 'Every eligible record has a valid analysis',
  });
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="rx-panel rx-panel-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <h3 style={{ fontSize: 15 }}>Researcher: run official analysis</h3>
        <p className="rx-small rx-muted" style={{ marginTop: 4 }}>
          Analyses up to 5 unanalysed records and saves them to the research record with provider, model and timestamp. Available in the private workspace only.
        </p>
      </div>
      {provider ? (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <ProviderPicker providers={providers} value={provider} onChange={setProvider} />
          <button
            className="btn btn-primary"
            type="button"
            disabled={pending || pendingCount === 0}
            style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
            onClick={() => {
              setError(null);
              setStatus({ state: 'running', text: `Sending records to ${provider === 'groq' ? 'Groq' : 'Gemini'}…` });
              start(async () => {
                const r = await runPublicAnalysisAction({ limit: 5, provider });
                if (!r.ok) {
                  setError(r.error);
                  setStatus({ state: 'error', text: 'Run failed' });
                  return;
                }
                setStatus({ state: 'done', text: r.data.analysed ? `${r.data.valid} valid, ${r.data.failed} held back (${r.data.model}) · ${r.data.remaining} remaining` : 'Nothing left to analyse' });
                router.refresh();
              });
            }}
          >
            <IconSpark size={15} /> {pending ? 'Analysing…' : 'Analyse next 5'}
          </button>
        </div>
      ) : (
        <p className="rx-small rx-muted">Add GEMINI_API_KEY or GROQ_API_KEY to .env.local to run official analyses.</p>
      )}
      <StatusLine status={status} />
      {error ? <p className="t-error-msg" style={{ opacity: 1, visibility: 'visible' }}>{error}</p> : null}
    </div>
  );
}

/** Official, saved synthesis or survey coding (private workspace). */
export function RunAiButton({ kind, providers, label }: { kind: 'synthesis' | 'survey_text'; providers: ProviderOption[]; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [provider, setProvider] = useState<LiveProvider | null>(defaultProvider(providers));
  const [status, setStatus] = useState<Status | null>(null);
  if (!provider) return null;
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <ProviderPicker providers={providers} value={provider} onChange={setProvider} />
      <button
        type="button"
        className="btn btn-secondary"
        disabled={pending}
        style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
        onClick={() => {
          setStatus({ state: 'running', text: `Waiting for ${provider === 'groq' ? 'Groq' : 'Gemini'}…` });
          start(async () => {
            const r = kind === 'synthesis' ? await runSynthesisAction({ provider }) : await runSurveyTextAnalysisAction({ provider });
            if (!r.ok) {
              setStatus({ state: 'error', text: r.error });
              return;
            }
            setStatus({ state: 'done', text: 'Saved to the research record with provider, model and timestamp.' });
            router.refresh();
          });
        }}
      >
        <IconSpark size={15} /> {pending ? 'Running…' : label}
      </button>
      {status ? <StatusLine status={status} /> : null}
    </div>
  );
}
