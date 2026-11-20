"""Redact OCR text before it is added to eval_set/. Owned by Privacy/Compliance.

Usage: python tools/redact.py < raw_ocr.txt > redacted.txt

Removes: UK postcodes, street addresses, phone numbers, emails, and lines that
look like a rider's name. Keeps the numbers the parser needs. This is a
best-effort filter; a human must still eyeball every case before committing.
Images themselves must never be committed - only redacted text.
"""

from __future__ import annotations

import re
import sys

POSTCODE = re.compile(r"\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b", re.I)
PHONE = re.compile(r"(?:\+44\s?|0)\d{3,4}[\s-]?\d{3}[\s-]?\d{3,4}")
EMAIL = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.]+\b")
STREET = re.compile(
    r"\b\d{0,4}\s*[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\s(?:Road|Rd|Street|St|Avenue|Ave|Lane|Ln|Close|Way|"
    r"Drive|Dr|Place|Pl|Crescent|Terrace|Gardens|Court|Square|Hill|Park)\b\.?"
)
# A line that is only 1-3 capitalised words (e.g. "Sarah", "Sarah K.") is treated as a name.
NAME_LINE = re.compile(r"^\s*[A-Z][a-z]+(?:\s[A-Z][a-z]*\.?){0,2}\s*$")
KEEP_WORDS = {"Uber", "UberX", "Comfort", "Exclusive", "Accept", "Match", "Priority", "Green", "Pet", "XL"}


def redact(text: str) -> str:
    out = []
    for line in text.splitlines():
        if NAME_LINE.match(line) and line.strip().split()[0] not in KEEP_WORDS:
            out.append("[NAME]")
            continue
        line = EMAIL.sub("[EMAIL]", line)
        line = PHONE.sub("[PHONE]", line)
        line = POSTCODE.sub("[POSTCODE]", line)
        line = STREET.sub("[ADDRESS]", line)
        out.append(line)
    return "\n".join(out)


if __name__ == "__main__":
    sys.stdout.write(redact(sys.stdin.read()))
