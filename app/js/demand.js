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

// ---------- planning tools (game plan, event radar, hot towns) ----------
import { km } from "./southwest.js";

const RAIN_PROB = 60;   // % chance of rain that counts as "rain expected"
const RAIN_MM = 0.5;    // or at least this much per hour

// Weather for a town at a given hour, from the feed's compact arrays. null if unknown.
export function weatherAt(weather, townId, when) {
  if (!weather || !weather.start || !weather.towns || !weather.towns[townId]) return null;
  const w = weather.towns[townId];
  const i = Math.floor((when - new Date(weather.start)) / 3600e3);
  if (i < 0 || i >= (w.p || []).length) return null;
  const prob = w.p[i], mm = (w.r || [])[i], temp = (w.t || [])[i];
  return { prob, mm, temp, rain: (prob ?? 0) >= RAIN_PROB || (mm ?? 0) >= RAIN_MM };
}

// Band level (0-3) of the week grid at a given time ("driving day": 00-06 belongs to the day before).
function levelAt(grid, when) {
  let d = dayIdx(when), h = when.getHours();
  if (h < 6) { d = (d + 6) % 7; h += 24; }
  const b = BANDS.findIndex(([s, e]) => h >= s && h < e);
  return b < 0 ? 0 : grid[d][b];
}

// Hour-by-hour outlook for a town: typical level, raised by events finishing (90-minute rush) and rain.
export function hourlyOutlook(townId, events, weather, now = new Date(), hours = 8) {
  const grid = weekGrid(townId, events, startOfWeek(now));
  const start = new Date(now); start.setMinutes(0, 0, 0);
  const out = [];
  for (let i = 0; i < hours; i++) {
    const at = new Date(start.getTime() + i * 3600e3);
    const next = new Date(at.getTime() + 3600e3);
    const rush = events.filter((e) => e.town === townId && (() => {
      const end = eventEnd(e);
      return end < next && new Date(end.getTime() + 90 * 60e3) > at;
    })());
    const wx = weatherAt(weather, townId, at);
    let level = levelAt(grid, at);
    if (rush.length) level += rush.some((e) => e.size === "big") ? 2 : 1;
    if (wx && wx.rain) level += 1;
    out.push({ at, level: Math.min(3, level), events: rush, rain: !!(wx && wx.rain), temp: wx ? wx.temp : null });
  }
  return out;
}

// The best stretch of the outlook: the longest run at the highest level reached (level 2 or more).
export function bestWindow(outlook) {
  const top = Math.max(0, ...outlook.map((h) => h.level));
  if (top < 2) return null;
  let best = null, run = null;
  outlook.forEach((h, i) => {
    if (h.level === top) { run = run ? { ...run, to: i } : { from: i, to: i }; }
    else run = null;
    if (run && (!best || run.to - run.from > best.to - best.from)) best = { ...run };
  });
  const slice = outlook.slice(best.from, best.to + 1);
  return {
    start: outlook[best.from].at,
    end: new Date(outlook[best.to].at.getTime() + 3600e3),
    level: top,
    events: [...new Map(slice.flatMap((h) => h.events).map((e) => [e.id || e.name, e])).values()],
    rain: slice.some((h) => h.rain),
  };
}

const IMPACT = { small: 1, medium: 2, big: 4 };

// Towns ranked by event demand between from and to (by events finishing in that window).
export function hotTowns(events, from, to, limit = 5) {
  const by = new Map();
  for (const e of events) {
    const end = eventEnd(e);
    if (!e.town || end < from || end > to) continue;
    const x = by.get(e.town) || { town: e.town, score: 0, count: 0, big: 0 };
    x.score += IMPACT[e.size] || 2; x.count++; if (e.size === "big") x.big++;
    by.set(e.town, x);
  }
  return [...by.values()].sort((a, b) => b.score - a.score || b.big - a.big).slice(0, limit);
}

// Events for the radar: filter by period, size and distance from a town; sorted by finish time.
export function radarEvents(events, { period = "tonight", bigOnly = false, nearTown = null, nearMiles = 25 } = {}, now = new Date()) {
  const from = new Date(now.getTime() - 30 * 60e3);
  let to;
  if (period === "tonight") { to = new Date(now); to.setHours(30, 0, 0, 0); }          // until 06:00 tomorrow
  else if (period === "weekend") {
    const d = dayIdx(now); to = new Date(now); to.setDate(to.getDate() + (6 - d)); to.setHours(30, 0, 0, 0);
  } else { to = new Date(now.getTime() + (period === "month" ? 30 : 7) * 864e5); }
  return events
    .map((e) => ({ ...e, _end: eventEnd(e), _mi: nearTown && e.lat != null ? km(nearTown.lat, nearTown.lon, e.lat, e.lon) / 1.609344
      : nearTown && e.town ? (() => { const t = TOWNS.find((x) => x.id === e.town); return t ? km(nearTown.lat, nearTown.lon, t.lat, t.lon) / 1.609344 : null; })() : null }))
    .filter((e) => e._end >= from && e._end <= to && (!bigOnly || e.size === "big") && (!nearTown || (e._mi != null && e._mi <= nearMiles)))
    .sort((a, b) => a._end - b._end);
}
