#!/usr/bin/env python3
"""Split the Transport Canada 2025 CROR (pdftotext -layout) into rules AND their
printed paragraph labels: (a) / (i) / 1. — nested by style + indentation.

Unlike the Comply365 HTML, the PDF PRINTS every label, so letters are read, not
counted: TC's own skips (104 has no (g); 14 runs (a)(b)(e)(f)(l)(r)(t)) survive.
Nesting is inferred: a label continues the nearest open list of its style when
its value is larger; otherwise it opens a new list under the deepest open item
indented less than it. "(i)" / "(v)" / "(x)" are alpha OR roman — decided by
whether the alpha list is exactly one letter short and by indentation.

Reusable: `rules(text)` -> [{number,title,section,lines}], `split(lines)` ->
tree [{label,style,ord,text,children,flags}]. Used by the audit and proposed as
the subrule splitter for pipelines/cror_2025.py.
"""
import re, subprocess, sys, os, json

PDF = None  # passed in by extract_cror.py
HEAD = re.compile(r"^( {0,3})(\d{1,3}(?:\.\d+)?)\.?\s+(\(?[A-Z].*?)\s*$")
GEN = re.compile(r"^([A-O])(?:\s+([A-Z(].{3,}))?$")
LAB = re.compile(r"^(\s*)\(([a-z]|[ivx]{1,5})\)\s*(.*)$")
NUM = re.compile(r"^(\s*)(\d{1,2})\.\s+(\S.*)$")
ROMAN = {r: i + 1 for i, r in enumerate(
    "i ii iii iv v vi vii viii ix x xi xii xiii xiv xv xvi xvii xviii xix xx".split())}


def pdf_text(pdf=PDF):
    return subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, text=True).stdout


def rules(text):
    lines = text.replace("\f", "").split("\n")
    toc_end = max(i for i, l in enumerate(lines) if "...." in l)
    secs = set()
    for l in lines[:toc_end + 1]:
        m = re.match(r"^(\s*)([A-Z][A-Z0-9 ,()/&'’–\-]{4,60})\s*\.{3,}", l)
        # indent 0 only: "    SWITCHING" / "    LIMITS" are wrapped TOC titles, and
        # treating them as section headings drops the body of 577.1 and 314.
        if m and not m.group(2)[0].isdigit() and (len(m.group(1)) <= 1 or m.group(2).startswith("FORM ")):
            secs.add(m.group(2).strip())
    out, cur, sec, gl = [], None, None, ""
    last_int = 0
    for raw in lines[toc_end + 1:]:
        s = raw.strip()
        if re.fullmatch(r"\d{1,3}", s):
            continue                                   # page number
        if s in secs:
            cur = None; sec = s; continue
        mh = HEAD.match(raw)
        mg = GEN.match(s) if sec == "GENERAL RULES" else None
        if mh:
            num, title = mh.group(2), mh.group(3)
            letters = [c for c in title if c.isalpha()]
            up = sum(c.isupper() for c in letters) / max(1, len(letters))
            ni = int(num.split(".")[0])
            ok = up >= 0.5 and len(letters) >= 3 and (ni > last_int or ("." in num and ni >= last_int))
            if not ok:
                mh = None
        if mh:
            cur = {"number": num, "title": title.strip(), "section": sec, "lines": []}
            out.append(cur); last_int = ni
        elif mg and mg.group(1) > gl:
            gl = mg.group(1)
            cur = {"number": gl, "title": None, "section": sec, "lines": [mg.group(2)] if mg.group(2) else []}
            out.append(cur)
        elif cur is not None:
            cur["lines"].append(raw)
    return out


def _cands(tok, is_num):
    if is_num:
        return [("decimal", int(tok))]
    c = []
    if len(tok) == 1:
        c.append(("alpha", ord(tok) - 96))
    if tok in ROMAN:
        c.append(("roman", ROMAN[tok]))
    return c


def split(lines):
    """-> tree of {label, style, ord, indent, text, children, flags}"""
    root = {"children": [], "indent": -1, "style": None, "ord": 0}
    stack = []                      # open items, outermost first
    prev_blank_or_indented = True
    top_para = False                # an unlabeled column-0 paragraph closed the open items
    cur = None
    for raw in lines:
        if not raw.strip():
            prev_blank_or_indented = True
            continue
        ind = len(raw) - len(raw.lstrip())
        m = LAB.match(raw); n = None if m else NUM.match(raw)
        if not (m or n):
            s = raw.strip()
            if ind <= 1 and cur is not None and s[:1].isupper() and prev_blank_or_indented:
                top_para = True
            prev_blank_or_indented = ind >= 3
            if cur is not None:
                cur["text"].append(s)
            continue
        tok = (m or n).group(2); rest = (m or n).group(3)
        if rest.strip() and not re.search(r"[A-Za-z0-9“\"(#]", rest):
            if cur is not None:                # "(b)." — a cross-reference wrapped onto its own line
                cur["text"].append(raw.strip())
            continue
        cands = _cands(tok, bool(n))
        options = []                # (score, kind, style, val, k)
        for style, val in cands:
            ks = [k for k in range(len(stack)) if stack[k]["style"] == style]
            if ks:
                k = ks[-1]; e = stack[k]
                if val > e["ord"]:
                    gap = val - e["ord"]
                    score = 0 if gap == 1 else (5 if gap == 2 else 20)
                    if style == "alpha" and ind > e["indent"] + 2 and tok in ROMAN:
                        score += 6          # deeper than the letters: prefer roman
                    options.append((score, "sib", style, val, k))
                elif val == e["ord"]:
                    options.append((8, "dup", style, val, k))
            if val == 1:
                options.append((3 if ks else 1, "new", style, val, None))
        if not options:
            options.append((50, "new", cands[0][0], cands[0][1], None))
        options.sort(key=lambda o: o[0])
        score, kind, style, val, k = options[0]
        flags = []
        if kind in ("sib", "dup"):
            if score >= 5 and kind == "sib":
                flags.append("skip")
            if kind == "dup":
                flags.append("duplicate-label")
            del stack[k:]
            parent = stack[-1] if stack else root
            base_ind = None
        else:
            if score >= 50:
                flags.append("orphan-start")
            parent = root
            for e in reversed(stack):
                if e["indent"] < ind:
                    parent = e; break
            if parent is root and stack and not top_para and style != "alpha":
                parent = stack[0]            # page reflow put a nested list at column 0
            # close everything deeper than parent
            while stack and stack[-1] is not parent:
                stack.pop()
        node = {"label": tok, "style": style, "ord": val, "indent": ind, "text": [rest.strip()],
                "children": [], "flags": flags}
        parent["children"].append(node)
        stack.append(node)
        cur = node; top_para = False; prev_blank_or_indented = False
    def fin(ns):
        for x in ns:
            x["text"] = re.sub(r"\s+", " ", " ".join(x["text"])).strip()
            fin(x["children"])
    fin(root["children"])
    return root["children"]


def flatten(number, tree, prefix=None):
    """-> [(ref, node)] with refs like 104(i)(5)(ii). Duplicate labels get -2."""
    out, seen = [], set()
    prefix = prefix or number
    for x in tree:
        ref = f"{prefix}({x['label']})"
        if ref in seen:
            ref = f"{prefix}({x['label']})-2"
        seen.add(ref)
        out.append((ref, x))
        out.extend(flatten(number, x["children"], ref))
    return out


if __name__ == "__main__":
    t = pdf_text()
    rs = rules(t)
    res = {}
    for r in rs:
        tree = split(r["lines"])
        res.setdefault(r["number"], []).extend(
            {"ref": ref, "style": x["style"], "flags": x["flags"], "text": x["text"]} for ref, x in flatten(r["number"], tree))
    json.dump({"rules": [{k: v for k, v in r.items() if k != "lines"} for r in rs], "subrules": res},
              open(sys.argv[1] if len(sys.argv) > 1 else "tc_subrules.json", "w"), indent=1, ensure_ascii=False)
    print(len(rs), "rules;", sum(len(v) for v in res.values()), "subrules")
