'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
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
  IconCompass,
  IconGraph,
  IconFlask,
  IconScale,
  IconDownload,
} from './icons';
import { DOCK_KEY } from '@/lib/dock';

/** The research workflow, in the order a mentor walks it. The numbers carry the sequence. */
const WORKFLOW = [
  { href: '/', label: 'Overview', Icon: IconOverview },
  { href: '/primary-research', label: 'Survey', Icon: IconSurvey },
  { href: '/evidence', label: 'Public evidence', Icon: IconSources },
  { href: '/graph', label: 'Evidence graph', Icon: IconGraph },
  { href: '/analysis', label: 'AI analysis', Icon: IconSpark },
  { href: '/themes', label: 'Themes', Icon: IconThemes },
  { href: '/intelligence', label: 'Investor intelligence', Icon: IconCompass },
  { href: '/triangulation', label: 'Triangulation', Icon: IconTriangulate },
  { href: '/opportunities', label: 'Opportunities', Icon: IconTarget },
  { href: '/validation', label: 'Validation', Icon: IconCheckSquare },
  { href: '/evidence-log', label: 'Evidence log', Icon: IconLog },
];

const TOOLS = [
  { href: '/reliability', label: 'AI reliability lab', Icon: IconFlask },
  { href: '/tracker', label: 'Contradictions & gaps', Icon: IconScale },
  { href: '/export', label: 'Export', Icon: IconDownload },
];


function isActive(pathname: string, href: string) {
  return pathname === href || (href !== '/' && pathname.startsWith(href));
}

// The dock state lives on <html data-dock> (set before paint); React subscribes to it.
const dockListeners = new Set<() => void>();
function subscribeDock(cb: () => void) {
  dockListeners.add(cb);
  return () => dockListeners.delete(cb);
}
function readDock() {
  return document.documentElement.dataset.dock === 'collapsed';
}
function setDock(collapsed: boolean) {
  if (collapsed) document.documentElement.dataset.dock = 'collapsed';
  else delete document.documentElement.dataset.dock;
  try {
    localStorage.setItem(DOCK_KEY, collapsed ? 'collapsed' : 'open');
  } catch {
    /* preference simply not remembered */
  }
  dockListeners.forEach((l) => l());
}

function ChevronIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}
function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/**
 * App shell: a vertical, independently scrolling sidebar ("dock") that shutters down to an
 * icon rail on desktop and becomes a slide-in drawer on phones, plus a slim top bar.
 */
export function AppShell({ badge, theme, children }: { badge: React.ReactNode; theme: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(subscribeDock, readDock, () => false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);

  if (lastPath !== pathname) {
    // Close the phone drawer after navigating (derived during render, no effect).
    setLastPath(pathname);
    setDrawerOpen(false);
  }

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    menuButton.current?.focus();
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const target = sidebar.current?.querySelector<HTMLAnchorElement>('.rx-side-link[aria-current="page"]') ?? sidebar.current?.querySelector<HTMLAnchorElement>('.rx-side-link');
    target?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [drawerOpen, closeDrawer]);

  const stepIndex = WORKFLOW.findIndex((w) => isActive(pathname, w.href));
  const current = stepIndex >= 0 ? WORKFLOW[stepIndex] : TOOLS.find((t) => isActive(pathname, t.href));

  const renderLink = (item: (typeof WORKFLOW)[number], step: number | null) => {
    const active = isActive(pathname, item.href);
    return (
      <li key={item.href}>
        <Link href={item.href} className="rx-side-link" aria-current={active ? 'page' : undefined} title={collapsed ? item.label : undefined}>
          <item.Icon size={17} />
          <span className="rx-side-text">
            {step !== null ? <span className="rx-side-step">{String(step).padStart(2, '0')}</span> : null}
            {item.label}
          </span>
        </Link>
      </li>
    );
  };

  return (
    <div className="rx-shell" data-drawer={drawerOpen ? 'open' : 'closed'}>
      <aside ref={sidebar} id="rx-sidebar" className="rx-sidebar t-resize" aria-label="Research workflow">
        <Link href="/" className="rx-side-brand" title="Groww SIP Discovery Engine">
          <span className="brand-logo" aria-hidden="true">G</span>
          <span className="rx-side-text">
            <span className="rx-side-brand-title">Groww SIP Discovery Engine</span>
            <span className="rx-side-brand-tag">NextLeap research prototype</span>
          </span>
        </Link>
        <button type="button" className="rx-drawer-close" onClick={closeDrawer} aria-label="Close navigation">
          <CloseIcon />
        </button>

        <nav className="rx-side-scroll">
          <p className="rx-side-heading">
            <span className="rx-side-text">Research workflow</span>
          </p>
          <ol className="rx-side-list">{WORKFLOW.map((w, i) => renderLink(w, i + 1))}</ol>
          <p className="rx-side-heading">
            <span className="rx-side-text">Tools</span>
          </p>
          <ul className="rx-side-list">{TOOLS.map((t) => renderLink(t, null))}</ul>
        </nav>

        <button
          type="button"
          className="rx-dock-toggle"
          onClick={() => setDock(!collapsed)}
          aria-expanded={!collapsed}
          aria-controls="rx-sidebar"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <span className="rx-dock-chevron">
            <ChevronIcon />
          </span>
          <span className="rx-side-text">Collapse sidebar</span>
        </button>
      </aside>

      <div className="rx-backdrop" onClick={closeDrawer} aria-hidden="true" />

      <div className="rx-content">
        <header className="rx-topbar">
          <button
            ref={menuButton}
            type="button"
            className="rx-menu-button"
            onClick={() => setDrawerOpen(true)}
            aria-expanded={drawerOpen}
            aria-controls="rx-sidebar"
            aria-label="Open navigation"
          >
            <MenuIcon />
          </button>
          <div className="rx-topbar-title">
            {current ? (
              <>
                {stepIndex >= 0 ? <span className="rx-side-step">{String(stepIndex + 1).padStart(2, '0')}</span> : null}
                <span>{current.label}</span>
              </>
            ) : null}
          </div>
          <div className="rx-topbar-actions">
            {badge}
            {theme}
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
