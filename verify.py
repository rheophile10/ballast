#!/usr/bin/env python3
"""Ballast reference verifier. Re-scores a RELEASE against a SHEET with no help from the app.

    python3 verify.py sheet.bed test3.txt release.spike [--pass 'passphrase'] [--marks marks.json]

Standard library + `cryptography` (pip/uv). Implements SPEC.md §1–§3, §6, §9 independently of src/.
"""
import argparse, base64, getpass, hashlib, json, re, sys
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

def b64url_decode(s): s = s.replace('-', '+').replace('_', '/'); return base64.b64decode(s + '=' * (-len(s) % 4))

def dearmor(text, kind=None):
    m = re.search(r'-----BEGIN BALLAST ([A-Z]+)-----\r?\n(.*?)-----END BALLAST \1-----', text, re.S)
    if not m: sys.exit('not a Ballast file')
    k, inner = m.group(1), m.group(2)
    if kind and k != kind: sys.exit(f'expected a {kind}, got a {k}')
    head, _, body = inner.partition('\n\n')
    headers = dict(l.split(':', 1) for l in head.replace('\r', '').split('\n') if ':' in l)
    raw = base64.b64decode(re.sub(r'\s+', '', body))
    if hashlib.sha256(raw).hexdigest() != headers['sha256'].strip(): sys.exit('corrupt file: sha256 mismatch')
    return json.loads(raw)

def hkdf(ikm, salt, info): return HKDF(algorithm=hashes.SHA256(), length=32, salt=salt, info=info.encode()).derive(ikm)
def open_box(key, box):
    all_ = b64url_decode(box)
    return json.loads(AESGCM(key).decrypt(all_[:12], all_[12:], None))
def priv_from_jwk(j):
    d = int.from_bytes(b64url_decode(j['d']), 'big'); return ec.derive_private_key(d, ec.SECP256R1())
def pub_from_raw(b64): return ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), b64url_decode(b64))
def shared(priv, pub_b64): return priv.exchange(ec.ECDH(), pub_from_raw(pub_b64))

def parse_test(src):  # enough of SPEC §10 to score: ids, types, keys, pairs, worth, area, ref, tags
    blocks = re.split(r'\n---+\n', src.replace('\r\n', '\n')); head = blocks.pop(0)
    settings = {'pass': 0.9}; areas = []
    for l in head.split('\n'):
        if l.lower().startswith('pass:'): v = l.split(':', 1)[1].strip(); settings['pass'] = float(v.rstrip('%')) / 100 if '%' in v or float(v.rstrip('%')) > 1 else float(v)
        if l.lower().startswith('areas:'):
            areas = [{'id': m.group(1), 'label': m.group(2) or m.group(1)} for a in l.split(':', 1)[1].split('·') if (m := re.match(r'^\s*(\S+)\s*(?:"([^"]*)")?\s*$', a))]
    items = []
    for b in blocks:
        if not b.strip(): continue
        it = {'type': 'mc', 'options': [], 'pairs': [], 'key': None, 'answer': '', 'ref': [], 'tags': [], 'worth': 1, 'area': None, 'id': None, 'prompt': ''}
        mode = None
        for line in b.split('\n'):
            if not line.strip(): mode = None; continue
            if (m := re.match(r'^Q:\s?(.*)$', line)): it['prompt'] = m.group(1); mode = 'q'; continue
            if (m := re.match(r'^(\*?)([a-z])\)\s?(.*)$', line)): it['options'].append(m.group(2)); it['key'] = m.group(2) if m.group(1) else it['key']; mode = None; continue
            if (m := re.match(r'^L:\s?(.*?)\s*=\s*(.*)$', line)): it['pairs'].append(chr(97 + len(it['pairs']))); mode = None; continue
            if (m := re.match(r'^A:\s?(.*)$', line)): it['answer'] = m.group(1); mode = None; continue
            if (m := re.match(r'^([a-z]+):\s?(.*)$', line, re.I)) and m.group(1).lower() in ('id', 'type', 'area', 'ref', 'lcr', 'tags', 'svg', 'img', 'alt', 'worth'):
                k, v = m.group(1).lower(), m.group(2).strip()
                if k == 'ref': it['ref'] += [x for x in re.split(r'\s*[,;]\s*|\s+(?=CROR|GOI|GR)', v) if x]
                elif k == 'tags': it['tags'] += v.split()
                elif k == 'worth': it['worth'] = float(v)
                elif k in ('id', 'type', 'area'): it[k] = v
                mode = None; continue
            if mode == 'q': it['prompt'] += '\n' + line
        if it['type'] == 'match': it['worth'] = len(it['pairs'])
        if not it['id']: it['id'] = 'q' + hashlib.sha256((it['prompt'] + it['type']).encode()).hexdigest()[:8]
        items.append(it)
    return {'settings': settings, 'areas': areas, 'items': items}

def score(test, attempt, marks):
    answers = attempt.get('answers', {}); per = []
    for it in test['items']:
        a = answers.get(it['id']); got, pending = 0, False
        if it['type'] == 'mc': got = it['worth'] if a == it['key'] else 0
        elif it['type'] == 'match': got = sum(1 for p in it['pairs'] if (a or {}).get(p) == p)
        elif it['type'] == 'short':
            if it['id'] in marks: got = min(float(marks[it['id']]), it['worth'])
            else: pending = True
        per.append({'id': it['id'], 'area': it['area'], 'ref': it['ref'], 'got': got, 'worth': it['worth'], 'pending': pending})
    total = sum(i['worth'] for i in per); s = sum(i['got'] for i in per)
    areas = {}
    for i in per:
        if i['area']: d = areas.setdefault(i['area'], {'correct': 0, 'total': 0}); d['correct'] += i['got']; d['total'] += i['worth']
    refs = {}
    for i in per:
        for r in i['ref']: d = refs.setdefault(r, {'correct': 0, 'total': 0}); d['correct'] += i['got']; d['total'] += i['worth']
    read = sorted([(r, v['total'] - v['correct']) for r, v in refs.items() if v['correct'] < v['total']], key=lambda x: (-x[1], x[0]))
    grade = s / total if total else 0
    return {'score': s, 'total': total, 'grade': grade, 'pass': grade >= test['settings']['pass'], 'pending': sum(i['pending'] for i in per), 'areas': areas, 'read': read, 'items': per}

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('sheet'); ap.add_argument('source'); ap.add_argument('release')
    ap.add_argument('--pass', dest='passphrase'); ap.add_argument('--marks'); ap.add_argument('--json', action='store_true')
    a = ap.parse_args()
    sheet_body = dearmor(open(a.sheet, encoding='utf-8').read(), 'SHEET')
    pw = a.passphrase or getpass.getpass('sheet passphrase: ')
    key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=b64url_decode(sheet_body['kdf']['salt']), iterations=sheet_body['kdf']['iter']).derive(pw.encode())
    try: sheet = open_box(key, sheet_body['box'])
    except Exception: sys.exit('wrong passphrase')
    rel = dearmor(open(a.release, encoding='utf-8').read(), 'RELEASE')
    rec = next((t for t in sheet['tgbos'] if t['id'] == rel['tgbo']), None) or sys.exit('release is for a TGBO not on this sheet')
    if rec['hash'] != rel['hash']: sys.exit('release does not compare: TGBO hash differs')
    priv = priv_from_jwk(sheet['rtc'].get('keys', sheet['rtc'])['priv'])
    try: attempt = open_box(hkdf(shared(priv, rel['train']), b64url_decode(rec['salt']), 'ballast/spike/1'), rel['box'])
    except Exception: sys.exit('cannot open release: not from that train, or tampered')
    on_sheet = next((t for t in sheet['trains'] if t['pin'] == rel['pin']), None)
    ident = 'train key matches the sheet' if on_sheet and on_sheet['pub'] == rel['train'] else 'WARNING: train key is NOT the one on the sheet for this PIN'
    test = parse_test(open(a.source, encoding='utf-8').read())
    marks = json.load(open(a.marks)) if a.marks else {}
    r = score(test, attempt, marks)
    if a.json: print(json.dumps(r, indent=1)); sys.exit(0)
    print(f"RELEASE from CN {rel['pin']} for TGBO {rec['title']!r} — {ident}")
    print(f"score {r['score']:g}/{r['total']:g} = {r['grade']*100:.1f}%  {'PASS' if r['pass'] else 'FAIL'}  (pass mark {test['settings']['pass']*100:.0f}%, {r['pending']} short answers unmarked)")
    for k, v in r['areas'].items(): print(f"  {k:14s} {v['correct']:g}/{v['total']:g}")
    if r['read']: print('  read:', ', '.join(f'{ref} ({n})' for ref, n in r['read']))
    breaks = attempt.get('breaks', [])
    if breaks: print(f"  {len(breaks)} break(s):", "; ".join(f"{b.get('why')} {b.get('ms',0)/1000:.0f}s at +{(b.get('at',0)-(attempt.get('started') or 0))/1000:.0f}s" for b in breaks))
