"""The screenshot reader must run from FairFare's own site: no third-party script or data host."""
import os
import re

APP = os.path.join(os.path.dirname(__file__), "..", "app")
VENDOR = os.path.join(APP, "vendor", "tesseract")


def test_engine_files_are_vendored():
    for f in ("tesseract.min.js", "worker.min.js", "tesseract-core-lstm.wasm.js",
              "tesseract-core-simd-lstm.wasm.js", os.path.join("lang", "eng.traineddata.gz.wasm"), "fairfare-worker.js"):
        assert os.path.getsize(os.path.join(VENDOR, f)) > 100, f


def test_app_code_contacts_no_outside_host():
    for root, _, files in os.walk(APP):
        if "vendor" in root:
            continue
        for name in files:
            if name.endswith((".js", ".html", ".css", ".webmanifest")):
                src = open(os.path.join(root, name), encoding="utf-8").read()
                hosts = re.findall(r"https?://([a-z0-9.-]+)", src)
                assert not hosts, (name, hosts)
