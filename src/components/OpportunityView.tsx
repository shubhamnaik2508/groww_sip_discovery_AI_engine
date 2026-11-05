'use client';

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  recalculateOpportunityAction,
  createOpportunityAction,
  updateOpportunityHumanScoreAction,
} from '@/app/actions';

export interface OpportunityItem {
  id: string;
  title: string;
  problemStatement: string;
  hypothesisOnRetention: string;
  status: string;
  compositeScore: number;
  weightsSnapshot: {
    evidenceStrength: number;
    independentRecords: number;
    sourceDiversity: number;
    userImpact: number;
    businessMetricLink: number;
    researchUncertainty: number;
    potentialFeasibility: number;
  };
  linkedThemes: any[];
  linkedEvidence?: Array<{
    id: string;
    originalText: string;
    sourceUrl: string;
    platform: string;
    journeyStage: string;
    provenance: Record<string, string>;
    analysisProvider?: string;
  }>;
  illustrativeEvidence?: Array<{ id: string; originalText: string; sourceUrl: string; platform: string; verificationStatus: string; isSynthetic: boolean }>;
  illustrativeEvidenceCount?: number;
  totalLinkedEvidenceCount?: number;
  sourceDiversityCount?: number;
  contradictoryEvidence?: Array<{
    id: string;
    title: string;
    description: string;
    evidenceA: string;
    evidenceB: string;
    sourceA: string;
    sourceB: string;
    eligible: boolean;
  }>;
  opportunityContext?: {
    userScenarios: string[];
    existingWorkarounds: string[];
    candidateUnmetNeeds: string[];
    candidateCauseHypotheses: string[];
    explicitlySupportedSegments: string[];
    primaryResearchConfirmationCount: number;
    researchConfidence: string;
  };
  scoreAudit?: Array<{ id: string; criterion: string; previousScore: number | null; newScore: number; rationale: string; scoredBy: string; createdAt: string }>;
  scores: Array<{
    id: string;
    criterion: string;
    rawScore: number;
    normalizedScore: number;
    basis: string;
    rationale: string | null;
  }>;
  sensitivityScenarios?: Array<{
    id: string;
    name: string;
    description: string;
    score: number;
  }>;
  missingInformation?: string[];
  isThinEvidence: boolean;
  hasEligibleEvidence?: boolean;
  eligibleEvidenceCount?: number;
  excludedFixtureCount?: number;
  excludedDuplicateCount?: number;
}

export function OpportunityView({
  initialOpportunities,
  availableThemes,
}: {
  initialOpportunities: OpportunityItem[];
  availableThemes: any[];
}) {
  const [weights, setWeights] = useState({
    evidenceStrength: 5,
    independentRecords: 3.75,
    sourceDiversity: 2.5,
    userImpact: 5,
    businessMetricLink: 3.75,
    researchUncertainty: 2.5,
    potentialFeasibility: 2.5,
  });

  const [opportunities, setOpportunities] = useState<OpportunityItem[]>(initialOpportunities);
  const router = useRouter();
  const [auditMessage, setAuditMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Create Opportunity Modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newProblem, setNewProblem] = useState('');
  const [newHypothesis, setNewHypothesis] = useState('');
  const [selectedThemeIds, setSelectedThemeIds] = useState<string[]>([]);
  const [newUserImpact, setNewUserImpact] = useState(4.0);
  const [newImpactRationale, setNewImpactRationale] = useState('');
  const [newBusinessLink, setNewBusinessLink] = useState(4.5);
  const [newBusinessRationale, setNewBusinessRationale] = useState('');
  const [newUncertainty, setNewUncertainty] = useState(2.0);
  const [newUncertaintyRationale, setNewUncertaintyRationale] = useState('');
  const [newFeasibility, setNewFeasibility] = useState(4.0);
  const [newFeasibilityRationale, setNewFeasibilityRationale] = useState('');

  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Client-side instant recalculation for responsiveness
  const recalculatedOpportunities = useMemo(() => {
    const totalWeights =
      weights.evidenceStrength +
      weights.independentRecords +
      weights.sourceDiversity +
      weights.userImpact +
      weights.businessMetricLink +
      weights.researchUncertainty +
      weights.potentialFeasibility;

    return opportunities
      .map((opp) => {
        const getScore = (crit: string) => {
          const s = opp.scores.find((x) => x.criterion === crit);
          return s ? s.normalizedScore : (opp.hasEligibleEvidence === false ? 0 : 50);
        };

        const evScore = getScore('evidence_strength');
        const recScore = getScore('independent_records');
        const divScore = getScore('source_diversity');
        const impScore = getScore('user_impact');
        const busScore = getScore('business_metric_link');
        const uncScore = opp.hasEligibleEvidence === false ? 0 : 100 - getScore('research_uncertainty'); // inverted penalty
        const feasScore = getScore('potential_feasibility');

        const composite = opp.hasEligibleEvidence === false ? 0 :
          totalWeights > 0
            ? (evScore * weights.evidenceStrength +
                recScore * weights.independentRecords +
                divScore * weights.sourceDiversity +
                impScore * weights.userImpact +
                busScore * weights.businessMetricLink +
                uncScore * weights.researchUncertainty +
                feasScore * weights.potentialFeasibility) /
              totalWeights
            : 0;

        return {
          ...opp,
          calculatedComposite: Number(composite.toFixed(1)),
        };
      })
      .sort((a, b) => b.calculatedComposite - a.calculatedComposite);
  }, [opportunities, weights]);

  const handleWeightChange = (key: keyof typeof weights, value: number) => {
    const updated = { ...weights, [key]: value };
    setWeights(updated);

    // Sync to database asynchronously
    startTransition(async () => {
      for (const opp of opportunities) {
        await recalculateOpportunityAction(opp.id, updated);
      }
    });
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newProblem.trim() || !newHypothesis.trim() || selectedThemeIds.length === 0) {
      alert('Please fill out all required fields and select at least one linked problem theme.');
      return;
    }

    setMsg(null);
    startTransition(async () => {
      const res = await createOpportunityAction({
        title: newTitle.trim(),
        problemStatement: newProblem.trim(),
        hypothesisOnRetention: newHypothesis.trim(),
        themeIds: selectedThemeIds,
        humanScores: {
          userImpact: {
            score: newUserImpact,
            rationale: newImpactRationale || 'Evaluated based on user friction intensity.',
            scoredBy: 'PM Fellow',
          },
          businessMetricLink: {
            score: newBusinessLink,
            rationale: newBusinessRationale || 'Direct connection to 30-day active SIP milestone.',
            scoredBy: 'PM Fellow',
          },
          researchUncertainty: {
            score: newUncertainty,
            rationale: newUncertaintyRationale || 'Assessed against literature and empirical signal strength.',
            scoredBy: 'PM Fellow',
          },
          potentialFeasibility: {
            score: newFeasibility,
            rationale: newFeasibilityRationale || 'Technical and banking integration complexity assessment.',
            scoredBy: 'PM Fellow',
          },
        },
      });

      if (res.success) {
        setMsg({ type: 'success', text: `Candidate opportunity "${newTitle}" created and scored.` });
        setIsCreateOpen(false);
      } else {
        setMsg({ type: 'error', text: res.error || 'Failed to create opportunity.' });
      }
    });
  };

  const getScoreItem = (opp: OpportunityItem, crit: string) => {
    return opp.scores.find((s) => s.criterion === crit);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Disclaimer Invariant Banner */}
      <div
        style={{
          padding: '14px 18px',
          borderRadius: 'var(--radius-md)',
          background: 'rgba(0, 208, 156, 0.08)',
          border: '1px solid var(--emerald-border)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '13px',
          color: 'var(--emerald-400)',
        }}
      >
        <span style={{ fontSize: '18px' }}>🎯</span>
        <div>
          <strong>Strict Methodology Invariant:</strong> Candidate opportunity scores are a structured prioritization aid across empirical evidence dimensions, <em>not a forecast or guarantee of retention lift</em>.
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

      {/* Grid: Left Weights Panel (1/3), Right Ranked Opportunities (2/3) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '24px',
          alignItems: 'start',
        }}
      >
        {/* Left: Dynamic Weights Panel */}
        <div
          className="card"
          style={{
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
            position: 'sticky',
            top: '80px',
          }}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Dynamic Criteria Weights</h3>
              <button
                className="btn btn-secondary"
                style={{ padding: '2px 8px', fontSize: '11px' }}
                onClick={() =>
                  setWeights({
                    evidenceStrength: 1,
                    independentRecords: 1,
                    sourceDiversity: 1,
                    userImpact: 1,
                    businessMetricLink: 1,
                    researchUncertainty: 1,
                    potentialFeasibility: 1,
                  })
                }
              >
                Reset
              </button>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '4px' }}>
              Adjust relative weights (0 to 5) to test sensitivity and simulate different product team prioritization strategies.
            </p>
          </div>

            {/* Strategy Presets */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                Strategy Weight Presets:
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: '11px', padding: '4px 6px', textAlign: 'center' }}
                  onClick={() =>
                    setWeights({
                      evidenceStrength: 1,
                      independentRecords: 1,
                      sourceDiversity: 1,
                      userImpact: 1,
                      businessMetricLink: 1,
                      researchUncertainty: 1,
                      potentialFeasibility: 1,
                    })
                  }
                >
                  Balanced (1x)
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: '11px', padding: '4px 6px', textAlign: 'center', borderColor: 'var(--emerald-border)' }}
                  onClick={() =>
                    setWeights({
                      evidenceStrength: 3,
                      independentRecords: 3,
                      sourceDiversity: 2,
                      userImpact: 1,
                      businessMetricLink: 1,
                      researchUncertainty: 2,
                      potentialFeasibility: 1,
                    })
                  }
                >
                  Evidence-Heavy
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: '11px', padding: '4px 6px', textAlign: 'center', borderColor: 'var(--purple-border)' }}
                  onClick={() =>
                    setWeights({
                      evidenceStrength: 1,
                      independentRecords: 1,
                      sourceDiversity: 1,
                      userImpact: 3,
                      businessMetricLink: 3,
                      researchUncertainty: 1,
                      potentialFeasibility: 2,
                    })
                  }
                >
                  Impact-First
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: '11px', padding: '4px 6px', textAlign: 'center' }}
                  onClick={() =>
                    setWeights({
                      evidenceStrength: 2,
                      independentRecords: 2,
                      sourceDiversity: 1,
                      userImpact: 1,
                      businessMetricLink: 1,
                      researchUncertainty: 3,
                      potentialFeasibility: 3,
                    })
                  }
                >
                  Conservative
                </button>
              </div>
            </div>

            {/* 1. Evidence Strength */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                <span style={{ fontWeight: 500 }}>1. Evidence Strength (Review Ratio)</span>
                <span style={{ color: 'var(--emerald-400)', fontWeight: 600 }}>{weights.evidenceStrength}x</span>
              </div>
              <input
                type="range"
                min="0"
                max="5"
                step="0.5"
                value={weights.evidenceStrength}
                onChange={(e) => handleWeightChange('evidenceStrength', parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--emerald-500)' }}
              />
            </div>

            {/* 2. Independent Records */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                <span style={{ fontWeight: 500 }}>2. Independent Records Volume</span>
                <span style={{ color: 'var(--emerald-400)', fontWeight: 600 }}>{weights.independentRecords}x</span>
              </div>
              <input
                type="range"
                min="0"
                max="5"
                step="0.5"
                value={weights.independentRecords}
                onChange={(e) => handleWeightChange('independentRecords', parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--emerald-500)' }}
              />
            </div>

            {/* 3. Source Diversity */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                <span style={{ fontWeight: 500 }}>3. Source Platform Diversity</span>
                <span style={{ color: 'var(--emerald-400)', fontWeight: 600 }}>{weights.sourceDiversity}x</span>
              </div>
              <input
                type="range"
                min="0"
                max="5"
                step="0.5"
                value={weights.sourceDiversity}
                onChange={(e) => handleWeightChange('sourceDiversity', parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--emerald-500)' }}
              />
            </div>

            {/* 4. User Impact */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                <span style={{ fontWeight: 500 }}>4. User Pain & Distress Severity</span>
                <span style={{ color: 'var(--emerald-400)', fontWeight: 600 }}>{weights.userImpact}x</span>
              </div>
              <input
                type="range"
                min="0"
                max="5"
                step="0.5"
                value={weights.userImpact}
                onChange={(e) => handleWeightChange('userImpact', parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--emerald-500)' }}
              />
            </div>

            {/* 5. Business Metric Link */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                <span style={{ fontWeight: 500 }}>5. Link to 12M Active SIP Target</span>
                <span style={{ color: 'var(--emerald-400)', fontWeight: 600 }}>{weights.businessMetricLink}x</span>
              </div>
              <input
                type="range"
                min="0"
                max="5"
                step="0.5"
                value={weights.businessMetricLink}
                onChange={(e) => handleWeightChange('businessMetricLink', parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--emerald-500)' }}
              />
            </div>

            {/* 6. Research Uncertainty */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                <span style={{ fontWeight: 500 }}>6. Research Certainty (Low Risk Bonus)</span>
                <span style={{ color: 'var(--emerald-400)', fontWeight: 600 }}>{weights.researchUncertainty}x</span>
              </div>
              <input
                type="range"
                min="0"
                max="5"
                step="0.5"
                value={weights.researchUncertainty}
                onChange={(e) => handleWeightChange('researchUncertainty', parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--emerald-500)' }}
              />
            </div>

            {/* 7. Potential Feasibility */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                <span style={{ fontWeight: 500 }}>7. Implementation Feasibility</span>
                <span style={{ color: 'var(--emerald-400)', fontWeight: 600 }}>{weights.potentialFeasibility}x</span>
              </div>
              <input
                type="range"
                min="0"
                max="5"
                step="0.5"
                value={weights.potentialFeasibility}
                onChange={(e) => handleWeightChange('potentialFeasibility', parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--emerald-500)' }}
              />
            </div>

          <button
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '6px' }}
            onClick={() => setIsCreateOpen(true)}
          >
            + Formulate Candidate Opportunity
          </button>
        </div>

        {/* Right: Ranked Opportunity Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600 }}>
              Opportunity Candidates ({recalculatedOpportunities.filter((item) => item.hasEligibleEvidence !== false).length} rankable)
            </h3>
            {isPending && (
              <span style={{ fontSize: '12px', color: 'var(--amber-400)' }}>
                Recalculating database scores...
              </span>
            )}
          </div>

          {recalculatedOpportunities.length === 0 ? (
            <div
              className="card"
              style={{
                padding: '40px',
                textAlign: 'center',
                color: 'var(--text-muted)',
              }}
            >
              No candidate opportunities formulated yet. Click &quot;+ Formulate Candidate Opportunity&quot; to define one based on discovered themes.
            </div>
          ) : (
            recalculatedOpportunities.map((opp, idx) => {
              const evStrength = getScoreItem(opp, 'evidence_strength')?.normalizedScore || 0;
              const indep = getScoreItem(opp, 'independent_records')?.normalizedScore || 0;
              const diversity = getScoreItem(opp, 'source_diversity')?.normalizedScore || 0;
              const userPain = getScoreItem(opp, 'user_impact')?.normalizedScore || 0;
              const metricLink = getScoreItem(opp, 'business_metric_link')?.normalizedScore || 0;
              const certScore = 100 - (getScoreItem(opp, 'research_uncertainty')?.normalizedScore || 0);
              const feas = getScoreItem(opp, 'potential_feasibility')?.normalizedScore || 0;
              const eligibleRank = opp.hasEligibleEvidence === false ? null : recalculatedOpportunities.slice(0, idx + 1).filter((item) => item.hasEligibleEvidence !== false).length;
              const isTopRanked = eligibleRank === 1;

              return (
                <div
                  key={opp.id}
                  className="card"
                  style={{
                    padding: '24px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '18px',
                    border: isTopRanked ? '1px solid var(--emerald-border)' : '1px solid var(--border-subtle)',
                  }}
                >
                  {/* Top Bar: Rank & Composite Score */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                      <span
                        style={{
                          fontSize: '18px',
                          fontWeight: 700,
                          color: isTopRanked ? 'var(--emerald-400)' : 'var(--text-muted)',
                          padding: '4px 10px',
                          borderRadius: 'var(--radius-md)',
                          background: 'var(--bg-surface-raised)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        {eligibleRank ? `#${eligibleRank}` : '—'}
                      </span>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <h4 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {opp.title}
                          </h4>
                          {opp.isThinEvidence && (
                            <span
                              className="badge badge-amber"
                              style={{ fontSize: '11px' }}
                              title="Less than 3 independent records support this opportunity"
                            >
                              ⚠️ Thin Evidence (&lt; 3 records)
                            </span>
                          )}
                          {opp.hasEligibleEvidence === false && (
                            <span className="badge badge-amber" style={{ fontSize: '11px' }}>
                              Not ranked · no genuine eligible evidence{opp.illustrativeEvidenceCount ? ` · ${opp.illustrativeEvidenceCount} illustrative record(s) shown below` : ''}
                            </span>
                          )}
                        </div>

                        {/* Linked Themes */}
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                          {opp.linkedThemes.map((t: any) => (
                            <span key={t.id} className="badge badge-purple" style={{ fontSize: '11px' }}>
                              Theme: {t.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Composite Score Circle/Badge */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '10px 16px',
                        borderRadius: 'var(--radius-lg)',
                        background: 'var(--bg-canvas)',
                        border: '1px solid var(--border-subtle)',
                        minWidth: '80px',
                      }}
                    >
                      <span style={{ fontSize: '24px', fontWeight: 700, color: 'var(--emerald-400)' }}>
                        {opp.calculatedComposite}
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        Priority Index
                      </span>
                    </div>
                  </div>

                  {/* Problem & Hypothesis Box */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                      gap: '14px',
                      padding: '14px',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-canvas)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        Underlying User Problem Statement:
                      </span>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px', lineHeight: '1.45' }}>
                        {opp.problemStatement}
                      </p>
                    </div>

                    <div>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--purple-400)', textTransform: 'uppercase' }}>
                        Hypothesis on 12-Month Retention Lift:
                      </span>
                      <p style={{ color: 'var(--text-primary)', fontSize: '13px', marginTop: '4px', lineHeight: '1.45' }}>
                        {opp.hypothesisOnRetention}
                      </p>
                    </div>
                  </div>

                  {opp.opportunityContext && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                      <div className="card" style={{ padding: 12 }}><strong style={{ fontSize: 12 }}>Research context</strong><p style={{ fontSize: 11, marginTop: 5 }}>Confidence: {opp.opportunityContext.researchConfidence} · Primary research records: {opp.opportunityContext.primaryResearchConfirmationCount}</p><p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>Evidence links indicate supporting records; primary research records are not necessarily independent participants unless deduplicated by content.</p></div>
                      <div className="card" style={{ padding: 12 }}><strong style={{ fontSize: 12 }}>Candidate user scenarios & workarounds</strong>{opp.opportunityContext.userScenarios.slice(0, 3).map((value) => <p key={value} style={{ fontSize: 11, marginTop: 5 }}>{value}</p>)}{opp.opportunityContext.existingWorkarounds.slice(0, 3).map((value) => <p key={value} style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 5 }}>Workaround: {value}</p>)}{opp.opportunityContext.userScenarios.length + opp.opportunityContext.existingWorkarounds.length === 0 && <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>No scenario or workaround recorded in eligible analysis.</p>}</div>
                      <div className="card" style={{ padding: 12 }}><strong style={{ fontSize: 12 }}>Unmet needs & explicit segments</strong>{opp.opportunityContext.candidateUnmetNeeds.slice(0, 3).map((value) => <p key={value} style={{ fontSize: 11, marginTop: 5 }}>Potential user value / need: {value}</p>)}{opp.opportunityContext.explicitlySupportedSegments.slice(0, 5).map((value) => <p key={value} style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 5 }}>{value}</p>)}{opp.opportunityContext.candidateUnmetNeeds.length + opp.opportunityContext.explicitlySupportedSegments.length === 0 && <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>No eligible explicit need or segment classification is recorded.</p>}</div>
                      {opp.opportunityContext.candidateCauseHypotheses.length > 0 && <div className="card" style={{ padding: 12 }}><strong style={{ fontSize: 12 }}>Candidate cause hypotheses · unvalidated</strong>{opp.opportunityContext.candidateCauseHypotheses.slice(0, 3).map((value) => <p key={value} style={{ fontSize: 11, marginTop: 5 }}>{value}</p>)}</div>}
                    </div>
                  )}

                  <details style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, padding: 12 }}>
                    <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Human score override & audit history</summary>
                    <form onSubmit={async (event) => {
                      event.preventDefault();
                      const values = new FormData(event.currentTarget);
                      const criterion = String(values.get('criterion')) as 'user_impact' | 'business_metric_link' | 'research_uncertainty' | 'potential_feasibility';
                      const score = Number(values.get('score'));
                      const rationale = String(values.get('rationale') || '');
                      const scoredBy = String(values.get('scoredBy') || '');
                      const result = await updateOpportunityHumanScoreAction({
                        opportunityId: opp.id,
                        criterion,
                        score,
                        rationale,
                        scoredBy,
                      });
                      setAuditMessage(result.success ? 'Override saved with an audit entry.' : result.error || 'Could not save the override.');
                      if (result.success && result.result) {
                        setOpportunities((current) => current.map((item) => item.id !== opp.id ? item : {
                          ...item,
                          scores: item.scores.some((scoreItem) => scoreItem.criterion === criterion)
                            ? item.scores.map((scoreItem) => scoreItem.criterion === criterion ? { ...scoreItem, rawScore: score, normalizedScore: score * 20, basis: 'human_judgement', rationale } : scoreItem)
                            : [...item.scores, { id: result.result.auditId, criterion, rawScore: score, normalizedScore: score * 20, basis: 'human_judgement', rationale }],
                          scoreAudit: [{ id: result.result.auditId, criterion, previousScore: result.result.previousScore, newScore: score, rationale, scoredBy, createdAt: new Date().toISOString() }, ...(item.scoreAudit || [])],
                        }));
                        router.refresh();
                      }
                    }} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginTop: 10 }}>
                      <select name="criterion" aria-label="Score criterion" defaultValue="user_impact"><option value="user_impact">User pain severity</option><option value="business_metric_link">Retention metric connection</option><option value="research_uncertainty">Research confidence / uncertainty</option><option value="potential_feasibility">Implementation feasibility</option></select>
                      <input name="score" aria-label="Score from zero to five" type="number" min="0" max="5" step="0.1" required placeholder="Score 0–5" />
                      <input name="scoredBy" aria-label="Reviewer" required placeholder="Reviewer name" />
                      <input name="rationale" aria-label="Override rationale" required placeholder="Why this score changed" />
                      <button className="btn btn-secondary" type="submit">Save audited override</button>
                    </form>
                    {auditMessage && <p role="status" style={{ fontSize: 11, marginTop: 6 }}>{auditMessage}</p>}
                    {(opp.scoreAudit || []).length > 0 && <div style={{ marginTop: 10 }}><strong style={{ fontSize: 11 }}>Previous score decisions</strong>{opp.scoreAudit!.slice(0, 5).map((entry) => <p key={entry.id} style={{ fontSize: 11, marginTop: 5 }}>{entry.criterion.replace(/_/g, ' ')}: {entry.previousScore ?? 'unset'} → {entry.newScore}/5 by {entry.scoredBy} · {entry.rationale} <span style={{ color: 'var(--text-muted)' }}>{entry.createdAt}</span></p>)}</div>}
                  </details>

                  {/* 7 Component Breakdown Bars */}
                  <div>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      7 Evaluation Dimension Breakdown:
                    </span>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '12px',
                        marginTop: '10px',
                      }}
                    >
                      {/* 1. Evidence Strength */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
                          <span>Evidence Strength</span>
                          <span style={{ color: 'var(--text-primary)' }}>{Math.round(evStrength)}%</span>
                        </div>
                        <div style={{ height: '6px', background: 'var(--bg-surface-raised)', borderRadius: '3px', marginTop: '4px', overflow: 'hidden' }}>
                          <div style={{ width: `${evStrength}%`, height: '100%', background: 'var(--emerald-500)', borderRadius: '3px' }} />
                        </div>
                      </div>

                      {/* 2. Independent Records */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
                          <span>Record Volume</span>
                          <span style={{ color: 'var(--text-primary)' }}>{Math.round(indep)}%</span>
                        </div>
                        <div style={{ height: '6px', background: 'var(--bg-surface-raised)', borderRadius: '3px', marginTop: '4px', overflow: 'hidden' }}>
                          <div style={{ width: `${indep}%`, height: '100%', background: 'var(--emerald-500)', borderRadius: '3px' }} />
                        </div>
                      </div>

                      {/* 3. Source Diversity */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
                          <span>Platform Diversity</span>
                          <span style={{ color: 'var(--text-primary)' }}>{Math.round(diversity)}%</span>
                        </div>
                        <div style={{ height: '6px', background: 'var(--bg-surface-raised)', borderRadius: '3px', marginTop: '4px', overflow: 'hidden' }}>
                          <div style={{ width: `${diversity}%`, height: '100%', background: 'var(--blue-400)', borderRadius: '3px' }} />
                        </div>
                      </div>

                      {/* 4. User Impact */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
                          <span>User Pain Severity</span>
                          <span style={{ color: 'var(--text-primary)' }}>{Math.round(userPain)}%</span>
                        </div>
                        <div style={{ height: '6px', background: 'var(--bg-surface-raised)', borderRadius: '3px', marginTop: '4px', overflow: 'hidden' }}>
                          <div style={{ width: `${userPain}%`, height: '100%', background: 'var(--amber-400)', borderRadius: '3px' }} />
                        </div>
                      </div>

                      {/* 5. Business Metric Link */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
                          <span>12M Metric Link</span>
                          <span style={{ color: 'var(--text-primary)' }}>{Math.round(metricLink)}%</span>
                        </div>
                        <div style={{ height: '6px', background: 'var(--bg-surface-raised)', borderRadius: '3px', marginTop: '4px', overflow: 'hidden' }}>
                          <div style={{ width: `${metricLink}%`, height: '100%', background: 'var(--purple-400)', borderRadius: '3px' }} />
                        </div>
                      </div>

                      {/* 6. Research Certainty */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
                          <span>Research Certainty</span>
                          <span style={{ color: 'var(--text-primary)' }}>{Math.round(certScore)}%</span>
                        </div>
                        <div style={{ height: '6px', background: 'var(--bg-surface-raised)', borderRadius: '3px', marginTop: '4px', overflow: 'hidden' }}>
                          <div style={{ width: `${certScore}%`, height: '100%', background: 'var(--emerald-500)', borderRadius: '3px' }} />
                        </div>
                      </div>

                      {/* 7. Feasibility */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
                          <span>Feasibility</span>
                          <span style={{ color: 'var(--text-primary)' }}>{Math.round(feas)}%</span>
                        </div>
                        <div style={{ height: '6px', background: 'var(--bg-surface-raised)', borderRadius: '3px', marginTop: '4px', overflow: 'hidden' }}>
                          <div style={{ width: `${feas}%`, height: '100%', background: 'var(--emerald-500)', borderRadius: '3px' }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Detailed Scoring Matrix Table */}
                  <div style={{ marginTop: '4px' }}>
                    <details style={{ background: 'var(--bg-canvas)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', padding: '10px 14px' }}>
                      <summary style={{ cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: 'var(--emerald-400)' }}>
                        ▸ View Full 7-Criteria Scoring Matrix &amp; Rationale ({opp.scores.length} Factors)
                      </summary>
                      <div style={{ marginTop: '12px', overflowX: 'auto' }}>
                        {opp.hasEligibleEvidence === false ? (
                          <p style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Stored scores are suppressed because this opportunity has no eligible evidence. Add genuine, non-duplicate evidence and rescore.</p>
                        ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                              <th style={{ padding: '6px 8px' }}>Criterion</th>
                              <th style={{ padding: '6px 8px' }}>Raw Score (0-5)</th>
                              <th style={{ padding: '6px 8px' }}>Normalized (0-100)</th>
                              <th style={{ padding: '6px 8px' }}>Basis</th>
                              <th style={{ padding: '6px 8px' }}>Scoring Rationale &amp; Evidence Grounding</th>
                            </tr>
                          </thead>
                          <tbody>
                            {opp.scores.map((s) => (
                              <tr key={s.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                <td style={{ padding: '8px', fontWeight: 500, textTransform: 'capitalize' }}>
                                  {s.criterion.replace(/_/g, ' ')}
                                </td>
                                <td style={{ padding: '8px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                                  {s.rawScore} / 5.0
                                </td>
                                <td style={{ padding: '8px', color: 'var(--emerald-400)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                                  {Math.round(s.normalizedScore)}%
                                </td>
                                <td style={{ padding: '8px' }}>
                                  <span className={`badge ${s.basis === 'computed' ? 'badge-blue' : 'badge-purple'}`} style={{ fontSize: '10px' }}>
                                    {s.basis}
                                  </span>
                                </td>
                                <td style={{ padding: '8px', color: 'var(--text-secondary)', fontSize: '11px', lineHeight: '1.4' }}>
                                  {s.rationale || 'No specific rationale provided.'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        )}
                      </div>
                    </details>
                  </div>

                  {/* Weight Sensitivity Scenarios */}
                  {opp.sensitivityScenarios && opp.sensitivityScenarios.length > 0 && (
                    <div style={{ marginTop: '4px' }}>
                      <details style={{ background: 'var(--bg-canvas)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', padding: '10px 14px' }}>
                        <summary style={{ cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: 'var(--purple-400)' }}>
                          ▸ Strategy Sensitivity Analysis ({opp.sensitivityScenarios.length} Weight Presets)
                        </summary>
                        <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                          {opp.sensitivityScenarios.map((sc) => (
                            <div
                              key={sc.id}
                              style={{
                                padding: '10px',
                                borderRadius: 'var(--radius-sm)',
                                background: 'var(--bg-surface-raised)',
                                border: '1px solid var(--border-subtle)',
                              }}
                            >
                              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {sc.name}
                              </div>
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                {sc.description}
                              </div>
                              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--emerald-400)', marginTop: '6px' }}>
                                {sc.score} <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>/ 100</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>
                  )}

                  <div className="card" style={{ padding: 12, marginTop: 8 }}>
                    <strong style={{ fontSize: 12 }}>Unified evidence basis</strong>
                    <p style={{ fontSize: 11, marginTop: 5 }}>{opp.totalLinkedEvidenceCount ?? 0} linked records · {opp.eligibleEvidenceCount ?? 0} genuine eligible · {opp.illustrativeEvidenceCount ?? 0} illustrative · {opp.sourceDiversityCount ?? 0} source types · {opp.opportunityContext?.researchConfidence ?? 'Insufficient evidence'}</p>
                    {!opp.hasEligibleEvidence && <p className="badge badge-amber" style={{ marginTop: 6 }}>Illustrative opportunity only · not genuine research-backed</p>}
                  </div>
                  {opp.illustrativeEvidence && opp.illustrativeEvidence.length > 0 && <details style={{ background: 'var(--bg-canvas)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', padding: '10px 14px', marginTop: 8 }}>
                    <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--amber-400)' }}>Illustrative linked records ({opp.illustrativeEvidence.length})</summary>
                    {opp.illustrativeEvidence.map((ev) => <article key={ev.id} style={{ marginTop: 9, borderTop: '1px solid var(--border-subtle)', paddingTop: 8, fontSize: 12 }}><span className="badge badge-amber">Illustrative fixture</span><span style={{ marginLeft: 6 }}>{ev.platform}</span><p style={{ marginTop: 5 }}>“{ev.originalText}”</p><a href={ev.sourceUrl} target="_blank" rel="noreferrer">Fixture reference ↗</a></article>)}
                  </details>}
                  {/* Supporting Evidence Lineage */}
                  {opp.linkedEvidence && opp.linkedEvidence.length > 0 && (
                    <div style={{ marginTop: '4px' }}>
                      <details style={{ background: 'var(--bg-canvas)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', padding: '10px 14px' }}>
                        <summary style={{ cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: 'var(--blue-400)' }}>
                          ▸ Grounding Evidence Lineage ({opp.linkedEvidence.length} Linked Records)
                        </summary>
                        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {opp.linkedEvidence.map((ev) => (
                            <div
                              key={ev.id}
                              style={{
                                padding: '10px 12px',
                                borderRadius: 'var(--radius-sm)',
                                background: 'var(--bg-surface-raised)',
                                border: '1px solid var(--border-subtle)',
                                fontSize: '12px',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                  <span className="badge badge-zinc" style={{ fontSize: '10px', textTransform: 'capitalize' }}>
                                    {ev.platform.replace('_', ' ')}
                                  </span>
                                  <span className="badge badge-purple" style={{ fontSize: '10px' }}>
                                    {ev.journeyStage.replace(/_/g, ' ')}
                                  </span>
                                  {ev.analysisProvider && <span className={`badge ${ev.analysisProvider === 'fake' ? 'badge-amber' : 'badge-neutral'}`} style={{ fontSize: 10 }}>Analysis: {ev.analysisProvider === 'fake' ? 'simulated' : ev.analysisProvider}</span>}
                                  <span
                                    className={`badge ${ev.provenance?.sourceUrl === 'curated_benchmark' ? 'badge-amber' : ev.provenance?.sourceUrl === 'verified_live' ? 'badge-emerald' : 'badge-zinc'}`}
                                    style={{ fontSize: '10px' }}
                                  >
                                    {ev.provenance?.sourceUrl === 'curated_benchmark' ? 'Curated Benchmark (Academic Fixture)' : ev.provenance?.sourceUrl === 'verified_live' ? 'Live Verified' : 'User Entered'}
                                  </span>
                                </div>
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                                  #{ev.id.slice(0, 8)}
                                </span>
                              </div>
                              <p style={{ fontStyle: 'italic', color: 'var(--text-primary)', fontFamily: 'var(--font-serif)', marginTop: '4px' }}>
                                &ldquo;{ev.originalText}&rdquo;
                              </p>
                              <div style={{ marginTop: '6px', fontSize: '11px' }}>
                                <a
                                  href={ev.sourceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ color: 'var(--emerald-400)', textDecoration: 'underline' }}
                                >
                                  Source Attribution Link
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>
                  )}

                  {opp.contradictoryEvidence && opp.contradictoryEvidence.length > 0 && (
                    <details style={{ background: 'var(--bg-canvas)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', padding: '10px 14px' }}>
                      <summary style={{ cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: 'var(--amber-400)' }}>Contradictory evidence ({opp.contradictoryEvidence.filter((item) => item.eligible).length} eligible · {opp.contradictoryEvidence.filter((item) => !item.eligible).length} excluded)</summary>
                      {opp.contradictoryEvidence.filter((item) => item.eligible).map((item) => <article key={item.id} style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 10, marginTop: 10 }}><strong style={{ fontSize: 12 }}>{item.title}</strong><p style={{ fontSize: 12, marginTop: 4 }}>{item.description}</p><p style={{ fontSize: 11, marginTop: 5 }}>A: “{item.evidenceA}” · <a href={item.sourceA} target="_blank" rel="noreferrer">source ↗</a></p><p style={{ fontSize: 11, marginTop: 3 }}>B: “{item.evidenceB}” · <a href={item.sourceB} target="_blank" rel="noreferrer">source ↗</a></p></article>)}
                      {opp.contradictoryEvidence.every((item) => !item.eligible) && <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>No eligible evidence pair is available to substantiate the saved contradiction.</p>}
                    </details>
                  )}

                  {/* Methodological Caveats & Missing Information */}
                  <div
                    style={{
                      padding: '12px 14px',
                      borderRadius: 'var(--radius-md)',
                      background: 'rgba(245, 158, 11, 0.05)',
                      border: '1px solid rgba(245, 158, 11, 0.25)',
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                      lineHeight: '1.45',
                    }}
                  >
                    <div style={{ fontWeight: 600, color: 'var(--amber-400)', marginBottom: '4px', textTransform: 'uppercase', fontSize: '10px' }}>
                      Methodological Limitations &amp; Missing Information:
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '16px' }}>
                      <li>Qualitative review feedback identifies friction mechanisms but cannot prove cohort churn prevalence without bank ledger logs.</li>
                      <li>Hypothesis regarding 12-month retention lift is provisional and requires randomized controlled trial (A/B testing) before engineering build.</li>
                      <li>Candidate prioritization scores are decision aids across empirical dimensions, not forecasts or promises of retention lift.</li>
                    </ul>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Formulate Candidate Opportunity Modal */}
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
            overflowY: 'auto',
          }}
          onClick={() => setIsCreateOpen(false)}
        >
          <div
            className="card"
            style={{ width: '100%', maxWidth: '640px', padding: '28px', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Formulate Candidate Opportunity</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
              Define a problem space opportunity grounded strictly in discovered investor friction themes.
            </p>

            <form onSubmit={handleCreateSubmit} style={{ marginTop: '18px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Opportunity Title:
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Proactive Mandate Health & Pre-Debit Alert System"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
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
                  Link Problem Themes:
                </label>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px',
                    padding: '10px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-canvas)',
                    border: '1px solid var(--border-subtle)',
                    maxHeight: '120px',
                    overflowY: 'auto',
                  }}
                >
                  {availableThemes.map((t: any) => {
                    const isSelected = selectedThemeIds.includes(t.id);
                    return (
                      <button
                        type="button"
                        key={t.id}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedThemeIds(selectedThemeIds.filter((id) => id !== t.id));
                          } else {
                            setSelectedThemeIds([...selectedThemeIds, t.id]);
                          }
                        }}
                        style={{
                          padding: '4px 8px',
                          fontSize: '11px',
                          borderRadius: '4px',
                          border: isSelected ? '1px solid var(--emerald-border)' : '1px solid var(--border-subtle)',
                          background: isSelected ? 'var(--emerald-glow)' : 'var(--bg-surface-raised)',
                          color: isSelected ? 'var(--emerald-400)' : 'var(--text-secondary)',
                          cursor: 'pointer',
                        }}
                      >
                        {isSelected ? '✓ ' : '+ '}
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Underlying User Problem Statement (No Solution Imposed):
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="Articulate the exact barrier first-time mutual fund investors face..."
                  value={newProblem}
                  onChange={(e) => setNewProblem(e.target.value)}
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
                  Hypothesis on 12-Month Active SIP Continuation:
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="Framed testably: By solving X, we hypothesize 12-month retention will increase because Y..."
                  value={newHypothesis}
                  onChange={(e) => setNewHypothesis(e.target.value)}
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

              {/* Human Ratings (0-5) */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '12px',
                  padding: '12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-canvas)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                    User Pain Severity (0–5): {newUserImpact}
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    step="0.1"
                    value={newUserImpact}
                    onChange={(e) => setNewUserImpact(parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--amber-400)' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                    12-Month Metric Link (0–5): {newBusinessLink}
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    step="0.1"
                    value={newBusinessLink}
                    onChange={(e) => setNewBusinessLink(parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--purple-400)' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                    Research Uncertainty (0–5): {newUncertainty}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="5"
                    step="0.1"
                    value={newUncertainty}
                    onChange={(e) => setNewUncertainty(parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--blue-400)' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                    Feasibility (0–5): {newFeasibility}
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    step="0.1"
                    value={newFeasibility}
                    onChange={(e) => setNewFeasibility(parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--emerald-500)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isPending}>
                  {isPending ? 'Scoring...' : 'Create & Score Opportunity'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
