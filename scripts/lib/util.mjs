import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 1) + '\n', 'utf8');
}

const TRACKING = /^(utm_|fbclid|gclid|mc_|igshid|cmpid|ref$|ref_)/i;

export function canonicalUrl(u) {
  try {
    const x = new URL(u);
    x.hash = '';
    x.hostname = x.hostname.toLowerCase();
    for (const k of [...x.searchParams.keys()]) {
      if (TRACKING.test(k)) x.searchParams.delete(k);
    }
    let s = x.toString();
    if (x.pathname !== '/' && s.endsWith('/') && !x.search) s = s.slice(0, -1);
    return s;
  } catch {
    return String(u || '').trim();
  }
}

export function sha(text) {
  return crypto.createHash('sha1').update(text).digest('hex').slice(0, 16);
}

export function titleKey(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function isGoogleNews(url) {
  try {
    return new URL(url).hostname === 'news.google.com';
  } catch {
    return false;
  }
}

// Id for a story. Google News links are redirects, so those use title and source instead.
export function makeId(url, title, source) {
  if (isGoogleNews(url)) return sha('gn|' + titleKey(title) + '|' + String(source || '').toLowerCase());
  return sha(canonicalUrl(url));
}

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (m, g) => {
    if (g[0] === '#') {
      const code = g[1].toLowerCase() === 'x' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
      try {
        return String.fromCodePoint(code);
      } catch {
        return m;
      }
    }
    return NAMED[g.toLowerCase()] ?? m;
  });
}

export function stripHtml(s) {
  return decodeEntities(String(s || '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function makeExcerpt(raw, max = 240) {
  let t = stripHtml(raw)
    .replace(/\s*The post .{0,200}? appeared first on .*$/i, '')
    .replace(/\s+The post\s.{0,160}$/i, '')
    .trim()
    .replace(/\s*(\[…\]|\[\.\.\.\]|Read more.*|Continue reading.*)$/i, '')
    .trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return (sp > 120 ? cut.slice(0, sp) : cut).replace(/[\s,;:.\-]+$/, '') + '…';
}
