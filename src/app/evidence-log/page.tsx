import Link from 'next/link';
import { EvidenceLogPrintButton } from '@/components/EvidenceLogPrintButton';
import { loadResearchState } from '@/services/research/triangulation-service';
import { buildEvidenceLog } from '@/services/research/evidence-log';
import { ResearchLogSections } from '@/components/research/ResearchLogSections';

export const dynamic = 'force-dynamic';

const formatDate = (value: string) => new Date(value).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });

export default async function EvidenceLogDocumentPage() {
  const researchLog = buildEvidenceLog(await loadResearchState());

  return (
    <main className="evidence-log-document">
      <div className="no-print document-actions">
        <EvidenceLogPrintButton />
        <a href="/api/research/export?type=evidence-log-md" className="btn btn-secondary">Download Markdown</a>
        <a href="/api/research/export?type=evidence-log-json" className="btn btn-secondary">Download JSON</a>
        <Link href="/export" className="btn btn-secondary">Other exports</Link>
        <p>In the print dialog, choose “Save as PDF.” This creates a local PDF; it does not publish or share a link.</p>
      </div>
      <header className="document-cover">
        <h1>AI Evidence Log</h1>
        <p>Groww SIP Discovery Engine · NextLeap Part 1 · Independent product research prototype</p>
        <p>Generated {formatDate(researchLog.generatedAt)} from the live research datasets</p>
        <p className="document-disclaimer">Independent academic project, not affiliated with Groww and not investment advice. Links between the findings and SIP retention are stated as hypotheses for experimentation.</p>
      </header>

      <ResearchLogSections log={researchLog} />

      <section>
        <h2>Business target</h2>
        <p>
          Percentage of eligible first-time mutual fund investors who still have at least one active SIP 12 months after starting their first SIP, where active means at least one successful instalment in the prior 30 days. This discovery phase identifies the problems to test; measuring the rate itself is the next phase, using cohort transaction data.
        </p>
      </section>
      <footer>Generated from the engine’s stored research records · Survey and public-feedback counts use separate denominators and are never pooled.</footer>
    </main>
  );
}
