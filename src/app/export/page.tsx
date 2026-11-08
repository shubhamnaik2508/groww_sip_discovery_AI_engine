import { db, initializeDatabase } from '@/db';
import { ensureResearchData } from '@/services/research/datasets';
import {
  evidenceRecords,
  themes,
} from '@/db/schema';
import { ExportService } from '@/services/export';
import { EvidenceService } from '@/services/evidence';
import { EvaluationService } from '@/services/evaluation';
import { ExportView } from '@/components/ExportView';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function ExportPage() {
  await ensureResearchData();

  const markdownContent = await ExportService.generateMarkdownReport();
  const csvContent = await EvidenceService.exportToCsv();
  const jsonData = await ExportService.compileExportData();

  const allRecords = await db.select().from(evidenceRecords).all();
  const allThemes = await db.select().from(themes).all();
  const evalResult = await EvaluationService.getLatestEvaluation();

  const summary = {
    totalRecords: jsonData.summary.eligibleNonFixtureRecordsCount,
    storedRecords: allRecords.length,
    syntheticRecords: jsonData.summary.syntheticRecordsCount,
    totalThemes: allThemes.length,
    totalOpportunities: jsonData.opportunities.filter((opportunity) => opportunity.hasEligibleEvidence).length,
    evaluationAccuracy: evalResult ? evalResult.accuracy : null,
    failureCasesCount: jsonData.failureCases.length,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <span className="badge badge-emerald">Evidence Log Export</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Reproducible Fellowship Deliverables
          </span>
        </div>
        <h1>Export Evidence Log & Findings</h1>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '780px', marginTop: '6px', fontSize: '14px' }}>
          Download the complete graduation portfolio in Markdown, CSV, or JSON. All data exports strictly preserve verbatim quote provenance, review audit trails, and known research limitations.
        </p>
      </div>

      <ExportView
        markdownContent={markdownContent}
        csvContent={csvContent}
        jsonData={jsonData}
        summary={summary}
      />
      <section className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
        <div><h2 style={{ fontSize: 16 }}>Standalone AI Evidence Log</h2><p style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 5 }}>Print-ready research provenance and evaluation document. The PDF is generated locally from your browser’s print dialog.</p></div>
        <Link href="/evidence-log" className="btn btn-primary">Open AI Evidence Log document →</Link>
      </section>
    </div>
  );
}
