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

KIND is one of `PROFILE`, `TEST`, `RELEASE`, `CANCEL`, `SHEET`, `BOOK`, `APPROVAL`, `REPORT`.
Every Ballast file is one of these; nothing is ever a binary file. The body is UTF-8 JSON. A reader
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

## 3. Identity — PROFILE

Every party (crew, RTC, superintendent) has an ECDH P-256 pair (to seal) and an ECDSA
P-256 pair (to sign). Crew keep theirs non-extractable in the browser; RTCs and
superintendents keep theirs inside their SHEET / BOOK. The public halves, name, PIN, role
and a 240 px JPEG photo travel as a `PROFILE`:
`{ "v":1, "kind":"profile", "role":"none"|"crew"|"rtc"|"superintendent", "name", "pin", "photo": "<base64 jpeg>", "pub": "<ECDH raw>", "sig": "<ECDSA raw>", "minted"? }`.

**Roles are minted.** A fresh registration has `role: "none"`. A role is granted by someone
entitled to grant it — superintendents mint RTCs, RTCs mint crew, the first superintendent
mints themself (root) — who signs it and dates it:
`"minted": { "role", "start": "YYYY-MM-DD", "by": { "name", "pin", "sig", "role" }, "signature" }`
where `signature` is ECDSA-SHA256 by `by.sig` over
`"ballast/mint/1\n<role>\n<start>\n<pin>\n<pub>\n<sig>\n<by.sig>"`.
A reader refuses any profile whose role is not `none` and whose mint does not verify, whose
minter's role is not the one entitled to grant it, or whose superintendent mint is not self-signed.
The minted profile goes back to its owner, who drops it into the browser that holds the keys;
only then does the page show that role's home. The **shared secret** between an
instructor and a student, `ECDH(a_priv, b_pub) = ECDH(b_priv, a_pub)`, is unique to the
pair, so a box under a key derived from it is both confidential to the pair and
authenticated as coming from the other party.

`sid = base64url(SHA-256(salt ‖ utf8(pin))[0:16])` identifies a student inside a
test without exposing the PIN.

## 4. APPROVAL and REPORT (superintendent)

APPROVAL carries `pub` (the superintendent's ECDH key) as well as `by` (their sign key), so
releases under the approved test can carry an audit copy sealed to them. REPORT rows carry
`release` (hash), `signed`, `late` and `marks: [[item id, got], ...]`, so an audit can be
compared item by item with what the RTC reported.

`APPROVAL`: `{ "hash": SHA-256 hex of the test source (CRLF→LF), "title", "by": <superintendent
sig key>, "name", "signature": ECDSA-SHA256 over "ballast/approval/1\n<hash>" }`. Public;
anyone with the superintendent's `sig` key can check it. An RTC drops it on the desk; a TGBO
built from a byte-identical source carries it in `approval`.

`REPORT`: `{ "test", "teacher": <RTC pub>, "box" }` — the class summary (rows per crew member
with grade, pass, areas, read-list, breaks, identity; class means; hardest items) sealed
under `HKDF(shared(rtc, superintendent), salt = test id, "ballast/report/1")`. No questions,
no answers.

## 5. TEST — one file for the class

```json
{ "v": 1, "kind": "test",
  "id": "<base64url 16 B random>",
  "salt": "<base64url 16 B random>",
  "title": "Test 3 · Block C",
  "settings": { "time": 5400, "pass": 0.9, "shuffleItems": true,
                "shuffleOptions": true, "allowBack": false },
  "areas": [ { "id": "signals", "label": "Signals & Rule 27" }, ... ],
  "rtc": "<pub base64url>", "rtcName": "ABC", "approval": <APPROVAL body or null>,
  "window": { "from": "<ISO 8601>", "until": "<ISO 8601>" },
  "clearances": [ { "no": 1, "sid": "...", "box": "<K wrapped>" }, ... ],
  "items": [ { "id": "q27b", "area": "signals", "box": "<item JSON encrypted>" }, ... ],
  "hash": "<SHA-256 hex over items[].id ‖ items[].box in order>" }
```

- Every test has a **window**. Each **clearance** is K sealed to one crew member with the
  window bound into the key: `AES-GCM(HKDF(shared_i, salt, "ballast/wrap/1\n" ‖ from ‖ "\n" ‖ until), K)`.
  The reader refuses to open before `from` or after `until` (by its own clock), and a file
  whose window was edited derives a different key, so it does not open at all. A release
  finished after `until` is flagged *late* by the RTC's intake — the RTC's clock, not the crew's. The TGBO is the content, common to
  all; the clearance is the per-train authority to occupy it.
- Each item is encrypted under its own `K_item = HKDF(K, salt, "ballast/item/1/" ‖ id)`,
  so a reader decrypts one item at a time and never holds the whole test in clear.
- Item plaintext: `{ "id", "type": "mc"|"match"|"short", "prompt", "options": [{"id","text"}],
  "pairs": [...], "ref": ["CROR 27(b)"], "area", "lcr", "tags": [], "svg": "<spec>",
  "img": [{"name","mime","b64","alt"}] }`. **No answers.**
- Display order of items and options for a student is a deterministic shuffle seeded
  by `sid`; both sides can reproduce it. Answers are recorded by item id and option id,
  never by position.

## 6. RELEASE — one crew member's attempt

```json
{ "v": 1, "kind": "release", "test": "<test id>", "salt": "<test salt>", "hash": "<test hash>",
  "source": "<approved source hash or null>", "sid": "...", "pin": "123456", "train": "<pub base64url>",
  "box": "<attempt encrypted under HKDF(shared(crew, rtc), salt, 'ballast/spike/1')>",
  "audit": { "pub": "<superintendent pub from the approval>",
             "box": "<the same attempt under HKDF(shared(crew, superintendent), salt, 'ballast/audit/1')>" } | null,
  "sig": "<crew sign key>", "signature": "<ECDSA over 'ballast/release/1\n' ‖ test ‖ '\n' ‖ box>" }
```

The armor header's `sha256` is the **release hash**: the crew member keeps it, the
cancellation names it, the class profile names it. The signature means the RTC cannot
alter the answers; the audit copy means the superintendent who approved the test can
re-score the release with no help from the RTC (an appeal). Unapproved tests have no
audit copy.

Attempt plaintext: `{ "started", "finished", "answers": { "<item id>": <value> },
"events": [ [t_ms, "show"|"answer"|"blur"|"focus"|"fullscreen-exit"|"lock"|"submit", ...] ],
"breaks": [ { "at", "ms", "why" } ], "ua": "…" }`. Values: mc → option id;
match → `{left id: right id}`; short → string.

GCM under the pair key authenticates the sender (only this crew member could have made
it, only this RTC can read it); the ECDSA signature makes that checkable by anyone who
holds the crew member's public profile.

## 7. CANCEL — the marks returned to the crew member

```json
{ "v": 1, "kind": "cancel", "test": "<test id>", "salt": "<test salt>", "pin": "123456", "rtc": "<rtc pub>",
  "release": "<release hash>", "by": "<rtc sign key>",
  "signature": "<ECDSA over 'ballast/cancel/1\n' ‖ test ‖ '\n' ‖ release ‖ '\n' ‖ box>", "box": "..." }
```

`box`, under `HKDF(shared, salt, "ballast/plate/1")`:
`{ "title", "pin", "score", "total", "grade", "pass", "pending",
"areas": [{ "id", "label", "correct", "total" }],
"read": [ { "ref": "CROR 27(b)", "area": "signals", "missed": 2 } ],
"tags": { ... }, "items": [ { "id", "area", "ref", "worth", "got", "pending" } ],
"answers": { "<item id>": <the answer as marked> }, "release": "<release hash>", "marked": <ms> }`.
No questions, no keys. The crew member compares `release` with the hash they kept, checks
the signature against the sign key of the RTC who minted them, and sees each mark beside
their own answer. A cancellation edited after signing fails the check.

## 8. SHEET (RTC) and BOOK (superintendent)

`{ "v":1, "kind":"sheet"|"book", "kdf": {"salt","iter"}, "box": "<AES-GCM under PBKDF2 key>" }`
containing `{ "rtc": <own profile + "keys": {priv, sign} as JWK>, "trains": [profiles],
"tests": [ { id, salt, hash, key K, title, source, text (the issued file), approved } ],
"pending": [unminted registrations],
"releases": [...], "marks": {...}, "assets": {name: {mime, b64}}, "approvals": [...],
"sources": [...], "reports": [...] }`. The only place answers, K, and private keys exist.

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
