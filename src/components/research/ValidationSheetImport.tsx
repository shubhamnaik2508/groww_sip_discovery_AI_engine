'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { importValidationSheetAction } from '@/app/research-actions';
import { SuccessCheck } from '@/components/motion';
import { IconUpload } from '@/components/icons';

export function ValidationSheetImport() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      className="rx-panel rx-panel-pad"
      style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await importValidationSheetAction(fd);
          if (!r.ok) return setMsg({ ok: false, text: r.error });
          setMsg({ ok: true, text: `Imported ${r.data.imported} review(s)${r.data.skipped.length ? `; skipped ${r.data.skipped.length}: ${r.data.skipped.slice(0, 3).join(' | ')}` : ''}` });
          router.refresh();
        });
      }}
    >
      <div className="rx-field">
        <label htmlFor="rx-sheet">Completed review sheet (CSV)</label>
        <input id="rx-sheet" name="file" type="file" accept=".csv,text/csv" required />
      </div>
      <button className="btn btn-secondary" type="submit" disabled={pending} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
        <IconUpload size={15} /> {pending ? 'Importing…' : 'Import reviews'}
      </button>
      {msg ? (
        <span className="rx-status" data-state={msg.ok ? 'done' : 'error'} role="status">
          {msg.ok ? <SuccessCheck show /> : <span className="rx-pulse" aria-hidden="true" />}
          <span className="rx-small">{msg.text}</span>
        </span>
      ) : null}
    </form>
  );
}
