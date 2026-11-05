'use client';

import { useState, useTransition } from 'react';
import {
  submitReviewAction,
  updateEvidenceMetadataAction,
  runBatchAnalysisAction,
  verifyEvidenceAction,
} from '@/app/actions';

export function EvidenceDetailModal({
  record,
  onClose,
}: {
  record: any;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'details' | 'review' | 'metadata_audit'>('details');
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Verification state
  const [verificationStatus, setVerificationStatus] = useState<string>(
    record.verificationStatus || (record.isSynthetic ? 'synthetic_fixture' : 'unverified')
  );
  const [verifiedAt, setVerifiedAt] = useState<string | null>(record.verifiedAt || null);
  const [verifiedBy, setVerifiedBy] = useState<string | null>(record.verifiedBy || null);

  // Review Form state
  const [decision, setDecision] = useState<'confirmed' | 'corrected' | 'rejected'>('confirmed');
  const [rationale, setRationale] = useState('');
  const [reviewer, setReviewer] = useState('PM Fellowship Reviewer');
  const [revisedTheme, setRevisedTheme] = useState(record.latestAnalysis?.parsedOutput?.theme?.name || '');
  const [revisedStage, setRevisedStage] = useState(record.journeyStage || 'unclear');
  const [revisedBehaviour, setRevisedBehaviour] = useState(record.latestAnalysis?.parsedOutput?.observedBehaviour || '');

  // Failure case state
  const [logFailureCase, setLogFailureCase] = useState(false);
  const [failureType, setFailureType] = useState<any>('theme_misclassification');
  const [lessonLearned, setLessonLearned] = useState('');
  const [preventionStrategy, setPreventionStrategy] = useState('');

  // Metadata Edit state
  const [editJourneyStage, setEditJourneyStage] = useState(record.journeyStage);
  const [editInvestorContext, setEditInvestorContext] = useState(record.investorContext || '');
  const [editReason, setEditReason] = useState('');

  const handleReviewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!record.latestAnalysis) {
      alert('This record has not been analyzed by AI yet. Run analysis first before reviewing.');
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const res = await submitReviewAction({
        recordAnalysisId: record.latestAnalysis.id,
        evidenceId: record.id,
        decision,
        rationale,
        reviewer,
        revisedOutput:
          decision === 'corrected'
            ? {
                themeName: revisedTheme,
                journeyStage: revisedStage,
                observedBehaviour: revisedBehaviour,
              }
            : null,
        failureCaseDetails:
          logFailureCase && (decision === 'corrected' || decision === 'rejected')
            ? {
                failureType,
                lessonLearned,
                preventionStrategy,
              }
            : undefined,
      });

      if (res.success) {
        setSuccessMsg(`Review successfully recorded as "${decision}". Original AI output preserved intact.`);
        setTimeout(() => onClose(), 2000);
      } else {
        setErrorMsg(res.error || 'Failed to submit review.');
      }
    });
  };

  const handleMetadataEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const res = await updateEvidenceMetadataAction(
        record.id,
        {
          journeyStage: editJourneyStage,
          investorContext: editInvestorContext.trim() || null,
        },
        editReason,
        reviewer
      );

      if (res.success) {
        setSuccessMsg('Metadata updated and recorded in immutable audit log.');
        setTimeout(() => onClose(), 2000);
      } else {
        setErrorMsg(res.error || 'Metadata update failed.');
      }
    });
  };

  const handleTriggerAnalysis = () => {
    startTransition(async () => {
      const res = await runBatchAnalysisAction({
        recordIds: [record.id],
      });
      if (res.success) {
        setSuccessMsg('Analysis generated successfully.');
        setTimeout(() => onClose(), 1500);
      } else {
        setErrorMsg(res.error || 'Analysis failed.');
      }
    });
  };

  const handleVerifyEvidence = (status: 'content_verified' | 'link_checked' | 'unverified') => {
    setErrorMsg(null);
    setSuccessMsg(null);
    startTransition(async () => {
      const res = await verifyEvidenceAction(
        record.id,
        status,
        reviewer,
        `Provenance audit status marked as ${status}`
      );
      if (res.success) {
        setVerificationStatus(status);
        setVerifiedAt(new Date().toISOString());
        setVerifiedBy(reviewer);
        setSuccessMsg(`Evidence status successfully updated to "${status}".`);
      } else {
        setErrorMsg(res.error || 'Failed to update verification status.');
      }
    });
  };

  const parsedAi = record.latestAnalysis?.parsedOutput;
  const latestRev = record.latestReview;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--modal-overlay, rgba(0, 0, 0, 0.8))',
        backdropFilter: 'blur(8px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '780px',
          maxHeight: '92vh',
          overflowY: 'auto',
          border: '1px solid var(--border-strong)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span className="badge badge-neutral">{record.platform}</span>
              <span className="badge badge-emerald">{record.journeyStage.replace(/_/g, ' ')}</span>
              {record.duplicateOfId && <span className="badge badge-amber">Duplicate Linked</span>}
            </div>
            <h2 style={{ fontSize: '18px', marginTop: '6px' }}>Evidence Inspection & Review</h2>
          </div>
          <button onClick={onClose} className="btn btn-secondary" style={{ padding: '4px 8px' }}>
            ✕
          </button>
        </div>

        {/* Tab switch */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px', marginBottom: '16px' }}>
          <button
            className={`btn ${activeTab === 'details' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('details')}
            style={{ fontSize: '12px' }}
          >
            📋 Evidence & AI Output
          </button>
          <button
            className={`btn ${activeTab === 'review' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('review')}
            style={{ fontSize: '12px' }}
          >
            ⚖️ Human Review Decision
          </button>
          <button
            className={`btn ${activeTab === 'metadata_audit' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('metadata_audit')}
            style={{ fontSize: '12px' }}
          >
            🔍 Metadata Audit Trail
          </button>
        </div>

        {errorMsg && (
          <div style={{ background: 'var(--red-glow)', border: '1px solid var(--red-border)', color: 'var(--red-400)', padding: '10px 14px', borderRadius: 'var(--radius-md)', marginBottom: '14px', fontSize: '12px' }}>
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div style={{ background: 'var(--emerald-glow)', border: '1px solid var(--emerald-border)', color: 'var(--emerald-400)', padding: '10px 14px', borderRadius: 'var(--radius-md)', marginBottom: '14px', fontSize: '12px' }}>
            {successMsg}
          </div>
        )}

        {activeTab === 'details' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Verbatim Feedback */}
            <div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Verbatim Feedback (Immutable Original Evidence)
              </span>
              <p className="editorial-quote" style={{ marginTop: '6px' }}>
                &ldquo;{record.originalText}&rdquo;
              </p>
            </div>

            {/* Provenance breakdown */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', background: 'var(--bg-canvas)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Source Provenance &amp; Verification</div>
                {record.isSynthetic ? <span className="badge badge-amber" style={{ fontSize: '11px' }}>Synthetic fixture · no research source; never verified</span> : <a
                  href={record.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: '12px', color: 'var(--blue-400)', textDecoration: 'underline', wordBreak: 'break-all' }}
                >
                  {record.sourceUrl} ↗
                </a>}
                <div style={{ marginTop: '4px' }}>
                  {verificationStatus === 'content_verified' ? (
                    <span className="badge badge-emerald" style={{ fontSize: '10px' }}>
                      ● Content Verified
                    </span>
                  ) : verificationStatus === 'link_checked' ? (
                    <span className="badge badge-blue" style={{ fontSize: '10px' }}>
                      ● Link Checked
                    </span>
                  ) : verificationStatus === 'synthetic_fixture' || record.isSynthetic ? (
                    <span className="badge badge-amber" style={{ fontSize: '10px' }}>
                      ◆ Synthetic Benchmark Fixture
                    </span>
                  ) : verificationStatus === 'user_entered' ? (
                    <span className="badge badge-purple" style={{ fontSize: '10px' }}>
                      ▲ User-Entered Submission
                    </span>
                  ) : (
                    <span className="badge badge-zinc" style={{ fontSize: '10px' }}>
                      ○ Unverified Link
                    </span>
                  )}
                </div>
                {verifiedAt && (
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Audited by {verifiedBy || 'Reviewer'} on {new Date(verifiedAt).toLocaleDateString()}
                  </div>
                )}
                {/* Audit Controls */}
                {record.isSynthetic ? (
                  <p style={{ fontSize: '10px', color: 'var(--amber-400)', marginTop: '8px' }}>
                    Fixture provenance cannot be changed to genuine verification.
                  </p>
                ) : <div style={{ marginTop: '8px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: '10px', padding: '2px 6px', color: 'var(--emerald-400)' }}
                    disabled={isPending}
                    onClick={() => handleVerifyEvidence('content_verified')}
                  >
                    ✓ Verify Content
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: '10px', padding: '2px 6px', color: 'var(--blue-400)' }}
                    disabled={isPending}
                    onClick={() => handleVerifyEvidence('link_checked')}
                  >
                    🌐 Check Link
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: '10px', padding: '2px 6px' }}
                    disabled={isPending}
                    onClick={() => handleVerifyEvidence('unverified')}
                  >
                    Unverify
                  </button>
                </div>}
              </div>

              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Investor Context</div>
                <div style={{ fontSize: '12px', color: record.investorContext ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  {record.investorContext || 'Not explicitly stated in source'}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--amber-400)', marginTop: '2px' }}>
                  {record.investorContext ? '⚠️ Context Annotation' : 'Unverified (Preserved)'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Collection Timestamp</div>
                <div style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{record.collectedAt}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Entry Method: <code>{record.entryMethod || 'seed'}</code>
                </div>
              </div>
            </div>

            {/* AI Analysis Section */}
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  AI Discovery Classification
                </span>
                {record.latestAnalysis?.provider && <span className={`badge ${record.latestAnalysis.provider === 'fake' ? 'badge-amber' : 'badge-neutral'}`} title="Analysis provider and model version are recorded in the analysis run.">{record.latestAnalysis.provider === 'fake' ? 'Simulated analysis' : `${record.latestAnalysis.provider} · ${record.latestAnalysis.model || 'model unknown'}`}</span>}
                {!parsedAi && (
                  <button onClick={handleTriggerAnalysis} disabled={isPending} className="btn btn-primary" style={{ fontSize: '12px', padding: '4px 10px' }}>
                    {isPending ? 'Analyzing...' : '⚡ Run AI Analysis'}
                  </button>
                )}
              </div>

              {parsedAi ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                    <div style={{ padding: '10px', background: 'var(--bg-canvas)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Discovered Theme</span>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--emerald-400)', marginTop: '2px' }}>
                        {parsedAi.theme?.name || 'Abstained'}
                      </div>
                    </div>

                    <div style={{ padding: '10px', background: 'var(--bg-canvas)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Model Confidence (Self-Reported)</span>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--amber-400)', marginTop: '2px' }}>
                        {parsedAi.selfReportedConfidence.toUpperCase()} (Unvalidated)
                      </div>
                    </div>
                  </div>

                  {/* Claims separation */}
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      Observation vs Inference Claims
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                      {parsedAi.claims?.map((claim: any, idx: number) => (
                        <div
                          key={idx}
                          style={{
                            padding: '8px 10px',
                            borderRadius: 'var(--radius-md)',
                            background: 'var(--bg-canvas)',
                            borderLeft: claim.type === 'observation' ? '3px solid var(--blue-500)' : '3px solid var(--purple-500)',
                            fontSize: '12px',
                          }}
                        >
                          <span className={`badge ${claim.type === 'observation' ? 'badge-blue' : 'badge-purple'}`} style={{ fontSize: '10px', marginRight: '6px' }}>
                            {claim.type.toUpperCase()}
                          </span>
                          {claim.text}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* SIP Continuation Hypothesis */}
                  {parsedAi.sipContinuationHypothesis && (
                    <div style={{ padding: '12px', background: 'rgba(168, 85, 247, 0.08)', border: '1px solid var(--purple-border)', borderRadius: 'var(--radius-md)' }}>
                      <span className="badge badge-purple" style={{ fontSize: '10px', marginBottom: '4px' }}>
                        {parsedAi.sipContinuationHypothesis.label}
                      </span>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--purple-400)', marginTop: '4px' }}>
                        {parsedAi.sipContinuationHypothesis.hypothesisText}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        <strong>Mechanism:</strong> {parsedAi.sipContinuationHypothesis.plausibleMechanism}
                      </div>
                    </div>
                  )}

                  {/* Follow-up question */}
                  {parsedAi.followUpResearchQuestion && (
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <strong>Follow-up Research Question:</strong> {parsedAi.followUpResearchQuestion}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ padding: '20px', textAlign: 'center', background: 'var(--bg-canvas)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', fontSize: '12px' }}>
                  No AI analysis recorded yet for this evidence item.
                </div>
              )}
            </div>

            {/* Existing Review Status */}
            {latestRev && (
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '14px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Latest Human Review Decision
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
                  <span className={`badge ${latestRev.decision === 'confirmed' ? 'badge-emerald' : latestRev.decision === 'corrected' ? 'badge-amber' : 'badge-red'}`} style={{ fontSize: '12px' }}>
                    {latestRev.decision.toUpperCase()}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Reviewed by <strong>{latestRev.reviewer}</strong> on {latestRev.createdAt}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginTop: '6px', background: 'var(--bg-canvas)', padding: '10px', borderRadius: 'var(--radius-md)' }}>
                  <strong>Reviewer Rationale:</strong> {latestRev.rationale}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'review' && (
          <form onSubmit={handleReviewSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>
                Review Decision *
              </label>
              <div style={{ display: 'flex', gap: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
                  <input
                    type="radio"
                    name="decision"
                    value="confirmed"
                    checked={decision === 'confirmed'}
                    onChange={() => setDecision('confirmed')}
                  />
                  ✅ Confirmed (Accurate output)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
                  <input
                    type="radio"
                    name="decision"
                    value="corrected"
                    checked={decision === 'corrected'}
                    onChange={() => setDecision('corrected')}
                  />
                  ✏️ Corrected (Provide revised classification)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
                  <input
                    type="radio"
                    name="decision"
                    value="rejected"
                    checked={decision === 'rejected'}
                    onChange={() => setDecision('rejected')}
                  />
                  ❌ Rejected (Fundamentally flawed or hallucinated)
                </label>
              </div>
            </div>

            {decision === 'corrected' && (
              <div style={{ padding: '14px', background: 'var(--bg-canvas)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--amber-400)' }}>
                  Revised Human Classification
                </span>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Revised Theme Name
                  </label>
                  <input
                    type="text"
                    value={revisedTheme}
                    onChange={(e) => setRevisedTheme(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Revised Journey Stage
                  </label>
                  <select
                    value={revisedStage}
                    onChange={(e) => setRevisedStage(e.target.value)}
                  >
                    <option value="discovery_intent">Discovery & Intent</option>
                    <option value="mandate_kyc_setup">Mandate & KYC Setup</option>
                    <option value="first_instalment">First Instalment & NAV Allotment</option>
                    <option value="market_dip_reaction">Market Dip & Drawdown Reaction</option>
                    <option value="autopay_failure_recovery">Autopay Failure & Recovery</option>
                    <option value="continuation_milestone">Continuation Milestone</option>
                    <option value="pause_cancellation">Pause & Cancellation</option>
                    <option value="unclear">Unclear</option>
                  </select>
                </div>
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Reviewer Rationale * (Mandatory explanation)
              </label>
              <textarea
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                rows={3}
                placeholder="Explain the specific factual or behavioral basis for confirming, correcting, or rejecting this model output..."
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Reviewer Name
              </label>
              <input
                type="text"
                value={reviewer}
                onChange={(e) => setReviewer(e.target.value)}
                required
              />
            </div>

            {/* Document failure case */}
            {(decision === 'corrected' || decision === 'rejected') && (
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: 'var(--amber-400)' }}>
                  <input
                    type="checkbox"
                    checked={logFailureCase}
                    onChange={(e) => setLogFailureCase(e.target.checked)}
                  />
                  Document as Genuine AI Failure Case for Reliability Lab
                </label>

                {logFailureCase && (
                  <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Failure Category
                      </label>
                      <select value={failureType} onChange={(e) => setFailureType(e.target.value as any)}>
                        <option value="theme_misclassification">Theme Misclassification</option>
                        <option value="hallucinated_context">Hallucinated Investor Context</option>
                        <option value="unwarranted_causal_leap">Unwarranted Causal Leap</option>
                        <option value="overconfidence_on_vague_text">Overconfidence on Vague/Spam Text</option>
                        <option value="excerpt_mismatch">Non-verbatim Excerpt</option>
                        <option value="missed_sarcasm">Missed Sarcasm / Sentiment Inversion</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Lesson Learned
                      </label>
                      <input
                        type="text"
                        value={lessonLearned}
                        onChange={(e) => setLessonLearned(e.target.value)}
                        placeholder="What architectural or prompt lesson was learned?"
                        required={logFailureCase}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Prevention Strategy
                      </label>
                      <input
                        type="text"
                        value={preventionStrategy}
                        onChange={(e) => setPreventionStrategy(e.target.value)}
                        placeholder="How can this error mode be systematically prevented in future prompt iterations?"
                        required={logFailureCase}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <button type="button" onClick={onClose} className="btn btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={isPending} className="btn btn-primary">
                {isPending ? 'Submitting Review...' : 'Submit Review Decision'}
              </button>
            </div>
          </form>
        )}

        {activeTab === 'metadata_audit' && (
          <form onSubmit={handleMetadataEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid var(--amber-border)', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: '12px', color: 'var(--amber-400)' }}>
              🔒 <strong>Immutability Notice:</strong> Original feedback text cannot be modified. Only contextual annotations (journey stage, investor context) may be revised, and every modification is permanently recorded in the audit trail.
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Journey Stage
              </label>
              <select value={editJourneyStage} onChange={(e) => setEditJourneyStage(e.target.value)}>
                <option value="discovery_intent">Discovery & Intent</option>
                <option value="mandate_kyc_setup">Mandate & KYC Setup</option>
                <option value="first_instalment">First Instalment & NAV Allotment</option>
                <option value="market_dip_reaction">Market Dip & Drawdown Reaction</option>
                <option value="autopay_failure_recovery">Autopay Failure & Recovery</option>
                <option value="continuation_milestone">Continuation Milestone</option>
                <option value="pause_cancellation">Pause & Cancellation</option>
                <option value="unclear">Unclear</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Investor Context Annotation
              </label>
              <input
                type="text"
                value={editInvestorContext}
                onChange={(e) => setEditInvestorContext(e.target.value)}
                placeholder="e.g. First-time investor (must be corroborated by evidence)"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Reason for Metadata Change * (Audit Log Entry)
              </label>
              <textarea
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                rows={2}
                placeholder="Explain why this metadata is being modified..."
                required
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <button type="button" onClick={onClose} className="btn btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={isPending} className="btn btn-primary">
                {isPending ? 'Saving Audit Entry...' : 'Save Metadata Correction'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
