import { db, initializeDatabase } from '@/db';
import { ensureResearchData } from '@/services/research/datasets';
import { evidenceRecords, recordAnalyses, reviews, evidenceEdits, analysisRuns } from '@/db/schema';
import { desc } from 'drizzle-orm';
import { EvidenceTable } from '@/components/EvidenceTable';
import { classifyEvidenceProvenance, isSyntheticFixture } from '@/lib/evidenceEligibility';

export const dynamic = 'force-dynamic';

export default async function EvidencePage() {
  await ensureResearchData();

  const allRecords = await db
    .select()
    .from(evidenceRecords)
    .orderBy(desc(evidenceRecords.createdAt))
    .all();

  const [allAnalyses, allRuns] = await Promise.all([
    db.select().from(recordAnalyses).orderBy(desc(recordAnalyses.createdAt)).all(),
    db.select().from(analysisRuns).all(),
  ]);
  const runProviders = new Map(allRuns.map((run) => [run.id, { provider: run.provider, model: run.model, promptVersion: run.promptVersion }]));

  const allReviews = await db
    .select()
    .from(reviews)
    .orderBy(desc(reviews.createdAt))
    .all();

  const allEdits = await db
    .select()
    .from(evidenceEdits)
    .orderBy(desc(evidenceEdits.createdAt))
    .all();

  // Map analyses and reviews to records
  const analysesByEvidence = new Map<string, any[]>();
  for (const a of allAnalyses) {
    if (!analysesByEvidence.has(a.evidenceId)) {
      analysesByEvidence.set(a.evidenceId, []);
    }
    let parsed = null;
    try {
      parsed = a.parsedOutput ? JSON.parse(a.parsedOutput) : null;
    } catch {
      parsed = null;
    }
    analysesByEvidence.get(a.evidenceId)!.push({ ...a, ...runProviders.get(a.runId), parsedOutput: parsed });
  }

  const reviewsByEvidence = new Map<string, any[]>();
  for (const r of allReviews) {
    if (!reviewsByEvidence.has(r.evidenceId)) {
      reviewsByEvidence.set(r.evidenceId, []);
    }
    reviewsByEvidence.get(r.evidenceId)!.push(r);
  }

  const editsByEvidence = new Map<string, any[]>();
  for (const e of allEdits) {
    if (!editsByEvidence.has(e.evidenceId)) {
      editsByEvidence.set(e.evidenceId, []);
    }
    editsByEvidence.get(e.evidenceId)!.push(e);
  }

  const decoratedRecords = allRecords.map((rec) => {
    let prov = {
      sourceUrl: 'unverified' as const,
      platform: 'unverified' as const,
      collectedAt: 'unverified' as const,
      originalText: 'unverified' as const,
      investorContext: 'unverified' as const,
      journeyStage: 'unverified' as const,
    };
    try {
      prov = JSON.parse(rec.fieldProvenance);
    } catch {
      // default
    }

    const recAnalyses = analysesByEvidence.get(rec.id) || [];
    const latestAnalysis = recAnalyses[0] || null;
    const recReviews = reviewsByEvidence.get(rec.id) || [];
    const latestReview = recReviews[0] || null;
    const recEdits = editsByEvidence.get(rec.id) || [];

    return {
      id: rec.id,
      sourceUrl: rec.sourceUrl,
      platform: rec.platform,
      collectedAt: rec.collectedAt,
      originalText: rec.originalText,
      investorContext: rec.investorContext,
      journeyStage: rec.journeyStage,
      fieldProvenance: prov,
      entryMethod: rec.entryMethod,
      isSynthetic: isSyntheticFixture(rec),
      provenanceCategory: classifyEvidenceProvenance(rec),
      verificationStatus: (rec.verificationStatus as any) || 'unverified',
      verifiedAt: rec.verifiedAt,
      verifiedBy: rec.verifiedBy,
      duplicateOfId: rec.duplicateOfId,
      contentHash: rec.contentHash,
      createdAt: rec.createdAt,
      latestAnalysis,
      allAnalyses: recAnalyses,
      latestReview,
      allReviews: recReviews,
      auditEdits: recEdits,
      reviewCount: recReviews.length,
    };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <span className="badge badge-emerald">Evidence Vault</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Strict Invariant: Original Verbatim Text is Immutable
          </span>
        </div>
        <h1>Evidence Records & Provenance</h1>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '780px', marginTop: '6px', fontSize: '14px' }}>
          Explore raw investor sentiment from public app stores, community threads, and interviews. Each record tracks field-level provenance, deduplication hashes, and human PM validation decisions.
        </p>
      </div>

      <EvidenceTable initialRecords={decoratedRecords} />
    </div>
  );
}
