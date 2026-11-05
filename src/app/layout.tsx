import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '@/components/Navbar';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Groww SIP Intelligence Lab | NextLeap PM Fellowship',
  description: 'Evidence-first AI Discovery Engine for 12-Month SIP Continuation & Retention Analysis',
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
                      Groww SIP Intelligence Lab
                      <span className="brand-tag">Fellowship Prototype</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      NextLeap PM Fellowship Graduation Project · 12-Month First-Time Investor Retention
                    </div>
                  </div>
                </Link>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ThemeSwitcher />
                <span className="badge badge-neutral" title="Discovery Engine Environment">
                  <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: 'var(--emerald-500)', marginRight: '4px' }}></span>
                  Local Engine Active
                </span>
                <Link href="/evidence" className="btn btn-primary" style={{ fontSize: '12px', padding: '6px 12px' }}>
                  + Ingest Evidence
                </Link>
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
              <span>Groww SIP Intelligence Lab · NextLeap Graduation Project</span>
              <span>Active SIP definition: At least 1 successful instalment in past 30 days</span>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
