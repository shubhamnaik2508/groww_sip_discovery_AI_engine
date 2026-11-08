'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { importSurveyAction, runPublicAnalysisAction, runSurveyTextAnalysisAction, runSynthesisAction } from '@/app/research-actions';
import { SuccessCheck, TextSwap, useErrorShake } from '@/components/motion';
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

export function RunAnalysisPanel({ needsPasscode, liveAvailable, pendingCount }: { needsPasscode: boolean; liveAvailable: boolean; pendingCount: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [passcode, setPasscode] = useState('');
  const [status, setStatus] = useState<Status>({
    state: 'idle',
    text: pendingCount ? `${pendingCount} eligible record(s) awaiting analysis` : 'Every eligible record has a valid analysis',
  });
  const [error, setError] = useState<string | null>(null);
  const { wrapRef, inputRef, trigger: shakeTrigger, clear: shakeClear } = useErrorShake();
  return (
    <div className="rx-panel rx-panel-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <h3 style={{ fontSize: 15 }}>Run live AI analysis</h3>
        <p className="rx-small rx-muted" style={{ marginTop: 4 }}>
          Sends up to 5 unanalysed public records to the configured model. Each output is schema-validated and every quote is checked against the source text before it can count.
        </p>
      </div>
      {!liveAvailable ? (
        <p className="rx-small" style={{ color: 'var(--rx-warn)' }}>No AI key is configured on this server, so live runs are disabled. The stored runs below are real model outputs.</p>
      ) : (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {needsPasscode ? <PasscodeField value={passcode} onChange={setPasscode} wrapRef={wrapRef} inputRef={inputRef} onClear={shakeClear} /> : null}
          <button
            className="btn btn-primary"
            type="button"
            disabled={pending || pendingCount === 0}
            style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
            onClick={() => {
              setError(null);
              setStatus({ state: 'running', text: 'Sending records to the model…' });
              start(async () => {
                const r = await runPublicAnalysisAction({ passcode, limit: 5 });
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

export function RunAiButton({ kind, needsPasscode, liveAvailable, label }: { kind: 'synthesis' | 'survey_text'; needsPasscode: boolean; liveAvailable: boolean; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [passcode, setPasscode] = useState('');
  const [status, setStatus] = useState<Status | null>(null);
  const { wrapRef, inputRef, trigger: shakeTrigger, clear: shakeClear } = useErrorShake();
  if (!liveAvailable) return null;
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      {needsPasscode ? <PasscodeField value={passcode} onChange={setPasscode} wrapRef={wrapRef} inputRef={inputRef} onClear={shakeClear} /> : null}
      <button
        type="button"
        className="btn btn-secondary"
        disabled={pending}
        style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
        onClick={() => {
          setStatus({ state: 'running', text: 'Waiting for the model…' });
          start(async () => {
            const r = kind === 'synthesis' ? await runSynthesisAction({ passcode }) : await runSurveyTextAnalysisAction({ passcode });
            if (!r.ok) {
              setStatus({ state: 'error', text: r.error });
              if (/passcode/i.test(r.error)) shakeTrigger();
              return;
            }
            setStatus({ state: 'done', text: 'Done. Stored with model and timestamp.' });
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
