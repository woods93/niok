import { readFileSync } from 'node:fs';

// Groups upcoming shows by day for the Live Shows page.
const TZ = 'America/Chicago';

function chicagoToday() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date())
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
  return m[2] === '00' ? `${h} ${ap}` : `${h}:${m[2]} ${ap}`;
}

function dayLabel(date) {
  const d = new Date(date + 'T12:00:00Z');
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' }).format(d);
}

export default function () {
  let data = { updatedAt: '', venues: [], shows: [] };
  try {
    data = JSON.parse(readFileSync(new URL('./shows.json', import.meta.url), 'utf8'));
  } catch {
    /* no data yet */
  }
  const today = chicagoToday();
  const days = [];
  const byDate = new Map();
  for (const s of data.shows || []) {
    if (s.date < today) continue;
    let day = byDate.get(s.date);
    if (!day) {
      day = { date: s.date, label: dayLabel(s.date), shows: [] };
      byDate.set(s.date, day);
      days.push(day);
    }
    day.shows.push({ ...s, timeLabel: clock(s.time) || 'Time TBA', doorsLabel: clock(s.doors) });
  }
  days.sort((a, b) => a.date.localeCompare(b.date));
  const venues = [...new Set((data.shows || []).map((s) => s.venue))].sort();
  return {
    days,
    venues,
    status: data.venues || [],
    problems: (data.venues || []).filter((v) => !v.ok).map((v) => v.name),
    updatedAt: data.updatedAt || '',
    total: days.reduce((n, d) => n + d.shows.length, 0),
  };
}
