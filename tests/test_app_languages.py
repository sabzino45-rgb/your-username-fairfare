"""Every app language has every English string, with the same {placeholders}."""
import json
import os
import re

ROOT = os.path.join(os.path.dirname(__file__), "..", "app")
LANG = os.path.join(ROOT, "lang")


def test_every_language_complete():
    en = json.load(open(os.path.join(LANG, "en.json"), encoding="utf-8"))
    keys = [k for k in en if not k.startswith("_")]
    for name in os.listdir(LANG):
        d = json.load(open(os.path.join(LANG, name), encoding="utf-8"))
        assert [k for k in keys if k not in d] == [], name
        for k in keys:
            assert set(re.findall(r"\{\w+\}", en[k])) == set(re.findall(r"\{\w+\}", d[k])), (name, k)


def test_language_list_matches_files():
    src = open(os.path.join(ROOT, "js", "i18n.js"), encoding="utf-8").read()
    listed = set(re.findall(r'\["([a-z]+)", "', src))
    files = {n[:-5] for n in os.listdir(LANG)}
    assert listed == files
