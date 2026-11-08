'use client';

/**
 * React bindings for the Transitions.dev snippets in src/app/transitions.css.
 * Each component follows the orchestration documented in
 * .claude/skills/transitions-dev/<nn>-*.md (timings read from the :root tokens).
 * State changes that restart an animation remount the element via `key`, which
 * replays the CSS animation without a manual reflow.
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

function cssMs(name: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(v) ? v : fallback;
}

const defaultFormat = (n: number) => n.toLocaleString('en-IN');

// 36 — Number subtle change: only changed digits cross-fade, rising or falling with the value.
export function SubtleNumber({ value, format = defaultFormat, className }: { value: number; format?: (n: number) => string; className?: string }) {
  const [s, setS] = useState<{ value: number; prevStr: string | null; dir: number; nonce: number }>({ value, prevStr: null, dir: 1, nonce: 0 });
  if (s.value !== value) {
    // Derive the transition during render (no effect): remember the old string and direction.
    setS({ value, prevStr: format(s.value), dir: value >= s.value ? 1 : -1, nonce: s.nonce + 1 });
  }
  const str = format(value);
  const prevStr = s.value === value ? s.prevStr : null;
  const sameLength = prevStr !== null && prevStr.length === str.length;
  return (
    <span
      key={s.nonce}
      className={`t-subtle-number${prevStr !== null ? ' is-animating' : ''}${className ? ` ${className}` : ''}`}
      style={{ ['--subtle-dir' as string]: String(s.dir) }}
      aria-label={str}
    >
      {[...str].map((ch, i) => {
        if (prevStr === null || (sameLength && prevStr[i] === ch)) return <React.Fragment key={i}>{ch}</React.Fragment>;
        return (
          <span className="t-subtle-slot" key={i}>
            {sameLength ? (
              <span className="t-subtle-old" aria-hidden="true">
                {prevStr[i]}
              </span>
            ) : null}
            <span className="t-subtle-new">{ch}</span>
          </span>
        );
      })}
    </span>
  );
}

// 04 — Text states swap: old text exits up with blur, new text enters from below.
export function TextSwap({ text, className }: { text: string; className?: string }) {
  const [shown, setShown] = useState(text);
  const [phase, setPhase] = useState<'' | 'is-exit' | 'is-enter-start'>('');
  const ref = useRef<HTMLSpanElement>(null);
  const exiting = text !== shown;
  useEffect(() => {
    if (!exiting) return;
    const t = setTimeout(() => {
      setShown(text);
      setPhase('is-enter-start');
      requestAnimationFrame(() => {
        void ref.current?.offsetHeight; // force reflow so the next change transitions
        setPhase('');
      });
    }, cssMs('--text-swap-dur', 150));
    return () => clearTimeout(t);
  }, [text, exiting]);
  const cls = exiting ? 'is-exit' : phase;
  return (
    <span ref={ref} className={`t-text-swap ${cls} ${className ?? ''}`} aria-live="polite">
      {shown}
    </span>
  );
}

// 16 — Tabs sliding: the pill tweens between measured tab positions.
export function SlidingTabs<T extends string>({ options, value, onChange, label }: { options: Array<{ value: T; label: string }>; value: T; onChange: (v: T) => void; label: string }) {
  const barRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const firstRef = useRef(true);
  const moveTo = useCallback((animate: boolean) => {
    const tab = barRef.current?.querySelector<HTMLButtonElement>('.t-tab[aria-selected="true"]');
    const p = pillRef.current;
    if (!tab || !p) return;
    if (!animate) {
      const prevT = p.style.transition;
      p.style.transition = 'none';
      p.style.transform = `translateX(${tab.offsetLeft}px)`;
      p.style.width = `${tab.offsetWidth}px`;
      void p.offsetWidth;
      p.style.transition = prevT;
    } else {
      p.style.transform = `translateX(${tab.offsetLeft}px)`;
      p.style.width = `${tab.offsetWidth}px`;
    }
  }, []);
  useLayoutEffect(() => {
    moveTo(!firstRef.current);
    firstRef.current = false;
  }, [value, moveTo]);
  useEffect(() => {
    const onResize = () => moveTo(false);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [moveTo]);
  return (
    <div className="t-tabs rx-tabs" role="tablist" aria-label={label} ref={barRef}>
      <span className="t-tabs-pill" ref={pillRef} aria-hidden="true" />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          className="t-tab"
          aria-selected={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            e.preventDefault();
            const i = options.findIndex((x) => x.value === value);
            const next = options[(i + (e.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length];
            onChange(next.value);
            requestAnimationFrame(() => barRef.current?.querySelector<HTMLButtonElement>('.t-tab[aria-selected="true"]')?.focus());
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// 21 — Accordion expand (grid-rows 0fr↔1fr, chevron flips).
export function Accordion({ head, children, defaultOpen = false, className, id }: { head: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean; className?: string; id?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = `${id ?? 'acc'}-panel`;
  return (
    <div className={`t-acc ${className ?? ''}`} data-open={String(open)} id={id}>
      <button type="button" className="t-acc-head" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
        {head}
        <span className="t-acc-chevron" aria-hidden="true">
          <svg viewBox="0 0 16 16">
            <path d="M4 6.5L8 10.5L12 6.5" />
          </svg>
        </span>
      </button>
      <div className="t-acc-panel" id={panelId} role="region">
        <div className="t-acc-panel-inner" inert={!open}>
          {children}
        </div>
      </div>
    </div>
  );
}

// 07 — Panel reveal: slides a panel into its region with a cross-blur.
// Give it a new `key` to replay for new content. appear=false renders visible
// immediately (first page load: no entrance animation and never hidden content).
export function PanelReveal({ open, children, className, appear = true }: { open: boolean; children: React.ReactNode; className?: string; appear?: boolean }) {
  const [entered, setEntered] = useState(!appear);
  useEffect(() => {
    if (!open || entered) return;
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, [open, entered]);
  return (
    <div className={`t-panel-slide ${className ?? ''}`} data-open={String(open && entered)}>
      {children}
    </div>
  );
}

// 10 — Success check: fade + rotate + Y-bob + stroke draw, shown once an action completes.
export function SuccessCheck({ show }: { show: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const path = el.querySelector('path');
    if (path) {
      const len = Math.ceil(path.getTotalLength()) + 1;
      path.style.strokeDasharray = String(len);
      path.style.strokeDashoffset = String(len);
    }
    el.setAttribute('data-state', 'out');
    if (show) {
      void el.offsetWidth; // force reflow so keyframes restart
      el.setAttribute('data-state', 'in');
    }
  }, [show]);
  return (
    <span ref={ref} className="t-success-check rx-check" data-state="out" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  );
}

// 12 — Error state shake: shake + error border + message, auto-reverting.
export function useErrorShake() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trigger = useCallback(() => {
    const w = wrapRef.current;
    const i = inputRef.current;
    if (!w || !i) return;
    w.classList.add('is-error');
    i.classList.add('is-error');
    i.classList.remove('is-shaking');
    void i.offsetWidth; // force reflow
    i.classList.add('is-shaking');
    const shakeMs = cssMs('--shake-dur-a', 80) * 2 + cssMs('--shake-dur-b', 60) * 2;
    setTimeout(() => i.classList.remove('is-shaking'), shakeMs + 20);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      w.classList.remove('is-error');
      i.classList.remove('is-error');
    }, shakeMs + cssMs('--revert-hold', 3000));
  }, []);
  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    wrapRef.current?.classList.remove('is-error');
    inputRef.current?.classList.remove('is-error');
  }, []);
  return { wrapRef, inputRef, trigger, clear };
}
