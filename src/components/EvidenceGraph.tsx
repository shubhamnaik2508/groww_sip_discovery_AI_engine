'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import * as d3Force from 'd3-force';

export interface GraphNode extends d3Force.SimulationNodeDatum {
  id: string;
  type: 'source' | 'record' | 'theme' | 'hypothesis' | 'question' | 'opportunity' | 'outcome';
  label: string;
  subtitle?: string;
  details?: any;
  color?: string;
  size?: number;
}

export interface GraphLink extends d3Force.SimulationLinkDatum<GraphNode> {
  id: string;
  source: string | GraphNode;
  target: string | GraphNode;
  relation: string;
}

export function EvidenceGraph({
  initialNodes,
  initialLinks,
}: {
  initialNodes: GraphNode[];
  initialLinks: GraphLink[];
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Filter toggles
  const [showSources, setShowSources] = useState(true);
  const [showRecords, setShowRecords] = useState(true);
  const [showThemes, setShowThemes] = useState(true);
  const [showOpportunities, setShowOpportunities] = useState(true);
  const [showOutcomes, setShowOutcomes] = useState(true);
  const [showHypotheses, setShowHypotheses] = useState(true);
  const [showQuestions, setShowQuestions] = useState(true);

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Simulation node positions state
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);

  // Filtered dataset
  const activeTypes = useMemo(() => {
    const s = new Set<string>();
    if (showSources) s.add('source');
    if (showRecords) s.add('record');
    if (showThemes) s.add('theme');
    if (showOpportunities) s.add('opportunity');
    if (showOutcomes) s.add('outcome');
    if (showHypotheses) s.add('hypothesis');
    if (showQuestions) s.add('question');
    return s;
  }, [showSources, showRecords, showThemes, showOpportunities, showOutcomes, showHypotheses, showQuestions]);

  const activeNodeIds = useMemo(() => {
    return new Set(initialNodes.filter((n) => activeTypes.has(n.type)).map((n) => n.id));
  }, [initialNodes, activeTypes]);

  useEffect(() => {
    const filteredNodes = initialNodes
      .filter((n) => activeTypes.has(n.type))
      .map((n) => ({ ...n }));

    const filteredLinks = initialLinks
      .filter((l) => {
        const srcId = typeof l.source === 'object' ? (l.source as any).id : l.source;
        const tgtId = typeof l.target === 'object' ? (l.target as any).id : l.target;
        return activeNodeIds.has(srcId) && activeNodeIds.has(tgtId);
      })
      .map((l) => ({ ...l }));

    const width = 960;
    const height = 620;

    const simulation = d3Force
      .forceSimulation<GraphNode>(filteredNodes)
      .force(
        'link',
        d3Force
          .forceLink<GraphNode, GraphLink>(filteredLinks)
          .id((d) => d.id)
          .distance((d) => (d.relation === 'belongs_to' ? 40 : 70))
      )
      .force('charge', d3Force.forceManyBody().strength(-120))
      .force('center', d3Force.forceCenter(width / 2, height / 2))
      .force(
        'collide',
        d3Force.forceCollide().radius((d: any) => (d.size || 10) + 12)
      );

    simulation.on('tick', () => {
      setNodes([...filteredNodes]);
      setLinks([...filteredLinks]);
    });

    return () => {
      simulation.stop();
    };
  }, [initialNodes, initialLinks, activeTypes, activeNodeIds]);

  // Connected nodes map for hover highlighting
  const connectedNodeIds = useMemo(() => {
    if (!hoveredNodeId) return null;
    const set = new Set<string>([hoveredNodeId]);
    for (const link of links) {
      const srcId = typeof link.source === 'object' ? (link.source as any).id : link.source;
      const tgtId = typeof link.target === 'object' ? (link.target as any).id : link.target;
      if (srcId === hoveredNodeId) set.add(tgtId);
      if (tgtId === hoveredNodeId) set.add(srcId);
    }
    return set;
  }, [hoveredNodeId, links]);

  const getNodeColor = (type: string) => {
    switch (type) {
      case 'outcome':
        return 'var(--emerald-400)'; // Cyan - Fellowship Target Outcome
      case 'opportunity':
        return 'var(--amber-400)'; // Amber - Candidate Problem Space Opportunity
      case 'theme':
        return 'var(--emerald-400)'; // Emerald - Discovered Lifecycle Theme
      case 'source':
        return 'var(--blue-400)'; // Blue - Originating Platform Channel
      case 'hypothesis':
        return 'var(--purple-400)'; // Purple - Testable Retention Hypothesis
      case 'question':
        return 'var(--red-400)'; // Rose - Open Qualitative Inquiry
      case 'record':
        return 'var(--text-secondary)'; // Slate - Verbatim Evidence Excerpt
      default:
        return 'var(--text-muted)';
    }
  };

  const getNodeRadius = (type: string) => {
    switch (type) {
      case 'outcome':
        return 18;
      case 'opportunity':
        return 15;
      case 'theme':
        return 13;
      case 'source':
        return 12;
      case 'hypothesis':
        return 9;
      case 'question':
        return 8;
      case 'record':
        return 6;
      default:
        return 8;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Controls & Filter Bar */}
      <div
        className="card"
        style={{
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Filter Network Layers:
          </span>

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showSources}
              onChange={(e) => setShowSources(e.target.checked)}
            />
            <span style={{ color: 'var(--blue-400)' }}>● Sources ({initialNodes.filter((n) => n.type === 'source').length})</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showRecords}
              onChange={(e) => setShowRecords(e.target.checked)}
            />
            <span style={{ color: 'var(--text-secondary)' }}>● Evidence ({initialNodes.filter((n) => n.type === 'record').length})</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showThemes}
              onChange={(e) => setShowThemes(e.target.checked)}
            />
            <span style={{ color: 'var(--emerald-400)' }}>● Themes ({initialNodes.filter((n) => n.type === 'theme').length})</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showOpportunities}
              onChange={(e) => setShowOpportunities(e.target.checked)}
            />
            <span style={{ color: 'var(--amber-400)' }}>● Opportunities ({initialNodes.filter((n) => n.type === 'opportunity').length})</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showOutcomes}
              onChange={(e) => setShowOutcomes(e.target.checked)}
            />
            <span style={{ color: 'var(--emerald-400)' }}>● North Star Metric ({initialNodes.filter((n) => n.type === 'outcome').length})</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showHypotheses}
              onChange={(e) => setShowHypotheses(e.target.checked)}
            />
            <span style={{ color: 'var(--purple-400)' }}>● Hypotheses ({initialNodes.filter((n) => n.type === 'hypothesis').length})</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showQuestions}
              onChange={(e) => setShowQuestions(e.target.checked)}
            />
            <span style={{ color: 'var(--red-400)' }}>● Questions ({initialNodes.filter((n) => n.type === 'question').length})</span>
          </label>
        </div>

        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Click any node to inspect verbatim quotes and linkages.
        </div>
      </div>

      {/* Main Canvas & Inspector Drawer */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: selectedNode ? '1fr 340px' : '1fr',
          gap: '20px',
          transition: 'all 0.2s ease',
        }}
      >
        {/* SVG Container */}
        <div
          className="card"
          style={{
            padding: '0',
            overflow: 'hidden',
            background: 'var(--bg-canvas)',
            border: '1px solid var(--border-subtle)',
            minHeight: '620px',
            position: 'relative',
          }}
        >
          <svg
            ref={svgRef}
            viewBox="0 0 960 620"
            style={{ width: '100%', height: '620px', display: 'block' }}
          >
            {/* Background Grid Pattern */}
            <defs>
              <pattern id="graph-grid" width="30" height="30" patternUnits="userSpaceOnUse">
                <path d="M 30 0 L 0 0 0 30" fill="none" stroke="var(--border-subtle)" strokeWidth="1" strokeOpacity={0.4} />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#graph-grid)" />

            {/* Links */}
            <g className="links">
              {links.map((link) => {
                const src: any = link.source;
                const tgt: any = link.target;
                if (!src.x || !tgt.x) return null;

                const isHighlighted =
                  connectedNodeIds &&
                  (connectedNodeIds.has(src.id) && connectedNodeIds.has(tgt.id));

                return (
                  <line
                    key={link.id}
                    x1={src.x}
                    y1={src.y}
                    x2={tgt.x}
                    y2={tgt.y}
                    stroke={
                      isHighlighted
                        ? 'var(--emerald-400)'
                        : link.relation === 'contradicts'
                        ? 'var(--red-400)'
                        : 'var(--border-subtle)'
                    }
                    strokeWidth={isHighlighted ? 2 : 1}
                    strokeDasharray={link.relation === 'contradicts' ? '4,4' : undefined}
                    opacity={connectedNodeIds && !isHighlighted ? 0.15 : 0.6}
                  />
                );
              })}
            </g>

            {/* Nodes */}
            <g className="nodes">
              {nodes.map((node) => {
                if (node.x === undefined || node.y === undefined) return null;

                const isSelected = selectedNode?.id === node.id;
                const isHovered = hoveredNodeId === node.id;
                const isDimmed = connectedNodeIds && !connectedNodeIds.has(node.id);
                const r = getNodeRadius(node.type);
                const color = getNodeColor(node.type);

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    style={{ cursor: 'pointer', transition: 'opacity 0.15s ease' }}
                    opacity={isDimmed ? 0.2 : 1}
                    onClick={() => setSelectedNode(node)}
                    onMouseEnter={() => setHoveredNodeId(node.id)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                  >
                    {/* Highlight halo */}
                    {(isSelected || isHovered) && (
                      <circle
                        r={r + 8}
                        fill="none"
                        stroke={color}
                        strokeWidth={2}
                        opacity={0.5}
                      />
                    )}

                    {/* Node circle */}
                    <circle
                      r={r}
                      fill={color}
                      stroke="var(--bg-canvas)"
                      strokeWidth={2}
                    />

                    {/* Node label */}
                    {(node.type === 'theme' || node.type === 'source' || node.type === 'opportunity' || node.type === 'outcome' || isSelected || isHovered) && (
                      <text
                        dy={r + 12}
                        textAnchor="middle"
                        fill="var(--text-primary)"
                        fontSize={node.type === 'outcome' ? '12px' : node.type === 'opportunity' || node.type === 'theme' ? '11px' : '10px'}
                        fontWeight={node.type === 'outcome' || node.type === 'opportunity' || node.type === 'theme' ? 600 : 400}
                        style={{ pointerEvents: 'none', textShadow: 'var(--graph-text-shadow, 0 1px 3px rgba(0,0,0,0.8))' }}
                      >
                        {node.label.length > 24 ? node.label.slice(0, 22) + '…' : node.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        {/* Node Inspector Drawer */}
        {selectedNode && (
          <div
            className="card"
            style={{
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              maxHeight: '620px',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span
                  className="badge"
                  style={{
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    background: `${getNodeColor(selectedNode.type)}20`,
                    border: `1px solid ${getNodeColor(selectedNode.type)}50`,
                    color: getNodeColor(selectedNode.type),
                  }}
                >
                  {selectedNode.type}
                </span>
                <h4 style={{ fontSize: '15px', fontWeight: 600, marginTop: '6px' }}>
                  {selectedNode.label}
                </h4>
              </div>

              <button
                className="btn btn-secondary"
                style={{ padding: '2px 6px', fontSize: '12px' }}
                onClick={() => setSelectedNode(null)}
              >
                ✕
              </button>
            </div>

            {selectedNode.subtitle && (
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: '1.45' }}>
                {selectedNode.subtitle}
              </p>
            )}

            {/* Opportunity Details */}
            {selectedNode.type === 'opportunity' && selectedNode.details && (
              <div
                style={{
                  padding: '12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-canvas)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
                    Underlying Problem Statement:
                  </span>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '3px' }}>
                    {selectedNode.details.problemStatement}
                  </p>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--purple-400)', fontWeight: 600 }}>
                    Hypothesis on 12-Month Retention Lift:
                  </span>
                  <p style={{ color: 'var(--text-primary)', fontSize: '13px', marginTop: '3px' }}>
                    {selectedNode.details.hypothesis}
                  </p>
                </div>
                {selectedNode.details.compositeScore !== undefined && (
                  <div style={{ fontSize: '12px', color: 'var(--emerald-400)', fontWeight: 600 }}>
                    Priority Index: {selectedNode.details.compositeScore} / 100
                  </div>
                )}
              </div>
            )}

            {/* Outcome Details */}
            {selectedNode.type === 'outcome' && selectedNode.details && (
              <div
                style={{
                  padding: '14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(6, 182, 212, 0.08)',
                  border: '1px solid rgba(6, 182, 212, 0.3)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ fontSize: '12px', color: 'var(--emerald-400)', fontWeight: 600 }}>
                  Fellowship North Star Business Metric
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: '1.4' }}>
                  {selectedNode.details.canonicalDefinition}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  <strong>Cohort:</strong> {selectedNode.details.cohortTarget}
                  <br />
                  <strong>Non-Negotiable Guard:</strong> {selectedNode.details.governingConstraint}
                </div>
              </div>
            )}

            {/* Verbatim quote if record */}
            {selectedNode.type === 'record' && selectedNode.details && (
              <div
                style={{
                  padding: '12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-canvas)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Verbatim Investor Feedback:
                </span>
                <p
                  style={{
                    fontFamily: 'var(--font-serif)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    marginTop: '4px',
                    fontStyle: 'italic',
                  }}
                >
                  “{selectedNode.details.originalText}”
                </p>
                <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                  Platform: <span style={{ textTransform: 'capitalize' }}>{selectedNode.details.platform}</span>
                  <br />
                  Evidence basis: <strong>{selectedNode.details.provenance || 'Unclassified / unknown'}</strong>
                  <br />
                  AI analysis: {selectedNode.details.analysisProvider || 'not analysed'}
                  <br />
                  Stage: {selectedNode.details.journeyStage}
                  <br />
                  <a
                    href={selectedNode.details.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--emerald-400)', textDecoration: 'underline' }}
                  >
                    View Original Source Link
                  </a>
                </div>
              </div>
            )}

            {/* Connected Links list */}
            <div>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Connected Relationships:
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                {links
                  .filter((l) => {
                    const sId = typeof l.source === 'object' ? (l.source as any).id : l.source;
                    const tId = typeof l.target === 'object' ? (l.target as any).id : l.target;
                    return sId === selectedNode.id || tId === selectedNode.id;
                  })
                  .map((l) => {
                    const sId = typeof l.source === 'object' ? (l.source as any).id : l.source;
                    const isOutgoing = sId === selectedNode.id;
                    const otherNodeId = isOutgoing
                      ? typeof l.target === 'object'
                        ? (l.target as any).id
                        : l.target
                      : sId;

                    const otherNode = initialNodes.find((n) => n.id === otherNodeId);
                    if (!otherNode) return null;

                    return (
                      <div
                        key={l.id}
                        style={{
                          padding: '6px 8px',
                          borderRadius: '4px',
                          background: 'var(--bg-canvas)',
                          border: '1px solid var(--border-subtle)',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                        onClick={() => setSelectedNode(otherNode)}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)' }}>
                          <span>{l.relation}</span>
                          <span style={{ color: getNodeColor(otherNode.type) }}>{otherNode.type}</span>
                        </div>
                        <div style={{ fontWeight: 500, marginTop: '2px', color: 'var(--text-primary)' }}>
                          {otherNode.label}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
