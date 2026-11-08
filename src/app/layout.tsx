import type { Metadata } from 'next';
import './globals.css';
import './transitions-root.css';
import './transitions.css';
import './research.css';
import { Navbar } from '@/components/Navbar';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import Link from 'next/link';
import { AiStatusBadge } from '@/components/AiStatusBadge';

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
      <body>
        <div className="app-container">
          <header className="app-header">
            <div className="header-top">
              <div className="header-brand">
                <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div className="brand-logo" aria-hidden="true">G</div>
                  <div>
                    <div className="brand-title">
                      Groww SIP Discovery Engine
                      <span className="brand-tag">NextLeap research prototype</span>
                    </div>
                    <div className="brand-subtitle" style={{ fontSize: '11.5px' }}>
                      Why first-time investors start, pause, reduce or stop SIPs — survey + public feedback, triangulated
                    </div>
                  </div>
                </Link>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
                <AiStatusBadge />
                <ThemeSwitcher />
              </div>
            </div>
            <Navbar />
          </header>

          <main className="app-main">
            {children}
          </main>

          <footer className="app-footer">
            <div className="disclaimer-banner">
              <span style={{ fontSize: '16px' }} aria-hidden="true">⚠️</span>
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
        </div>
      </body>
    </html>
  );
}
