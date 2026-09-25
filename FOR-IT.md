# Ballast — for IT review

**What it is.** A single HTML file that lets an instructor (the "RTC") issue a test to a
class and mark what comes back, with no server, no accounts, and no network access.
Students (the "trains") open the same file. Nothing is installed.

**Data egress: none, enforced by the browser.** The page carries this Content-Security-Policy:

    default-src 'none'; script-src 'sha256-…'; style-src 'sha256-…'; img-src blob: data:; connect-src 'none'; form-action 'none'; base-uri 'none'

`connect-src 'none'` means the browser refuses every network request the page could make.
There are no analytics, fonts, CDNs or telemetry. It runs from a USB stick, a file share,
or a static web host identically.

**What runs.** One file, plain JavaScript (ES2020), no runtime dependencies, no `eval`, no
`innerHTML`. All cryptography is the browser's WebCrypto: ECDH P-256, HKDF-SHA-256,
AES-256-GCM, PBKDF2-SHA-256. We wrote no cryptographic primitives. The source is in `src/`,
the build is `build.mjs` (concatenation), and the shipped `index.html` is committed; rerunning
the build reproduces it byte for byte. Its SHA-256 is printed by the build and recorded in
the release notes — hash the file you were given and compare.

**What it stores on the machine.** In the browser profile only: the student's private key
(non-extractable — the browser will not export it to a script or a person) and the log of an
attempt in progress, so a crash does not lose the test. Never the decrypted test, never an
answer key. The instructor's file (`.bed`) is encrypted under their passphrase; it is the
only place answers and the instructor's private key exist.

**Permissions requested.** Camera — only when a student clicks "Use webcam" while making
a badge, released after the shot; photo upload is always offered instead. Fullscreen and
keyboard lock — when a test starts. That is the complete list.

**Personal data.** Name, PIN, photo and public key: in the badge (which the student
sends), and in the instructor's encrypted file. The test file sent to the class contains
none of it. The returned attempt carries the PIN and the event log, sealed to the
instructor. Retention is the instructor's file on the instructor's machine.

**Integrity and independent verification.** Every file is ASCII-armored JSON with a
SHA-256 in its header. Attempts are encrypted under a key only that student and that
instructor can derive, which also authenticates the sender. `verify.py` (Python standard
library + `cryptography`) re-scores any attempt from the instructor's file and the test
source and must agree with the app — an auditor can run it without trusting the app.

**What it does not stop, stated plainly.** A camera or a second device photographing the
screen; screenshots at the OS level; a student who opens developer tools with the
intent and skill to use them. Mitigations are deterrence and evidence: one question on
screen at a time, drawn to a canvas (no selectable text), copy/cut/save/print refused,
mandatory fullscreen with leaving-the-tab recorded, and a watermark of the student's
name, PIN and time across every frame. The instructor sees every break with its
timestamp and can replay the attempt.

**Files.** `index.html` · `src/` · `build.mjs` · `SPEC.md` (formats, byte by byte) ·
`verify.py` · `test/` (unit, cross-language and end-to-end browser tests).
