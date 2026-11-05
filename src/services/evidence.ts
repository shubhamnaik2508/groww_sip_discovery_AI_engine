import { db, initializeDatabase } from '@/db';
import { evidenceRecords, evidenceEdits, importBatches, reviews, recordAnalyses, themes, evidenceThemeLinks } from '@/db/schema';
import { eq, desc, sql, and, like, or } from 'drizzle-orm';
import { computeContentHash } from '@/lib/hashing';
import { parseCsvContent, mapCsvRowToRecordInput, sanitizeForCsvExport } from '@/lib/csv';
import { EvidenceRecordInput, IngestBatchResult, IngestRowError, FieldProvenanceMap } from '@/lib/types';
import { deduplicateEligibleEvidence, deduplicateNonFixtureRecords, isEligibleNonFixtureEvidence, isSyntheticFixture } from '@/lib/evidenceEligibility';
import crypto from 'crypto';

export class EvidenceService {
  /**
   * Ingests a CSV string of evidence records
   */
  static async ingestCsv(
    csvContent: string,
    fileName: string,
    importedBy: string = 'Researcher'
  ): Promise<IngestBatchResult> {
    await initializeDatabase();
    const batchId = crypto.randomUUID();
    const { data: rawRows, errors: parseErrors } = parseCsvContent(csvContent);

    const rejectionDetails: IngestRowError[] = [];
    let acceptedRows = 0;
    let rejectedRows = 0;
    let duplicateRows = 0;
    const acceptedIds: string[] = [];

    // Add any syntax-level parse errors from PapaParse
    for (const err of parseErrors) {
      rejectionDetails.push({
        rowNumber: err.row ?? 0,
        message: `CSV syntax error: ${err.message}`,
      });
      rejectedRows++;
    }

    // Process each row
    for (let i = 0; i < rawRows.length; i++) {
      const rowNumber = i + 2; // header is row 1
      const mapped = mapCsvRowToRecordInput(rawRows[i], rowNumber);

      if (mapped.errors && mapped.errors.length > 0) {
        rejectionDetails.push(...mapped.errors);
        rejectedRows++;
        continue;
      }

      const input = mapped.record!;
      const contentHash = computeContentHash(input.originalText);

      // Check if duplicate exists in database
      const sameHashRecords = await db
        .select()
        .from(evidenceRecords)
        .where(eq(evidenceRecords.contentHash, contentHash))
        .all();
      const existing = sameHashRecords.find(isEligibleNonFixtureEvidence);

      const recordId = crypto.randomUUID();
      const isDuplicate = Boolean(existing);
      const duplicateOfId = existing?.id || null;

      if (isDuplicate) {
        duplicateRows++;
      }

      const isFixture = isSyntheticFixture(input);
      await db.insert(evidenceRecords).values({
        id: recordId,
        sourceUrl: input.sourceUrl,
        platform: input.platform,
        collectedAt: input.collectedAt,
        originalText: input.originalText,
        contentHash,
        investorContext: input.investorContext || null,
        journeyStage: input.journeyStage || 'unclear',
        sourceMetadata: input.sourceMetadata ? JSON.stringify(input.sourceMetadata) : null,
        fieldProvenance: JSON.stringify(input.fieldProvenance || {
          sourceUrl: 'user_entered',
          platform: 'user_entered',
          collectedAt: 'user_entered',
          originalText: 'user_entered',
          journeyStage: 'user_entered',
        }),
        entryMethod: 'csv',
        importBatchId: batchId,
        duplicateOfId,
        isSynthetic: isFixture,
        verificationStatus: isFixture ? 'synthetic_fixture' : 'user_entered',
        verifiedAt: null,
        verifiedBy: null,
      });

      acceptedRows++;
      acceptedIds.push(recordId);
    }

    // Save batch record
    await db.insert(importBatches).values({
      id: batchId,
      fileName,
      totalRows: rawRows.length,
      acceptedRows,
      rejectedRows,
      duplicateRows,
      rejectionDetails: rejectionDetails.length > 0 ? JSON.stringify(rejectionDetails) : null,
      importedBy,
    });

    return {
      batchId,
      fileName,
      totalRows: rawRows.length,
      acceptedRows,
      rejectedRows,
      duplicateRows,
      rejectedDetails: rejectionDetails,
      acceptedIds,
    };
  }

  /**
   * Manually adds a new evidence record with strict provenance tracking
   */
  static async createManualRecord(
    input: EvidenceRecordInput,
    enteredBy: string = 'Researcher'
  ): Promise<{ id: string; isDuplicate: boolean; duplicateOfId: string | null }> {
    await initializeDatabase();
    const contentHash = computeContentHash(input.originalText);

    const sameHashRecords = await db
      .select()
      .from(evidenceRecords)
      .where(eq(evidenceRecords.contentHash, contentHash))
      .all();
    const existing = sameHashRecords.find(isEligibleNonFixtureEvidence);

    const isDuplicate = Boolean(existing);
    const duplicateOfId = existing?.id || null;
    const recordId = crypto.randomUUID();

    const defaultProvenance: FieldProvenanceMap = {
      sourceUrl: 'user_entered',
      platform: 'user_entered',
      collectedAt: 'user_entered',
      originalText: 'user_entered',
      investorContext: input.investorContext ? 'user_entered' : 'unverified',
      journeyStage: input.journeyStage !== 'unclear' ? 'user_entered' : 'unverified',
    };

    const isFixture = isSyntheticFixture({ ...input, entryMethod: input.entryMethod || 'manual' });
    let verificationStatus: 'content_verified' | 'link_checked' | 'user_entered' | 'unverified' | 'synthetic_fixture' = 'user_entered';
    if (isFixture) {
      verificationStatus = 'synthetic_fixture';
    } else if (input.verificationStatus) {
      verificationStatus = input.verificationStatus;
    }

    await db.insert(evidenceRecords).values({
      id: recordId,
      sourceUrl: input.sourceUrl,
      platform: input.platform,
      collectedAt: input.collectedAt,
      originalText: input.originalText,
      contentHash,
      investorContext: input.investorContext || null,
      journeyStage: input.journeyStage || 'unclear',
      sourceMetadata: input.sourceMetadata ? JSON.stringify(input.sourceMetadata) : null,
      fieldProvenance: JSON.stringify(input.fieldProvenance || defaultProvenance),
      entryMethod: input.entryMethod || 'manual',
      duplicateOfId,
      isSynthetic: isFixture,
      verificationStatus,
      verifiedAt: input.verifiedAt || null,
      verifiedBy: input.verifiedBy || null,
    });

    return { id: recordId, isDuplicate, duplicateOfId };
  }

  /**
   * Updates verification status with reviewer audit trail
   */
  static async verifyEvidenceRecord(
    id: string,
    status: 'content_verified' | 'link_checked' | 'unverified',
    verifiedBy: string,
    notes?: string
  ): Promise<void> {
    await initializeDatabase();
    const records = await db.select().from(evidenceRecords).where(eq(evidenceRecords.id, id)).limit(1);
    if (records.length === 0) {
      throw new Error(`Record with id ${id} not found.`);
    }

    const current = records[0];
    if (isSyntheticFixture(current)) {
      throw new Error('Synthetic or curated benchmark fixtures cannot be verified as genuine investor evidence.');
    }
    const timestamp = new Date().toISOString();

    await db.insert(evidenceEdits).values({
      id: crypto.randomUUID(),
      evidenceId: id,
      fieldName: 'verification_status',
      oldValue: current.verificationStatus,
      newValue: status,
      editedBy: verifiedBy,
      reason: notes || `Updated verification status to ${status}`,
    });

    await db.update(evidenceRecords).set({
      verificationStatus: status,
      verifiedAt: timestamp,
      verifiedBy,
      updatedAt: timestamp,
    }).where(eq(evidenceRecords.id, id));
  }

  /**
   * Audited metadata update.
   * STRICT GUARANTEE: originalText CANNOT be edited. Attempting to do so throws an error.
   */
  static async updateRecordMetadata(
    id: string,
    edits: {
      journeyStage?: string;
      investorContext?: string | null;
      sourceMetadata?: Record<string, any>;
      originalText?: string;
    },
    editedBy: string,
    reason: string
  ): Promise<void> {
    await initializeDatabase();

    if (edits.originalText !== undefined) {
      throw new Error(
        'Integrity Violation: originalText is immutable verbatim evidence and cannot be edited. If feedback was transcribed erroneously, ingest a new record.'
      );
    }

    if (!reason || !reason.trim()) {
      throw new Error('An audit reason is required for any metadata correction.');
    }

    const currentRecords = await db
      .select()
      .from(evidenceRecords)
      .where(eq(evidenceRecords.id, id))
      .limit(1);

    if (currentRecords.length === 0) {
      throw new Error(`Evidence record with id ${id} not found.`);
    }

    const current = currentRecords[0];
    const updatePayload: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };

    if (edits.journeyStage !== undefined && edits.journeyStage !== current.journeyStage) {
      await db.insert(evidenceEdits).values({
        id: crypto.randomUUID(),
        evidenceId: id,
        fieldName: 'journey_stage',
        oldValue: current.journeyStage,
        newValue: edits.journeyStage,
        editedBy,
        reason,
      });
      updatePayload.journeyStage = edits.journeyStage;
    }

    if (edits.investorContext !== undefined && edits.investorContext !== current.investorContext) {
      await db.insert(evidenceEdits).values({
        id: crypto.randomUUID(),
        evidenceId: id,
        fieldName: 'investor_context',
        oldValue: current.investorContext,
        newValue: edits.investorContext,
        editedBy,
        reason,
      });
      updatePayload.investorContext = edits.investorContext;
    }

    if (edits.sourceMetadata !== undefined) {
      const newMetaStr = JSON.stringify(edits.sourceMetadata);
      if (newMetaStr !== current.sourceMetadata) {
        await db.insert(evidenceEdits).values({
          id: crypto.randomUUID(),
          evidenceId: id,
          fieldName: 'source_metadata',
          oldValue: current.sourceMetadata,
          newValue: newMetaStr,
          editedBy,
          reason,
        });
        updatePayload.sourceMetadata = newMetaStr;
      }
    }

    await db.update(evidenceRecords).set(updatePayload).where(eq(evidenceRecords.id, id));
  }

  /**
   * Lists evidence records with filtering, searching, and review status
   */
  static async listEvidence(filters?: {
    platform?: string;
    journeyStage?: string;
    search?: string;
    hideDuplicates?: boolean;
    onlySynthetic?: boolean;
    excludeSynthetic?: boolean;
    limit?: number;
    offset?: number;
  }) {
    await initializeDatabase();

    const conditions = [];

    if (filters?.platform && filters.platform !== 'all') {
      conditions.push(eq(evidenceRecords.platform, filters.platform));
    }
    if (filters?.journeyStage && filters.journeyStage !== 'all') {
      conditions.push(eq(evidenceRecords.journeyStage, filters.journeyStage));
    }
    if (filters?.search && filters.search.trim()) {
      const q = `%${filters.search.trim().toLowerCase()}%`;
      conditions.push(
        or(
          like(sql`LOWER(${evidenceRecords.originalText})`, q),
          like(sql`LOWER(${evidenceRecords.sourceUrl})`, q),
          like(sql`LOWER(${evidenceRecords.investorContext})`, q)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const records = await db
      .select()
      .from(evidenceRecords)
      .where(whereClause)
      .orderBy(desc(evidenceRecords.createdAt));

    const classifiedRecords = records.filter((record) => {
      const isFixture = isSyntheticFixture(record);
      if (filters?.onlySynthetic && !isFixture) return false;
      if (filters?.excludeSynthetic && isFixture) return false;
      return true;
    });
    const seenHashes = new Set<string>();
    const eligiblePage = classifiedRecords.filter((record) => {
      if (!filters?.hideDuplicates) return true;
      if (record.duplicateOfId || seenHashes.has(record.contentHash)) return false;
      seenHashes.add(record.contentHash);
      return true;
    }).slice(filters?.offset ?? 0, (filters?.offset ?? 0) + (filters?.limit ?? 200));

    // Fetch the latest analysis and review for each record
    const recordIds = eligiblePage.map((r) => r.id);
    if (recordIds.length === 0) return [];

    const analyses = await db
      .select()
      .from(recordAnalyses)
      .where(sql`${recordAnalyses.evidenceId} IN (${sql.join(recordIds.map((id) => sql`${id}`), sql`, `)})`)
      .orderBy(desc(recordAnalyses.createdAt));

    const allReviews = await db
      .select()
      .from(reviews)
      .where(sql`${reviews.evidenceId} IN (${sql.join(recordIds.map((id) => sql`${id}`), sql`, `)})`)
      .orderBy(desc(reviews.createdAt));

    return eligiblePage.map((record) => {
      const latestAnalysis = analyses.find((a) => a.evidenceId === record.id);
      const latestReview = allReviews.find((r) => r.evidenceId === record.id);
      return {
        ...record,
        isSynthetic: isSyntheticFixture(record),
        fieldProvenance: JSON.parse(record.fieldProvenance || '{}'),
        sourceMetadata: record.sourceMetadata ? JSON.parse(record.sourceMetadata) : null,
        latestAnalysis: latestAnalysis
          ? {
              ...latestAnalysis,
              parsedOutput: latestAnalysis.parsedOutput ? JSON.parse(latestAnalysis.parsedOutput) : null,
            }
          : null,
        latestReview: latestReview
          ? {
              ...latestReview,
              revisedOutput: latestReview.revisedOutput ? JSON.parse(latestReview.revisedOutput) : null,
            }
          : null,
      };
    });
  }

  /**
   * Retrieves a single record with all audit history, analyses, and reviews
   */
  static async getEvidenceById(id: string) {
    await initializeDatabase();

    const records = await db
      .select()
      .from(evidenceRecords)
      .where(eq(evidenceRecords.id, id))
      .limit(1);

    if (records.length === 0) return null;
    const record = records[0];

    const edits = await db
      .select()
      .from(evidenceEdits)
      .where(eq(evidenceEdits.evidenceId, id))
      .orderBy(desc(evidenceEdits.createdAt));

    const analyses = await db
      .select()
      .from(recordAnalyses)
      .where(eq(recordAnalyses.evidenceId, id))
      .orderBy(desc(recordAnalyses.createdAt));

    const recordReviews = await db
      .select()
      .from(reviews)
      .where(eq(reviews.evidenceId, id))
      .orderBy(desc(reviews.createdAt));

    return {
      ...record,
      fieldProvenance: JSON.parse(record.fieldProvenance || '{}'),
      sourceMetadata: record.sourceMetadata ? JSON.parse(record.sourceMetadata) : null,
      edits,
      analyses: analyses.map((a) => ({
        ...a,
        parsedOutput: a.parsedOutput ? JSON.parse(a.parsedOutput) : null,
      })),
      reviews: recordReviews.map((r) => ({
        ...r,
        revisedOutput: r.revisedOutput ? JSON.parse(r.revisedOutput) : null,
      })),
    };
  }

  /**
   * Exports persisted records to sanitized CSV
   */
  static async exportToCsv(options?: { excludeSynthetic?: boolean }): Promise<string> {
    await initializeDatabase();
    const records = await this.listEvidence({
      excludeSynthetic: options?.excludeSynthetic ?? true,
      limit: 5000,
    });

    const headers = [
      'id',
      'source_url',
      'platform',
      'collected_at',
      'entry_method',
      'verification_status',
      'verified_at',
      'verified_by',
      'author_id',
      'published_at',
      'language',
      'evidence_type',
      'primary_research_metadata',
      'journey_stage',
      'investor_context',
      'original_text',
      'duplicate_of_id',
      'is_synthetic',
      'ai_theme',
      'ai_confidence',
      'review_decision',
      'reviewed_theme',
      'reviewer_rationale',
    ];

    const rows = records.map((r) => {
      const parsedAi = r.latestAnalysis?.parsedOutput;
      const parsedReview = r.latestReview?.revisedOutput;
      let sourceMetadata: Record<string, unknown> = {};
      try {
        sourceMetadata = typeof r.sourceMetadata === 'string' ? JSON.parse(r.sourceMetadata) : (r.sourceMetadata || {});
      } catch { sourceMetadata = {}; }

      return [
        sanitizeForCsvExport(r.id),
        sanitizeForCsvExport(r.isSynthetic ? '' : r.sourceUrl),
        sanitizeForCsvExport(r.platform),
        sanitizeForCsvExport(r.collectedAt),
        sanitizeForCsvExport(r.entryMethod),
        sanitizeForCsvExport(r.isSynthetic ? 'synthetic_fixture' : (r.verificationStatus || 'unverified')),
        sanitizeForCsvExport(r.verifiedAt || ''),
        sanitizeForCsvExport(r.verifiedBy || ''),
        sanitizeForCsvExport(sourceMetadata.authorId || sourceMetadata.author || ''),
        sanitizeForCsvExport(sourceMetadata.publishedAt || sourceMetadata.datePosted || ''),
        sanitizeForCsvExport(sourceMetadata.language || ''),
        sanitizeForCsvExport(sourceMetadata.evidenceType || ''),
        sanitizeForCsvExport(JSON.stringify(Object.fromEntries(Object.entries(sourceMetadata).filter(([key]) => ['participantId', 'segmentQualification', 'employmentStage', 'sipStartingContext', 'motivationExpectations', 'cashFlowConflict', 'sipBehaviour', 'externalWorkaround', 'unmetNeed', 'researchDate', 'researcherNotes', 'quoteConsent'].includes(key))))),
        sanitizeForCsvExport(r.journeyStage),
        sanitizeForCsvExport(r.investorContext || ''),
        sanitizeForCsvExport(r.originalText),
        sanitizeForCsvExport(r.duplicateOfId || ''),
        sanitizeForCsvExport(r.isSynthetic ? 'true' : 'false'),
        sanitizeForCsvExport(parsedAi?.theme?.name || ''),
        sanitizeForCsvExport(parsedAi?.self_reported_confidence || ''),
        sanitizeForCsvExport(r.latestReview?.decision || 'unreviewed'),
        sanitizeForCsvExport(parsedReview?.theme?.name || ''),
        sanitizeForCsvExport(r.latestReview?.rationale || ''),
      ];
    });

    const csvLines = [headers.join(',')];
    for (const row of rows) {
      csvLines.push(row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','));
    }
    return csvLines.join('\n');
  }

  /**
   * Computes a truthful provenance breakdown across all stored evidence records.
   * Guarantees that unverified or fixture URLs are never reported as live-verified.
   */
  static async getProvenanceBreakdown() {
    await initializeDatabase();
    const records = await db.select().from(evidenceRecords).all();
    let contentVerified = 0;
    let linkChecked = 0;
    let curatedBenchmark = 0;
    let userEntered = 0;
    let unverified = 0;
    const eligibleRecords = deduplicateEligibleEvidence(records);
    const eligibleNonFixture = eligibleRecords.length;
    const nonFixtureRecords = records.filter((record) => !isSyntheticFixture(record));
    const duplicateCount = nonFixtureRecords.length - deduplicateNonFixtureRecords(nonFixtureRecords).length;

    for (const r of records) {
      const vStatus = r.verificationStatus;
      const isSynth = isSyntheticFixture(r);

      if (isSynth) {
        curatedBenchmark++;
      } else if (vStatus === 'content_verified') {
        contentVerified++;
      } else if (vStatus === 'link_checked') {
        linkChecked++;
      } else if (vStatus === 'user_entered') {
        userEntered++;
      } else {
        // Check legacy fieldProvenance if present
        try {
          const prov: FieldProvenanceMap = JSON.parse(r.fieldProvenance || '{}');
          if (prov.sourceUrl === 'verified_live' || prov.sourceUrl === 'verified') {
            contentVerified++;
          } else if (prov.sourceUrl === 'curated_benchmark') {
            curatedBenchmark++;
          } else if (prov.sourceUrl === 'user_entered') {
            userEntered++;
          } else {
            unverified++;
          }
        } catch {
          unverified++;
        }
      }
    }

    const verifiedLive = contentVerified + linkChecked;

    return {
      total: records.length,
      eligibleNonFixture,
      duplicateCount,
      contentVerified,
      linkChecked,
      verifiedLive,
      curatedBenchmark,
      userEntered,
      unverified,
      syntheticFixture: curatedBenchmark,
      isBenchmarkCohort: curatedBenchmark > 0 && eligibleNonFixture === 0,
    };
  }
}

