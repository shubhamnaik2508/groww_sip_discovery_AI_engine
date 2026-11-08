import { db, initializeDatabase } from '@/db';
import { ensureResearchData } from '@/services/research/datasets';
import { analysisRuns } from '@/db/schema';
import { desc } from 'drizzle-orm';
import { EvaluationService } from '@/services/evaluation';
import { ReviewService } from '@/services/review';
import { ReliabilityLab } from '@/components/ReliabilityLab';

export const dynamic = 'force-dynamic';

export default async function ReliabilityPage() {
  await ensureResearchData();

  const evalResult = await EvaluationService.getLatestEvaluation();
  const allFailures = await ReviewService.listFailureCases();

  const latestRuns = await db
    .select()
    .from(analysisRuns)
    .orderBy(desc(analysisRuns.startedAt))
    .limit(1);

  const latestRunId = latestRuns.length > 0 ? latestRuns[0].id : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <span className="badge badge-emerald">AI Reliability Lab</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Evaluation Provenance & Guardrails
          </span>
        </div>
        <h1>Model Evaluation & Failure Case Lab</h1>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '780px', marginTop: '6px', fontSize: '14px' }}>
          Compare stored AI classifications with saved labels. Evaluation sample provenance is shown separately; fixture results do not count as genuine investor evidence.
        </p>
      </div>

      <ReliabilityLab
        evalResult={evalResult}
        failureCases={allFailures}
        latestRunId={latestRunId}
      />
    </div>
  );
}
