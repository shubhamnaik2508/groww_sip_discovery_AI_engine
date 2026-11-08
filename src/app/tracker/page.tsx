import { db, initializeDatabase } from '@/db';
import { ensureResearchData } from '@/services/research/datasets';
import { contradictions, researchQuestions, evidenceRecords } from '@/db/schema';
import { desc } from 'drizzle-orm';
import { TrackerView, StageCoverageItem } from '@/components/TrackerView';

export const dynamic = 'force-dynamic';

const STAGE_LABELS: { [key: string]: string } = {
  discovery_intent: '1. Discovery & Intent',
  mandate_kyc_setup: '2. Mandate & KYC Setup',
  first_instalment: '3. First Instalment Allotment',
  market_dip_reaction: '4. Market Dip Reaction (M2-4)',
  autopay_failure_recovery: '5. Autopay Failure & Penalty',
  continuation_milestone: '6. 12-Month Horizon',
  pause_cancellation: '7. Pause & Cancellation',
};

export default async function TrackerPage() {
  await ensureResearchData();

  const allRecords = await db.select().from(evidenceRecords).all();
  const allContradictions = await db.select().from(contradictions).orderBy(desc(contradictions.createdAt)).all();
  const allQuestions = await db.select().from(researchQuestions).orderBy(desc(researchQuestions.createdAt)).all();

  const recordMap = new Map(allRecords.map((r) => [r.id, r]));

  // Build decorated contradictions
  const decoratedContradictions = allContradictions.map((c) => {
    const evA = recordMap.get(c.evidenceAId) || {
      id: c.evidenceAId,
      originalText: 'Evidence record unavailable',
      platform: 'unknown',
      sourceUrl: '#',
      collectedAt: '',
    };
    const evB = recordMap.get(c.evidenceBId) || {
      id: c.evidenceBId,
      originalText: 'Evidence record unavailable',
      platform: 'unknown',
      sourceUrl: '#',
      collectedAt: '',
    };

    return {
      id: c.id,
      title: c.title,
      description: c.description,
      status: c.status,
      resolutionNotes: c.resolutionNotes,
      evidenceA: {
        id: evA.id,
        originalText: evA.originalText,
        platform: evA.platform,
        sourceUrl: evA.sourceUrl,
        collectedAt: evA.collectedAt,
      },
      evidenceB: {
        id: evB.id,
        originalText: evB.originalText,
        platform: evB.platform,
        sourceUrl: evB.sourceUrl,
        collectedAt: evB.collectedAt,
      },
    };
  });

  // Calculate Journey Stage Coverage
  const totalRecords = allRecords.length || 1;
  const stageCounts: { [key: string]: number } = {};
  for (const s of Object.keys(STAGE_LABELS)) {
    stageCounts[s] = 0;
  }
  for (const r of allRecords) {
    if (stageCounts[r.journeyStage] !== undefined) {
      stageCounts[r.journeyStage]++;
    }
  }

  const stageCoverage: StageCoverageItem[] = Object.entries(STAGE_LABELS).map(([k, label]) => {
    const count = stageCounts[k] || 0;
    const pct = Math.round((count / totalRecords) * 100);
    const density: 'healthy' | 'moderate' | 'thin' =
      count >= 4 ? 'healthy' : count >= 2 ? 'moderate' : 'thin';

    return {
      stageKey: k,
      stageLabel: label,
      count,
      pct,
      density,
    };
  });

  // Calculate Platform Coverage
  const platformCounts: { [key: string]: number } = {};
  for (const r of allRecords) {
    platformCounts[r.platform] = (platformCounts[r.platform] || 0) + 1;
  }
  const platformCoverage = Object.entries(platformCounts).map(([platform, count]) => ({
    platform,
    count,
    pct: Math.round((count / totalRecords) * 100),
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <span className="badge badge-amber">Qualitative Synthesis</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Contradiction Resolution & Research Coverage
          </span>
        </div>
        <h1>Contradictions & Research Gaps</h1>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '780px', marginTop: '6px', fontSize: '14px' }}>
          Reconcile polar tension points across investor cohorts, detect research blind spots across the 12-month lifecycle, and track open investigative inquiries.
        </p>
      </div>

      <TrackerView
        contradictions={decoratedContradictions}
        questions={allQuestions}
        stageCoverage={stageCoverage}
        platformCoverage={platformCoverage}
      />
    </div>
  );
}
