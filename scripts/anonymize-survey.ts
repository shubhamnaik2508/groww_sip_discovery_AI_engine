/**
 * Converts the raw Google Forms export into the anonymised dataset committed to the repo.
 * PII columns (names, emails, phones) are dropped; respondents become R01..Rnn.
 * Usage: npx tsx scripts/anonymize-survey.ts "<path to raw export.csv>"
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseGoogleFormsCsv, toAnonymisedCsv, computeHeadlineMetrics } from '../src/lib/research/survey';

const input = process.argv[2];
if (!input) throw new Error('Pass the raw Google Forms CSV path.');
const survey = parseGoogleFormsCsv(fs.readFileSync(input, 'utf8'));
const out = path.resolve('data/primary/google-forms-sip-survey.anonymized.csv');
fs.writeFileSync(out, toAnonymisedCsv(survey));
fs.writeFileSync(
  path.resolve('data/primary/google-forms-sip-survey.provenance.json'),
  JSON.stringify({ sourceFile: path.basename(input), anonymisedAt: new Date().toISOString(), respondents: survey.responses.length, excludedColumns: survey.excludedColumns, method: 'PII columns dropped by parseGoogleFormsCsv; respondents re-coded R01..Rnn in export row order.' }, null, 2),
);
console.log(`respondents=${survey.responses.length} questions=${survey.questions.length} excluded=${JSON.stringify(survey.excludedColumns)}`);
console.log('warnings:', survey.warnings);
for (const q of survey.questions) console.log(q.order, q.type, JSON.stringify(q.wording));
for (const m of computeHeadlineMetrics(survey)) console.log(`${m.label}: ${m.count}/${m.denominator} (${m.pct}%) ${m.status}${m.previouslyReported ? ` prev=${m.previouslyReported.count}/${m.previouslyReported.denominator}` : ''}${m.subgroup ? ` | subgroup ${m.subgroup.count}/${m.subgroup.denominator}` : ''}`);
