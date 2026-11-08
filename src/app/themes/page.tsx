import { db, initializeDatabase } from '@/db';
import { ensureResearchData } from '@/services/research/datasets';
import {
  themes,
  evidenceThemeLinks,
  evidenceRecords,
  recordAnalyses,
  analysisRuns,
} from '@/db/schema';
import { desc } from 'drizzle-orm';
import { ThemeMap, ThemeWithDetails } from '@/components/ThemeMap';
import { classifyEvidenceProvenance, deduplicateEligibleEvidence, isGenuineResearchEvidence, isSyntheticFixture } from '@/lib/evidenceEligibility';

export const dynamic = 'force-dynamic';

export default async function ThemesPage() {
  await ensureResearchData();

  const allThemes = await db
    .select()
    .from(themes)
    .orderBy(desc(themes.createdAt))
    .all();

  const allLinks = await db.select().from(evidenceThemeLinks).all();
  const allRecords = await db.select().from(evidenceRecords).all();
  const [allAnalyses, runs] = await Promise.all([db.select().from(recordAnalyses).all(), db.select().from(analysisRuns).all()]);
  const runProvider = new Map(runs.map((run) => [run.id, run.provider]));

  const recordMap = new Map(allRecords.map((r) => [r.id, r]));
  const allRecordIds = new Set(allRecords.map((r) => r.id));

  // Extract behaviours and hypotheses associated with each theme from analyses
  const themeBehaviours = new Map<string, Set<string>>();
  const themeHypotheses = new Map<string, Set<string>>();

  for (const a of allAnalyses) {
    if (!allRecordIds.has(a.evidenceId) || a.validationStatus !== 'valid') continue;
    if (!a.parsedOutput) continue;
    try {
      const parsed = JSON.parse(a.parsedOutput);
      const themeName = parsed.theme?.name;
      if (themeName) {
        const matchingTheme = allThemes.find((t) => t.name.toLowerCase() === themeName.toLowerCase());
        if (matchingTheme) {
          const sourceRecord = recordMap.get(a.evidenceId);
          const analysisLabel = sourceRecord && isSyntheticFixture(sourceRecord) || runProvider.get(a.runId) === 'fake' ? '[ILLUSTRATIVE AI] ' : '[AI ANALYSIS] ';
          if (!themeBehaviours.has(matchingTheme.id)) themeBehaviours.set(matchingTheme.id, new Set());
          if (!themeHypotheses.has(matchingTheme.id)) themeHypotheses.set(matchingTheme.id, new Set());

          if (parsed.observedBehaviour) {
            themeBehaviours.get(matchingTheme.id)!.add(`${analysisLabel}${parsed.observedBehaviour}`);
          }
          if (Array.isArray(parsed.hypotheses)) {
            for (const h of parsed.hypotheses) {
              themeHypotheses.get(matchingTheme.id)!.add(`${analysisLabel}${h}`);
            }
          }
        }
      }
    } catch {
      // skip
    }
  }

  // Build decorated themes
  const decoratedThemes: ThemeWithDetails[] = allThemes.map((t) => {
    const links = allLinks.filter((l) => l.themeId === t.id);
    const eligibleLinks = links.filter((l) => allRecordIds.has(l.evidenceId));
    const supportingLinks = eligibleLinks.filter((l) => l.role === 'supports');
    const contradictingLinks = eligibleLinks.filter((l) => l.role === 'contradicts');
    const genuineRecords = deduplicateEligibleEvidence(eligibleLinks.flatMap((l) => { const r = recordMap.get(l.evidenceId); return r ? [r] : []; }));
    const genuineVerified = genuineRecords.filter((record) => ['content_verified', 'verified_live', 'verified'].includes(record.verificationStatus)).length;
    const genuineSources = new Set(genuineRecords.map((record) => record.platform)).size;

    const evidenceQuotes = eligibleLinks.flatMap((l) => {
        const rec = recordMap.get(l.evidenceId);
        if (!rec) return [];
        return [{
          id: rec.id,
          text: rec.originalText,
          platform: rec.platform,
          sourceUrl: rec.sourceUrl,
          role: l.role,
          synthetic: isSyntheticFixture(rec),
          provenanceCategory: classifyEvidenceProvenance(rec),
          verificationStatus: rec.verificationStatus,
        }];
      });

    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      description: t.description,
      journeyStage: t.journeyStage,
      origin: t.origin,
      status: t.status,
      mergedIntoId: t.mergedIntoId,
      supportingCount: supportingLinks.length,
      contradictingCount: contradictingLinks.length,
      excludedFixtureCount: 0,
      genuineCount: new Set(eligibleLinks.filter((l) => { const r = recordMap.get(l.evidenceId); return r ? isGenuineResearchEvidence(r) : false; }).map((l) => l.evidenceId)).size,
      illustrativeCount: new Set(eligibleLinks.filter((l) => { const r = recordMap.get(l.evidenceId); return r ? isSyntheticFixture(r) : false; }).map((l) => l.evidenceId)).size,
      sourceDiversity: new Set(eligibleLinks.flatMap((l) => { const r = recordMap.get(l.evidenceId); return r ? [r.platform] : []; })).size,
      researchConfidence: genuineRecords.length >= 5 && genuineVerified >= 3 && genuineSources >= 3 ? 'High evidence support'
        : genuineRecords.length >= 3 && genuineVerified >= 2 && genuineSources >= 2 ? 'Moderate evidence support'
        : genuineRecords.length ? 'Limited evidence support'
        : eligibleLinks.length ? 'Illustrative only' : 'No linked evidence',
      evidenceQuotes,
      behaviours: Array.from(themeBehaviours.get(t.id) || []),
      hypotheses: Array.from(themeHypotheses.get(t.id) || []),
    };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <span className="badge badge-purple">Unified Discovery Themes</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Unbiased Inductive Synthesis
          </span>
        </div>
        <h1>Investor Journey & Behaviour Map</h1>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '780px', marginTop: '6px', fontSize: '14px' }}>
          {allRecords.length} stored records and all linked themes appear together. Fixture-derived insights remain illustrative and never count as genuine research support.
        </p>
      </div>

      {decoratedThemes.some((theme) => theme.evidenceQuotes.length > 0) ? <ThemeMap initialThemes={decoratedThemes} /> : <div className="card" style={{ padding: 28, borderStyle: 'dashed' }}><h2 style={{ fontSize: 16 }}>No evidence-linked themes yet</h2><p style={{ color: 'var(--text-secondary)', marginTop: 8, fontSize: 13 }}>Run analysis on available records to discover evidence-linked themes.</p></div>}
    </div>
  );
}

