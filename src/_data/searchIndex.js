import { loadMerged } from '../../scripts/lib/merge.mjs';

// Compact record per story for the browser-side search. Keys are short to keep the file small.
export default function () {
  const { items, archive } = loadMerged();
  const all = [...items];
  for (const m of archive) all.push(...m.items);
  const seen = new Set();
  const out = [];
  for (const a of all) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    out.push({
      t: a.title,
      u: a.url,
      s: a.source,
      d: a.published,
      x: a.excerpt || '',
      g: a.tags || [],
      n: a.nostalgic ? a.score : 0
    });
  }
  return out;
}
