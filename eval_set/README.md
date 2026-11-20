# eval_set

One JSON object per line, in any *.jsonl file:

```json
{"id": "pilot-0001", "origin": "pilot", "ocr_text": "<REDACTED text via tools/redact.py>",
 "expected_fields": {"fare": 12.4, "pickup_min": 6, "pickup_miles": 1.8, "trip_min": 18, "trip_miles": 7.2},
 "outcome": {"take_home": 10.1, "minutes": 31.0, "miles": 10.4},
 "profile": {"cost_per_mile": 0.2}}
```

- Never commit images, only redacted text. A human checks every redaction.
- Use `null` in expected_fields when the field really isn't on the card. The parser should then return None rather than guess.
- `outcome` is what the trip really paid after costs, from the driver's log. Leave it out if unknown.
- synthetic.jsonl comes from tools/make_synthetic.py. Delete it once there are enough pilot cases.
