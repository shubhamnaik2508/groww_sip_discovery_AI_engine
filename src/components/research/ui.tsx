import React from 'react';
import type { Relationship, Strength } from '@/lib/research/triangulation';
import { IconAlert, IconInfo, IconSpark, IconExternal } from '@/components/icons';

export const PLATFORM_LABELS: Record<string, string> = {
  play_store: 'Google Play',
  trading_qa: 'TradingQ&A',
  youtube: 'YouTube',
  reddit: 'Reddit',
  app_store: 'App Store',
  twitter_x: 'X / Twitter',
  community_forum: 'Forum',
  google_forms: 'Google Forms',
  user_interview: 'Interview',
  other: 'Other',
};
export const platformLabel = (p: string) => PLATFORM_LABELS[p] ?? p;

export const REL_LABELS: Record<Relationship, string> = {
  convergent: 'Convergent',
  divergent: 'Divergent',
  survey_only: 'Survey only',
  public_only: 'Public only',
  not_measured_in_survey: 'Not measured in survey',
  insufficient: 'Insufficient',
};

export function RelTag({ rel }: { rel: Relationship }) {
  return <span className={`rx-rel rx-rel-${rel}`}>{REL_LABELS[rel]}</span>;
}

export function StrengthTag({ strength }: { strength: Strength }) {
  return <span className={`rx-strength rx-strength-${strength}`}>{strength[0].toUpperCase() + strength.slice(1)} evidence</span>;
}

export function SourcePill({ kind, children }: { kind: 'survey' | 'public' | 'ai' | 'warn' | 'neutral'; children: React.ReactNode }) {
  return (
    <span className={`rx-src rx-src-${kind}`}>
      <span className="rx-dot" aria-hidden="true" />
      {children}
    </span>
  );
}

export function ShareBar({ kind, pct, label }: { kind: 'survey' | 'public'; pct: number; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
      <div className="rx-small rx-num" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ color: kind === 'survey' ? 'var(--rx-survey)' : 'var(--rx-public)', fontWeight: 650 }}>{pct}%</span>
        <span className="rx-muted">{label}</span>
      </div>
      <div className={`rx-bar rx-bar-${kind}`} role="img" aria-label={`${pct}% ${label}`}>
        <span style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

export function Callout({ tone, children }: { tone: 'info' | 'warn' | 'ai' | 'ok'; children: React.ReactNode }) {
  const Icon = tone === 'warn' ? IconAlert : tone === 'ai' ? IconSpark : IconInfo;
  return (
    <div className={`rx-callout rx-callout-${tone}`}>
      <Icon size={16} />
      <div>{children}</div>
    </div>
  );
}

export function Stat({ label, value, unit, note }: { label: string; value: React.ReactNode; unit?: string; note?: React.ReactNode }) {
  return (
    <div className="rx-stat">
      <span className="rx-stat-label">{label}</span>
      <span className="rx-stat-value rx-num">
        {value}
        {unit ? <small>{unit}</small> : null}
      </span>
      {note ? <span className="rx-stat-note">{note}</span> : null}
    </div>
  );
}

/** Renders original text with the cited verbatim span highlighted (case/whitespace-insensitive). */
export function HighlightedText({ text, quotes, maxChars }: { text: string; quotes: string[]; maxChars?: number }) {
  const shown = maxChars && text.length > maxChars ? text.slice(0, maxChars) + '…' : text;
  const ranges: Array<[number, number]> = [];
  const lower = shown.toLowerCase();
  for (const q of quotes) {
    const needle = q.trim().replace(/^["'“‘]+|["'”’]+$/g, '').toLowerCase();
    if (needle.length < 3) continue;
    const idx = lower.indexOf(needle);
    if (idx >= 0) ranges.push([idx, idx + needle.length]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const parts: React.ReactNode[] = [];
  let pos = 0;
  ranges.forEach(([s, e], i) => {
    if (s < pos) return;
    parts.push(shown.slice(pos, s));
    parts.push(<mark key={i}>{shown.slice(s, e)}</mark>);
    pos = e;
  });
  parts.push(shown.slice(pos));
  return <span style={{ whiteSpace: 'pre-wrap' }}>{parts}</span>;
}

export function SourceLink({ href, children }: { href: string; children?: React.ReactNode }) {
  return (
    <a className="rx-link" href={href} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {children ?? 'Open source'}
      <IconExternal size={12} />
    </a>
  );
}

export function PageHead({ title, description, actions }: { title: string; description: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="rx-head">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div> : null}
    </header>
  );
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return 'not stated';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}
