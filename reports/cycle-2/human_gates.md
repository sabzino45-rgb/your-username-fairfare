# Human gates - cycle 2

_Cycle 1's open items (reports/cycle-1/human_gates.md) still apply and are not repeated here._

- [ ] Product/Shipping: the cycle-2 "fare zone" rule assumes a real Uber UK offer card shows the product label (UberX, Comfort, ...) above the fare, the fare above the pickup and trip lines, and that an amount on the Accept button is the offer's own fare. This is unverified on real screenshots. Owner confirms the layout against at least 10 real, redacted offer screenshots (collected under cycle 1's privacy gate) before the cycle-2 reader ships to any driver, and accepts that until then every accuracy figure is synthetic.
- [ ] Accept or reject the remaining reader risk (QA cycle 2, "c17 hole"): if OCR misses the card's own fare completely AND a second amount as big as the fare sits inside the offer card, a scanned screenshot can show a false ACCEPT. QA could only trigger it with a deliberately thin, pale-grey fare; 0 false ACCEPTs across 158 realistic scans. If you don't accept it, cycle 2 counts as BLOCK.
- [ ] Accept or reject the pasted-text risk (QA medium): offers pasted as text, whose fare line is already missing, can still be fooled into a false ACCEPT (4 made-up cases). Screenshots are protected by the size check; pasted text has no sizes. Option: turn off pasting offer text and keep screenshots plus typing.
