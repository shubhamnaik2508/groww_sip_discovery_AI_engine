import type { Metadata } from 'next';
import './globals.css';
import './transitions-root.css';
import './transitions.css';
import './research.css';
import { AppShell } from '@/components/AppShell';
import { DOCK_BOOT_SCRIPT } from '@/lib/dock';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { AiStatusBadge } from '@/components/AiStatusBadge';
import { IconAlert } from '@/components/icons';

export const metadata: Metadata = {
  title: 'Groww SIP Discovery Engine | NextLeap Research',
  description: 'Primary survey research and AI-coded public investor feedback, triangulated into evidence-traced SIP product opportunities.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: DOCK_BOOT_SCRIPT }} />
      </head>
      <body>
        <AppShell badge={<AiStatusBadge />} theme={<ThemeSwitcher />}>
          <main className="app-main">
            {children}
          </main>

          <footer className="app-footer">
            <div className="disclaimer-banner">
              <span style={{ color: 'var(--amber-500)', display: 'inline-flex', marginTop: 2 }}>
                <IconAlert size={16} />
              </span>
              <div>
                <strong>Independent Academic & Product Discovery Research Tool</strong>
                <p style={{ marginTop: '2px', color: 'var(--text-secondary)' }}>
                  This application is an independent student capstone project developed for the NextLeap Product Manager Fellowship. It is <strong>not</strong> an official Groww product, is not affiliated with or endorsed by Groww (Nextbillion Technology Pvt. Ltd.), and does not provide investment advice, mutual fund recommendations, or financial advisory services. Hypotheses regarding 12-month active SIP continuation represent exploratory qualitative correlations derived from public investor feedback and require rigorous A/B experimentation to validate.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', fontSize: '11px', color: 'var(--text-muted)' }}>
              <span>Groww SIP Discovery Engine · NextLeap Part 1</span>
              <span>Active SIP definition: At least 1 successful instalment in past 30 days</span>
            </div>
          </footer>
        </AppShell>
      </body>
    </html>
  );
}
