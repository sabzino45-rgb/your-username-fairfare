// Shift progress and personal bests, from the driver's own History (rides marked "Took it").
// Everything here is computed on the phone; nothing is sent anywhere.
import { BANDS } from "./southwest.js";
import { dayIdx } from "./demand.js";

// A "driving day" runs 05:00 to 05:00, so a late shift counts as one day.
export function drivingDay(ts) {
  const d = new Date(ts - 5 * 3600e3);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function todayStats(history, now = new Date()) {
  const today = drivingDay(now.getTime());
  const rides = history.filter((x) => x.status === "took" && drivingDay(x.at) === today);
  const take = rides.reduce((a, x) => a + (x.take || 0), 0);
  const first = rides.length ? Math.min(...rides.map((x) => x.at)) : null;
  return { rides: rides.length, take, first };
}

// Pace against the shift goal: hours left counted from the first ride today.
export function pace(stats, goal, shiftHours, now = new Date()) {
  if (!goal || !shiftHours) return null;
  const pct = Math.max(0, Math.min(1, stats.take / goal));
  if (stats.take >= goal) return { pct: 1, state: "done" };
  if (!stats.first) return { pct, state: "notStarted" };
  const elapsed = (now - stats.first) / 3600e3;
  const left = Math.max(0.5, shiftHours - elapsed);
  const need = (goal - stats.take) / left;
  const expected = goal * Math.min(1, elapsed / shiftHours);
  return { pct, state: stats.take >= expected * 0.95 ? "onPace" : "behind", need, hoursLeft: left };
}

// Consecutive driving days (ending today or yesterday) where taken rides reached the goal.
export function goalStreak(history, goal, now = new Date()) {
  if (!goal) return 0;
  const sums = new Map();
  for (const x of history) if (x.status === "took") sums.set(drivingDay(x.at), (sums.get(drivingDay(x.at)) || 0) + (x.take || 0));
  let n = 0;
  const day = new Date(now.getTime());
  if ((sums.get(drivingDay(day.getTime())) || 0) < goal) day.setDate(day.getDate() - 1);   // today may still be in progress
  while ((sums.get(drivingDay(day.getTime())) || 0) >= goal) { n++; day.setDate(day.getDate() - 1); }
  return n;
}

// The driver's best day-and-band by take-home per hour (needs at least 3 rides there).
export function bestTime(history, minRides = 3) {
  const cells = new Map();
  for (const x of history) {
    if (x.status !== "took" || !x.minutes) continue;
    const d0 = new Date(x.at);
    let d = dayIdx(d0), h = d0.getHours();
    if (h < 6) { d = (d + 6) % 7; h += 24; }
    const b = BANDS.findIndex(([s, e]) => h >= s && h < e);
    if (b < 0) continue;
    const k = `${d}:${b}`;
    const c = cells.get(k) || { day: d, band: b, take: 0, minutes: 0, rides: 0 };
    c.take += x.take || 0; c.minutes += x.minutes; c.rides++;
    cells.set(k, c);
  }
  const ok = [...cells.values()].filter((c) => c.rides >= minRides);
  if (!ok.length) return null;
  const best = ok.sort((a, b) => b.take / b.minutes - a.take / a.minutes)[0];
  return { ...best, perHr: best.take / (best.minutes / 60) };
}
