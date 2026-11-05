'use client';

import { useState, useTransition } from 'react';
import { runEvaluationAction } from '@/app/actions';

export function ReliabilityLab({
  evalResult,
  failureCases,
  latestRunId,
}: {
  evalResult: any;
  failureCases: any[];
  latestRunId: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedFailure, setSelectedFailure] = useState<any | null>(null);
  const [showAllGoldenItems, setShowAllGoldenItems] = useState(false);

  const handleRunEvaluation = () => {
    if (!latestRunId) {
      alert('No AI analysis runs found in database. Run batch analysis on evidence first.');
      return;
    }

    setMsg(null);
    startTransition(async () => {
      const res = await runEvaluationAction(latestRunId);
      if (res.success) {
        setMsg({ type: 'success', text: 'Golden-set evaluation successfully executed.' });
      } else {
        setMsg({ type: 'error', text: res.error || 'Evaluation run failed.' });
      }
    });
  };

  const formatPct = (val: number | null | undefined) => {
    if (val === null || val === undefined) return 'N/A';
    return `${Math.round(val * 100)}%`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Banner / Evaluation Runner */}
      <div
        className="card"
        style={{
          padding: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600 }}>AI Reliability & Ground-Truth Lab</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
            Evaluation outcomes are separated by provider and evidence provenance. Genuine failure audits exclude fixtures and unverified records.
          </p>
        </div>

        <button
          className="btn btn-primary"
          onClick={handleRunEvaluation}
          disabled={isPending || !latestRunId}
        >
          {isPending ? 'Evaluating...' : '⚡ Re-run Golden Evaluation'}
        </button>
      </div>

      {msg && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            fontSize: '13px',
            background: msg.type === 'success' ? 'var(--emerald-glow)' : 'var(--red-glow)',
            border: `1px solid ${msg.type === 'success' ? 'var(--emerald-border)' : 'var(--red-border)'}`,
            color: msg.type === 'success' ? 'var(--emerald-400)' : 'var(--red-400)',
          }}
        >
          {msg.text}
        </div>
      )}

      {/* Model & Evaluation Provenance Banner */}
      {evalResult && (
        <div
          className="card"
          style={{
            padding: '14px 18px',
            background: 'var(--bg-surface-raised)',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            fontSize: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text-muted)' }}>Evaluation Target:</span>
            <span className="badge badge-purple" style={{ fontFamily: 'var(--font-mono)' }}>
              Provider: {evalResult.provider || 'simulated-double'}
            </span>
            <span className="badge badge-zinc" style={{ fontFamily: 'var(--font-mono)' }}>
              Model: {evalResult.model || 'test-double'} ({evalResult.modelVersion || '1.0.0'})
            </span>
            <span className="badge badge-emerald">
              Evaluation Sample: {evalResult.totalGoldenRecords} items
            </span>
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
            Evaluated on: {evalResult.evaluatedAt ? new Date(evalResult.evaluatedAt).toLocaleString() : 'N/A'}
          </div>
        </div>
      )}

      {/* Simulated Double Warning Banner */}
      {evalResult && (evalResult.isSimulated || evalResult.provider === 'fake') && (
        <div
          style={{
            padding: '14px 18px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid var(--red-border)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            fontSize: '13px',
            color: 'var(--red-400)',
          }}
        >
          <span style={{ fontSize: '18px', lineHeight: 1 }}>🧪</span>
          <div>
            <strong>SIMULATED TEST DOUBLE:</strong>{' '}
            This historical evaluation used the deterministic FakeAIProvider, not a live AI model.
            <em> Agreement is a software test diagnostic and is not model accuracy or investor research.</em>
          </div>
        </div>
      )}

      {/* Incomplete Evaluation Warning */}
      {evalResult && evalResult.isIncomplete && (
        <div
          style={{
            padding: '14px 18px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--amber-glow)',
            border: '1px solid var(--amber-border)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            fontSize: '13px',
            color: 'var(--amber-400)',
          }}
        >
          <span style={{ fontSize: '18px', lineHeight: 1 }}>⚠️</span>
          <div>
            <strong>INCOMPLETE EVALUATION:</strong>{' '}
            {evalResult.missingDetails || 'Evaluation is missing independent labels or eligible predictions for some records. Metrics may be partial.'}
          </div>
        </div>
      )}

      {/* Small Sample Warning Invariant */}
      {evalResult && (evalResult.smallSampleWarning || evalResult.totalGoldenRecords < 50) && (
        <div
          style={{
            padding: '14px 18px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--amber-glow)',
            border: '1px solid var(--amber-border)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            fontSize: '13px',
            color: 'var(--amber-400)',
          }}
        >
          <span style={{ fontSize: '18px', lineHeight: 1 }}>⚠️</span>
          <div>
            <strong>Evaluation Sample (n = {evalResult.totalGoldenRecords}):</strong>{' '}
            Evidence basis: {evalResult.genuineSampleSize ?? 0} genuine eligible, {evalResult.illustrativeSampleSize ?? 0} illustrative fixture, and {evalResult.otherSampleSize ?? evalResult.totalGoldenRecords} other/ineligible record(s). Fixture outcomes are illustrative and cannot establish research findings or model performance on genuine investor evidence.
          </div>
        </div>
      )}

      {/* Top KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
        }}
      >
        <div className="card" style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Evaluated Labelled Sample</span>
          <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
            {evalResult ? evalResult.totalGoldenRecords : 0}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Genuine {evalResult?.genuineSampleSize ?? 0} · Illustrative {evalResult?.illustrativeSampleSize ?? 0} · Other {evalResult?.otherSampleSize ?? evalResult?.totalGoldenRecords ?? 0}</span>
        </div>

        <div className="card" style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {evalResult?.isSimulated || evalResult?.provider === 'fake' ? 'Simulated Agreement' : evalResult?.genuineSampleSize === 0 ? 'Illustrative Match Rate' : 'Exact Theme Agreement'}
          </span>
          <div style={{ fontSize: '28px', fontWeight: 700, color: evalResult?.isSimulated || evalResult?.genuineSampleSize === 0 ? 'var(--text-muted)' : 'var(--emerald-400)', marginTop: '4px' }}>
            {evalResult ? `${(evalResult.accuracy * 100).toFixed(1)}%` : '0%'}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            {evalResult?.isSimulated ? 'Deterministic test assertion' : evalResult?.genuineSampleSize === 0 ? 'Illustrative data only' : 'Ground-truth match rate'}
          </span>
        </div>

        <div className="card" style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Abstention Precision</span>
          <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--blue-400)', marginTop: '4px' }}>
            {evalResult && evalResult.abstentionAccuracy != null ? `${(evalResult.abstentionAccuracy * 100).toFixed(1)}%` : 'N/A'}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Refusal on ambiguous input</span>
        </div>

        <div className="card" style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Logged Failure Cases</span>
          <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--red-400)', marginTop: '4px' }}>
            {failureCases.length}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Audited with root-cause RCA</span>
        </div>
      </div>

      {evalResult?.diagnostics && (
        <section className="card">
          <h3 style={{ fontSize: 16, fontWeight: 600 }}>Extraction quality diagnostics</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>
            Denominators are limited to evaluated records with the required human label or model span. These checks assess extractability and literal grounding, not whether an interpretation is substantively correct.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginTop: 14 }}>
            {([
              ['Journey-stage agreement', evalResult.diagnostics.journeyStageAgreement],
              ['Behaviour extraction coverage', evalResult.diagnostics.behaviorExtractionCoverage],
              ['Literal evidence grounding', evalResult.diagnostics.evidenceGroundingAccuracy],
              ['Unsupported inference claims', evalResult.diagnostics.unsupportedInferenceRate],
              ['Abstention precision', evalResult.diagnostics.abstentionPrecision],
              ['Abstention recall', evalResult.diagnostics.abstentionRecall],
            ] as const).map(([label, metric]) => <div key={label} style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, padding: 12 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
              <p style={{ fontSize: 18, fontWeight: 700, marginTop: 5 }}>{metric.denominator ? `${((metric.numerator / metric.denominator) * 100).toFixed(1)}%` : 'N/A'}</p>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{metric.numerator}/{metric.denominator} checks</p>
            </div>)}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>Evaluation records with diagnostic notes: {evalResult.diagnostics.evaluationSampleSize}</p>
        </section>
      )}

      {/* Grid: Left Per-Theme Metrics (60%), Right Error Categories (40%) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: '24px',
          alignItems: 'start',
        }}
      >
        {/* Per-Theme Performance Table */}
        <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Per-Theme Classification Metrics</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>
              Precision, Recall, and F1 with mandatory support threshold guard (support &ge; 3).
            </p>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface-raised)', borderBottom: '1px solid var(--border-subtle)' }}>
                  <th style={{ padding: '10px 16px', color: 'var(--text-secondary)', fontWeight: 600 }}>Theme Name</th>
                  <th style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 600, width: '80px' }}>Support</th>
                  <th style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 600, width: '80px' }}>Precision</th>
                  <th style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 600, width: '80px' }}>Recall</th>
                  <th style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 600, width: '80px' }}>F1 Score</th>
                </tr>
              </thead>
              <tbody>
                {!evalResult || !evalResult.metricsByTheme || evalResult.metricsByTheme.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No evaluation metrics available yet.
                    </td>
                  </tr>
                ) : (
                  evalResult.metricsByTheme.map((m: any, idx: number) => {
                    const isLowSupport = !m.statisticallyMeaningful;

                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{m.themeName}</span>
                            {isLowSupport && (
                              <span style={{ fontSize: '10px', color: 'var(--amber-400)' }}>
                                ⚠️ Low Support (n &lt; 3) — F1 unstable
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '12px 12px', color: 'var(--text-secondary)' }}>
                          {m.support}
                        </td>
                        <td style={{ padding: '12px 12px', color: 'var(--text-primary)' }}>
                          {formatPct(m.precision)}
                        </td>
                        <td style={{ padding: '12px 12px', color: 'var(--text-primary)' }}>
                          {formatPct(m.recall)}
                        </td>
                        <td style={{ padding: '12px 12px', fontWeight: 600, color: isLowSupport ? 'var(--text-muted)' : 'var(--emerald-400)' }}>
                          {formatPct(m.f1)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Error Breakdown Bars */}
        <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Failure Mode Taxonomy</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>
              Granular breakdown of model discrepancies against ground truth.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {evalResult?.commonErrorCategories &&
              Object.entries(evalResult.commonErrorCategories).map(([key, count]: any) => {
                const label =
                  key === 'wrong_theme'
                    ? 'Theme Misclassification'
                    : key === 'missed_abstention'
                    ? 'Missed Abstention (Overconfidence)'
                    : key === 'unwarranted_abstention'
                    ? 'Unwarranted Abstention'
                    : key === 'unsupported_context'
                    ? 'Unsupported Context Assertion'
                    : key === 'excerpt_mismatch'
                    ? 'Excerpt Verbatim Mismatch'
                    : 'Unlabelled Inference';

                return (
                  <div key={key}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '3px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                      <span style={{ color: count > 0 ? 'var(--red-400)' : 'var(--text-muted)', fontWeight: 600 }}>
                        {count} instances
                      </span>
                    </div>
                    <div style={{ height: '6px', background: 'var(--bg-surface-raised)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${Math.min(100, count * 20)}%`,
                          height: '100%',
                          background: count > 0 ? 'var(--red-500)' : 'var(--border-subtle)',
                          borderRadius: '3px',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* Confusion Matrix Section */}
      {evalResult?.confusionMatrix && evalResult.confusionMatrix.length > 0 && (
        <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Confusion Matrix (Ground Truth vs. AI Predicted)</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>
              Diagonal elements represent verified true positives. Off-diagonal elements identify systematic misattribution.
            </p>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface-raised)', borderBottom: '1px solid var(--border-subtle)' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-secondary)' }}>Actual \ Predicted</th>
                  {Array.from(new Set(evalResult.confusionMatrix.map((c: any) => c.predicted))).map((pred: any) => (
                    <th key={pred} style={{ padding: '8px 10px', color: 'var(--text-secondary)', maxWidth: '140px' }}>
                      {pred.length > 20 ? pred.slice(0, 18) + '…' : pred}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from(new Set(evalResult.confusionMatrix.map((c: any) => c.actual))).map((act: any) => {
                  return (
                    <tr key={act} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500, color: 'var(--text-primary)' }}>
                        {act}
                      </td>
                      {Array.from(new Set(evalResult.confusionMatrix.map((c: any) => c.predicted))).map((pred: any) => {
                        const cell = evalResult.confusionMatrix.find(
                          (c: any) => c.actual === act && c.predicted === pred
                        );
                        const count = cell ? cell.count : 0;
                        const isMatch = act.toLowerCase() === pred.toLowerCase();

                        return (
                          <td
                            key={pred}
                            style={{
                              padding: '8px 10px',
                              background:
                                count > 0
                                  ? isMatch
                                    ? 'rgba(0, 208, 156, 0.12)'
                                    : 'rgba(239, 68, 68, 0.12)'
                                  : 'transparent',
                              color:
                                count > 0
                                  ? isMatch
                                    ? 'var(--emerald-400)'
                                    : 'var(--red-400)'
                                  : 'var(--text-muted)',
                              fontWeight: count > 0 ? 600 : 400,
                            }}
                          >
                            {count}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Full Golden-Set Evaluation Audit Table */}
      {evalResult?.items && evalResult.items.length > 0 && (
        <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="badge badge-emerald">Audit Trail</span>
                <h3 style={{ fontSize: '15px', fontWeight: 600 }}>
                  Complete Golden-Set Diagnostic Inspection ({evalResult.items.length} records)
                </h3>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>
                Item-by-item comparison of independent human ground-truth labels vs. AI model predictions.
              </p>
            </div>

            <button
              className="btn btn-secondary"
              style={{ fontSize: '12px', padding: '6px 12px' }}
              onClick={() => setShowAllGoldenItems(!showAllGoldenItems)}
            >
              {showAllGoldenItems ? '▲ Collapse Item List' : `▼ Inspect All ${evalResult.items.length} Evaluated Records`}
            </button>
          </div>

          {showAllGoldenItems && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-surface-raised)', borderBottom: '1px solid var(--border-subtle)' }}>
                    <th style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontWeight: 600, width: '40px' }}>#</th>
                    <th style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontWeight: 600 }}>Verbatim Quote Excerpt</th>
                    <th style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontWeight: 600, width: '180px' }}>Golden Ground Truth</th>
                    <th style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontWeight: 600, width: '180px' }}>AI Predicted Theme</th>
                    <th style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontWeight: 600, width: '100px' }}>Agreement</th>
                    <th style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontWeight: 600, width: '140px' }}>Error Category</th>
                  </tr>
                </thead>
                <tbody>
                  {evalResult.items.map((item: any, idx: number) => {
                    const isMatch = item.isMatch;
                    return (
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{idx + 1}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <p style={{ fontFamily: 'var(--font-serif)', color: 'var(--text-primary)', fontStyle: 'italic' }}>
                            “{item.evidenceText.length > 80 ? item.evidenceText.slice(0, 80) + '…' : item.evidenceText}”
                          </p>
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--emerald-400)', fontWeight: 500 }}>
                          {item.actualTheme}
                        </td>
                        <td style={{ padding: '10px 14px', color: isMatch ? 'var(--text-primary)' : 'var(--red-400)', fontWeight: 500 }}>
                          {item.predictedTheme}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {isMatch ? (
                            <span className="badge badge-emerald" style={{ fontSize: '10px' }}>
                              ✅ Match
                            </span>
                          ) : (
                            <span className="badge badge-red" style={{ fontSize: '10px' }}>
                              ❌ Mismatch
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span
                            style={{
                              fontSize: '11px',
                              color: isMatch ? 'var(--text-muted)' : 'var(--red-400)',
                              textTransform: 'capitalize',
                            }}
                          >
                            {item.errorCategory.replace(/_/g, ' ')}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Genuine Failure Cases Audit Table */}
      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="badge badge-red">RCA Log</span>
            <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Genuine Human-Corrected Failure Cases ({failureCases.length})</h3>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '4px' }}>
            Documented real failure cases showing original flawed model inference, human reviewer rationale, lessons learned, and active programmatic guards.
          </p>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface-raised)', borderBottom: '1px solid var(--border-subtle)' }}>
                <th style={{ padding: '10px 16px', color: 'var(--text-secondary)', fontWeight: 600, width: '160px' }}>Failure Type</th>
                <th style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontWeight: 600 }}>Original Verbatim Excerpt</th>
                <th style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontWeight: 600, width: '220px' }}>Original vs Corrected</th>
                <th style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontWeight: 600, width: '220px' }}>Lesson & Prevention Guard</th>
                <th style={{ padding: '10px 16px', color: 'var(--text-secondary)', fontWeight: 600, width: '80px', textAlign: 'right' }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {failureCases.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No genuine human-corrected failure examples are recorded yet. Synthetic fixture analysis is excluded from this section.
                  </td>
                </tr>
              ) : (
                failureCases.map((fc) => {
                  const rawPred = typeof fc.originalPrediction === 'object' ? fc.originalPrediction : null;
                  const corrOut = typeof fc.correctedOutput === 'object' ? fc.correctedOutput : null;

                  return (
                    <tr
                      key={fc.id}
                      style={{ borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer' }}
                      onClick={() => setSelectedFailure(fc)}
                    >
                      <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
                        <span className="badge badge-red" style={{ fontSize: '11px', textTransform: 'capitalize' }}>
                          {fc.failureType.replace(/_/g, ' ')}
                        </span>
                      </td>

                      <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                        <p
                          style={{
                            fontFamily: 'var(--font-serif)',
                            fontSize: '13px',
                            color: 'var(--text-primary)',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          “{fc.originalText || 'Verbatim feedback reference'}”
                        </p>
                      </td>

                      <td style={{ padding: '12px 14px', verticalAlign: 'top', fontSize: '12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ color: 'var(--red-400)' }}>
                            AI: {rawPred?.theme?.name || 'Erroneous Output'}
                          </span>
                          <span style={{ color: 'var(--emerald-400)' }}>
                            Human: {corrOut?.themeName || 'Corrected Theme'}
                          </span>
                        </div>
                      </td>

                      <td style={{ padding: '12px 14px', verticalAlign: 'top', fontSize: '12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>
                            <strong>Lesson:</strong> {fc.lessonLearned}
                          </span>
                          <span style={{ color: 'var(--emerald-400)' }}>
                            <strong>Guard:</strong> {fc.preventionStrategy}
                          </span>
                        </div>
                      </td>

                      <td style={{ padding: '12px 16px', verticalAlign: 'top', textAlign: 'right' }}>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '2px 8px', fontSize: '11px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFailure(fc);
                          }}
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Failure Case Deep Inspection Modal */}
      {selectedFailure && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'var(--modal-overlay, rgba(0, 0, 0, 0.8))',
            backdropFilter: 'blur(8px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={() => setSelectedFailure(null)}
        >
          <div
            className="card"
            style={{ width: '100%', maxWidth: '600px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span className="badge badge-red" style={{ fontSize: '11px' }}>
                  Failure Case #{selectedFailure.id.slice(0, 8)}
                </span>
                <h3 style={{ fontSize: '16px', fontWeight: 600, marginTop: '4px' }}>
                  {selectedFailure.failureType.replace(/_/g, ' ').toUpperCase()}
                </h3>
              </div>
              <button className="btn btn-secondary" onClick={() => setSelectedFailure(null)}>
                ✕
              </button>
            </div>

            <div
              style={{
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-canvas)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
                Verbatim Input Excerpt:
              </span>
              <p style={{ fontFamily: 'var(--font-serif)', color: 'var(--text-primary)', marginTop: '4px', fontStyle: 'italic' }}>
                “{selectedFailure.originalText}”
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div
                style={{
                  padding: '12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--red-glow)',
                  border: '1px solid var(--red-border)',
                }}
              >
                <span style={{ fontSize: '11px', color: 'var(--red-400)', fontWeight: 600 }}>
                  Original Flawed Model Output:
                </span>
                <pre style={{ fontSize: '11px', color: 'var(--text-primary)', marginTop: '6px', whiteSpace: 'pre-wrap', maxHeight: '140px', overflowY: 'auto' }}>
                  {typeof selectedFailure.originalPrediction === 'object'
                    ? JSON.stringify(selectedFailure.originalPrediction, null, 2)
                    : selectedFailure.originalPrediction}
                </pre>
              </div>

              <div
                style={{
                  padding: '12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--emerald-glow)',
                  border: '1px solid var(--emerald-border)',
                }}
              >
                <span style={{ fontSize: '11px', color: 'var(--emerald-400)', fontWeight: 600 }}>
                  Human Reviewer Correction:
                </span>
                <pre style={{ fontSize: '11px', color: 'var(--text-primary)', marginTop: '6px', whiteSpace: 'pre-wrap', maxHeight: '140px', overflowY: 'auto' }}>
                  {typeof selectedFailure.correctedOutput === 'object'
                    ? JSON.stringify(selectedFailure.correctedOutput, null, 2)
                    : selectedFailure.correctedOutput}
                </pre>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
              <div>
                <strong>Reviewer Justification:</strong>
                <p style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {selectedFailure.reviewerRationale}
                </p>
              </div>

              <div>
                <strong style={{ color: 'var(--amber-400)' }}>Lesson Learned:</strong>
                <p style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {selectedFailure.lessonLearned}
                </p>
              </div>

              <div>
                <strong style={{ color: 'var(--emerald-400)' }}>Active Prevention Strategy / Guard:</strong>
                <p style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {selectedFailure.preventionStrategy}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
