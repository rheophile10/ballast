# Ballast — file formats, version 1

Ballast is a serverless test system: one `index.html`, no network, WebCrypto only.
Everything that travels is ASCII-armored text so it survives email, Teams, renaming,
and pasting into a message body.

## 1. Armor

```
-----BEGIN BALLAST <KIND>-----
version: 1
<key>: <value>          (zero or more header lines; informational, never trusted)
sha256: <hex of body bytes>

<base64 of body bytes, 76 columns>
-----END BALLAST <KIND>-----
```

KIND is one of `TIE`, `SPIKE`, `PLATE`, `BED`. The body is UTF-8 JSON. A reader
strips all whitespace from the base64, decodes, checks `sha256`, then parses.
The file extension is never consulted.

Header lines are a courtesy for humans (which test, how many items) and are
re-derived from the body; nothing in them is authoritative.

## 2. Primitives (all WebCrypto; all also in Python `cryptography`)

| purpose            | primitive                                             |
|--------------------|-------------------------------------------------------|
| identity keys      | ECDH P-256; public key = raw uncompressed point, 65 B |
| key agreement      | ECDH → 32 B shared bits                               |
| key derivation     | HKDF-SHA-256(shared, salt, info) → 32 B               |
| encryption         | AES-256-GCM, 12 B random nonce, 16 B tag              |
| passphrase (BED)   | PBKDF2-HMAC-SHA-256, 600 000 iterations, 16 B salt    |
| hashing            | SHA-256                                               |

Binary fields are base64url without padding. A **box** is `nonce ‖ ciphertext‖tag`
as one base64url string. HKDF salt is always the test's 16-byte `salt`.

## 3. Identity

Every party has one ECDH P-256 keypair. Students keep theirs non-extractable in the
browser; instructors keep theirs inside their `.bed`. The **shared secret** between an
instructor and a student, `ECDH(a_priv, b_pub) = ECDH(b_priv, a_pub)`, is unique to the
pair, so a box under a key derived from it is both confidential to the pair and
authenticated as coming from the other party.

`sid = base64url(SHA-256(salt ‖ utf8(pin))[0:16])` identifies a student inside a
test without exposing the PIN.

## 4. Badge (PNG)

A square photo with a QR code (error correction H) in the lower-right quadrant
encoding `B1|<name>|<pin>|<pub base64url>`. Read from the pixels, never from
metadata, so it survives re-encoding and screenshots.

## 5. TIE — the test, one file for the class

```json
{ "v": 1, "kind": "tie",
  "id": "<base64url 16 B random>",
  "salt": "<base64url 16 B random>",
  "title": "Test 3 · Block C",
  "settings": { "time": 5400, "pass": 0.9, "shuffleItems": true,
                "shuffleOptions": true, "allowBack": false },
  "areas": [ { "id": "signals", "label": "Signals & Rule 27" }, ... ],
  "instructor": "<pub base64url>",
  "wraps": [ { "sid": "...", "box": "<K wrapped>" }, ... ],
  "items": [ { "id": "q27b", "area": "signals", "box": "<item JSON encrypted>" }, ... ],
  "hash": "<SHA-256 hex over items[].id ‖ items[].box in order>" }
```

- `K` is a random 32 B content key. Each wrap: `AES-GCM(HKDF(shared_i, salt, "ballast/wrap/1"), K)`.
- Each item is encrypted under its own `K_item = HKDF(K, salt, "ballast/item/1/" ‖ id)`,
  so a reader decrypts one item at a time and never holds the whole test in clear.
- Item plaintext: `{ "id", "type": "mc"|"match"|"short", "prompt", "options": [{"id","text"}],
  "pairs": [...], "ref": ["CROR 27(b)"], "area", "lcr", "tags": [], "svg": "<spec>",
  "img": [{"name","mime","b64","alt"}] }`. **No answers.**
- Display order of items and options for a student is a deterministic shuffle seeded
  by `sid`; both sides can reproduce it. Answers are recorded by item id and option id,
  never by position.

## 6. SPIKE — one student's attempt

```json
{ "v": 1, "kind": "spike", "tie": "<tie id>", "hash": "<tie hash>", "sid": "...",
  "pin": "123456", "student": "<pub base64url>",
  "box": "<attempt encrypted under HKDF(shared, salt, 'ballast/spike/1')>" }
```

Attempt plaintext: `{ "started", "finished", "answers": { "<item id>": <value> },
"events": [ [t_ms, "show"|"answer"|"blur"|"focus"|"fullscreen-exit"|"lock"|"submit", ...] ],
"breaks": [ { "at", "ms", "why" } ], "ua": "…" }`. Values: mc → option id;
match → `{left id: right id}`; short → string.

GCM under the pair key is the signature: only this student could have made it,
only this instructor can read it.

## 7. PLATE — the result returned to the student

Encrypted under `HKDF(shared, salt, "ballast/plate/1")`:
`{ "tie", "title", "pin", "score", "total", "grade", "pass",
"areas": [{ "id", "label", "correct", "total" }],
"read": [ { "ref": "CROR 27(b)", "area": "signals", "missed": 2 } ],
"tags": { "difficulty:2": {"correct","total"} } }`.
No questions, no answers.

## 8. BED — the instructor's own file

`{ "v":1, "kind":"bed", "kdf": {"salt","iter"}, "box": "<AES-GCM under PBKDF2 key>" }`
containing `{ "instructor": { "name", "priv" (JWK), "pub" }, "roster": [ { "name",
"pin", "pub", "photo"? } ], "tests": [ { "title", "source" (txt), "assets": {name:
{mime,b64}}, "tie": { id, salt, hash, key K } } ], "attempts": [...], "marks": {...} }`.
The only place answers, K, and the private key exist.

## 9. Scoring

`mc`: 1 if answer == key option id. `match`: 1 per correct pair, item worth `pairs.length`.
`short`: 0 until the instructor marks it (model answer shown); marks live in the BED.
Grade = Σ item scores / Σ item worth. Area and tag rollups are the same sums over
the items carrying that area/tag. Anyone holding the BED (or the instructor key and
the source) can re-score any SPIKE and must get the same numbers — `verify.py` does.

## 10. Test source (`.txt`)

```
# Test 3 · Block C
time: 90m
pass: 90%
shuffle: items options
back: no
areas: definitions "Definitions" · signals "Signals & Rule 27" · ocs "OCS"

---
id: q27b
type: mc
area: signals
ref: CROR 27(b)
lcr: none
tags: imperfect-display exception difficulty:2
svg: signal G,x,R
Q: What is the indication of this signal?
*a) Proceed, reducing to slow speed through turnouts, preparing to stop at next signal.
b) Clear signal.
c) Stop signal.
---
type: match
area: definitions
Q: Match the term to the definition.
L: Reduced speed = A speed that will permit stopping within one half the range of vision of equipment.
L: Transfer = An engine ... not exceeding 15 MPH ...
---
type: short
area: ocs
ref: CROR 302(b)
img: clearance-134.png
alt: OCS clearance 134 to CN 5411
Q: What must be verified before the clearance is acted upon?
A: conductor and LE each have a copy; designation and engine number verified
```

`id:` is optional (derived from a hash of the prompt when absent). `Q:` may run
over several lines until the first option/pair/answer line. `*` marks the key.
`L: left = right` defines a matching pair. `img:` names a file the instructor drops
alongside the source; `alt:` describes it. Unknown keys are kept as tags.
