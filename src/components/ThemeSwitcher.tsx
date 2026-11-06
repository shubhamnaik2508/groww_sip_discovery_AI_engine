'use client';

import React, { useEffect, useState } from 'react';

export type ThemeMode = 'cool' | 'warm' | 'warm-paper';

interface ThemeOption {
  id: ThemeMode;
  label: string;
  shortLabel: string;
  icon: string;
  description: string;
}

const THEMES: ThemeOption[] = [
  {
    id: 'cool',
    label: 'Oceanic Blue',
    shortLabel: 'Oceanic Blue',
    icon: '🌊',
    description: 'Deep ocean surfaces with clear sky blue accents',
  },
  {
    id: 'warm',
    label: 'Warm Espresso',
    shortLabel: 'Warm Dark',
    icon: '☕',
    description: 'Warm roasted espresso & honey amber accents',
  },
  {
    id: 'warm-paper',
    label: 'Warm Paper Glassmorphism',
    shortLabel: 'Warm Paper Glass',
    icon: '📜',
    description: 'Warm linen parchment with translucent frosted glassmorphism',
  },
];

export function ThemeSwitcher() {
  const [currentTheme, setCurrentTheme] = useState<ThemeMode>('cool');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    let stored: ThemeMode | null = null;
    try { stored = localStorage.getItem('groww_sip_theme') as ThemeMode | null; } catch { /* Use default when storage is unavailable. */ }
    if (stored && (stored === 'cool' || stored === 'warm' || stored === 'warm-paper')) {
      setCurrentTheme(stored);
      applyTheme(stored);
    } else {
      applyTheme('cool');
    }
  }, []);

  const applyTheme = (theme: ThemeMode) => {
    if (theme === 'cool') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    try { localStorage.setItem('groww_sip_theme', theme); } catch { /* Theme selection still works without storage. */ }
  };

  const handleSelect = (theme: ThemeMode) => {
    setCurrentTheme(theme);
    applyTheme(theme);
  };

  if (!mounted) {
    return (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          height: '28px',
          width: '180px',
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-full)',
          border: '1px solid var(--border-subtle)',
        }}
      />
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Color Palette Switcher"
      style={{
        display: 'inline-flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        padding: '2px',
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius-full)',
        border: '1px solid var(--border-subtle)',
        boxShadow: 'var(--shadow-sm)',
        gap: '2px',
      }}
    >
      {THEMES.map((t) => {
        const isActive = currentTheme === t.id;
        return (
          <button
            key={t.id}
            role="radio"
            aria-checked={isActive}
            title={`${t.label} — ${t.description}`}
            onClick={() => handleSelect(t.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              fontSize: '11px',
              fontWeight: isActive ? 600 : 500,
              fontFamily: 'var(--font-sans)',
              borderRadius: 'var(--radius-full)',
              border: isActive ? '1px solid var(--emerald-border)' : '1px solid transparent',
              background: isActive ? 'var(--emerald-glow)' : 'transparent',
              color: isActive ? 'var(--emerald-400)' : 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              lineHeight: 1.3,
            }}
          >
            <span aria-hidden="true" style={{ fontSize: '11px' }}>{t.icon}</span>
            <span>{t.shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
}
