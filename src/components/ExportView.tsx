'use client';

import { useState } from 'react';

export function ExportView({
  markdownContent,
  csvContent,
  jsonData,
  summary,
}: {
  markdownContent: string;
  csvContent: string;
  jsonData: any;
  summary: {
    totalRecords: number;
    storedRecords: number;
    syntheticRecords: number;
    totalThemes: number;
    totalOpportunities: number;
    evaluationAccuracy: number | null;
    failureCasesCount: number;
  };
}) {
  const [copied, setCopied] = useState(false);
  const [activePreview, setActivePreview] = useState<'markdown' | 'json' | 'csv'>('markdown');

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadMarkdown = () => {
    downloadFile(markdownContent, 'groww_sip_discovery_log.md', 'text/markdown;charset=utf-8');
  };

  const handleDownloadCsv = () => {
    downloadFile(csvContent, 'groww_evidence_log.csv', 'text/csv;charset=utf-8');
  };

  const handleDownloadJson = () => {
    downloadFile(JSON.stringify(jsonData, null, 2), 'groww_discovery_export.json', 'application/json;charset=utf-8');
  };

  const handleCopyMarkdown = () => {
    navigator.clipboard.writeText(markdownContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Banner & Quick Summary */}
      <div
        className="card"
        style={{
          padding: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '20px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span className="badge badge-emerald">Graduation Deliverable</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              NextLeap Product Manager Fellowship
            </span>
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Evidence Log & Discovery Artifacts</h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '680px', marginTop: '4px', fontSize: '13px' }}>
            Export comprehensive discovery documentation including verbatim quotes, provenance audits, empirical theme synthesis, failure case post-mortems, and sanitized CSV data.
          </p>
        </div>

        {/* Download Buttons */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary"
            onClick={handleDownloadMarkdown}
            style={{ fontWeight: 600 }}
          >
            📄 Download Report (.MD)
          </button>

          <button className="btn btn-secondary" onClick={handleDownloadCsv}>
            📊 Download CSV (.CSV)
          </button>

          <button className="btn btn-secondary" onClick={handleDownloadJson}>
            💾 Download JSON (.JSON)
          </button>
        </div>
      </div>

      {/* Metric Highlights */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '16px',
        }}
      >
        <div className="card" style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Eligible Evidence</span>
          <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
            {summary.totalRecords}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{summary.storedRecords} stored · {summary.syntheticRecords} fixtures excluded</span>
        </div>

        <div className="card" style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Discovered Themes</span>
          <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--purple-400)', marginTop: '4px' }}>
            {summary.totalThemes}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Across 7 journey stages</span>
        </div>

        <div className="card" style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Ranked Opportunities</span>
          <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--emerald-400)', marginTop: '4px' }}>
            {summary.totalOpportunities}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Scored across 7 criteria</span>
        </div>

        <div className="card" style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>AI Exact Agreement</span>
          <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--blue-400)', marginTop: '4px' }}>
            {summary.evaluationAccuracy !== null ? `${(summary.evaluationAccuracy * 100).toFixed(1)}%` : 'N/A'}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Against golden-set labels</span>
        </div>

        <div className="card" style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Audited Failure Cases</span>
          <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--red-400)', marginTop: '4px' }}>
            {summary.failureCasesCount}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Documented RCA logs</span>
        </div>
      </div>

      {/* In-Page Artifact Preview Section */}
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
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className={`btn ${activePreview === 'markdown' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '4px 10px', fontSize: '12px' }}
              onClick={() => setActivePreview('markdown')}
            >
              Markdown Report Preview
            </button>
            <button
              className={`btn ${activePreview === 'csv' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '4px 10px', fontSize: '12px' }}
              onClick={() => setActivePreview('csv')}
            >
              Sanitized CSV Preview
            </button>
            <button
              className={`btn ${activePreview === 'json' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '4px 10px', fontSize: '12px' }}
              onClick={() => setActivePreview('json')}
            >
              Structured JSON Preview
            </button>
          </div>

          {activePreview === 'markdown' && (
            <button
              className="btn btn-secondary"
              style={{ padding: '4px 10px', fontSize: '12px' }}
              onClick={handleCopyMarkdown}
            >
              {copied ? '✓ Copied to Clipboard!' : '📋 Copy Markdown'}
            </button>
          )}
        </div>

        {/* Content Box */}
        <div
          style={{
            padding: '24px',
            maxHeight: '600px',
            overflowY: 'auto',
            background: 'var(--bg-canvas)',
            fontFamily: activePreview === 'markdown' ? 'var(--font-sans)' : 'var(--font-mono)',
            fontSize: activePreview === 'markdown' ? '13px' : '12px',
            lineHeight: '1.6',
            color: 'var(--text-primary)',
            whiteSpace: 'pre-wrap',
          }}
        >
          {activePreview === 'markdown' && markdownContent}
          {activePreview === 'csv' && csvContent}
          {activePreview === 'json' && JSON.stringify(jsonData, null, 2)}
        </div>
      </div>
    </div>
  );
}
