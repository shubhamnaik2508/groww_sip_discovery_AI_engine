export type EvidenceProvenanceLike = string | Record<string, unknown> | null | undefined;
export type EvidenceProvenanceCategory = 'verified_public' | 'unverified_public' | 'synthetic_fixture' | 'curated_benchmark' | 'primary_research' | 'duplicate_ineligible';

export interface EvidenceEligibilityInput {
  id?: string;
  platform?: string | null;
  sourceUrl?: string | null;
  entryMethod?: string | null;
  isSynthetic?: boolean | null;
  verificationStatus?: string | null;
  duplicateOfId?: string | null;
  fieldProvenance?: EvidenceProvenanceLike;
  sourceMetadata?: EvidenceProvenanceLike;
  contentHash?: string | null;
}

function parseMetadata(value: EvidenceProvenanceLike): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function hasFixtureProvenance(value: EvidenceProvenanceLike): boolean {
  const metadata = parseMetadata(value);
  return Object.values(metadata).some((item) => {
    if (typeof item !== 'string') return false;
    const normalized = item.toLowerCase();
    return normalized.includes('curated_benchmark') || normalized.includes('synthetic_fixture');
  });
}

export function classifyEvidenceProvenance(record: EvidenceEligibilityInput): EvidenceProvenanceCategory {
  if (record.duplicateOfId) return 'duplicate_ineligible';
  if (isSyntheticFixture(record)) {
    const field = parseMetadata(record.fieldProvenance);
    const metadata = parseMetadata(record.sourceMetadata);
    const values = [...Object.values(field), ...Object.values(metadata)].filter((value): value is string => typeof value === 'string').join(' ').toLowerCase();
    return values.includes('curated_benchmark') ? 'curated_benchmark' : 'synthetic_fixture';
  }
  if (record.platform === 'google_forms' || record.platform === 'user_interview' || (record.entryMethod === 'manual' && ['interview', 'survey'].includes(String(parseMetadata(record.sourceMetadata).evidenceType)))) return 'primary_research';
  if (['content_verified', 'verified_live', 'verified'].includes(String(record.verificationStatus))) return 'verified_public';
  return 'unverified_public';
}

export function isSyntheticFixture(record: EvidenceEligibilityInput): boolean {
  if (record.isSynthetic || record.entryMethod === 'fixture' || record.verificationStatus === 'synthetic_fixture') {
    return true;
  }
  if (hasFixtureProvenance(record.fieldProvenance)) return true;

  const sourceMetadata = parseMetadata(record.sourceMetadata);
  return Object.values(sourceMetadata).some((value) =>
    typeof value === 'string' && /synthetic|illustrative fixture/i.test(value)
  );
}

export function isEligibleNonFixtureEvidence(record: EvidenceEligibilityInput): boolean {
  return !isSyntheticFixture(record) && !record.duplicateOfId;
}

/**
 * Evidence allowed to support genuine research findings. Public-source records
 * require content verification; link reachability alone does not authenticate
 * the quoted content. Researcher-supplied surveys/interviews are a separate
 * primary-research category and retain their user-entered provenance.
 */
export function isGenuineResearchEvidence(record: EvidenceEligibilityInput): boolean {
  if (!isEligibleNonFixtureEvidence(record)) return false;
  const status = record.verificationStatus;
  if (status === 'content_verified' || status === 'verified_live' || status === 'verified') return true;
  const primaryResearchPlatforms = new Set(['google_forms', 'user_interview']);
  return Boolean(
    record.platform && primaryResearchPlatforms.has(record.platform) &&
    (status === 'user_entered' || status === 'content_verified') &&
    (record.entryMethod === 'manual' || record.entryMethod === 'csv')
  );
}

export function deduplicateEligibleEvidence<T extends EvidenceEligibilityInput>(records: T[]): T[] {
  const seenIds = new Set<string>();
  const seenHashes = new Set<string>();
  const result: T[] = [];
  for (const record of records) {
    if (!isGenuineResearchEvidence(record)) continue;
    const hash = record.contentHash || null;
    if ((record.id && seenIds.has(record.id)) || (hash && seenHashes.has(hash))) continue;
    if (record.id) seenIds.add(record.id);
    if (hash) seenHashes.add(hash);
    result.push(record);
  }
  return result;
}

export function deduplicateNonFixtureRecords<T extends EvidenceEligibilityInput>(records: T[]): T[] {
  const seenIds = new Set<string>();
  const seenHashes = new Set<string>();
  const result: T[] = [];
  for (const record of records) {
    if (!isEligibleNonFixtureEvidence(record)) continue;
    const hash = record.contentHash || null;
    if ((record.id && seenIds.has(record.id)) || (hash && seenHashes.has(hash))) continue;
    if (record.id) seenIds.add(record.id);
    if (hash) seenHashes.add(hash);
    result.push(record);
  }
  return result;
}
