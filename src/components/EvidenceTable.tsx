'use client';

import { useState, useTransition, useMemo } from 'react';
import { EvidenceDetailModal } from '@/components/EvidenceDetailModal';
import { IngestModal } from '@/components/IngestModal';
import { runBatchAnalysisAction } from '@/app/actions';

interface EvidenceRecordItem {
  id: string;
  sourceUrl: string;
  platform: string;
  collectedAt: string;
  originalText: string;
  investorContext: string | null;
  journeyStage: string;
  fieldProvenance: {
    sourceUrl?: 'verified_live' | 'curated_benchmark' | 'user_entered' | 'unverified' | 'verified';
    platform?: 'verified_live' | 'curated_benchmark' | 'user_entered' | 'unverified' | 'verified';
    collectedAt?: 'verified_live' | 'curated_benchmark' | 'user_entered' | 'unverified' | 'verified';
    originalText?: 'verified_live' | 'curated_benchmark' | 'user_entered' | 'unverified' | 'verified';
    investorContext?: 'verified_live' | 'curated_benchmark' | 'user_entered' | 'unverified' | 'verified';
    journeyStage?: 'verified_live' | 'curated_benchmark' | 'user_entered' | 'unverified' | 'verified';
  };
  entryMethod: string;
  isSynthetic: boolean;
  provenanceCategory?: string;
  verificationStatus?: 'content_verified' | 'link_checked' | 'user_entered' | 'unverified' | 'synthetic_fixture' | string | null;
  verifiedAt?: string | null;
  verifiedBy?: string | null;
  duplicateOfId: string | null;
  contentHash: string;
  createdAt: string;
  latestAnalysis?: any;
  latestReview?: any;
  reviewCount?: number;
}

export function EvidenceTable({ initialRecords }: { initialRecords: EvidenceRecordItem[] }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [selectedStage, setSelectedStage] = useState<string>('all');
  const [selectedReviewStatus, setSelectedReviewStatus] = useState<string>('all');
  const [selectedProvenance, setSelectedProvenance] = useState<string>('all');
  const [hideDuplicates, setHideDuplicates] = useState(false);
  const [hideSynthetic, setHideSynthetic] = useState(false);

  const [selectedRecord, setSelectedRecord] = useState<EvidenceRecordItem | null>(null);
  const [isIngestOpen, setIsIngestOpen] = useState(false);
  const [isBatchPending, startBatchTransition] = useTransition();
  const [batchMsg, setBatchMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filter logic
  const filteredRecords = useMemo(() => {
    return initialRecords.filter((rec) => {
      // Duplicates
      if (hideDuplicates && rec.duplicateOfId) {
        return false;
      }

      // Synthetic
      if (hideSynthetic && rec.isSynthetic) {
        return false;
      }

      // Platform
      if (selectedPlatform !== 'all' && rec.platform !== selectedPlatform) {
        return false;
      }

      // Journey Stage
      if (selectedStage !== 'all' && rec.journeyStage !== selectedStage) {
        return false;
      }

      // Review Status
      if (selectedReviewStatus !== 'all') {
        const rev = rec.latestReview?.decision;
        if (selectedReviewStatus === 'unanalyzed' && rec.latestAnalysis) return false;
        if (selectedReviewStatus === 'unreviewed' && (rev || !rec.latestAnalysis)) return false;
        if (selectedReviewStatus === 'confirmed' && rev !== 'confirmed') return false;
        if (selectedReviewStatus === 'corrected' && rev !== 'corrected') return false;
        if (selectedReviewStatus === 'rejected' && rev !== 'rejected') return false;
      }

      // Provenance
      if (selectedProvenance !== 'all') {
        const prov = rec.fieldProvenance?.sourceUrl || rec.fieldProvenance?.originalText || 'unverified';
        if (selectedProvenance === 'curated_benchmark' && prov !== 'curated_benchmark') return false;
        if (selectedProvenance === 'verified_live' && prov !== 'verified_live' && prov !== 'verified') return false;
        if (selectedProvenance === 'user_entered' && prov !== 'user_entered') return false;
        if (selectedProvenance === 'unverified' && prov !== 'unverified') return false;
      }

      // Free text search
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const textMatch = rec.originalText.toLowerCase().includes(query);
        const contextMatch = (rec.investorContext || '').toLowerCase().includes(query);
        const urlMatch = rec.sourceUrl.toLowerCase().includes(query);
        const themeMatch = rec.latestAnalysis?.parsedOutput?.theme?.name?.toLowerCase().includes(query);
        if (!textMatch && !contextMatch && !urlMatch && !themeMatch) {
          return false;
        }
      }

      return true;
    });
  }, [initialRecords, searchTerm, selectedPlatform, selectedStage, selectedReviewStatus, selectedProvenance, hideDuplicates, hideSynthetic]);

  const unanalyzedCount = useMemo(() => {
    return initialRecords.filter((r) => !r.latestAnalysis).length;
  }, [initialRecords]);

  const handleRunBatchAnalysis = () => {
    setBatchMsg(null);
    startBatchTransition(async () => {
      const res = await runBatchAnalysisAction({
        maxRecords: 50,
        skipAlreadyAnalyzed: true,
      });

      if (res.success && res.summary) {
        setBatchMsg({
          type: 'success',
          text: `Configured provider ${res.summary.provider} analyzed ${res.summary.successfulRecords} record(s); ${res.summary.failedRecords} failed out of ${res.summary.totalRecords}. Fixture results remain illustrative.`,
        });
      } else {
        setBatchMsg({
          type: 'error',
          text: res.error || 'Failed to complete batch analysis.',
        });
      }
    });
  };

  const formatPlatform = (p: string) => {
    switch (p) {
      case 'play_store':
        return 'Play Store';
      case 'reddit':
        return 'Reddit';
      case 'twitter_x':
        return 'Twitter / X';
      case 'interview':
        return 'User Interview';
      case 'ticket':
        return 'Support Ticket';
      case 'desk_research':
        return 'Desk Research';
      default:
        return p;
    }
  };

  const formatStage = (s: string) => {
    switch (s) {
      case 'discovery_intent':
        return 'Discovery & Intent';
      case 'mandate_kyc_setup':
        return 'Mandate & KYC Setup';
      case 'first_instalment':
        return 'First Instalment Allotment';
      case 'market_dip_reaction':
        return 'Market Dip (Months 2-4)';
      case 'autopay_failure_recovery':
        return 'Autopay Failure & Penalty';
      case 'continuation_milestone':
        return '12-Month Horizon';
      case 'pause_cancellation':
        return 'Pause & Cancellation';
      default:
        return s;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Controls Bar */}
      <div
        className="card"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          padding: '18px 20px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Evidence Records Vault</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '2px' }}>
              Showing {filteredRecords.length} of {initialRecords.length} total raw evidence records with provenance badges and verification traces.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            {unanalyzedCount > 0 && (
              <button
                className="btn btn-secondary"
                onClick={handleRunBatchAnalysis}
                disabled={isBatchPending}
                style={{ borderColor: 'var(--purple-border)', color: 'var(--purple-400)' }}
              >
                {isBatchPending ? 'Analyzing...' : `⚡ Analyze ${unanalyzedCount} Unanalyzed`}
              </button>
            )}

            <button className="btn btn-primary" onClick={() => setIsIngestOpen(true)}>
              📥 Ingest Evidence
            </button>
          </div>
        </div>

        {batchMsg && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              fontSize: '13px',
              background: batchMsg.type === 'success' ? 'var(--emerald-glow)' : 'var(--red-glow)',
              border: `1px solid ${batchMsg.type === 'success' ? 'var(--emerald-border)' : 'var(--red-border)'}`,
              color: batchMsg.type === 'success' ? 'var(--emerald-400)' : 'var(--red-400)',
            }}
          >
            {batchMsg.text}
          </div>
        )}

        {/* Filters Row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px',
            alignItems: 'center',
          }}
        >
          {/* Search box */}
          <div style={{ gridColumn: 'span 2' }}>
            <input
              type="text"
              placeholder="Search feedback text, context, theme or URL..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-canvas)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontSize: '13px',
              }}
            />
          </div>

          {/* Platform selector */}
          <div>
            <select
              value={selectedPlatform}
              onChange={(e) => setSelectedPlatform(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-canvas)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontSize: '13px',
              }}
            >
              <option value="all">All Platforms</option>
              <option value="play_store">Google Play Store</option>
              <option value="reddit">Reddit</option>
              <option value="twitter_x">Twitter / X</option>
              <option value="interview">User Interview</option>
              <option value="ticket">Support Ticket</option>
              <option value="desk_research">Desk Research</option>
            </select>
          </div>

          {/* Stage selector */}
          <div>
            <select
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-canvas)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontSize: '13px',
              }}
            >
              <option value="all">All Journey Stages</option>
              <option value="discovery_intent">Discovery & Intent</option>
              <option value="mandate_kyc_setup">Mandate & KYC Setup</option>
              <option value="first_instalment">First Instalment Allotment</option>
              <option value="market_dip_reaction">Market Dip (Months 2-4)</option>
              <option value="autopay_failure_recovery">Autopay Failure & Penalty</option>
              <option value="continuation_milestone">12-Month Horizon</option>
              <option value="pause_cancellation">Pause & Cancellation</option>
              <option value="unclear">Unclear Stage</option>
            </select>
          </div>

          {/* Review status selector */}
          <div>
            <select
              value={selectedReviewStatus}
              onChange={(e) => setSelectedReviewStatus(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-canvas)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontSize: '13px',
              }}
            >
              <option value="all">All Review Statuses</option>
              <option value="unanalyzed">Unanalyzed (Pending AI)</option>
              <option value="unreviewed">Unreviewed (Pending PM)</option>
              <option value="confirmed">Confirmed by PM</option>
              <option value="corrected">Corrected by PM</option>
              <option value="rejected">Rejected by PM</option>
            </select>
          </div>

          {/* Provenance selector */}
          <div>
            <select
              value={selectedProvenance}
              onChange={(e) => setSelectedProvenance(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-canvas)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontSize: '13px',
              }}
            >
              <option value="all">All Provenance Tiers</option>
              <option value="curated_benchmark">Curated Benchmark (Academic)</option>
              <option value="verified_live">Live Verified</option>
              <option value="user_entered">User-Entered</option>
              <option value="unverified">Unverified</option>
            </select>
          </div>
        </div>

        {/* Toggle options & Legend */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', paddingTop: '6px' }}>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', fontSize: '13px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={hideDuplicates}
                onChange={(e) => setHideDuplicates(e.target.checked)}
              />
              Hide duplicate records
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={hideSynthetic}
                onChange={(e) => setHideSynthetic(e.target.checked)}
              />
              Exclude synthetic records
            </label>
          </div>

          {/* Provenance badge legend */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '11px', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
            <span>Provenance Status:</span>
            <span style={{ border: '1px solid var(--emerald-400)', color: 'var(--emerald-400)', padding: '1px 6px', borderRadius: '4px' }}>
              ● Content Verified
            </span>
            <span style={{ border: '1px solid var(--blue-400)', color: 'var(--blue-400)', padding: '1px 6px', borderRadius: '4px' }}>
              ● Link Checked
            </span>
            <span style={{ border: '1px solid var(--purple-400)', color: 'var(--purple-400)', padding: '1px 6px', borderRadius: '4px' }}>
              ▲ User-Entered
            </span>
            <span style={{ border: '1px solid var(--amber-400)', color: 'var(--amber-400)', padding: '1px 6px', borderRadius: '4px' }}>
              ◆ Synthetic Fixture
            </span>
            <span style={{ border: '1px dashed var(--text-muted)', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: '4px' }}>
              ○ Unverified
            </span>
          </div>
        </div>
      </div>

      {/* Main Evidence Table */}
      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface-raised)', borderBottom: '1px solid var(--border-subtle)' }}>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)', width: '160px' }}>Platform & Source</th>
                <th style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--text-secondary)', width: '100px' }}>Date</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Verbatim Investor Feedback</th>
                <th style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--text-secondary)', width: '160px' }}>Journey Stage</th>
                <th style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--text-secondary)', width: '190px' }}>AI Discovered Theme</th>
                <th style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--text-secondary)', width: '120px' }}>PM Review</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)', width: '90px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No evidence records matched your filter criteria.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((record) => {
                  const parsedAi = record.latestAnalysis?.parsedOutput;
                  const latestRev = record.latestReview;
                  const isDuplicate = Boolean(record.duplicateOfId);

                  // Provenance indicator for original text
                  const textProv = record.fieldProvenance?.originalText || 'unverified';

                  return (
                    <tr
                      key={record.id}
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        background: isDuplicate ? 'rgba(255,255,255,0.01)' : 'transparent',
                        opacity: isDuplicate ? 0.75 : 1,
                        cursor: 'pointer',
                        transition: 'background-color 0.1s ease',
                      }}
                      onClick={() => setSelectedRecord(record)}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-surface-hover)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = isDuplicate ? 'rgba(255,255,255,0.01)' : 'transparent')}
                    >
                      {/* Platform & Source */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className="badge badge-gray" style={{ fontSize: '11px', textTransform: 'capitalize' }}>
                              {formatPlatform(record.platform)}
                            </span>
                            {isDuplicate && (
                              <span className="badge badge-amber" style={{ fontSize: '10px' }} title="Identical text exists in another record">
                                Duplicate
                              </span>
                            )}
                          </div>
                          {record.isSynthetic ? <span className="badge badge-amber" style={{ fontSize: '10px' }}>{record.provenanceCategory?.replace(/_/g, ' ') || 'Synthetic illustrative fixture'} · excluded from genuine support</span> : <a
                            href={record.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              fontSize: '11px',
                              color: 'var(--text-muted)',
                              textDecoration: 'underline',
                              maxWidth: '140px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              display: 'inline-block',
                            }}
                          >
                            {record.sourceUrl.replace(/^https?:\/\/(www\.)?/, '')}
                          </a>}
                        </div>
                      </td>

                      {/* Date */}
                      <td style={{ padding: '14px 14px', verticalAlign: 'top', color: 'var(--text-secondary)', fontSize: '12px' }}>
                        {record.collectedAt}
                      </td>

                      {/* Verbatim Excerpt */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <p
                            style={{
                              fontFamily: 'var(--font-serif)',
                              fontSize: '14px',
                              lineHeight: '1.45',
                              color: 'var(--text-primary)',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}
                          >
                            “{record.originalText}”
                          </p>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                            {(() => {
                              const status = record.verificationStatus || (record.isSynthetic ? 'synthetic_fixture' : textProv);
                              const isVerified = status === 'content_verified' || status === 'verified_live' || status === 'verified';
                              const isLinkChecked = status === 'link_checked';
                              const isUser = status === 'user_entered';
                              const isSynth = record.isSynthetic || status === 'synthetic_fixture' || status === 'curated_benchmark';

                              const badgeColor = isVerified
                                ? 'var(--emerald-400)'
                                : isLinkChecked
                                ? 'var(--blue-400)'
                                : isUser
                                ? 'var(--purple-400)'
                                : isSynth
                                ? 'var(--amber-400)'
                                : 'var(--text-muted)';

                              const badgeText = isVerified
                                ? record.provenanceCategory === 'primary_research' ? 'Primary Research · User Supplied' : 'Verified Genuine Public Evidence'
                                : isLinkChecked
                                ? 'Link Checked'
                                : isUser
                                ? 'User-Entered'
                                : isSynth
                                ? record.provenanceCategory?.replace(/_/g, ' ') || 'Synthetic Fixture'
                                : 'Unverified';

                              return (
                                <span
                                  style={{
                                    border: `1px ${status === 'unverified' ? 'dashed' : 'solid'} ${badgeColor}`,
                                    color: badgeColor,
                                    padding: '1px 6px',
                                    borderRadius: '3px',
                                    fontSize: '10px',
                                    fontWeight: 600,
                                  }}
                                >
                                  {badgeText}
                                </span>
                              );
                            })()}

                            {record.investorContext && (
                              <span style={{ fontStyle: 'italic', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                Context: {record.investorContext}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Journey Stage */}
                      <td style={{ padding: '14px 14px', verticalAlign: 'top' }}>
                        <span className="badge badge-blue" style={{ fontSize: '11px' }}>
                          {formatStage(record.journeyStage)}
                        </span>
                      </td>

                      {/* AI Classification */}
                      <td style={{ padding: '14px 14px', verticalAlign: 'top' }}>
                        {parsedAi ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '12px' }}>
                              {parsedAi.theme?.name || 'Theme extracted'}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                              <span>Conf: {Math.round((parsedAi.confidenceScore || 0) * 100)}%</span>
                              <span>•</span>
                              <span style={{ color: 'var(--purple-400)' }}>{parsedAi.hypotheses?.length || 0} hyp.</span>
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Pending Analysis</span>
                        )}
                      </td>

                      {/* PM Review */}
                      <td style={{ padding: '14px 14px', verticalAlign: 'top' }}>
                        {latestRev ? (
                          <span
                            className={`badge ${
                              latestRev.decision === 'confirmed'
                                ? 'badge-emerald'
                                : latestRev.decision === 'corrected'
                                ? 'badge-amber'
                                : 'badge-red'
                            }`}
                            style={{ fontSize: '11px', textTransform: 'capitalize' }}
                          >
                            {latestRev.decision}
                          </span>
                        ) : (
                          <span className="badge badge-gray" style={{ fontSize: '11px' }}>
                            Unreviewed
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'top', textAlign: 'right' }}>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '12px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRecord(record);
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

      {/* Detail Modal */}
      {selectedRecord && (
        <EvidenceDetailModal
          record={selectedRecord}
          onClose={() => setSelectedRecord(null)}
        />
      )}

      {/* Ingest Modal */}
      {isIngestOpen && (
        <IngestModal onClose={() => setIsIngestOpen(false)} />
      )}
    </div>
  );
}
