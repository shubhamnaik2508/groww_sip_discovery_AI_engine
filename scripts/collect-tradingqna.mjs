#!/usr/bin/env node
/**
 * Collects genuine public SIP discussions from TradingQ&A (tradingqna.com),
 * a public Discourse forum, through its documented public JSON API.
 *
 * - Respects robots.txt (only /search.json and /posts/{id}.json, neither disallowed).
 * - Sequential requests with a delay; identifies itself honestly.
 * - Stores the verbatim `raw` post body, the canonical post URL, publication date
 *   and topic title. Usernames are NOT stored (privacy); only a salted hash.
 *
 * Usage: node scripts/collect-tradingqna.mjs [maxRecords]
 * Output: data/secondary/tradingqna.jsonl (appends/merges by post id)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const BASE = 'https://tradingqna.com';
const OUT = path.resolve('data/secondary/tradingqna.jsonl');
const MAX = Number(process.argv[2] || 45);
const UA = 'groww-sip-discovery-research/1.0 (independent NextLeap academic project)';
// "in:title" keeps results to topics whose title is about SIPs.
const QUERIES = [
  'sip stop', 'sip stopped', 'sip pause', 'sip reduce', 'sip loss', 'sip negative',
  'sip market', 'sip mandate', 'sip salary', 'sip skip', 'sip missed', 'sip debit',
  'sip continue', 'sip not', 'sip autopay', 'sip returns', 'sip cancel', 'sip failed',
  'sip worried', 'sip beginner', 'sip first', 'sip should', 'sip help', 'sip date',
];
const FIRST_PERSON = /(i|i'm|i've|my|me|we|our)/i;
const EDITORIAL = /^(weekly market|nifty|things we are reading|introducing|zerodha educate|the chatter)/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (res.status === 429) {
    const wait = Number(res.headers.get('retry-after') || 10) * 1000;
    await sleep(wait);
    return getJson(url);
  }
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

const existing = new Map();
if (fs.existsSync(OUT)) {
  for (const line of fs.readFileSync(OUT, 'utf8').split('\n').filter(Boolean)) {
    const r = JSON.parse(line); existing.set(r.externalId, r);
  }
}

const candidates = new Map();
for (const q of QUERIES) {
  const data = await getJson(`${BASE}/search.json?q=${encodeURIComponent(q + ' in:title')}`);
  for (const p of data.posts || []) {
    if (p.post_number !== 1) continue; // investor's own question, not advice replies
    candidates.set(p.id, { id: p.id, topicId: p.topic_id, query: q });
  }
  await sleep(1200);
}
console.log('candidate first-posts:', candidates.size);

let added = 0;
for (const c of candidates.values()) {
  if (existing.size >= MAX) break;
  const externalId = `tqna-post-${c.id}`;
  if (existing.has(externalId)) continue;
  const post = await getJson(`${BASE}/posts/${c.id}.json`);
  await sleep(1200);
  const raw = String(post.raw || '').trim();
  if (!/\bsip/i.test(raw) && !/\bsip/i.test(post.topic_slug || '')) continue; // must be SIP-related
  if (raw.length < 40) continue;
  const topic = await getJson(`${BASE}/t/${c.topicId}.json`).catch(() => null);
  await sleep(1200);
  const rec = {
    externalId,
    platform: 'trading_qa',
    sourceUrl: `${BASE}/t/${post.topic_slug}/${post.topic_id}/1`,
    title: topic?.title ?? null,
    originalText: raw,
    publishedAt: post.created_at,
    collectedAt: new Date().toISOString(),
    language: 'en',
    authorHash: hash('tqna:' + post.username).slice(0, 12),
    metadata: { replyCount: post.reply_count, reads: post.reads, searchQuery: c.query },
    collectionMethod: 'Discourse public JSON API (/search.json, /posts/{id}.json)',
  };
  existing.set(externalId, rec);
  fs.appendFileSync(OUT, JSON.stringify(rec) + '\n');
  added++;
  console.log(`+ ${externalId} ${rec.title?.slice(0, 70)}`);
}
console.log(`added ${added}; total ${existing.size}`);
