// Pulls upcoming live shows from each venue and writes src/_data/shows.json.
// Each venue has its own small reader. A broken venue never empties the page:
// if a reader returns nothing, the last good listings for that venue are kept and flagged.
import { parseDocument } from 'htmlparser2';
import { readJson, writeJson, decodeEntities, stripHtml } from './lib/util.mjs';

const OUT = process.env.SHOWS_OUT || 'src/_data/shows.json';
const TZ = 'America/Chicago';
const HORIZON_DAYS = 75;
const UA = 'Mozilla/5.0 (compatible; NashvilleIOnceKnewBot/1.0; +https://woods93.github.io/niok/)';

// ---------- helpers ----------
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n) => String(n).padStart(2, '0');

export function chicagoParts(ms) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

export function today() {
  return chicagoParts(Date.now()).date;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function parseTime(s) {
  const m = String(s || '').match(/(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?/i);
  if (m) {
    let h = Number(m[1]) % 12;
    if (m[3].toLowerCase() === 'p') h += 12;
    return `${pad(h)}:${m[2] || '00'}`;
  }
  const m24 = String(s || '').match(/\b([01]?\d|2[0-3]):([0-5]\d)(?::\d{2})?\b/);
  return m24 ? `${pad(Number(m24[1]))}:${m24[2]}` : '';
}

// Picks a sensible year for a month/day with no year given.
function inferYear(month, day) {
  const t = today();
  const y = Number(t.slice(0, 4));
  const cand = `${y}-${pad(month)}-${pad(day)}`;
  return cand < addDays(t, -45) ? y + 1 : y;
}

export function parseDateText(text) {
  const t = String(text);
  let m = t.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/i);
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()];
    const day = Number(m[2]);
    const yr = m[3] ? Number(m[3]) : inferYear(mo, day);
    return `${yr}-${pad(mo)}-${pad(day)}`;
  }
  m = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (m) {
    const mo = Number(m[1]);
    const day = Number(m[2]);
    if (mo < 1 || mo > 12 || day < 1 || day > 31) return '';
    let yr = m[3] ? Number(m[3]) : inferYear(mo, day);
    if (yr < 100) yr += 2000;
    return `${yr}-${pad(mo)}-${pad(day)}`;
  }
  return '';
}

async function get(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { 'user-agent': UA, accept: '*/*', ...(opts.headers || {}) },
    signal: AbortSignal.timeout(25000),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res;
}

const getText = async (url, opts) => (await get(url, opts)).text();

// Minimal DOM helpers on top of htmlparser2 (no extra dependency needed).
const isTag = (n) => n.type === 'tag' || n.type === 'script' || n.type === 'style';
function textOf(node) {
  if (node.type === 'text') return node.data;
  if (node.type === 'script' || node.type === 'style') return '';
  return (node.children || []).map(textOf).join(' ');
}
const clean = (s) => decodeEntities(String(s || '')).replace(/\s+/g, ' ').trim();
function walk(node, fn) {
  fn(node);
  (node.children || []).forEach((c) => walk(c, fn));
}
export function textTokens(node) {
  const out = [];
  walk(node, (n) => {
    if (n.type === 'text' && !(n.parent && ['script', 'style', 'noscript'].includes(n.parent.name))) {
      const t = clean(n.data);
      if (t) out.push(t);
    }
  });
  return out;
}
const abs = (href, base) => {
  try { return new URL(href, base).href; } catch { return ''; }
};

const GENERIC = /^(buy tickets?|get tickets?|tickets?|more info|details|read more|view event|learn more|info|rsvp|sold out|free)$/i;

// Finds each event by its link, then looks upward for the smallest block that holds
// exactly that event and a date. Works for lists/cards that put date, time and title together.
export function scrapeByLinks(html, { base, linkRe, ticketRe }) {
  const doc = parseDocument(html);
  const anchors = [];
  walk(doc, (n) => {
    if (n.type === 'tag' && n.name === 'a' && n.attribs && n.attribs.href && linkRe.test(n.attribs.href)) anchors.push(n);
  });
  const hrefsIn = (node) => {
    const s = new Set();
    walk(node, (n) => {
      if (n.type === 'tag' && n.name === 'a' && n.attribs && n.attribs.href && linkRe.test(n.attribs.href)) s.add(abs(n.attribs.href, base));
    });
    return s;
  };
  const seen = new Map();
  for (const a of anchors) {
    const url = abs(a.attribs.href, base);
    if (!url || seen.has(url)) continue;
    let node = a;
    let found = null;
    for (let i = 0; i < 9 && node; i++) {
      node = node.parent;
      if (!node || node.type === 'root') break;
      if (hrefsIn(node).size > 1) break;
      const txt = clean(textOf(node));
      if (parseDateText(txt)) { found = node; break; }
    }
    if (!found) continue;
    const txt = clean(textOf(found));
    const date = parseDateText(txt);
    const showM = txt.match(/\bshow(?:\s*time)?\s*[:@-]?\s*(\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?)/i);
    const doorsM = txt.match(/\bdoors?\s*[:@-]?\s*(\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?)/i);
    const timeAll = txt.match(/\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?/i);
    const time = parseTime(showM ? showM[1] : timeAll ? timeAll[0] : '');
    const doors = doorsM ? parseTime(doorsM[1]) : '';
    // title: first heading, else the longest non-generic link text
    let title = '';
    walk(found, (n) => {
      if (!title && n.type === 'tag' && /^h[1-6]$/.test(n.name)) title = clean(textOf(n));
    });
    if (!title) {
      const cands = [];
      walk(found, (n) => {
        if (n.type === 'tag' && n.name === 'a' && n.attribs && n.attribs.href && linkRe.test(n.attribs.href)) {
          const t = clean(textOf(n));
          if (t && !GENERIC.test(t)) cands.push(t);
        }
      });
      title = cands.sort((x, y) => y.length - x.length)[0] || '';
    }
    if (!title) {
      const slug = url.split('/').filter(Boolean).pop() || '';
      title = slug.replace(/-/g, ' ');
    }
    let tickets = '';
    if (ticketRe) {
      walk(found, (n) => {
        if (!tickets && n.type === 'tag' && n.name === 'a' && n.attribs && n.attribs.href && ticketRe.test(n.attribs.href)) tickets = abs(n.attribs.href, base);
      });
    }
    seen.set(url, { title, date, time, doors, url, tickets });
  }
  return [...seen.values()];
}

// ---------- venue readers ----------
async function readSquarespace(v) {
  const j = JSON.parse(await getText(v.url + (v.url.includes('?') ? '&' : '?') + 'format=json'));
  const origin = new URL(v.url).origin;
  return (j.upcoming || [])
    .filter((e) => !/^private event/i.test(e.title || ''))
    .map((e) => {
      const s = chicagoParts(e.startDate);
      const en = e.endDate ? chicagoParts(e.endDate) : null;
      return {
        venue: v.name,
        title: clean(e.title),
        date: s.date,
        time: s.time,
        endTime: en && en.date === s.date ? en.time : '',
        doors: '',
        url: e.fullUrl ? abs(e.fullUrl, origin) : v.url,
        tickets: '',
      };
    });
}

async function readBasement(v) {
  const html = await getText(v.url);
  const nonce = (html.match(/nonce:\s*'([a-f0-9]+)'/) || [])[1];
  const params = (html.match(/params:\s*'(\{.*?\})'/s) || [])[1];
  const ajax = (html.match(/['"]([^'"]*admin-ajax\.php)['"]/) || [])[1];
  if (!nonce || !params) throw new Error('calendar settings not found on page');
  const start = today();
  const end = addDays(start, HORIZON_DAYS);
  const body = new URLSearchParams({ action: 'get_events_for_calendar', nonce, start, end, params });
  const raw = await getText(abs(ajax || '/wp-admin/admin-ajax.php', v.url), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', referer: v.url },
    body,
  });
  const j = JSON.parse(raw);
  const out = [];
  for (const e of j.events || []) {
    const venue = clean(stripHtml(e.venue || '')) || v.name;
    const sk = String(e.sortkey || '').match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);
    out.push({
      venue,
      title: clean(e.title),
      date: sk ? sk[1] : String(e.start || '').slice(0, 10),
      time: sk ? sk[2] : parseTime(e.displayTime),
      doors: parseTime(e.doors),
      url: v.url,
      tickets: '',
    });
  }
  return out;
}

async function readLinks(v) {
  const html = await getText(v.url);
  const found = scrapeByLinks(html, {
    base: v.url,
    linkRe: new RegExp(v.linkPattern),
    ticketRe: v.ticketPattern ? new RegExp(v.ticketPattern) : null,
  });
  return found.map((e) => ({ venue: v.name, ...e }));
}

// Skinny Dennis: a plain list like "Tue 11/03  9:00 PM  Act name". Read the page as text.
export function parseTextCalendar(tokens, v) {
  const text = tokens.join(' | ');
  const re = /(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\.?,?\s*\|?\s*(\d{1,2})\/(\d{1,2})(?!\d|\/\d)/gi;
  const marks = [];
  let m;
  while ((m = re.exec(text))) marks.push({ idx: m.index, end: re.lastIndex, mo: Number(m[2]), day: Number(m[3]) });
  const out = [];
  marks.forEach((mk, i) => {
    const chunk = text.slice(mk.end, i + 1 < marks.length ? marks[i + 1].idx : mk.end + 400);
    const tm = chunk.match(/\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?/i);
    const time = tm ? parseTime(tm[0]) : '';
    let title = chunk.replace(tm ? tm[0] : '', ' ');
    title = title.split('|').map((x) => clean(x)).filter((x) => x && !GENERIC.test(x) && !/^(tickets?|dice|instagram|more)$/i.test(x));
    const t = title[0] || '';
    if (!t || mk.mo < 1 || mk.mo > 12) return;
    const yr = inferYear(mk.mo, mk.day);
    out.push({ venue: v.name, title: t.slice(0, 160), date: `${yr}-${pad(mk.mo)}-${pad(mk.day)}`, time, doors: '', url: v.url, tickets: '' });
  });
  return out;
}

async function readTextCalendar(v) {
  const html = await getText(v.url);
  const doc = parseDocument(html);
  let body = doc;
  walk(doc, (n) => { if (n.type === 'tag' && n.name === 'body') body = n; });
  return parseTextCalendar(textTokens(body), v);
}

const READERS = { squarespace: readSquarespace, basement: readBasement, links: readLinks, text: readTextCalendar };

// ---------- main ----------
export async function main() {
  const venues = readJson('config/venues.json', []);
  const prev = readJson(OUT, { shows: [], venues: [] });
  const start = today();
  const end = addDays(start, HORIZON_DAYS);
  const all = [];
  const status = [];

  for (const v of venues) {
    const st = { id: v.id, name: v.name, url: v.url, ok: false, count: 0, error: '', stale: false };
    try {
      const reader = READERS[v.reader];
      if (!reader) throw new Error('unknown reader ' + v.reader);
      let list = await reader(v);
      list = list
        .filter((e) => e.title && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.date >= start && e.date <= end)
        .map((e) => ({ ...e, source: v.id }));
      const seen = new Set();
      list = list.filter((e) => {
        const k = [e.venue, e.date, e.time, e.title.toLowerCase()].join('|');
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      st.count = list.length;
      if (list.length === 0) throw new Error('reader returned no upcoming shows');
      st.ok = true;
      all.push(...list);
      console.log(`shows: ${v.name}: ${list.length} upcoming. First: ${list.slice(0, 2).map((e) => `${e.date} ${e.time} ${e.title}`).join(' || ')}`);
    } catch (err) {
      st.error = String(err.message || err).slice(0, 200);
      const old = (prev.shows || []).filter((e) => e.source === v.id && e.date >= start && e.date <= end);
      if (old.length) {
        all.push(...old);
        st.stale = true;
        st.count = old.length;
      }
      console.log(`shows: ${v.name}: PROBLEM: ${st.error}${old.length ? ` (kept ${old.length} earlier listings)` : ''}`);
    }
    status.push(st);
  }

  all.sort((a, b) => (a.date + (a.time || '99:99') + a.venue).localeCompare(b.date + (b.time || '99:99') + b.venue));
  writeJson(OUT, { updatedAt: new Date().toISOString(), venues: status, shows: all });
  console.log(`shows: wrote ${all.length} shows from ${status.filter((s) => s.ok).length}/${status.length} venues`);
}

if (process.argv[1] && process.argv[1].endsWith('shows.mjs')) {
  main().catch((e) => { console.error(e); process.exit(0); });
}
