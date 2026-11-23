"""Driver news headlines (app/js/news.js), run in Node."""
import json
import os
import shutil
import subprocess

import pytest

APP = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "app", "js"))

JS = """
import * as N from 'file://%(app)s/news.js';
const now = new Date('2026-11-21T21:00:00');
const events = [
  { id: 'rush', town: 'exeter', name: 'Chiefs', venue: 'Sandy Park', date: '2026-11-21', end: '20:30', size: 'big' },
  { id: 'later', town: 'exeter', name: 'Gig', date: '2026-11-21', end: '23:00', size: 'small' },
  { id: 'far-small', town: 'penzance', name: 'Quiz', date: '2026-11-21', end: '22:00', size: 'small' },
  { id: 'far-big', town: 'bristol', name: 'Arena', date: '2026-11-21', end: '22:30', size: 'big' },
  { id: 'done', town: 'exeter', name: 'Matinee', date: '2026-11-21', end: '16:00', size: 'medium' },
];
const floods = [
  { id: 'f1', area: 'River Exe', severity: 2, raised: '2026-11-21T18:00:00' },
  { id: 'f2', area: 'River Parrett', severity: 4, changed: '2026-11-21T15:00:00' },
  { id: 'f3', area: 'River Axe', severity: 3, raised: '2026-11-21T17:00:00' },
];
const weather = { start: '2026-11-21T21:00', towns: { exeter: { p: [10, 80, 90], r: [0, 1, 5], t: [3, 1, 0] } } };
const notes = [{ id: 'n1', town: 'exeter', text: 'M5 slow', at: now.getTime() - 3600e3 }, { id: 'n2', town: 'bristol', text: 'x', at: now.getTime() }];
const r = N.buildNews({ events, floods, weather, notes, bankHolidays: [{ date: '2026-12-25', title: 'Christmas Day' }], town: 'exeter', townName: 'Exeter' }, now);
console.log(JSON.stringify({ now: r.now.map((x) => x.id + ':' + x.tone), earlier: r.earlier.map((x) => x.id) }));
"""


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
def test_news_headlines():
    r = subprocess.run(["node", "--input-type=module", "-e", JS % {"app": APP}], capture_output=True, text=True, check=True)
    o = json.loads(r.stdout)
    ids = [x.split(":")[0] for x in o["now"]]
    assert ids[0] == "ev-rush"                                   # a rush happening now comes first
    assert "fl-f1:alert" in o["now"] and "fl-f3:warn" in o["now"]
    assert ids.index("fl-f1") < ids.index("fl-f3")               # warnings before alerts
    assert "ev-later" in ids and "ev-far-big" in ids and "ev-far-small" not in ids   # small events elsewhere are left out
    assert "wx-heavy" in ids and "wx-ice" in ids and "wx-rain" not in ids
    assert "note-n1" in ids and "note-n2" not in ids             # only this town's notes
    assert "big-day" in ids                                       # 2 big events today
    assert not any(i.startswith("bank-") for i in ids)            # Christmas is more than 7 days away
    assert o["earlier"] == ["ev-done", "fl-f2"]                  # newest first
