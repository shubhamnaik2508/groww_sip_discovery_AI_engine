import Papa from 'papaparse';
import { EvidenceRecordInput, IngestRowError, Platform, JourneyStage } from './types';

/**
 * Sanitizes values for CSV export to protect against CSV Formula Injection
 * (RFC 4180 + OWASP Spreadsheet Injection Guidelines)
 */
export function sanitizeForCsvExport(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

export interface RawCsvRow {
  [key: string]: string | undefined;
}

export function parseCsvContent(csvString: string): { data: RawCsvRow[]; errors: Papa.ParseError[] } {
  const result = Papa.parse<RawCsvRow>(csvString, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim().toLowerCase().replace(/[\s\-_]+/g, '_'),
  });

  return {
    data: result.data,
    errors: result.errors,
  };
}

/**
 * Normalizes common variations in CSV column naming to the canonical schema
 */
export function mapCsvRowToRecordInput(row: RawCsvRow, rowNumber: number): {
  record?: EvidenceRecordInput;
  errors?: IngestRowError[];
} {
  const errors: IngestRowError[] = [];

  // Find URL
  const rawUrl = (row.source_url || row.url || row.link || row.source || '').trim();
  if (!rawUrl) {
    errors.push({
      rowNumber,
      field: 'source_url',
      message: 'Source URL is required and cannot be empty.',
      rawData: row as Record<string, string>,
    });
  } else {
    try {
      const parsedUrl = new URL(rawUrl);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        throw new Error('Invalid protocol');
      }
    } catch {
      errors.push({
        rowNumber,
        field: 'source_url',
        message: 'Source URL must be a valid HTTP or HTTPS URL.',
        rawData: row as Record<string, string>,
      });
    }
  }

  // Find Text
  const rawText = row.original_text || row.text || row.feedback || row.content || row.review || row.comment;
  if (!rawText || rawText.trim().length < 5) {
    errors.push({
      rowNumber,
      field: 'original_text',
      message: 'Original feedback text is required (minimum 5 characters).',
      rawData: row as Record<string, string>,
    });
  }

  // Find Platform
  let rawPlatform = (row.platform || '').trim().toLowerCase().replace(/[\s\-]+/g, '_');
  if (rawPlatform === 'twitter' || rawPlatform === 'x') rawPlatform = 'twitter_x';
  if (rawPlatform === 'google_play' || rawPlatform === 'playstore' || rawPlatform === 'play_store') rawPlatform = 'play_store';
  if (rawPlatform === 'appstore' || rawPlatform === 'apple_store' || rawPlatform === 'app_store') rawPlatform = 'app_store';
  if (rawPlatform === 'tradingqna' || rawPlatform === 'tradingq&a' || rawPlatform === 'trading_qa') rawPlatform = 'trading_qa';
  if (rawPlatform === 'google_form' || rawPlatform === 'google_forms' || rawPlatform === 'survey') rawPlatform = 'google_forms';

  const validPlatforms: Platform[] = [
    'play_store',
    'app_store',
    'reddit',
    'trading_qa',
    'google_forms',
    'twitter_x',
    'youtube',
    'community_forum',
    'user_interview',
    'other',
  ];

  if (!rawPlatform) {
    // Attempt auto-detection from URL
    if (rawUrl) {
      if (rawUrl.includes('play.google.com')) rawPlatform = 'play_store';
      else if (rawUrl.includes('apple.com')) rawPlatform = 'app_store';
      else if (rawUrl.includes('reddit.com')) rawPlatform = 'reddit';
      else if (rawUrl.includes('twitter.com') || rawUrl.includes('x.com')) rawPlatform = 'twitter_x';
      else if (rawUrl.includes('youtube.com')) rawPlatform = 'youtube';
      else rawPlatform = 'other';
    } else {
      rawPlatform = 'other';
    }
  }

  if (!validPlatforms.includes(rawPlatform as Platform)) {
    rawPlatform = 'other';
  }

  // Find Collected Date
  let rawDate = (row.collected_at || row.date || row.collected_date || row.created_at || '').trim();
  if (!rawDate) {
    rawDate = new Date().toISOString().split('T')[0];
  }

  // Journey stage
  let rawJourney = (row.journey_stage || row.stage || '').trim().toLowerCase();
  const validStages: JourneyStage[] = [
    'discovery_intent',
    'mandate_kyc_setup',
    'first_instalment',
    'market_dip_reaction',
    'autopay_failure_recovery',
    'continuation_milestone',
    'pause_cancellation',
    'unclear',
  ];
  if (!validStages.includes(rawJourney as JourneyStage)) {
    rawJourney = 'unclear';
  }

  // Investor context
  const rawContext = (row.investor_context || row.context || '').trim() || null;

  if (errors.length > 0) {
    return { errors };
  }

  // Extra metadata
  const sourceMetadata: Record<string, string> = {};
  if (row.author) sourceMetadata.author = row.author.trim();
  if (row.rating) sourceMetadata.rating = row.rating.trim();
  if (row.upvotes) sourceMetadata.upvotes = row.upvotes.trim();
  if (row.title) sourceMetadata.title = row.title.trim();
  const metadataAliases: Record<string, string[]> = {
    authorId: ['author_id', 'anonymized_author_id', 'author'],
    publishedAt: ['published_at', 'publication_date', 'date_posted'],
    language: ['language', 'lang'],
    evidenceType: ['evidence_type', 'record_type'],
    investorSegment: ['investor_segment', 'segment'],
    participantId: ['participant_id', 'anonymized_participant_id'],
    segmentQualification: ['segment_qualification'],
    employmentStage: ['employment_stage'],
    sipStartingContext: ['sip_starting_context'],
    motivationExpectations: ['motivation_expectations', 'starting_motivation', 'initial_expectations'],
    cashFlowConflict: ['cash_flow_conflict'],
    sipBehaviour: ['sip_behaviour', 'sip_behavior'],
    externalWorkaround: ['external_workaround', 'workaround'],
    unmetNeed: ['unmet_need'],
    researchDate: ['research_date', 'interview_date', 'survey_date'],
    researcherNotes: ['researcher_notes'],
    quoteConsent: ['quote_consent', 'consent_to_quote'],
  };
  for (const [key, aliases] of Object.entries(metadataAliases)) {
    const value = aliases.map((alias) => row[alias]?.trim()).find(Boolean);
    if (value) sourceMetadata[key] = value;
  }

  const record: EvidenceRecordInput = {
    sourceUrl: rawUrl!.trim(),
    platform: rawPlatform as Platform,
    collectedAt: rawDate,
    originalText: rawText!.trim(),
    investorContext: rawContext,
    journeyStage: rawJourney as JourneyStage,
    sourceMetadata: Object.keys(sourceMetadata).length > 0 ? sourceMetadata : null,
    fieldProvenance: {
      sourceUrl: 'user_entered',
      platform: 'user_entered',
      collectedAt: 'user_entered',
      originalText: 'user_entered',
      investorContext: rawContext ? 'user_entered' : 'unverified',
      journeyStage: rawJourney !== 'unclear' ? 'user_entered' : 'unverified',
      ...(Object.keys(sourceMetadata).length ? { sourceMetadata: 'user_entered' as const } : {}),
    },
    entryMethod: 'csv',
    isSynthetic: false,
  };

  return { record };
}
