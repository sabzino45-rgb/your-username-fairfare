// Demand forecast: combines the typical pattern of each place with events drivers add.
import { KIND_PATTERNS, BANDS, TOWNS } from "./southwest.js";

const EVENT_WEIGHT = { small: 2, medium: 4, big: 7 };

// Monday-based day index for a Date
export const dayIdx = (d) => (d.getDay() + 6) % 7;

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

// Does pattern [start,end) on its day cover band [bs,be) on that day? Handles past-midnight.
function patternHits(start, end, bs, be) {
  const e = end <= start ? end + 24 : end;
  return overlaps(start, e, bs, be);
}

export function placePatterns(place) {
  return place.hours || KIND_PATTERNS[place.kind] || [];
}

// Is a place busy at this date/time? (typical pattern)
export function placeHotNow(place, now = new Date()) {
  const h = now.getHours() + now.getMinutes() / 60;
  const d = dayIdx(now);
  return placePatterns(place).some(([days, s, e]) => {
    const end = e <= s ? e + 24 : e;
    if (days.includes(d) && h >= s && h < end) return true;
    const prev = (d + 6) % 7; // past-midnight spill from yesterday
    return end > 24 && days.includes(prev) && h + 24 >= s && h + 24 < end;
  });
}

// Event end as a Date
export function eventEnd(ev) {
  return new Date(`${ev.date}T${ev.end || "22:00"}`);
}

// Week grid for a town: 7 days x BANDS, each a level 0..3 (quiet, steady, busy, peak)
export function weekGrid(townId, events = [], weekStart = startOfWeek(new Date()), extraPlaces = []) {
  const town = TOWNS.find((t) => t.id === townId);
  const places = [...(town ? town.places : []), ...extraPlaces.filter((p) => p.town === townId)];
  const score = Array.from({ length: 7 }, () => BANDS.map(() => 1)); // background demand
  // Every town: steady daytime trade, busier Friday and Saturday evenings
  const TOWN_BASE = [[[0, 1, 2, 3, 4, 5, 6], 10, 18, 1], [[4, 5], 18, 22, 1]];
  for (const p of [{ hours: TOWN_BASE }, ...places]) {
    for (const [days, s, e, w] of placePatterns(p)) {
      for (const d of days) BANDS.forEach(([bs, be], bi) => { if (patternHits(s, e, bs, be)) score[d][bi] += w; });
    }
  }
  // Events this week: the 90 minutes after they finish are the rush
  const wEnd = new Date(weekStart.getTime() + 7 * 864e5);
  for (const ev of events.filter((e) => e.town === townId)) {
    const end = eventEnd(ev);
    if (end < weekStart || end >= wEnd) continue;
    const d = dayIdx(end);
    const h = end.getHours() + end.getMinutes() / 60;
    BANDS.forEach(([bs, be], bi) => {
      const hh = h < 6 ? h + 24 : h;
      if (overlaps(hh, hh + 1.5, bs, be)) score[d][bi] += EVENT_WEIGHT[ev.size] || 3;
    });
  }
  const flat = score.flat();
  const max = Math.max(...flat);
  return score.map((row) => row.map((v) => (max <= 1 ? 0 : v <= 1 ? 0 : v / max < 0.45 ? 1 : v / max < 0.75 ? 2 : 3)));
}

export function startOfWeek(d) {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  s.setDate(s.getDate() - dayIdx(s));
  return s;
}

// Which band is "now"? Hours 0-6 count as the previous day's 22-02 band.
export function currentSlot(now = new Date()) {
  let d = dayIdx(now);
  let h = now.getHours();
  if (h < 6) { d = (d + 6) % 7; h += 24; }
  const bi = BANDS.findIndex(([s, e]) => h >= s && h < e);
  return { day: d, band: bi };   // band -1 means 02:00-06:00 (outside the grid)
}

// The next band at the top level after now
export function nextPeak(grid, now = new Date()) {
  const { day, band } = currentSlot(now);
  const top = Math.max(...grid.flat());
  if (top <= 0) return null;
  const B = BANDS.length;
  // Grid days are "driving days": 00:00-06:00 belongs to the previous day.
  const base = new Date(now);
  if (base.getHours() < 6) base.setDate(base.getDate() - 1);
  const week0 = startOfWeek(base);
  for (let step = 1; step <= 7 * B; step++) {
    const idx = day * B + (band < 0 ? B - 1 : band) + step;
    const d = Math.floor(idx / B) % 7, b = idx % B;
    if (grid[d][b] === top) {
      const start = new Date(week0);
      start.setDate(start.getDate() + Math.floor(idx / B));
      start.setHours(BANDS[b][0] % 24, 0, 0, 0);
      if (BANDS[b][0] >= 24) start.setDate(start.getDate() + 1);
      return { day: d, band: b, start };
    }
  }
  return null;
}
