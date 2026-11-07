import { readFileSync } from 'node:fs';
import { loadMerged } from '../../scripts/lib/merge.mjs';

// Small JSON documents for the site's chat assistant (a Fish Audio webhook tool fetches these).
// They are rebuilt with the site, so they are as fresh as the latest deploy.
const TZ = 'America/Chicago';

function chicagoToday(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(d)
      .map((x) => [x.type, x.value])
  );
  return `${p.year}-${p.month}-${p.day}`;
}

function clock(t) {
  const m = String(t || '').match(/^(\d{2}):(\d{2})$/);
  if (!m) return '';
  let h = Number(m[1]);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m[2]} ${ap}`;
}

const squash = (s) => String(s || '').replace(/\s+/g, ' ').trim();

export default function () {
  const built = new Date().toISOString();

  const { items } = loadMerged();
  const byNewest = [...items].sort((a, b) => String(b.published || b.sortDate).localeCompare(String(a.published || a.sortDate)));
  const brief = (a) => ({
    title: squash(a.title),
    source: a.source,
    published: a.published,
    summary: squash(a.excerpt),
    link: a.url,
    nostalgia_score: a.nostalgic ? a.score : 0
  });
  const news = {
    about: 'Latest Nashville and Nashville-music headlines gathered by The Nashville I Once Knew. Headlines and short summaries only; link to the original story for the full article.',
    built_at: built,
    latest: byNewest.slice(0, 30).map(brief),
    most_nostalgic_recent: byNewest
      .slice(0, 150)
      .filter((a) => a.nostalgic)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map(brief)
  };

  let data = { updatedAt: '', venues: [], shows: [] };
  try {
    data = JSON.parse(readFileSync(new URL('./shows.json', import.meta.url), 'utf8'));
  } catch {
    /* no data yet */
  }
  const from = chicagoToday(0);
  const to = chicagoToday(14);
  const shows = {
    about: 'Upcoming live shows over the next 14 days at Nashville-area venues covered by The Nashville I Once Knew. Always tell people to confirm times and tickets with the venue.',
    built_at: built,
    listings_updated_at: data.updatedAt || '',
    venues_covered: (data.venues || []).filter((v) => v.ok).map((v) => v.name),
    shows: (data.shows || [])
      .filter((s) => s.date >= from && s.date <= to)
      .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
      .map((s) => ({
        date: s.date,
        weekday: new Date(s.date + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long' }),
        time: clock(s.time) || 'Time TBA',
        venue: s.venue,
        title: squash(s.title)
      }))
  };

  return [
    { slug: 'news', body: news },
    { slug: 'shows', body: shows }
  ];
}
