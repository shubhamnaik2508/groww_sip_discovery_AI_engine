import { describe, it, expect } from 'vitest';
import { computeContentHash, normalizeEvidenceText } from '../hashing';
import { parseCsvContent, mapCsvRowToRecordInput, sanitizeForCsvExport } from '../csv';

describe('Evidence Text Hashing and Normalization', () => {
  it('normalizes smart quotes, excessive whitespace, and casing', () => {
    const raw1 = '“Groww stopped my SIP   abruptly!”';
    const raw2 = '"groww stopped my sip abruptly!"';
    expect(normalizeEvidenceText(raw1)).toBe(normalizeEvidenceText(raw2));
    expect(computeContentHash(raw1)).toBe(computeContentHash(raw2));
  });

  it('produces distinct hashes for genuinely different content', () => {
    const h1 = computeContentHash('My first SIP instalment failed.');
    const h2 = computeContentHash('My first SIP instalment was successful.');
    expect(h1).not.toBe(h2);
  });
});

describe('CSV Parsing and Validation', () => {
  it.each([
    ['TradingQ&A', 'trading_qa'],
    ['Google Forms', 'google_forms'],
  ])('accepts primary research source %s', (platform, expected) => {
    const row = mapCsvRowToRecordInput({
      source_url: 'https://example.invalid/research-record',
      text: 'A participant described their SIP experience in detail.',
      platform,
      date: '2026-06-01',
    }, 2);
    expect(row.errors).toBeUndefined();
    expect(row.record?.platform).toBe(expected);
  });

  it('correctly maps valid CSV columns and normalizes headers', () => {
    const csv = `Source URL,Feedback,Platform,Date,Investor Context
https://play.google.com/store/apps/details?id=com.nextbillion.groww&reviewId=123,"Autopay failed without clear reason",Play Store,2026-05-10,"First-time investor"`;

    const { data, errors } = parseCsvContent(csv);
    expect(errors.length).toBe(0);
    expect(data.length).toBe(1);

    const { record, errors: rowErrors } = mapCsvRowToRecordInput(data[0], 2);
    expect(rowErrors).toBeUndefined();
    expect(record).toBeDefined();
    expect(record?.sourceUrl).toBe('https://play.google.com/store/apps/details?id=com.nextbillion.groww&reviewId=123');
    expect(record?.originalText).toBe('Autopay failed without clear reason');
    expect(record?.platform).toBe('play_store');
    expect(record?.investorContext).toBe('First-time investor');
  });

  it('preserves research source metadata without upgrading verification provenance', () => {
    const { record } = mapCsvRowToRecordInput({
      source_url: 'https://example.com/review',
      text: 'I check the SIP status every week.',
      platform: 'reddit',
      author_id: 'anon-user-42',
      published_at: '2026-05-20',
      language: 'en',
      evidence_type: 'public discussion',
    }, 2);
    expect(record?.sourceMetadata).toMatchObject({ authorId: 'anon-user-42', publishedAt: '2026-05-20', language: 'en', evidenceType: 'public discussion' });
    expect(record?.fieldProvenance?.sourceUrl).toBe('user_entered');
    expect(record?.fieldProvenance?.sourceUrl).not.toBe('verified_live');
  });

  it('imports anonymized primary-research context and consent without marking a public source verified', () => {
    const { record } = mapCsvRowToRecordInput({
      source_url: 'https://example.org/research/export-row-07',
      text: 'I started my first SIP after receiving my first salary.',
      platform: 'user_interview',
      participant_id: 'P07',
      segment_qualification: 'First-paycheck segment self-qualified',
      employment_stage: 'First year of employment',
      sip_starting_context: 'Monthly salary income',
      motivation_expectations: 'Build a long-term savings habit',
      cash_flow_conflict: 'Unexpected rent expense',
      sip_behaviour: 'Considered pausing; status unknown',
      external_workaround: 'Asked a family member',
      unmet_need: 'Clear SIP flexibility information',
      interview_date: '2026-06-02',
      researcher_notes: 'Anonymized note',
      quote_consent: 'yes',
    }, 2);
    expect(record?.sourceMetadata).toMatchObject({
      participantId: 'P07', segmentQualification: 'First-paycheck segment self-qualified',
      employmentStage: 'First year of employment', sipStartingContext: 'Monthly salary income',
      motivationExpectations: 'Build a long-term savings habit', cashFlowConflict: 'Unexpected rent expense',
      sipBehaviour: 'Considered pausing; status unknown', externalWorkaround: 'Asked a family member',
      unmetNeed: 'Clear SIP flexibility information', researchDate: '2026-06-02',
      researcherNotes: 'Anonymized note', quoteConsent: 'yes',
    });
    expect(record?.fieldProvenance?.sourceUrl).toBe('user_entered');
  });

  it('rejects rows with missing URL or empty feedback text', () => {
    const csv = `url,text
,"Only text here with no url"
https://example.com/groww,""`;

    const { data } = parseCsvContent(csv);
    const row1 = mapCsvRowToRecordInput(data[0], 2);
    expect(row1.errors?.length).toBeGreaterThan(0);
    expect(row1.errors?.[0].field).toBe('source_url');

    const row2 = mapCsvRowToRecordInput(data[1], 3);
    expect(row2.errors?.length).toBeGreaterThan(0);
    expect(row2.errors?.[0].field).toBe('original_text');
  });

  it('sanitizes formula injection characters for CSV export', () => {
    expect(sanitizeForCsvExport('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
    expect(sanitizeForCsvExport('+cmd|"/c calc"!A0')).toBe("'+cmd|\"/c calc\"!A0");
    expect(sanitizeForCsvExport('-10')).toBe("'-10");
    expect(sanitizeForCsvExport('@malicious')).toBe("'@malicious");
    expect(sanitizeForCsvExport('Regular safe investor text')).toBe('Regular safe investor text');
  });
});
