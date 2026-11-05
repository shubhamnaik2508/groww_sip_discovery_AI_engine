'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/', label: 'Overview', icon: '📊' },
  { href: '/evidence', label: 'Evidence Explorer', icon: '📑' },
  { href: '/intelligence', label: 'Investor Intelligence', icon: '🧭' },
  { href: '/themes', label: 'Theme & Behaviour Map', icon: '🗺️' },
  { href: '/opportunities', label: 'Opportunity Explorer', icon: '🎯' },
  { href: '/graph', label: 'Evidence Graph', icon: '🕸️' },
  { href: '/reliability', label: 'AI Reliability Lab', icon: '🧪' },
  { href: '/tracker', label: 'Contradictions & Gaps', icon: '⚖️' },
  { href: '/export', label: 'Evidence Log Export', icon: '📤' },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="nav-bar" aria-label="Main Navigation">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-link ${isActive ? 'active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
          >
            <span aria-hidden="true" style={{ marginRight: '6px' }}>{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
