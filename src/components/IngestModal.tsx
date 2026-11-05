'use client';

import { useState, useTransition } from 'react';
import { uploadEvidenceCsvAction, addManualEvidenceAction } from '@/app/actions';

export function IngestModal({
  isOpen: controlledIsOpen,
  onClose,
}: {
  isOpen?: boolean;
  onClose?: () => void;
} = {}) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isControlled = controlledIsOpen !== undefined;
  const showModal = isControlled ? controlledIsOpen : internalIsOpen;

  const closeModal = () => {
    if (onClose) onClose();
    if (!isControlled) setInternalIsOpen(false);
  };

  const openModal = () => {
    if (!isControlled) setInternalIsOpen(true);
  };

  const [activeTab, setActiveTab] = useState<'csv' | 'manual'>('csv');
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleCsvSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await uploadEvidenceCsvAction(formData);
      if (res.success && res.result) {
        setSuccessMsg(
          `Successfully processed CSV: ${res.result.acceptedRows} accepted, ${res.result.duplicateRows} duplicates identified, ${res.result.rejectedRows} rejected.`
        );
        setTimeout(() => closeModal(), 2000);
      } else {
        setErrorMsg(res.error || 'Upload failed.');
      }
    });
  };

  const handleManualSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await addManualEvidenceAction(formData);
      if (res.success) {
        setSuccessMsg('Record added successfully with verified provenance badges.');
        setTimeout(() => closeModal(), 2000);
      } else {
        setErrorMsg(res.error || 'Failed to add manual record.');
      }
    });
  };

  return (
    <>
      {!isControlled && (
        <button onClick={openModal} className="btn btn-primary">
          + Ingest Evidence
        </button>
      )}

      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'var(--modal-overlay, rgba(0, 0, 0, 0.75))',
            backdropFilter: 'blur(8px)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ingest-modal-title"
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '640px',
              maxHeight: '90vh',
              overflowY: 'auto',
              border: '1px solid var(--border-strong)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 id="ingest-modal-title" style={{ fontSize: '18px' }}>
                Ingest Investor Evidence
              </h2>
              <button
                onClick={() => closeModal()}
                className="btn btn-secondary"
                style={{ padding: '4px 8px', fontSize: '12px' }}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {/* Tab switch */}
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px', marginBottom: '16px' }}>
              <button
                type="button"
                className={`btn ${activeTab === 'csv' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab('csv')}
                style={{ fontSize: '12px' }}
              >
                📄 CSV Batch Upload
              </button>
              <button
                type="button"
                className={`btn ${activeTab === 'manual' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab('manual')}
                style={{ fontSize: '12px' }}
              >
                ✍️ Manual Single Entry
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

            {activeTab === 'csv' ? (
              <form onSubmit={handleCsvSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label htmlFor="csv-file-input" style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                    Select CSV File
                  </label>
                  <input
                    id="csv-file-input"
                    type="file"
                    name="file"
                    accept=".csv"
                    required
                    style={{ padding: '12px', background: 'var(--bg-canvas)', border: '1px dashed var(--border-strong)' }}
                  />
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                    Columns supported: <code>source_url</code>, <code>platform</code>, <code>collected_at</code>, <code>original_text</code>, <code>investor_context</code>, <code>journey_stage</code>, <code>author_id</code>, <code>published_at</code>, <code>language</code>, <code>evidence_type</code>. Imports remain user-entered until reviewed; supplied URLs are not verified automatically.
                  </div>
                </div>

                <div>
                  <label htmlFor="csv-imported-by" style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                    Researcher Name / Attribution
                  </label>
                  <input
                    id="csv-imported-by"
                    type="text"
                    name="importedBy"
                    defaultValue="Fellowship Researcher"
                    required
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                  <button type="button" onClick={() => closeModal()} className="btn btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" disabled={isPending} className="btn btn-primary">
                    {isPending ? 'Processing & Validating CSV...' : 'Upload & Ingest'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleManualSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label htmlFor="manual-source-url" style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                    Source URL * (Verified provenance)
                  </label>
                  <input
                    id="manual-source-url"
                    type="url"
                    name="sourceUrl"
                    placeholder="https://play.google.com/... or https://reddit.com/..."
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label htmlFor="manual-platform" style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                      Platform *
                    </label>
                    <select id="manual-platform" name="platform" defaultValue="play_store" required>
                      <option value="play_store">Google Play Store</option>
                      <option value="app_store">Apple App Store</option>
                      <option value="reddit">Reddit (r/IndiaInvestments, r/Groww)</option>
                      <option value="trading_qa">TradingQ&amp;A</option>
                      <option value="google_forms">Google Forms Survey Response</option>
                      <option value="twitter_x">Twitter / X</option>
                      <option value="youtube">YouTube Comments</option>
                      <option value="community_forum">Community Forum</option>
                      <option value="user_interview">User Interview</option>
                      <option value="other">Other Public Source</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="manual-collected-at" style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                      Collection Date *
                    </label>
                    <input
                      id="manual-collected-at"
                      type="date"
                      name="collectedAt"
                      defaultValue={new Date().toISOString().split('T')[0]}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="manual-journey-stage" style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                    Journey Stage (Preliminary)
                  </label>
                  <select id="manual-journey-stage" name="journeyStage" defaultValue="unclear">
                    <option value="discovery_intent">Discovery & Intent</option>
                    <option value="mandate_kyc_setup">Mandate & KYC Setup</option>
                    <option value="first_instalment">First Instalment & NAV Allotment</option>
                    <option value="market_dip_reaction">Market Dip & Drawdown Reaction</option>
                    <option value="autopay_failure_recovery">Autopay Failure & Recovery</option>
                    <option value="continuation_milestone">Continuation Milestone (6M / 12M)</option>
                    <option value="pause_cancellation">Pause & Cancellation</option>
                    <option value="unclear">Unclear / Needs AI Discovery</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="manual-investor-context" style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                    Investor Context (Only if explicitly stated in text)
                  </label>
                  <input
                    id="manual-investor-context"
                    type="text"
                    name="investorContext"
                    placeholder="e.g. First-time investor, 3 months into SIP (leave blank if unstated)"
                  />
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Do not assume first-time status unless the source explicitly mentions it.
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                  <div><label htmlFor="manual-author-id" style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Source author (public handle or anonymized ID)</label><input id="manual-author-id" name="authorId" placeholder="Avoid private names or contact details" /></div>
                  <div><label htmlFor="manual-published-at" style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Publication date</label><input id="manual-published-at" name="publishedAt" type="date" /></div>
                  <div><label htmlFor="manual-language" style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Language</label><input id="manual-language" name="language" placeholder="e.g. en, hi" /></div>
                  <div><label htmlFor="manual-evidence-type" style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Evidence type</label><input id="manual-evidence-type" name="evidenceType" placeholder="review, survey, interview note" /></div>
                </div>

                <details style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '12px' }}>
                  <summary style={{ cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>Optional primary research details (use anonymized participant IDs only)</summary>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginTop: '12px' }}>
                    <div><label htmlFor="manual-participant-id" style={{ display: 'block', fontSize: '11px', marginBottom: 4 }}>Participant ID</label><input id="manual-participant-id" name="participantId" placeholder="e.g. P07 (no name/contact)" /></div>
                    <div><label htmlFor="manual-segment-qualification" style={{ display: 'block', fontSize: '11px', marginBottom: 4 }}>Segment qualification</label><input id="manual-segment-qualification" name="segmentQualification" placeholder="Record only what participant confirmed" /></div>
                    <div><label htmlFor="manual-employment-stage" style={{ display: 'block', fontSize: '11px', marginBottom: 4 }}>Employment stage</label><input id="manual-employment-stage" name="employmentStage" placeholder="Participant-stated, not inferred" /></div>
                    <div><label htmlFor="manual-sip-starting-context" style={{ display: 'block', fontSize: '11px', marginBottom: 4 }}>SIP starting context</label><input id="manual-sip-starting-context" name="sipStartingContext" /></div>
                    <div><label htmlFor="manual-motivation" style={{ display: 'block', fontSize: '11px', marginBottom: 4 }}>Motivation / expectations</label><input id="manual-motivation" name="motivationExpectations" /></div>
                    <div><label htmlFor="manual-cashflow-conflict" style={{ display: 'block', fontSize: '11px', marginBottom: 4 }}>Cash-flow conflict</label><input id="manual-cashflow-conflict" name="cashFlowConflict" /></div>
                    <div><label htmlFor="manual-sip-behaviour" style={{ display: 'block', fontSize: '11px', marginBottom: 4 }}>SIP behaviour</label><input id="manual-sip-behaviour" name="sipBehaviour" placeholder="Continue, reduce, pause, stop, or unknown" /></div>
                    <div><label htmlFor="manual-workaround" style={{ display: 'block', fontSize: '11px', marginBottom: 4 }}>Workaround</label><input id="manual-workaround" name="externalWorkaround" /></div>
                    <div><label htmlFor="manual-unmet-need" style={{ display: 'block', fontSize: '11px', marginBottom: 4 }}>Unmet need</label><input id="manual-unmet-need" name="unmetNeed" /></div>
                    <div><label htmlFor="manual-interview-date" style={{ display: 'block', fontSize: '11px', marginBottom: 4 }}>Interview / survey date</label><input id="manual-interview-date" name="researchDate" type="date" /></div>
                    <div style={{ gridColumn: '1 / -1' }}><label htmlFor="manual-researcher-notes" style={{ display: 'block', fontSize: '11px', marginBottom: 4 }}>Researcher notes (exclude sensitive financial identifiers)</label><textarea id="manual-researcher-notes" name="researcherNotes" rows={2} /></div>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, gridColumn: '1 / -1', fontSize: 11 }}><input name="quoteConsent" type="checkbox" value="yes" />Participant consented to including this anonymized verbatim excerpt in shareable project materials. Leave unchecked when not confirmed.</label>
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 8 }}>Do not enter PAN, bank account numbers, credentials, portfolio screenshots, names, phone numbers or other unnecessary identifiers. These fields remain researcher-entered and do not independently verify a public source.</p>
                </details>

                <div>
                  <label htmlFor="manual-original-text" style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                    Original Verbatim Feedback * (Immutable Evidence)
                  </label>
                  <textarea
                    id="manual-original-text"
                    name="originalText"
                    rows={4}
                    placeholder="Paste the exact verbatim user feedback here without editing..."
                    required
                  />
                </div>

                <div>
                  <label htmlFor="manual-entered-by" style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                    Researcher Name
                  </label>
                  <input id="manual-entered-by" type="text" name="enteredBy" defaultValue="Fellowship Researcher" required />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                  <button type="button" onClick={() => closeModal()} className="btn btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" disabled={isPending} className="btn btn-primary">
                    {isPending ? 'Saving Record...' : 'Save Evidence Record'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
