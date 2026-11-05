import { describe, expect, it } from 'vitest';
import { classifyEvidenceProvenance, deduplicateEligibleEvidence, isEligibleNonFixtureEvidence, isGenuineResearchEvidence, isSyntheticFixture } from '../evidenceEligibility';

const normalRecord = {
  id: 'record-1',
  entryMethod: 'manual',
  isSynthetic: false,
  verificationStatus: 'user_entered',
  duplicateOfId: null,
  fieldProvenance: { sourceUrl: 'user_entered' },
  sourceMetadata: null,
};

describe('shared evidence eligibility', () => {
  it.each([
    ['fixture entry method', { entryMethod: 'fixture' }],
    ['synthetic flag', { isSynthetic: true }],
    ['synthetic verification status', { verificationStatus: 'synthetic_fixture' }],
    ['curated benchmark field provenance', { fieldProvenance: { sourceUrl: 'curated_benchmark' } }],
    ['serialized legacy provenance', { fieldProvenance: '{"originalText":"curated_benchmark"}' }],
    ['synthetic attribution metadata', { sourceMetadata: { attributionNote: 'Synthetic / illustrative benchmark fixture' } }],
    ['duplicate linkage', { duplicateOfId: 'record-0' }],
  ])('excludes %s from genuine evidence', (_label, override) => {
    const record = { ...normalRecord, ...override };
    expect(isEligibleNonFixtureEvidence(record)).toBe(false);
    if (_label !== 'duplicate linkage') expect(isSyntheticFixture(record)).toBe(true);
  });

  it('keeps user-entered unverified public evidence out of genuine research counts', () => {
    expect(isSyntheticFixture(normalRecord)).toBe(false);
    expect(isEligibleNonFixtureEvidence(normalRecord)).toBe(true);
    expect(isGenuineResearchEvidence(normalRecord)).toBe(false);
  });

  it('allows content-verified public evidence and researcher-supplied primary research', () => {
    expect(isGenuineResearchEvidence({ ...normalRecord, platform: 'reddit', verificationStatus: 'content_verified' })).toBe(true);
    expect(isGenuineResearchEvidence({ ...normalRecord, platform: 'google_forms', verificationStatus: 'user_entered' })).toBe(true);
    expect(isGenuineResearchEvidence({ ...normalRecord, platform: 'reddit', verificationStatus: 'link_checked' })).toBe(false);
  });

  it('assigns distinct provenance labels without promoting illustrative data', () => {
    expect(classifyEvidenceProvenance({ ...normalRecord, platform: 'reddit', verificationStatus: 'content_verified' })).toBe('verified_public');
    expect(classifyEvidenceProvenance({ ...normalRecord, platform: 'reddit', verificationStatus: 'user_entered' })).toBe('unverified_public');
    expect(classifyEvidenceProvenance({ ...normalRecord, platform: 'user_interview', verificationStatus: 'user_entered' })).toBe('primary_research');
    expect(classifyEvidenceProvenance({ ...normalRecord, entryMethod: 'fixture', fieldProvenance: { originalText: 'curated_benchmark' } })).toBe('curated_benchmark');
    expect(classifyEvidenceProvenance({ ...normalRecord, entryMethod: 'fixture' })).toBe('synthetic_fixture');
    expect(classifyEvidenceProvenance({ ...normalRecord, duplicateOfId: 'record-0' })).toBe('duplicate_ineligible');
  });

  it('collapses identical content hashes even when a legacy duplicate link is missing', () => {
    const rows = [
      { ...normalRecord, id: 'canonical', contentHash: 'same-hash' },
      { ...normalRecord, id: 'legacy-copy', contentHash: 'same-hash' },
    ];
    const verifiedRows = rows.map((row) => ({ ...row, platform: 'reddit', verificationStatus: 'content_verified' }));
    expect(deduplicateEligibleEvidence(verifiedRows).map((row) => row.id)).toEqual(['canonical']);
  });
});

