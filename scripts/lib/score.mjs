import path from 'node:path';
import { readJson } from './util.mjs';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
const norm = (s) => String(s || '').replace(/[‘’]/g, "'");

export function loadEntityConfig(root = process.cwd()) {
  return readJson(path.join(root, 'config', 'entities.json'), {
    threshold: 3,
    weights: { entity: 3, entityCap: 9, phrase: 2, phraseCap: 4, era: 1, eraCap: 2 },
    entities: [],
    retrospectivePhrases: []
  });
}

export function buildScorer(cfg) {
  const w = cfg.weights;
  const entityRes = (cfg.entities || []).map((e) => {
    const names = [e.name, ...(e.aliases || [])].map((n) => esc(norm(n)));
    return {
      name: e.name,
      re: new RegExp(`(?<![\\w])(?:${names.join('|')})(?![\\w])`, 'i')
    };
  });
  const phraseRes = (cfg.retrospectivePhrases || []).map((p) => {
    const wild = p.endsWith('*');
    const base = esc(norm(wild ? p.slice(0, -1) : p));
    return new RegExp(`(?<![\\w])${base}${wild ? '\\w*' : ''}(?![\\w])`, 'i');
  });
  const eraRe = /(?<![\w])(19(?:8\d|9[0-5])s?|'?(?:80|90)s|eighties|nineties)(?![\w])/gi;

  function score(text) {
    const t = norm(text);
    const reasons = [];
    const tags = [];
    let entityPts = 0;
    for (const e of entityRes) {
      if (e.re.test(t)) {
        entityPts += w.entity;
        tags.push(e.name);
        reasons.push(e.name);
      }
    }
    let phrasePts = 0;
    for (const re of phraseRes) {
      const m = t.match(re);
      if (m) {
        phrasePts += w.phrase;
        reasons.push(m[0].toLowerCase());
      }
    }
    let eraPts = 0;
    const seen = new Set();
    for (const m of t.matchAll(eraRe)) {
      const k = m[0].toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      eraPts += w.era;
      reasons.push(m[0]);
    }
    const total =
      Math.min(entityPts, w.entityCap) + Math.min(phrasePts, w.phraseCap) + Math.min(eraPts, w.eraCap);
    return { score: total, nostalgic: total >= cfg.threshold, reasons, tags };
  }

  return { score, threshold: cfg.threshold };
}
