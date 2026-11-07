import fs from 'node:fs';
import path from 'node:path';
import { readJson } from './util.mjs';
import { buildScorer, loadEntityConfig } from './score.mjs';

export function loadArchive(root = process.cwd()) {
  const dir = path.join(root, 'data', 'archive');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}\.json$/.test(f))
    .sort()
    .reverse()
    .map((f) => {
      const items = readJson(path.join(dir, f), []).map(withDefaults);
      items.sort((a, b) => String(b.published).localeCompare(String(a.published)));
      return { month: f.slice(0, -5), items };
    });
}

function withDefaults(a) {
  return { tags: [], reasons: [], score: 0, nostalgic: false, excerpt: '', ...a };
}

// Combines the stored stories with the hosts' picks from the curation sheet.
export function loadMerged(root = process.cwd()) {
  const cfg = loadEntityConfig(root);
  const scorer = buildScorer(cfg);
  // Some feeds publish photo files (for example "Photo-1061.jpg") as stories. Skip them.
  const isImageFileTitle = (t) => /\.(jpe?g|png|gif|webp)\s*$/i.test(String(t || ''));
  const articles = readJson(path.join(root, 'src', '_data', 'articles.json'), [])
    .filter((a) => !isImageFileTitle(a.title))
    .map(withDefaults);
  const picks = readJson(path.join(root, 'src', '_data', 'picks.json'), []);
  const archive = loadArchive(root);

  const byId = new Map(articles.map((a) => [a.id, a]));
  const archivedById = new Map();
  for (const m of archive) for (const a of m.items) archivedById.set(a.id, a);

  const pickItems = [];
  const pickMap = new Map();
  for (const p of picks) {
    const base = byId.get(p.id) || archivedById.get(p.id);
    let item;
    if (base) {
      item = { ...base };
    } else if (p.title) {
      const published = p.published || p.added;
      item = withDefaults({
        id: p.id,
        title: p.title,
        url: p.url,
        source: p.source || 'Host pick',
        published,
        added: p.added,
        sortDate: published,
        ...scorer.score(p.title)
      });
    } else {
      continue;
    }
    item.pin = !!p.pin;
    item.note = p.note || '';
    item.episode = p.episode || '';
    item.tags = [...new Set([...(item.tags || []), ...(p.tags || [])])];
    if (p.override !== null && p.override !== undefined && !Number.isNaN(Number(p.override))) {
      item.score = Number(p.override);
      item.nostalgic = item.score >= cfg.threshold;
    }
    item.picked = true;
    pickItems.push(item);
    pickMap.set(p.id, item);
  }

  const items = articles.map((a) => pickMap.get(a.id) || a);
  for (const p of pickItems) {
    if (!byId.has(p.id) && !archivedById.has(p.id)) items.push(p);
  }
  items.sort((a, b) => String(b.sortDate || b.published).localeCompare(String(a.sortDate || a.published)));
  pickItems.sort((a, b) => String(b.published).localeCompare(String(a.published)));
  return { items, picks: pickItems, archive };
}
