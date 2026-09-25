# Ballast

A test that stays on the rails. One `index.html`, no server, no network, WebCrypto only.
The instructor is the **RTC**; students are **trains**; the test is a **TGBO**; the
attempt is a **track release**; the marks come back as a **cancellation**. Rule 136
applies: copy, repeat, complete.

```
python3 -m http.server   # or just open index.html from disk
```

**Trains:** Register crew → send your badge (or its text) to the RTC → drop the TGBO you
receive → repeat the four characters → fullscreen → one item at a time → Release track →
send the `.spike`. Later, drop the `.plate` to see your grade, by area, and the rules to read.

**RTC:** Open the desk → drop badges → drop the test source (`.txt`, see `SPEC.md` §10)
and any images it names → Issue TGBO (one `.tie` for the class) → drop the `.spike`
files → mark short answers → cancel (one `.plate` per train) → Save sheet (`.bed`).

**Formats:** `SPEC.md`. **For IT:** `FOR-IT.md`. **Independent re-scoring:** `verify.py`.

## Develop

Plain JavaScript with JSDoc, checked by `tsc`; no runtime dependencies.

```
npm test                       # unit + cross-language (needs python3 + cryptography)
node build.mjs                 # index.html; prints its SHA-256 (esbuild for concatenation)
node --test test/e2e.test.mjs  # Chromium, file:// (needs playwright)
```

Set `ESBUILD` / `PLAYWRIGHT` to module paths if they are not installed here.
