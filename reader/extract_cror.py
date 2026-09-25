#!/usr/bin/env python3
"""Extract the public Transport Canada 2025 CROR PDF into the reader's document JSON.

    uv run --with nothing python3 reader/extract_cror.py <2025_CROR_current_TransportCanada.pdf> documents/cror-2025.json

Needs `pdftotext` (poppler). The document format (SPEC.md §11) is a flat list of nodes:
  { id, kind: section|rule|subrule|text|signal, number, title, parent, text, hash, page }
`hash` is the first 12 hex of SHA-256 over the node's normalised text, so a test item can be tied to the
exact wording it was written against, and a later edition shows which items to revisit.
The rule and sub-rule splitting is cror_split.py (the same code the study aid audit used).
"""
import hashlib, json, re, subprocess, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cror_split as split

def norm(s): return re.sub(r"\s+", " ", s or "").strip()
def h12(s): return hashlib.sha256(norm(s).lower().encode()).hexdigest()[:12]

CAP = re.compile(r"^([A-Z][A-Za-z /,()&'\-]+?)\s+-\s+(.+)$")   # "Clear - Proceed."

def signals(pdf):
    """405-440: number on its own line, then (after the diagram) 'Name - Indication', then optional lines."""
    txt = subprocess.run(["pdftotext", "-f", "71", "-l", "82", "-layout", pdf, "-"], capture_output=True, text=True).stdout
    out, num, cur = [], None, None
    for l in txt.split("\n"):
        s = l.strip()
        m = re.match(r"^(4[0-4]\d[A-Z]?)\.$", s)
        if m: num = m.group(1); cur = None; continue
        if re.match(r"^440\.\s", s): break
        c = CAP.match(s)
        if c and num and not cur:
            cur = {"num": num, "name": c.group(1).strip(), "lines": [c.group(2).strip()]}; out.append(cur); continue
        if cur and s and not s.isdigit() and s[:1].isalpha() and not re.match(r"^\d{3}\.$", s): cur["lines"].append(s)
        elif cur and not s: pass
        elif cur and (s.isdigit() or re.match(r"^\d{3}\.$", s)): cur = None
    return [{"num": a["num"], "name": a["name"], "text": " ".join(a["lines"])} for a in out]

def definitions(text):
    """The DEFINITIONS section: a term in capitals on its own line, then its paragraph(s), until GENERAL RULES."""
    lines = text.replace("\f", "").split("\n")
    starts = [i for i, l in enumerate(lines) if l.strip() == "DEFINITIONS" and "...." not in l]
    if not starts: return []
    out, cur = [], None
    for l in lines[starts[-1] + 1:]:
        s = l.strip()
        if s == "GENERAL RULES": break
        if not s or re.fullmatch(r"\d{1,3}", s): continue
        # a term: a short line, no final period, at least one all-capitals word ("ADVANCE SIGNAL", "SLOW Speed")
        if len(s) <= 60 and not s.endswith((".", ",", ";", ":")) and re.fullmatch(r"[A-Z][A-Za-z0-9()/&'’\-]*(?: [A-Za-z0-9()/&'’\-]+){0,7}", s) and re.search(r"\b[A-Z]{3,}\b", s) and s not in ("EXCEPTION", "NOTE"):
            cur = {"term": s.title().replace("(Abs)", "(ABS)").replace("(Ctc)", "(CTC)").replace("(Dob)", "(DOB)").replace("(Ecm)", "(ECM)").replace("(Top)", "(TOP)").replace("(Ocs)", "(OCS)").replace("(Scs)", "(SCS)").replace("(Sct)", "(SCT)").replace("(Gbo)", "(GBO)").replace("(Rtc)", "(RTC)").replace("(Ttc)", "(TTC)"), "lines": []}; out.append(cur)
        elif cur: cur["lines"].append(s)
    return [{"term": d["term"], "text": " ".join(d["lines"])} for d in out if d["lines"]]

def main(pdf, out):
    text = split.pdf_text(pdf)
    rs = split.rules(text)
    pages = {}
    for i, page in enumerate(text.split("\f")):
        for l in page.split("\n"):
            m = split.HEAD.match(l)
            if m: pages.setdefault(m.group(2), i + 1)
    nodes, seen_sec, have = [], {}, set()
    def section(name):
        sid = "sec:" + re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        if sid not in seen_sec: seen_sec[sid] = True; nodes.append({"id": sid, "kind": "section", "number": None, "title": name.title(), "parent": None, "text": "", "hash": h12(name)})
        return sid
    dsec = section("DEFINITIONS")
    for d in definitions(text):
        did = "def:" + re.sub(r"[^a-z0-9]+", "-", d["term"].lower()).strip("-")
        if did in have: continue
        have.add(did); nodes.append({"id": did, "kind": "definition", "number": None, "title": d["term"], "parent": dsec, "text": d["text"], "hash": h12(d["text"])})
    for r in rs:
        num = r["number"]; num = "113" if num == "113.0" else num
        if num in have: continue
        have.add(num)
        sid = section(r["section"]) if r["section"] else None
        body = "\n".join(x.rstrip() for x in r["lines"]).strip()
        body = re.sub(r"\n{3,}", "\n\n", body)
        parent = num.split(".")[0] if "." in num else sid
        nodes.append({"id": num, "kind": "rule" if num[:1].isdigit() else "general", "number": num, "title": (r["title"] or "").title() or None, "parent": parent, "text": body, "hash": h12(body), "page": pages.get(r["number"])})
        if num[:1].isdigit():
            for ref, x in split.flatten(num, split.split(r["lines"])):
                nodes.append({"id": ref, "kind": "subrule", "number": ref, "title": None, "parent": re.sub(r"\([^)]*\)$", "", ref) if ref.count("(") > 1 else num, "text": x["text"], "hash": h12(x["text"]), "flags": x["flags"] or None})
    # the signal aspects 405-439 sit inside the diagrams, which the text parser cannot see
    sig_sec = section("BLOCK AND INTERLOCKING SIGNALS")
    have = {n["id"] for n in nodes}
    for a in signals(pdf):
        sid = str(a["num"]); txt = f"{a['name']} - {a['text']}"
        if sid in have and any(n["id"] == sid and n["text"] for n in nodes): sid += "-2"  # two captions under one number: keep both
        if sid in have:   # the parser made an empty shell for it; fill it
            for n in nodes:
                if n["id"] == sid: n.update(title=a["name"], text=txt, hash=h12(txt), kind="signal")
        else:
            nodes.append({"id": sid, "kind": "signal", "number": sid, "title": a["name"], "parent": sig_sec, "text": txt, "hash": h12(txt), "page": None})
    # stable order: sections in order of appearance, rules by document order (signals slot in numerically)
    order = {n["id"]: i for i, n in enumerate(nodes)}
    def key(n):
        m = re.match(r"^(\d+)(?:\.(\d+))?", n["id"])
        return (0, order[n["id"]]) if not m else (1, int(m.group(1)), int(m.group(2) or 0), n["id"][m.end():m.end() + 1] if n["id"][m.end():m.end() + 1].isalpha() else "", order[n["id"]])
    sections = [n for n in nodes if n["kind"] == "section"]; rest = sorted([n for n in nodes if n["kind"] != "section"], key=key)
    doc = {"v": 1, "kind": "document", "id": "cror-2025", "title": "Canadian Rail Operating Rules", "edition": "January 28, 2025",
           "source": "Transport Canada — https://tc.canada.ca/en/rail-transportation/rules/2024-2025/canadian-rail-operating-rules",
           "extracted": os.path.basename(pdf), "nodes": sections + rest}
    for n in doc["nodes"]:
        for k in [k for k, v in n.items() if v is None]: del n[k]
    json.dump(doc, open(out, "w"), ensure_ascii=False, indent=0)
    kinds = {}
    for n in doc["nodes"]: kinds[n["kind"]] = kinds.get(n["kind"], 0) + 1
    print(f"{out}: {len(doc['nodes'])} nodes {kinds}; {os.path.getsize(out) // 1024} KB")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "documents/cror-2025.json")
