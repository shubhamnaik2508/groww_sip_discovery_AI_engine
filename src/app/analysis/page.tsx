import { db } from '@/db';
import { recordAnalyses } from '@/db/schema';
import { loadResearchState } from '@/services/research/triangulation-service';
import { AnalysisRecords, AnalysisRecordView } from '@/components/research/AnalysisRecords';
import { RunAnalysisPanel } from '@/components/research/ActionForms';
import { Callout, PageHead, SourcePill, Stat, fmtDate, platformLabel } from '@/components/research/ui';
import { groqConfigured, groqModel, RECORD_PROMPT_VERSION } from '@/services/ai/groq';
import { needsPasscode } from '@/lib/research/access';
import { IconDownload } from '@/components/icons';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function AnalysisPage() {
  const state = await loadResearchState();
  const ps = state.triangulation.publicSummary;
  const rawById = new Map((await db.select({ id: recordAnalyses.id, raw: recordAnalyses.rawOutput }).from(recordAnalyses).all()).map((r) => [r.id, r.raw]));
  const records: AnalysisRecordView[] = state.publicRecords.map((r) => ({
    id: r.id,
    platform: r.platform,
    sourceUrl: r.sourceUrl,
    title: r.title,
    originalText: r.originalText,
    publishedAt: r.publishedAt,
    collectionMethod: r.collectionMethod,
    eligible: r.eligible,
    exclusionReason: r.exclusionReason,
    analysis: r.analysis
      ? {
          id: r.analysis.id,
          status: r.analysis.status,
          errors: r.analysis.errors,
          model: r.analysis.model,
          analysedAt: r.analysis.analysedAt,
          parsed: r.analysis.parsed,
          codes: r.analysis.coded.codes,
          signals: r.analysis.coded.signals,
          firstPerson: r.analysis.coded.firstPerson,
          themeName: r.analysis.coded.themeName,
          raw: rawById.get(r.analysis.id),
        }
      : null,
  }));
  const runs = state.runs.filter((r) => r.totalRecords > 0);

  return (
    <div className="rx-page">
      <PageHead
        title="AI analysis of public feedback"
        description="Every public record is sent to a language model with a fixed codebook. The output is validated against a schema, and every quote it cites must appear verbatim in the original text before it can count toward a theme. Failures are kept and shown, not hidden."
        actions={
          <a className="btn btn-secondary" href="/api/research/export?type=snapshot" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <IconDownload size={15} /> Stored AI outputs (JSON)
          </a>
        }
      />

      <div className="rx-stat-strip">
        <Stat label="Public records stored" value={ps.totalRecords} note={Object.entries(ps.platforms).map(([p, n]) => `${platformLabel(p)} ${n}`).join(' · ')} />
        <Stat label="Valid AI analyses" value={ps.analysedValid} unit={`/ ${ps.eligibleRecords}`} note="Passed schema and grounding checks" />
        <Stat label="Failed checks" value={ps.analysedFailed} note="Kept with the reason; not counted" />
        <Stat label="First-person accounts" value={ps.firstPersonValid} unit={`/ ${ps.analysedValid}`} note="Author describes their own SIP" />
        <Stat label="Model" value={<span style={{ fontSize: 15 }}>{ps.models.join(', ') || (groqConfigured() ? groqModel() : 'none yet')}</span>} note={`Prompt ${RECORD_PROMPT_VERSION}`} />
      </div>

      {ps.analysedValid === 0 ? (
        <Callout tone="warn">No stored AI analyses are available on this deployment yet. Nothing on this page is simulated; the counts will fill in as real runs complete.</Callout>
      ) : null}

      <div className="rx-grid rx-grid-2">
        <RunAnalysisPanel needsPasscode={needsPasscode()} liveAvailable={groqConfigured()} pendingCount={ps.notAnalysed + ps.analysedFailed} />
        <div className="rx-panel rx-panel-pad" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h3 style={{ fontSize: 15 }}>How each record is processed</h3>
          <ol className="rx-small" style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4, lineHeight: 1.5 }}>
            <li>Public text is wrapped as untrusted data; instructions inside it are ignored (prompt-injection guard). Text over 4,000 characters is truncated and flagged.</li>
            <li>The model returns motivation, expectation, behaviour, triggers, stressors, confusion, outside help, characteristics, unmet need, themes and uncertainty.</li>
            <li>Zod validates the structure. Every populated field must carry a verbatim quote; demographics stay unknown unless quoted.</li>
            <li>Codebook themes whose quote is not verbatim are pruned and reported, so they can never inflate a count.</li>
            <li>Outputs are stored immutably with run id, model, prompt version and timestamp.</li>
          </ol>
        </div>
      </div>

      <section className="rx-section">
        <header>
          <h2>Analysis runs</h2>
        </header>
        {runs.length ? (
          <div className="rx-table-wrap">
            <table className="rx-table">
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Provider / model</th>
                  <th>Prompt</th>
                  <th>Started</th>
                  <th className="rx-right">Records</th>
                  <th className="rx-right">Valid</th>
                  <th className="rx-right">Failed</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="rx-mono">{r.id.slice(0, 8)}</td>
                    <td>{r.provider} · {r.model}</td>
                    <td className="rx-small">{r.promptVersion}</td>
                    <td className="rx-small">{fmtDate(r.startedAt)} {r.startedAt.slice(11, 16)}</td>
                    <td className="rx-right rx-num">{r.totalRecords}</td>
                    <td className="rx-right rx-num">{r.successfulRecords}</td>
                    <td className="rx-right rx-num">{r.failedRecords}</td>
                    <td>{r.status === 'completed' ? <SourcePill kind="public">Completed</SourcePill> : <SourcePill kind="warn">{r.status}</SourcePill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rx-small rx-muted">No runs yet.</p>
        )}
      </section>

      <section className="rx-section">
        <header>
          <h2>Records and extracted attributes</h2>
          <p>Expand a record to compare the original text (observation) with what the model extracted (inference). Cited spans are highlighted in the source.</p>
        </header>
        <AnalysisRecords records={records} />
      </section>
    </div>
  );
}
