#!/usr/bin/env node
// Pulls the configured feeds, removes duplicates, scores stories for nostalgia,
// reads the hosts' Google Sheet (optional), and writes JSON data files for the site build.

import fs from 'node:fs';
import path from 'node:path';
import Parser from 'rss-parser';
import { parse as parseCsv } from 'csv-parse/sync';
import {
  readJson,
  writeJson,
  canonicalUrl,
  makeId,
  titleKey,
  decodeEntities,
  makeExcerpt,
  isGoogleNews
} from './lib/util.mjs';
import { buildScorer, loadEntityConfig } from './lib/score.mjs';

const ROOT = process.cwd();
const P = {
  sources: process.env.SOURCES_FILE || path.join(ROOT, 'config', 'sources.json'),
  articles: path.join(ROOT, 'src', '_data', 'articles.json'),
  picks: path.join(ROOT, 'src', '_data', 'picks.json'),
  thisday: path.join(ROOT, 'src', '_data', 'thisday.json'),
  health: path.join(ROOT, 'src', '_data', 'health.json'),
  archiveDir: path.join(ROOT, 'data', 'archive')
};

const cfg = readJson(P.sources, null);
if (!cfg) {
  console.error(`Could not read ${P.sources}`);
  process.exit(1);
}
const settings = {
  keepDays: 90,
  ingestMaxAgeDays: 30,
  timeoutMs: 20000,
  batchSize: 4,
  googleNewsWindow: '14d',
  userAgent: 'NashvilleIOnceKnewReader/1.0',
  ...(cfg.settings || {})
};
const entityCfg = loadEntityConfig(ROOT);
const scorer = buildScorer(entityCfg);
const now = new Date();
const nowIso = now.toISOString();
const DAY = 86400000;

// ---------------------------------------------------------------- feed list
const feeds = [];
for (const f of cfg.feeds || []) {
  if (f.enabled && f.url) feeds.push({ name: f.name, url: f.url, evergreen: !!f.evergreen, google: !!f.google });
}
const gn = cfg.googleNews || {};
if (gn.enabled) {
  const queries = [];
  if (gn.entityQueries) {
    for (const e of entityCfg.entities || []) {
      queries.push(/nashville/i.test(e.name) ? `"${e.name}"` : `"${e.name}" Nashville`);
    }
  }
  for (const q of gn.extraQueries || []) queries.push(q);
  for (const q of queries) {
    const full = `${q} when:${settings.googleNewsWindow}`;
    feeds.push({
      name: `Google News: ${q}`,
      url: `https://news.google.com/rss/search?q=${encodeURIComponent(full)}&hl=en-US&gl=US&ceid=US:en`,
      evergreen: false,
      google: true
    });
  }
}

const parser = new Parser({
  timeout: settings.timeoutMs,
  headers: {
    'User-Agent': settings.userAgent,
    Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
  },
  customFields: { item: ['source'] }
});

async function fetchFeed(f) {
  if (f.url.startsWith('file:')) {
    const xml = fs.readFileSync(path.resolve(ROOT, f.url.slice(5)), 'utf8');
    return parser.parseString(xml);
  }
  return parser.parseURL(f.url);
}

function textOf(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  return v._ || v['#text'] || '';
}

function normalize(item, f) {
  let url = item.link || (/^https?:/i.test(item.guid || '') ? item.guid : '');
  if (!/^https?:\/\//i.test(url || '')) return null;
  let title = decodeEntities(item.title || '').replace(/\s+/g, ' ').trim();
  if (!title) return null;
  let source = f.name;
  if (f.google) {
    source = textOf(item.source).trim() || 'Google News';
    const suffix = ` - ${source}`;
    if (title.endsWith(suffix)) title = title.slice(0, -suffix.length).trim();
  } else {
    url = canonicalUrl(url);
  }
  let excerpt = f.google ? '' : makeExcerpt(item.contentSnippet || item.summary || item.content || '');
  if (titleKey(excerpt) === titleKey(title)) excerpt = '';

  let pub = new Date(item.isoDate || item.pubDate || '');
  if (Number.isNaN(pub.getTime())) pub = now;
  if (pub.getTime() > now.getTime() + DAY) pub = now;
  const published = pub.toISOString();

  return {
    id: makeId(url, title, source),
    title,
    url,
    source,
    published,
    added: nowIso,
    sortDate: f.evergreen ? nowIso : published,
    excerpt
  };
}

function monthOf(item) {
  const d = new Date(item.published);
  const ok = !Number.isNaN(d.getTime());
  return (ok ? item.published : item.added).slice(0, 7);
}

// ---------------------------------------------------------------- existing data
const existing = readJson(P.articles, []);
const known = new Set();
const knownTitles = new Set();
for (const a of existing) {
  known.add(a.id);
  knownTitles.add(titleKey(a.title));
}
if (fs.existsSync(P.archiveDir)) {
  for (const file of fs.readdirSync(P.archiveDir)) {
    if (!file.endsWith('.json')) continue;
    for (const a of readJson(path.join(P.archiveDir, file), [])) {
      known.add(a.id);
      knownTitles.add(titleKey(a.title));
    }
  }
}

// ---------------------------------------------------------------- fetch feeds
const health = [];
const results = [];
for (let i = 0; i < feeds.length; i += settings.batchSize) {
  const batch = feeds.slice(i, i + settings.batchSize);
  const settled = await Promise.allSettled(batch.map((f) => fetchFeed(f)));
  settled.forEach((r, j) => results.push({ f: batch[j], r }));
}

const added = [];
let okFeeds = 0;
for (const { f, r } of results) {
  const entry = { name: f.name, kind: 'feed', ok: false, fetched: 0, added: 0, error: '', checkedAt: nowIso };
  if (r.status === 'rejected') {
    entry.error = String(r.reason?.message || r.reason).slice(0, 200);
    console.warn(`FAILED  ${f.name}: ${entry.error}`);
    health.push(entry);
    continue;
  }
  okFeeds += 1;
  entry.ok = true;
  const items = r.value.items || [];
  entry.fetched = items.length;
  for (const raw of items) {
    const n = normalize(raw, f);
    if (!n) continue;
    if (!f.evergreen && now.getTime() - new Date(n.published).getTime() > settings.ingestMaxAgeDays * DAY) continue;
    const tk = titleKey(n.title);
    if (known.has(n.id) || knownTitles.has(tk)) continue;
    known.add(n.id);
    knownTitles.add(tk);
    added.push(n);
    entry.added += 1;
  }
  console.log(`ok      ${f.name}: ${entry.fetched} fetched, ${entry.added} new`);
  health.push(entry);
}

// ---------------------------------------------------------------- score, trim, archive
const all = [...existing, ...added].map((a) => ({
  ...a,
  ...scorer.score(`${a.title}. ${a.excerpt || ''}`)
}));
all.sort((a, b) => String(b.sortDate).localeCompare(String(a.sortDate)));

const keepMs = settings.keepDays * DAY;
const recent = [];
const toArchive = [];
for (const a of all) {
  if (now.getTime() - new Date(a.added).getTime() > keepMs) toArchive.push(a);
  else recent.push(a);
}

if (toArchive.length) {
  const byMonth = new Map();
  for (const a of toArchive) {
    const m = monthOf(a);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m).push(a);
  }
  for (const [m, list] of byMonth) {
    const file = path.join(P.archiveDir, `${m}.json`);
    const merged = new Map(readJson(file, []).map((a) => [a.id, a]));
    for (const a of list) merged.set(a.id, a);
    const out = [...merged.values()].sort((a, b) => String(b.published).localeCompare(String(a.published)));
    writeJson(file, out);
  }
  console.log(`archived ${toArchive.length} stories`);
}
writeJson(P.articles, recent);

// ---------------------------------------------------------------- Google Sheet (optional)
async function fetchCsv(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': settings.userAgent },
    redirect: 'follow',
    signal: AbortSignal.timeout(settings.timeoutMs)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  return parseCsv(text, {
    columns: (header) => header.map((h) => String(h).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')),
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
    trim: true
  });
}

const splitList = (s) =>
  String(s || '')
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean);

async function syncPicks() {
  const url = process.env.PICKS_CSV_URL;
  if (!url) return;
  const entry = { name: 'Host picks sheet', kind: 'sheet', ok: false, fetched: 0, added: 0, error: '', checkedAt: nowIso };
  try {
    const rows = await fetchCsv(url);
    const prev = new Map(readJson(P.picks, []).map((p) => [p.id, p]));
    const picks = [];
    for (const r of rows) {
      const link = String(r.url || '').trim();
      if (!/^https?:\/\//i.test(link)) continue;
      const clean = canonicalUrl(link);
      const id = makeId(clean);
      const d = new Date(r.date || '');
      const override = String(r.nostalgia_override ?? '').trim();
      picks.push({
        id,
        url: clean,
        title: String(r.title || '').trim(),
        source: String(r.source || '').trim(),
        published: Number.isNaN(d.getTime()) ? '' : d.toISOString(),
        added: prev.get(id)?.added || nowIso,
        pin: /^(y|yes|true|1|x)$/i.test(String(r.pin || '').trim()),
        note: String(r.note || '').trim(),
        tags: splitList(r.tags),
        episode: String(r.episode || '').trim(),
        override: override !== '' && !Number.isNaN(Number(override)) ? Number(override) : null
      });
    }
    writeJson(P.picks, picks);
    entry.ok = true;
    entry.fetched = picks.length;
    console.log(`ok      Host picks sheet: ${picks.length} rows`);
  } catch (e) {
    entry.error = String(e.message || e).slice(0, 200);
    console.warn(`FAILED  Host picks sheet: ${entry.error} (keeping previous picks)`);
  }
  health.push(entry);
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function monthNum(v) {
  const s = String(v || '').trim().toLowerCase();
  const n = parseInt(s, 10);
  if (n >= 1 && n <= 12) return n;
  const i = MONTHS.indexOf(s.slice(0, 3));
  return i >= 0 ? i + 1 : null;
}

async function syncThisDay() {
  const url = process.env.THISDAY_CSV_URL;
  if (!url) return;
  const entry = { name: 'This Day sheet', kind: 'sheet', ok: false, fetched: 0, added: 0, error: '', checkedAt: nowIso };
  try {
    const rows = await fetchCsv(url);
    const out = [];
    for (const r of rows) {
      const month = monthNum(r.month);
      const day = parseInt(r.day, 10);
      const event = String(r.event || '').trim();
      if (!month || !(day >= 1 && day <= 31) || !event) continue;
      const year = parseInt(r.year, 10);
      const link = String(r.url || r.link || '').trim();
      out.push({
        month,
        day,
        year: Number.isNaN(year) ? null : year,
        event,
        url: /^https?:\/\//i.test(link) ? link : ''
      });
    }
    writeJson(P.thisday, out);
    entry.ok = true;
    entry.fetched = out.length;
    console.log(`ok      This Day sheet: ${out.length} rows`);
  } catch (e) {
    entry.error = String(e.message || e).slice(0, 200);
    console.warn(`FAILED  This Day sheet: ${entry.error} (keeping previous entries)`);
  }
  health.push(entry);
}

await syncPicks();
await syncThisDay();

writeJson(P.health, { checkedAt: nowIso, sources: health });

const nostalgic = recent.filter((a) => a.nostalgic).length;
console.log(
  `done: ${added.length} new, ${recent.length} on the main feed (${nostalgic} nostalgic), ` +
    `${okFeeds}/${feeds.length} feeds responded`
);

if (feeds.length > 0 && okFeeds === 0) {
  console.error('Every feed failed. Stopping so the run shows as failed.');
  process.exitCode = 1;
}
