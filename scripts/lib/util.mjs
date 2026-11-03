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

// ---- thumbnails ----------------------------------------------------------
const BAD_IMG = /(gravatar|pixel|spacer|blank\.|1x1|emoji|logo|favicon|\/ads?\/|doubleclick|feedburner)/i;

export function cleanImageUrl(u, base) {
  try {
    const x = new URL(String(u || '').trim().replace(/&amp;/g, '&'), base || undefined);
    if (x.protocol === 'http:') x.protocol = 'https:';
    if (x.protocol !== 'https:') return '';
    const s = x.toString();
    return BAD_IMG.test(s) ? '' : s;
  } catch {
    return '';
  }
}

function attrUrl(v) {
  if (!v) return '';
  if (Array.isArray(v)) return attrUrl(v.find((e) => attrUrl(e)));
  if (typeof v === 'string') return v;
  return (v.$ && (v.$.url || v.$.href)) || v.url || '';
}

// Picks the best image a feed item offers: media tags, enclosure, then the first <img> in the body.
export function extractImage(item) {
  const cands = [];
  const mc = item.mediaContent;
  if (Array.isArray(mc)) {
    for (const m of mc) {
      const t = (m && m.$ && (m.$.medium || m.$.type)) || '';
      if (!t || /image/i.test(t)) cands.push(attrUrl(m));
    }
  } else if (mc) cands.push(attrUrl(mc));
  cands.push(attrUrl(item.mediaThumbnail));
  if (item.enclosure && /image/i.test(item.enclosure.type || '')) cands.push(item.enclosure.url);
  for (const body of [item['content:encoded'], item.content, item.summary]) {
    const m = /<img[^>]+src=["']([^"']+)["']/i.exec(String(body || ''));
    if (m) cands.push(m[1]);
  }
  for (const c of cands) {
    const ok = cleanImageUrl(c);
    if (ok) return ok;
  }
  return '';
}

export function ogImage(html, pageUrl) {
  const head = String(html || '').slice(0, 200000);
  const re = /<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(head))) {
    const c = /content=["']([^"']+)["']/i.exec(m[0]);
    if (c) {
      const ok = cleanImageUrl(decodeEntities(c[1]), pageUrl);
      if (ok) return ok;
    }
  }
  const rev = /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(head);
  return rev ? cleanImageUrl(decodeEntities(rev[1]), pageUrl) : '';
}
