# Ballast

A test that stays on the rails. One `index.html`, no server, no network, WebCrypto only.
The instructor is the **RTC**; students are **crew**; each has a **clearance** on the test;
the attempt is a **track release**; the marks come back as a **cancellation**. Rule 136
applies: copy, repeat, complete.

```
python3 -m http.server   # or just open index.html from disk
```

**Recommended deployment:** one saved copy, `ballast.html`, on a shared drive (go to
cror.ca/ballast and press Ctrl+S, "Webpage, HTML only", or use the top bar's *Save a copy*).
A fixed file IT can hash once, works with no internet, identical for every crew member.
Note that a browser keeps keys per address: the cror.ca page and the `file://` page are two
registrations, so pick one.

Everyone starts the same way: **register** (name, PIN, photo) and send the registration
text to the person above you. **Roles are minted:** the superintendent mints RTCs, an RTC
mints crew, and the first superintendent mints themself. The minted profile — signed and
dated — comes back to you; drop it in and the page becomes your role's home. Every file
is armored text.

**Crew:** drop the test the RTC sends → repeat the four characters → fullscreen → one item
at a time → Release track → send the release. Later, drop the cancellation to see your grade
by area and the rules to read. Practice first: a built-in test that marks itself.

**RTC:** start a sheet → drop registrations and mint them (the profile goes back to the crew
member) → drop the test source (`.txt`, `SPEC.md` §10), any images it names, and the
superintendent's approval → Issue test (one file, one clearance per crew member) → drop
releases → mark short answers → cancel (marks per person) → report to the superintendent →
Save sheet.

**Superintendent:** start a book → drop RTC registrations and mint them → drop test sources
and Approve (a signature the RTC drops on their desk) → drop reports → administrations and
by-crew-member tables, CSV → Save book.

**Provenance:** every test has a window; releases are signed by the crew member and carry an
audit copy sealed to the approving superintendent; the crew member keeps the release hash;
the cancellation is signed by the RTC and names that hash; the superintendent can drop any
release on the book to re-score it and compare with what the RTC reported.

**Tutorial:** `tutorial/index.html` — a pretend desktop (shared drive, browser) around the real
Ballast, run by a fictional cast (`samples/cast.json`). You play superintendent, then RTC,
then crew, including an appeal. Built with `node tutorial/build.mjs`; tested by
`test/tutorial.test.mjs`.

**Formats:** `SPEC.md`. **For IT:** `FOR-IT.md`. **Independent re-scoring:** `verify.py`.

## Develop

Plain JavaScript with JSDoc, checked by `tsc`; no runtime dependencies.

```
npm test                       # unit + cross-language (needs python3 + cryptography)
node build.mjs                 # index.html; prints its SHA-256 (esbuild for concatenation)
node --test test/e2e.test.mjs  # Chromium, file:// (needs playwright)
```

Set `ESBUILD` / `PLAYWRIGHT` to module paths if they are not installed here.
