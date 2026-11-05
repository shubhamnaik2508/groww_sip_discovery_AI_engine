import { z } from 'zod';

export const PlatformSchema = z.enum([
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
]);
export type Platform = z.infer<typeof PlatformSchema>;

export const JourneyStageSchema = z.enum([
  'discovery_intent',
  'mandate_kyc_setup',
  'first_instalment',
  'market_dip_reaction',
  'autopay_failure_recovery',
  'continuation_milestone',
  'pause_cancellation',
  'unclear',
]);
export type JourneyStage = z.infer<typeof JourneyStageSchema>;

export const FieldProvenanceStatusSchema = z.enum([
  'verified_live',      // Audited against external live web endpoint
  'curated_benchmark',  // Curated academic benchmark fixture (authentic excerpt, unverified live URL)
  'user_entered',      // Submitted via CSV or manual entry form
  'unverified',        // Unvalidated source URL or missing metadata
  'verified',          // Legacy synonym for verified_live
]);
export type FieldProvenanceStatus = z.infer<typeof FieldProvenanceStatusSchema>;

export interface FieldProvenanceMap {
  sourceUrl: FieldProvenanceStatus;
  platform: FieldProvenanceStatus;
  collectedAt: FieldProvenanceStatus;
  originalText: FieldProvenanceStatus;
  investorContext?: FieldProvenanceStatus;
  journeyStage: FieldProvenanceStatus;
  sourceMetadata?: FieldProvenanceStatus;
}

export const VerificationStatusSchema = z.enum([
  'content_verified',   // Human or scraper has verified original content and source authenticity
  'link_checked',       // Link reachable and syntax valid, but content not fully authenticated
  'user_entered',       // User submitted, pending review
  'unverified',         // Explicitly unverified or uncheckable
  'synthetic_fixture',  // Synthetic test data or illustrative fixture
]);
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

export const EvidenceRecordInputSchema = z.object({
  sourceUrl: z.string().url('Source URL must be a valid HTTP or HTTPS URL').refine(
    (url) => url.startsWith('http://') || url.startsWith('https://'),
    'URL must start with http:// or https://'
  ),
  platform: PlatformSchema,
  collectedAt: z.string().min(1, 'Collection date is required'),
  originalText: z.string().trim().min(5, 'Original verbatim text must be at least 5 characters'),
  investorContext: z.string().optional().nullable(),
  journeyStage: JourneyStageSchema.optional().default('unclear'),
  sourceMetadata: z.record(z.string(), z.any()).optional().nullable(),
  fieldProvenance: z.record(z.string(), FieldProvenanceStatusSchema).optional(),
  entryMethod: z.enum(['csv', 'manual', 'fixture']).optional().default('manual'),
  isSynthetic: z.boolean().optional().default(false),
  verificationStatus: VerificationStatusSchema.optional().default('unverified'),
  verifiedAt: z.string().optional().nullable(),
  verifiedBy: z.string().optional().nullable(),
});

export type EvidenceRecordInput = z.input<typeof EvidenceRecordInputSchema>;

export interface IngestRowError {
  rowNumber: number;
  field?: string;
  message: string;
  rawData?: Record<string, string>;
}

export interface IngestBatchResult {
  batchId: string;
  fileName: string;
  totalRows: number;
  acceptedRows: number;
  rejectedRows: number;
  duplicateRows: number;
  rejectedDetails: IngestRowError[];
  acceptedIds: string[];
}
