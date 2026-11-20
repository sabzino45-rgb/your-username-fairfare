"""R1/R2 app checks: share target in the manifest and sw.js, and verdict words per SAFETY.md."""
import json
import os
import re

APP = os.path.join(os.path.dirname(__file__), "..", "app")


def read(*p):
    return open(os.path.join(APP, *p), encoding="utf-8").read()


def test_manifest_share_target():
    m = json.loads(read("manifest.webmanifest"))
    st = m["share_target"]
    assert st["method"] == "POST"
    assert st["enctype"] == "multipart/form-data"
    files = st["params"]["files"]
    assert len(files) == 1 and files[0]["name"] == "image"
    assert "image/*" in files[0]["accept"]
    # Relative action inside the app scope (the app lives under a GitHub Pages sub-path)
    action = st["action"]
    assert not action.startswith("/") and "://" not in action and ".." not in action
    assert m["scope"] == "./"


def test_sw_handles_share_post_before_get_only_return():
    sw = read("sw.js")
    action = json.loads(read("manifest.webmanifest"))["share_target"]["action"].lstrip("./")
    assert f'"{action}"' in sw
    fetch = sw[sw.index('addEventListener("fetch"'):]
    post = fetch.index('method === "POST"')
    get_only = fetch.index('method !== "GET"')
    assert post < get_only, "share POST must be handled before the GET-only early return"
    assert "formData()" in sw and "303" in sw
    form_field = json.loads(read("manifest.webmanifest"))["share_target"]["params"]["files"][0]["name"]
    assert f'getAll("{form_field}")' in sw


def test_sw_cache_bumped_and_share_names_match_page():
    sw, app = read("sw.js"), read("js", "app.js")
    assert re.search(r'const CACHE = "fairfare-v(\d+)"', sw).group(1) != "1"
    for name in ("SHARE_CACHE", "SHARE_KEY"):
        val = re.search(rf'const {name} = "([^"]+)"', sw).group(1)
        assert f'const {name} = "{val}"' in app, name
    # The page deletes the hand-off cache after reading it
    assert "caches.delete(SHARE_CACHE)" in app


def test_verdict_words_follow_safety_md():
    en = json.loads(read("lang", "en.json"))
    assert (en["v.ACCEPT"], en["v.MARGINAL"], en["v.DECLINE"]) == ("ACCEPT", "MARGINAL", "DECLINE")
    for k, v in en.items():
        if k.startswith(("v.", "check.", "history.")):
            assert not re.search(r"\b(MAYBE|SKIP)\b", v), k


def test_numbers_behind_details():
    app = read("js", "app.js")
    body = app[app.index("function updateCheck"):app.index("let tesseractLoading")]
    word, details, rng = body.rfind('<div class="word">'), body.index("<details"), body.index('class="range"')
    assert word < details < rng
    assert "<details" in body and " open" in body  # open only when kept for the same verdict
