'use client';

import React, { useEffect, useState } from 'react';

/** 'research' is the default (no data-theme attribute); the legacy themes stay selectable. */
export type ThemeMode = 'research' | 'cool' | 'warm' | 'warm-paper';

const THEMES: Array<{ id: ThemeMode; label: string }> = [
  { id: 'research', label: 'Research (light)' },
  { id: 'cool', label: 'Ocean Slate (dark)' },
  { id: 'warm', label: 'Warm Espresso (dark)' },
  { id: 'warm-paper', label: 'Warm Paper' },
];
const STORAGE_KEY = 'groww_sip_theme_v2';

function applyTheme(theme: ThemeMode) {
  if (theme === 'research') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* Theme selection still works without storage. */
  }
}

export function ThemeSwitcher() {
  const [theme, setTheme] = useState<ThemeMode>('research');

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* default */
    }
    if (stored && THEMES.some((t) => t.id === stored)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the saved theme from browser storage after hydration
      setTheme(stored as ThemeMode);
      applyTheme(stored as ThemeMode);
    }
  }, []);

  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
      <span className="brand-subtitle">Theme</span>
      <select
        value={theme}
        onChange={(e) => {
          const next = e.target.value as ThemeMode;
          setTheme(next);
          applyTheme(next);
        }}
        style={{ fontSize: 12, padding: '4px 8px', borderRadius: 8 }}
        aria-label="Colour theme"
      >
        {THEMES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
    </label>
  );
}
