'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  IconOverview,
  IconSurvey,
  IconSources,
  IconSpark,
  IconThemes,
  IconTriangulate,
  IconTarget,
  IconCheckSquare,
  IconLog,
  IconMore,
  IconCompass,
  IconGraph,
  IconFlask,
  IconScale,
  IconDownload,
} from './icons';

/** The research workflow, in the order a mentor walks it. The numbers carry the sequence. */
const WORKFLOW = [
  { href: '/', label: 'Overview', Icon: IconOverview },
  { href: '/primary-research', label: 'Survey', Icon: IconSurvey },
  { href: '/evidence', label: 'Public evidence', Icon: IconSources },
  { href: '/analysis', label: 'AI analysis', Icon: IconSpark },
  { href: '/themes', label: 'Themes', Icon: IconThemes },
  { href: '/triangulation', label: 'Triangulation', Icon: IconTriangulate },
  { href: '/opportunities', label: 'Opportunities', Icon: IconTarget },
  { href: '/validation', label: 'Validation', Icon: IconCheckSquare },
  { href: '/evidence-log', label: 'Evidence log', Icon: IconLog },
];

const MORE = [
  { href: '/intelligence', label: 'Investor intelligence', Icon: IconCompass },
  { href: '/graph', label: 'Evidence graph', Icon: IconGraph },
  { href: '/reliability', label: 'AI reliability lab', Icon: IconFlask },
  { href: '/tracker', label: 'Contradictions & gaps', Icon: IconScale },
  { href: '/export', label: 'Export', Icon: IconDownload },
];

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== '/' && pathname.startsWith(href));
}

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'closed' | 'mounting' | 'open' | 'closing'>('closed');

  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    // Close the menu on navigation (derived during render, no effect).
    setLastPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    // Transitions.dev menu dropdown: open/close classes with a close-state cleanup.
    if (open) {
      const r = btn.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 236)) });
      // Mount at the pre-open scale, then add .is-open on the next frame so it transitions.
      setState('mounting');
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setState('open')));
      return () => cancelAnimationFrame(raf);
    }
    if (state === 'open' || state === 'mounting') {
      setState('closing');
      const t = setTimeout(() => setState('closed'), 150);
      return () => clearTimeout(t);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const moreActive = MORE.some((m) => isActive(pathname, m.href));

  return (
    <nav className="rx-nav" aria-label="Research workflow">
      {WORKFLOW.map(({ href, label, Icon }, i) => (
        <Link key={href} href={href} className="rx-nav-link" aria-current={isActive(pathname, href) ? 'page' : undefined}>
          <span className="rx-nav-step">{String(i + 1).padStart(2, '0')}</span>
          <Icon size={15} />
          {label}
        </Link>
      ))}
      <span className="rx-nav-sep" aria-hidden="true" />
      <div className="rx-nav-more">
        <button
          ref={btn}
          type="button"
          className="rx-nav-link"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-current={moreActive ? 'page' : undefined}
          onClick={() => setOpen((o) => !o)}
          style={{ background: 'transparent', border: 0, cursor: 'pointer', font: 'inherit' }}
        >
          <IconMore size={15} /> More tools
        </button>
        {state !== 'closed' ? (
          <div
            ref={menu}
            role="menu"
            className={`rx-nav-menu t-dropdown${state === 'open' ? ' is-open' : state === 'closing' ? ' is-closing' : ''}`}
            data-origin="top-left"
            style={{ top: pos.top, left: pos.left }}
          >
            {MORE.map(({ href, label, Icon }) => (
              <Link key={href} href={href} role="menuitem" aria-current={isActive(pathname, href) ? 'page' : undefined}>
                <Icon size={15} /> {label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </nav>
  );
}
