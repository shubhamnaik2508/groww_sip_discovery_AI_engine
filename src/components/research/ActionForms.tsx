'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { importSurveyAction, runPublicAnalysisAction, runSurveyTextAnalysisAction, runSynthesisAction } from '@/app/research-actions';
import { SlidingTabs, SuccessCheck, TextSwap, useErrorShake } from '@/components/motion';
import type { LiveProvider, ProviderOption } from '@/services/ai/llm';
import { IconSpark, IconUpload } from '@/components/icons';

function PasscodeField({ value, onChange, wrapRef, inputRef, onClear }: { value: string; onChange: (v: string) => void; wrapRef: React.RefObject<HTMLDivElement | null>; inputRef: React.RefObject<HTMLDivElement | null>; onClear: () => void }) {
  return (
    <div className="t-input-wrap rx-field" ref={wrapRef}>
      <label htmlFor="rx-passcode">Research passcode</label>
      <div className="t-input" ref={inputRef}>
        <input
          id="rx-passcode"
          type="password"
          autoComplete="off"
          value={value}
          onChange={(e) => {
            onClear();
            onChange(e.target.value);
          }}
          style={{ width: '100%' }}
        />
      </div>
    </div>
  );
}

type Status = { state: 'idle' | 'running' | 'done' | 'error'; text: string };

function StatusLine({ status }: { status: Status }) {
  return (
    <div className="rx-status" data-state={status.state} role="status">
      {status.state === 'done' ? <SuccessCheck show /> : <span className="rx-pulse" aria-hidden="true" />}
      <TextSwap text={status.text} />
    </div>
  );
}

export function SurveyImportForm({ needsPasscode }: { needsPasscode: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [passcode, setPasscode] = useState('');
  const [status, setStatus] = useState<Status>({ state: 'idle', text: 'Waiting for a CSV export' });
  const { wrapRef, inputRef, trigger: shakeTrigger, clear: shakeClear } = useErrorShake();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="rx-panel rx-panel-pad"
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set('passcode', passcode);
        setError(null);
        setStatus({ state: 'running', text: 'Parsing export and removing personal identifiers…' });
        start(async () => {
          const r = await importSurveyAction(fd);
          if (!r.ok) {
            setError(r.error);
            setStatus({ state: 'error', text: 'Import failed' });
            if (/passcode/i.test(r.error)) shakeTrigger();
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
        <div className="rx-field">
          <label htmlFor="rx-survey-file">CSV file</label>
          <input id="rx-survey-file" name="file" type="file" accept=".csv,text/csv" required />
        </div>
        {needsPasscode ? <PasscodeField value={passcode} onChange={setPasscode} wrapRef={wrapRef} inputRef={inputRef} onClear={shakeClear} /> : null}
        <button className="btn btn-primary" type="submit" disabled={pending} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <IconUpload size={15} /> {pending ? 'Importing…' : 'Import survey'}
        </button>
      </div>
      <StatusLine status={status} />
      {error ? <p className="t-error-msg" style={{ opacity: 1, visibility: 'visible' }}>{error}</p> : null}
    </form>
  );
}

/**
 * Lets the person running an analysis choose the model provider. Only providers with a
 * server-side key are selectable; Gemini is pre-selected whenever it is available.
 */
export function ProviderPicker({ providers, value, onChange }: { providers: ProviderOption[]; value: LiveProvider | null; onChange: (p: LiveProvider) => void }) {
  const available = providers.filter((p) => p.configured);
  const missing = providers.filter((p) => !p.configured);
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
      <span className="rx-small rx-muted">
        {current.model}
        {missing.length ? ` · ${missing.map((m) => m.label).join(', ')} unavailable (no key on this server)` : ''}
      </span>
    </div>
  );
}

function defaultProvider(providers: ProviderOption[]): LiveProvider | null {
  return providers.find((p) => p.id === 'gemini' && p.configured)?.id ?? providers.find((p) => p.configured)?.id ?? null;
}

export function RunAnalysisPanel({ needsPasscode, providers, pendingCount }: { needsPasscode: boolean; providers: ProviderOption[]; pendingCount: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [passcode, setPasscode] = useState('');
  const [provider, setProvider] = useState<LiveProvider | null>(defaultProvider(providers));
  const [status, setStatus] = useState<Status>({
    state: 'idle',
    text: pendingCount ? `${pendingCount} eligible record(s) awaiting analysis` : 'Every eligible record has a valid analysis',
  });
  const [error, setError] = useState<string | null>(null);
  const { wrapRef, inputRef, trigger: shakeTrigger, clear: shakeClear } = useErrorShake();
  const liveAvailable = provider !== null;
  return (
    <div className="rx-panel rx-panel-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <h3 style={{ fontSize: 15 }}>Run live AI analysis</h3>
        <p className="rx-small rx-muted" style={{ marginTop: 4 }}>
          Sends up to 5 unanalysed public records to the model you choose. Each output is schema-validated and every quote is checked against the source text before it can count. The provider and model are stored with every result.
        </p>
      </div>
      {!liveAvailable ? (
        <p className="rx-small" style={{ color: 'var(--rx-warn)' }}>No AI key is configured on this server, so live runs are disabled. The stored runs below are real model outputs.</p>
      ) : (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <ProviderPicker providers={providers} value={provider} onChange={setProvider} />
          {needsPasscode ? <PasscodeField value={passcode} onChange={setPasscode} wrapRef={wrapRef} inputRef={inputRef} onClear={shakeClear} /> : null}
          <button
            className="btn btn-primary"
            type="button"
            disabled={pending || pendingCount === 0}
            style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
            onClick={() => {
              setError(null);
              setStatus({ state: 'running', text: `Sending records to ${provider === 'groq' ? 'Groq' : 'Gemini'}…` });
              start(async () => {
                const r = await runPublicAnalysisAction({ passcode, limit: 5, provider: provider ?? undefined });
                if (!r.ok) {
                  setError(r.error);
                  setStatus({ state: 'error', text: 'Run failed' });
                  if (/passcode/i.test(r.error)) shakeTrigger();
                  return;
                }
                setStatus({
                  state: 'done',
                  text: r.data.analysed ? `${r.data.valid} valid, ${r.data.failed} failed (${r.data.model}) · ${r.data.remaining} remaining` : 'Nothing left to analyse',
                });
                router.refresh();
              });
            }}
          >
            <IconSpark size={15} /> {pending ? 'Analysing…' : 'Analyse next 5'}
          </button>
        </div>
      )}
      <StatusLine status={status} />
      {error ? <p className="t-error-msg" style={{ opacity: 1, visibility: 'visible' }}>{error}</p> : null}
    </div>
  );
}

export function RunAiButton({ kind, needsPasscode, providers, label }: { kind: 'synthesis' | 'survey_text'; needsPasscode: boolean; providers: ProviderOption[]; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [passcode, setPasscode] = useState('');
  const [provider, setProvider] = useState<LiveProvider | null>(defaultProvider(providers));
  const [status, setStatus] = useState<Status | null>(null);
  const { wrapRef, inputRef, trigger: shakeTrigger, clear: shakeClear } = useErrorShake();
  if (!provider) return null;
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <ProviderPicker providers={providers} value={provider} onChange={setProvider} />
      {needsPasscode ? <PasscodeField value={passcode} onChange={setPasscode} wrapRef={wrapRef} inputRef={inputRef} onClear={shakeClear} /> : null}
      <button
        type="button"
        className="btn btn-secondary"
        disabled={pending}
        style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
        onClick={() => {
          setStatus({ state: 'running', text: `Waiting for ${provider === 'groq' ? 'Groq' : 'Gemini'}…` });
          start(async () => {
            const input = { passcode, provider };
            const r = kind === 'synthesis' ? await runSynthesisAction(input) : await runSurveyTextAnalysisAction(input);
            if (!r.ok) {
              setStatus({ state: 'error', text: r.error });
              if (/passcode/i.test(r.error)) shakeTrigger();
              return;
            }
            setStatus({ state: 'done', text: 'Done. Stored with provider, model and timestamp.' });
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
