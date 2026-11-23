// Driver news: turns the live feed (events, fixtures, weather, flood warnings, bank holidays) and the
// driver's own notes into short headlines. "now" = happening or due in the next 24 hours; "earlier" = the last 24 hours.
// Pure functions: the app passes in the data and the time, so tests can run without a browser.
import { eventEnd, weatherAt } from "./demand.js";

const H = 3600e3;
const RUSH_MIN = 90;          // the rush after an event finishes
const HEAVY_MM = 4;           // mm of rain in an hour counted as heavy
const ICE_C = 0.5;            // at or below this, warn about ice

const venueOf = (e) => e.venue || "";

// Each item: { id, kind, tone, at (Date), key, params, past, town }
// kind: flood | weather | rush | event | big | bank | note      tone: alert | warn | good | info
export function buildNews({ events = [], floods = [], weather = null, bankHolidays = [], notes = [], town = null, townName = "" }, now = new Date()) {
  const out = [];
  const dayAgo = new Date(now.getTime() - 24 * H), dayAhead = new Date(now.getTime() + 24 * H);

  // Flood warnings (Environment Agency): severe and warnings first, alerts after, lifted ones as "earlier"
  for (const f of floods) {
    const at = new Date(f.changed || f.raised || now);
    if (f.severity === 4) {
      if (at >= dayAgo) out.push({ id: "fl-" + f.id, kind: "flood", tone: "info", at, key: "news.floodLifted", params: { area: f.area }, past: true });
      continue;
    }
    const key = f.severity === 1 ? "news.floodSevere" : f.severity === 2 ? "news.flood" : "news.floodAlert";
    out.push({ id: "fl-" + f.id, kind: "flood", tone: f.severity <= 2 ? "alert" : "warn", at, key, params: { area: f.area }, past: false, rank: f.severity });
  }

  // Weather for the driver's town: first heavy rain, first rain, first near-freezing hour in the next 24 hours
  if (town && weather) {
    let rain = null, heavy = null, ice = null;
    for (let i = 0; i < 24; i++) {
      const at = new Date(now.getTime() + i * H); at.setMinutes(0, 0, 0);
      const w = weatherAt(weather, town, at);
      if (!w) continue;
      if (!heavy && (w.mm ?? 0) >= HEAVY_MM) heavy = at;
      if (!rain && w.rain) rain = at;
      if (!ice && w.temp != null && w.temp <= ICE_C) ice = at;
    }
    if (heavy) out.push({ id: "wx-heavy", kind: "weather", tone: "warn", at: heavy, key: "news.heavyRain", params: { town: townName, time: heavy }, past: false });
    else if (rain) out.push({ id: "wx-rain", kind: "weather", tone: "good", at: rain, key: "news.rain", params: { town: townName, time: rain }, past: false });
    if (ice) out.push({ id: "wx-ice", kind: "weather", tone: "warn", at: ice, key: "news.ice", params: { town: townName, time: ice }, past: false });
  }

  // Events: rush now (anywhere, big ones; any size in my town), finishing later today, finished earlier
  let bigToday = 0;
  for (const e of events) {
    const end = eventEnd(e);
    const mine = town && e.town === town;
    const rushEnd = new Date(end.getTime() + RUSH_MIN * 60e3);
    if (e.size === "big" && end.toDateString() === now.toDateString()) bigToday++;
    if (!mine && e.size !== "big") continue;
    const p = { name: e.name, venue: venueOf(e), time: end };
    if (end <= now && rushEnd > now) out.push({ id: "ev-" + (e.id || e.name), kind: "rush", tone: "good", at: end, key: "news.rushNow", params: p, past: false, town: e.town });
    else if (end > now && end <= dayAhead) out.push({ id: "ev-" + (e.id || e.name), kind: "event", tone: e.size === "big" ? "good" : "info", at: end, key: "news.finishes", params: p, past: false, town: e.town });
    else if (rushEnd <= now && end >= dayAgo) out.push({ id: "ev-" + (e.id || e.name), kind: "event", tone: "info", at: end, key: "news.finished", params: p, past: true, town: e.town });
  }
  if (bigToday >= 2) {
    const at = new Date(now); at.setHours(6, 0, 0, 0);
    out.push({ id: "big-day", kind: "big", tone: "good", at, key: "news.bigDay", params: { n: bigToday }, past: false });
  }

  // Bank holiday in the next 7 days
  for (const b of bankHolidays) {
    const d = new Date(b.date + "T00:00");
    if (d >= new Date(now.getTime() - 12 * H) && d <= new Date(now.getTime() + 7 * 24 * H)) {
      out.push({ id: "bank-" + b.date, kind: "bank", tone: "info", at: d, key: "news.bank", params: { name: b.title, date: d }, past: false });
    }
  }

  // The driver's own notes for this town (last 3 hours)
  for (const n of notes) {
    if (town && n.town !== town) continue;
    if (now - n.at > 3 * H) continue;
    out.push({ id: "note-" + n.id, kind: "note", tone: "info", at: new Date(n.at), key: "news.note", params: { text: n.text }, past: false });
  }

  const toneRank = { alert: 0, warn: 1, good: 2, info: 3 };
  const nowItems = out.filter((x) => !x.past).sort((a, b) =>
    (a.kind === "rush" ? -1 : 0) - (b.kind === "rush" ? -1 : 0) || toneRank[a.tone] - toneRank[b.tone] || a.at - b.at);
  const earlier = out.filter((x) => x.past).sort((a, b) => b.at - a.at);
  return { now: nowItems, earlier };
}
