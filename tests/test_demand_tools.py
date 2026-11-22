"""Planning and motivation helpers (app/js/demand.js, app/js/progress.js), run in Node."""
import json
import os
import shutil
import subprocess

import pytest

APP = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "app", "js"))

JS = """
import * as D from 'file://%(app)s/demand.js';
import * as P from 'file://%(app)s/progress.js';
const now = new Date('2026-11-21T19:30:00');            // Saturday evening
const ev = [
  { id: 'a', town: 'exeter', name: 'Chiefs', date: '2026-11-21', end: '21:45', size: 'big', lat: 50.709, lon: -3.469 },
  { id: 'b', town: 'plymouth', name: 'Gig', date: '2026-11-21', end: '22:30', size: 'medium' },
  { id: 'c', town: 'bristol', name: 'Next week', date: '2026-11-27', end: '22:00', size: 'big' },
];
const weather = { start: '2026-11-21T19:00', towns: { exeter: { p: [10, 10, 20, 90, 90, 10, 10, 10, 10], r: [0,0,0,1.2,0.8,0,0,0,0], t: [9,9,8,8,8,7,7,7,7] } } };
const out = D.hourlyOutlook('exeter', ev, weather, now, 8);
const best = D.bestWindow(out);
const hot = D.hotTowns(ev, now, new Date(now.getTime() + 48 * 3600e3));
const tonight = D.radarEvents(ev, { period: 'tonight' }, now).map((e) => e.id);
const week = D.radarEvents(ev, { period: 'week' }, now).map((e) => e.id);
const near = D.radarEvents(ev, { period: 'week', nearTown: { lat: 50.718, lon: -3.534 }, nearMiles: 25 }, now).map((e) => e.id);
const H = (h, m, take, mins, st = 'took') => ({ at: new Date(2026, 10, 21, h, m).getTime(), take, minutes: mins, status: st });
const hist = [H(18, 0, 20, 20), H(19, 0, 15, 15), H(12, 0, 50, 30, 'passed')];
const prev = (d, take) => ({ at: new Date(2026, 10, 21 - d, 20, 0).getTime(), take, minutes: 30, status: 'took' });
const streakHist = [...hist, prev(1, 210), prev(2, 205), prev(4, 300)];
const stats = P.todayStats(hist, now);
console.log(JSON.stringify({
  levels: out.map((h) => h.level), rain: out.map((h) => h.rain), eventsAt: out.map((h) => h.events.length),
  best: best && [best.start.getHours(), best.end.getHours(), best.events.map((e) => e.id), best.rain],
  hot: hot.map((x) => x.town), tonight, week, near,
  stats, pace: P.pace(stats, 200, 8, now), streak: P.goalStreak(streakHist, 200, now),
  bestTime: P.bestTime([...hist, H(19, 30, 30, 15)], 3),
  late: P.drivingDay(new Date(2026, 10, 22, 2, 0).getTime()),
}));
"""


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
def test_planning_and_progress():
    r = subprocess.run(["node", "--input-type=module", "-e", JS % {"app": APP}], capture_output=True, text=True, check=True)
    o = json.loads(r.stdout)
    assert o["rain"][3] and o["rain"][4] and not o["rain"][0]            # 22:00-23:00 rain
    assert o["eventsAt"][2] == 1 and o["eventsAt"][3] == 1                # Chiefs rush 21:45-23:15
    assert all(0 <= l <= 3 for l in o["levels"])
    assert o["best"] is not None and "a" in o["best"][2]                  # best window includes the Chiefs rush
    assert o["hot"] == ["exeter", "plymouth"]                              # next week's event is outside 48 h
    assert o["tonight"] == ["a", "b"] and o["week"] == ["a", "b", "c"]
    assert o["near"] == ["a"]                                              # Plymouth and Bristol are over 25 mi from Exeter
    assert o["stats"]["rides"] == 2 and o["stats"]["take"] == 35
    assert o["pace"]["state"] == "behind" and o["pace"]["need"] > 25
    assert o["streak"] == 2                                                # yesterday and the day before; gap at day 3
    assert o["bestTime"]["rides"] == 3 and o["bestTime"]["band"] == 3      # Sat 18-22
    assert o["late"] == "2026-11-21"                                       # 02:00 belongs to the previous driving day
