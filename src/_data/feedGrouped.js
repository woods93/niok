import { loadMerged } from '../../scripts/lib/merge.mjs';

// Groups stories that cover the same event. The strongest story leads;
// the rest become "also covered by" links on its card.
const STOP = new Set(('a an the and or of to in on at for with by from as is are was were be it its this that ' +
  'his her their our your you he she they we after over into about up out new says say said will just more ' +
  'than not but have has had who what when how why').split(' '));

function tokens(title) {
  return new Set(
    String(title || '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
  );
}

function numbers(title) {
  return (String(title || '').match(/\b\d+\b/g) || []).sort().join(',');
}

function similar(a, b) {
  let shared = 0;
  for (const w of a) if (b.has(w)) shared += 1;
  const union = a.size + b.size - shared;
  return shared >= 3 && shared / union >= 0.4;
}

const WEEK = 7 * 86400000;

export default function () {
  const items = loadMerged().items;
  const info = items.map((a) => ({ a, t: tokens(a.title), time: new Date(a.published).getTime() || 0 }));
  const used = new Set();
  const out = [];
  // Lead candidates: pinned first, then nostalgia score, then newest.
  const order = [...info].sort(
    (x, y) => (y.a.pin ? 1 : 0) - (x.a.pin ? 1 : 0) || (y.a.score || 0) - (x.a.score || 0) || y.time - x.time
  );
  const leads = new Map();
  for (const lead of order) {
    if (used.has(lead.a.id)) continue;
    used.add(lead.a.id);
    const also = [];
    for (const other of info) {
      if (used.has(other.a.id)) continue;
      if (Math.abs(other.time - lead.time) > WEEK) continue;
      if (numbers(lead.a.title) !== numbers(other.a.title)) continue;
      if (!similar(lead.t, other.t)) continue;
      used.add(other.a.id);
      also.push({ title: other.a.title, url: other.a.url, source: other.a.source });
    }
    leads.set(lead.a.id, { ...lead.a, also });
  }
  // Keep the original order of the feed (newest first).
  for (const { a } of info) if (leads.has(a.id)) out.push(leads.get(a.id));
  return out;
}
