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
    word = body.rfind('<div class="word">')
    details = body.index("<details", word)
    readout, rng = body.index("${readout}", word), body.index('class="range"', word)
    assert word < details < readout < rng, "readout and numbers must sit inside Details"
    assert 'id="readout"' not in app, "the parsed-numbers readout must not sit outside Details"
    # Details stays open only for the same offer generation, not just identical numbers (QA #15)
    assert "verdictGen === offerGen" in body


def test_scan_clears_old_verdict_and_drops_stale_results():
    app = read("js", "app.js")
    scan = app[app.index("async function scanImage"):app.index("function saveOffer")]
    assert "++scanSeq" in scan and "my !== scanSeq" in scan, "stale OCR results must be ignored"
    reading = scan.index('scanState = "reading"')
    assert reading < scan.index("updateCheck()", reading) < scan.index("loadTesseract()"), \
        "the old verdict must be cleared before OCR starts"
    assert 'finish("failed")' in scan
    body = app[app.index("function updateCheck"):]
    assert body.index("if (scanState)") < body.index("estimate(o, s)"), "scan state overrides any old verdict"


def test_text_capped_and_word_never_breaks():
    app, css = read("js", "app.js"), read("styles.css")
    assert "const MAX_TEXT = 5000" in app and 'maxlength="${MAX_TEXT}"' in app
    assert ".slice(0, MAX_TEXT)" in app
    word = re.search(r"\n\.word \{([^}]*)\}", css).group(1)
    assert "white-space: nowrap" in word and "overflow-wrap: anywhere" not in word
    assert "function fitWord" in app
