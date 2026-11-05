'use client';

export function EvidenceLogPrintButton() {
  return <button className="btn btn-primary no-print" onClick={() => window.print()}>Export AI Evidence Log · Print / Save as PDF</button>;
}
