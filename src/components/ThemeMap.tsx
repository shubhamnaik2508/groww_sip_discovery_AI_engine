'use client';

import { useState, useTransition } from 'react';
import { updateThemeStatusAction, mergeThemesAction, createThemeAction } from '@/app/actions';

export interface ThemeWithDetails {
  id: string;
  name: string;
  slug: string;
  description: string;
  journeyStage: string;
  origin: string;
  status: string;
  mergedIntoId: string | null;
  supportingCount: number;
  contradictingCount: number;
  excludedFixtureCount: number;
  genuineCount: number;
  illustrativeCount: number;
  sourceDiversity: number;
  researchConfidence: string;
  evidenceQuotes: Array<{
    id: string;
    text: string;
    platform: string;
    sourceUrl: string;
    role: string;
    synthetic?: boolean;
    provenanceCategory?: string;
    verificationStatus?: string;
  }>;
  behaviours: string[];
  hypotheses: string[];
}

const STAGES: { [key: string]: { label: string; description: string } } = {
  discovery_intent: {
    label: '1. Discovery & Intent',
    description: 'Initial intent to start investing in mutual funds, perception of risk and returns.',
  },
  mandate_kyc_setup: {
    label: '2. Mandate & KYC Setup',
    description: 'Aadhaar/PAN KYC verification, bank account linking, e-mandate authentication.',
  },
  first_instalment: {
    label: '3. First Instalment Allotment',
    description: 'First debit execution, NAV unit allotment, initial settlement wait time.',
  },
  market_dip_reaction: {
    label: '4. Market Dip Reaction (Months 2–4)',
    description: 'First experience with negative returns, market drawdown anxiety, loss aversion.',
  },
  autopay_failure_recovery: {
    label: '5. Autopay Failure & Penalty',
    description: 'Insufficient bank balance, silent debit drops, bank ECS bounce charges.',
  },
  continuation_milestone: {
    label: '6. 12-Month Horizon',
    description: 'Evaluation of gains vs expectations, milestone celebrations, long-term discipline.',
  },
  pause_cancellation: {
    label: '7. Pause & Cancellation',
    description: 'Liquidity pinches, salary date changes, app pause barriers, total cancellation.',
  },
};

export function ThemeMap({ initialThemes }: { initialThemes: ThemeWithDetails[] }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [expandedThemeId, setExpandedThemeId] = useState<string | null>(null);

  // Merge modal state
  const [mergeSource, setMergeSource] = useState<ThemeWithDetails | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState('');

  // New theme modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newStage, setNewStage] = useState('discovery_intent');

  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const filteredThemes = initialThemes.filter((t) => {
    if (selectedStatus !== 'all' && t.status !== selectedStatus) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const match =
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.behaviours.some((b) => b.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  const handleStatusChange = (themeId: string, status: 'proposed' | 'accepted' | 'retired') => {
    setMsg(null);
    startTransition(async () => {
      const res = await updateThemeStatusAction(themeId, status);
      if (res.success) {
        setMsg({ type: 'success', text: `Theme status updated to "${status}".` });
      } else {
        setMsg({ type: 'error', text: res.error || 'Failed to update theme status.' });
      }
    });
  };

  const handleMergeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mergeSource || !mergeTargetId) return;
    setMsg(null);
    startTransition(async () => {
      const res = await mergeThemesAction(mergeSource.id, mergeTargetId);
      if (res.success) {
        setMsg({ type: 'success', text: `Merged "${mergeSource.name}" successfully.` });
        setMergeSource(null);
        setMergeTargetId('');
      } else {
        setMsg({ type: 'error', text: res.error || 'Failed to merge themes.' });
      }
    });
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newDesc.trim()) return;
    setMsg(null);
    startTransition(async () => {
      const res = await createThemeAction(newName, newDesc, newStage);
      if (res.success) {
        setMsg({ type: 'success', text: `Theme "${newName}" created successfully.` });
        setIsCreateOpen(false);
        setNewName('');
        setNewDesc('');
      } else {
        setMsg({ type: 'error', text: res.error || 'Failed to create theme.' });
      }
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Controls Bar */}
      <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Theme & Behaviour Map</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '2px' }}>
              Clustered investor friction themes mapped across the 12-month mutual fund lifecycle with supporting quotes and behavioural patterns.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button className="btn btn-primary" onClick={() => setIsCreateOpen(true)}>
              + New Theme
            </button>
          </div>
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

        {/* Filter bar */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1', minWidth: '220px' }}>
            <input
              type="text"
              placeholder="Search themes, behaviours, or descriptions..."
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

          <div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-canvas)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontSize: '13px',
              }}
            >
              <option value="all">All Statuses</option>
              <option value="proposed">Proposed (AI Extracted)</option>
              <option value="accepted">Accepted (PM Confirmed)</option>
              <option value="merged">Merged</option>
              <option value="retired">Retired</option>
            </select>
          </div>
        </div>
      </div>

      {/* Grouped by Journey Stage */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        {Object.entries(STAGES).map(([stageKey, stageMeta]) => {
          const stageThemes = filteredThemes.filter((t) => t.journeyStage === stageKey);

          return (
            <div key={stageKey} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {stageMeta.label}
                  </h3>
                  <span className="badge badge-gray" style={{ fontSize: '11px' }}>
                    {stageThemes.length} {stageThemes.length === 1 ? 'theme' : 'themes'}
                  </span>
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '3px' }}>
                  {stageMeta.description}
                </p>
              </div>

              {stageThemes.length === 0 ? (
                <div
                  style={{
                    padding: '24px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px dashed var(--border-subtle)',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    fontSize: '13px',
                  }}
                >
                  No themes recorded under this journey stage yet. Ingest evidence from this phase to uncover behavioural signals.
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
                    gap: '16px',
                  }}
                >
                  {stageThemes.map((theme) => {
                    const isExpanded = expandedThemeId === theme.id;

                    return (
                      <div
                        key={theme.id}
                        className="card"
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: '16px',
                          border:
                            theme.status === 'accepted'
                              ? '1px solid var(--emerald-border)'
                              : theme.status === 'merged'
                              ? '1px solid var(--border-subtle)'
                              : '1px solid var(--border-subtle)',
                          opacity: theme.status === 'retired' || theme.status === 'merged' ? 0.6 : 1,
                        }}
                      >
                        {/* Top */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                            <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                              {theme.name}
                            </h4>

                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <span
                                className={`badge ${
                                  theme.status === 'accepted'
                                    ? 'badge-emerald'
                                    : theme.status === 'proposed'
                                    ? 'badge-purple'
                                    : 'badge-gray'
                                }`}
                                style={{ fontSize: '10px', textTransform: 'capitalize' }}
                              >
                                {theme.genuineCount === 0 && theme.illustrativeCount > 0 ? `Illustrative · workflow ${theme.status}` : theme.status}
                              </span>

                              <span
                                className="badge badge-gray"
                                style={{
                                  fontSize: '10px',
                                  color: theme.origin === 'human_created' ? 'var(--emerald-400)' : 'var(--purple-400)',
                                }}
                              >
                                {theme.origin === 'human_created' ? 'PM' : 'AI'}
                              </span>
                            </div>
                          </div>

                          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: '1.45' }}>
                            {theme.genuineCount === 0 && theme.illustrativeCount > 0
                              ? `Illustrative theme from benchmark fixtures; not genuine research validation. ${theme.description.replace(/^Discovered from blind ground truth:\s*/i, '')}`
                              : theme.description}
                          </p>

                          {/* Evidence Counts */}
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px' }}>
                            <span className="badge badge-emerald" style={{ fontSize: '11px' }}>
                              ✓ {theme.supportingCount} linked supporting records
                            </span>
                            {theme.contradictingCount > 0 && (
                              <span className="badge badge-red" style={{ fontSize: '11px' }}>
                                ✕ {theme.contradictingCount} Contradicting
                              </span>
                            )}
                            {theme.excludedFixtureCount > 0 && (
                              <span className="badge badge-zinc" style={{ fontSize: '10px' }}>
                                {theme.excludedFixtureCount} fixture link(s) excluded
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '11px', color: 'var(--text-muted)' }}>
                            <span>{theme.genuineCount > 0 ? theme.researchConfidence : 'Illustrative only'}</span>
                            <span>{theme.evidenceQuotes.length} linked records</span>
                            <span>{theme.sourceDiversity} source types</span>
                            <span>{theme.genuineCount} genuine</span>
                            <span>{theme.illustrativeCount} illustrative</span>
                          </div>

                          {/* Observed Behaviours */}
                          {theme.behaviours.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>
                                Observed Behaviours:
                              </span>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {theme.behaviours.map((b, idx) => (
                                  <span
                                    key={idx}
                                    style={{
                                      fontSize: '11px',
                                      padding: '2px 8px',
                                      borderRadius: '4px',
                                      background: 'var(--bg-surface-raised)',
                                      color: 'var(--text-secondary)',
                                      border: '1px solid var(--border-subtle)',
                                    }}
                                  >
                                    {b}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Derived Hypotheses */}
                          {theme.hypotheses.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>
                                Candidate Hypotheses:
                              </span>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {theme.hypotheses.map((h, idx) => (
                                  <div
                                    key={idx}
                                    style={{
                                      fontSize: '12px',
                                      padding: '6px 8px',
                                      borderRadius: '4px',
                                      background: 'rgba(168, 85, 247, 0.08)',
                                      border: '1px solid rgba(168, 85, 247, 0.25)',
                                      color: 'var(--purple-400)',
                                      lineHeight: '1.4',
                                    }}
                                  >
                                    <strong style={{ fontWeight: 600 }}>[HYPOTHESIS]</strong> {h.replace(/^\[HYPOTHESIS\]\s*/i, '')}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Supporting Evidence Drawer */}
                          {isExpanded && theme.evidenceQuotes.length > 0 && (
                            <div
                              style={{
                                marginTop: '10px',
                                padding: '12px',
                                borderRadius: 'var(--radius-md)',
                                background: 'var(--bg-canvas)',
                                border: '1px solid var(--border-subtle)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '10px',
                              }}
                            >
                              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                                Supporting Verbatim Excerpts ({theme.evidenceQuotes.length}):
                              </span>
                              {theme.evidenceQuotes.map((q) => (
                                <div key={q.id} style={{ fontSize: '12px', borderLeft: '2px solid var(--emerald-400)', paddingLeft: '8px' }}>
                                  <p style={{ fontFamily: 'var(--font-serif)', color: 'var(--text-primary)', fontStyle: 'italic' }}>
                                    “{q.text}”
                                  </p>
                                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px', fontSize: '10px', color: 'var(--text-muted)' }}>
                                    <span style={{ textTransform: 'capitalize' }}>{q.platform}</span>
                                    <span>•</span>
                                    <span className={`badge ${q.synthetic ? 'badge-amber' : q.provenanceCategory === 'verified_public' ? 'badge-emerald' : 'badge-neutral'}`}>{q.provenanceCategory?.replace(/_/g, ' ') || q.verificationStatus || 'unverified'}</span>
                                    <a href={q.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>
                                      Source Link
                                    </a>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Bottom Action Footer */}
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            borderTop: '1px solid var(--border-subtle)',
                            paddingTop: '10px',
                            marginTop: '6px',
                          }}
                        >
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '11px' }}
                            onClick={() => setExpandedThemeId(isExpanded ? null : theme.id)}
                          >
                            {isExpanded ? 'Hide Quotes' : `View Quotes (${theme.evidenceQuotes.length})`}
                          </button>

                          <div style={{ display: 'flex', gap: '6px' }}>
                            {theme.status === 'proposed' && (
                              <button
                                className="btn btn-secondary"
                                style={{ padding: '4px 8px', fontSize: '11px', borderColor: 'var(--emerald-border)', color: 'var(--emerald-400)' }}
                                onClick={() => handleStatusChange(theme.id, 'accepted')}
                                disabled={isPending}
                              >
                                Accept
                              </button>
                            )}

                            {theme.status === 'accepted' && (
                              <button
                                className="btn btn-secondary"
                                style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--text-muted)' }}
                                onClick={() => handleStatusChange(theme.id, 'retired')}
                                disabled={isPending}
                              >
                                Retire
                              </button>
                            )}

                            <button
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--amber-400)' }}
                              onClick={() => setMergeSource(theme)}
                              disabled={isPending}
                            >
                              Merge
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Merge Modal */}
      {mergeSource && (
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
          onClick={() => setMergeSource(null)}
        >
          <div
            className="card"
            style={{ width: '100%', maxWidth: '480px', padding: '24px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Merge Theme</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '6px' }}>
              Merge <strong>{mergeSource.name}</strong> into another primary theme. All linked evidence records will automatically point to the destination theme.
            </p>

            <form onSubmit={handleMergeSubmit} style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Target Destination Theme:
                </label>
                <select
                  value={mergeTargetId}
                  onChange={(e) => setMergeTargetId(e.target.value)}
                  required
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
                  <option value="">Select destination theme...</option>
                  {initialThemes
                    .filter((t) => t.id !== mergeSource.id && t.status !== 'merged')
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.supportingCount} records)
                      </option>
                    ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setMergeSource(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isPending || !mergeTargetId}>
                  {isPending ? 'Merging...' : 'Confirm Merge'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Theme Modal */}
      {isCreateOpen && (
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
          onClick={() => setIsCreateOpen(false)}
        >
          <div
            className="card"
            style={{ width: '100%', maxWidth: '520px', padding: '24px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Create New Theme</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '6px' }}>
              Define a human-created problem theme based on investor interviews or synthesis.
            </p>

            <form onSubmit={handleCreateSubmit} style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Theme Name:
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Unexplained Instalment Settlement Delay"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
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

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Lifecycle Journey Stage:
                </label>
                <select
                  value={newStage}
                  onChange={(e) => setNewStage(e.target.value)}
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
                  <option value="discovery_intent">Discovery & Intent</option>
                  <option value="mandate_kyc_setup">Mandate & KYC Setup</option>
                  <option value="first_instalment">First Instalment Allotment</option>
                  <option value="market_dip_reaction">Market Dip (Months 2–4)</option>
                  <option value="autopay_failure_recovery">Autopay Failure & Penalty</option>
                  <option value="continuation_milestone">12-Month Horizon</option>
                  <option value="pause_cancellation">Pause & Cancellation</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Description & User Context:
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Describe how this friction affects first-time mutual fund investors..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-canvas)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isPending || !newName.trim() || !newDesc.trim()}>
                  {isPending ? 'Saving...' : 'Create Theme'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
