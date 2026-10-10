#!/usr/bin/env python3
"""
Builds src/data/vocabCatalog.json, the app's only vocabulary source, from the Anki deck
"5000 Từ vựng Tiếng Anh (Oxford 5000, A1-C1)" (https://ankiweb.net/shared/info/632690606):
5,004 Oxford 3000/5000 words with Vietnamese meanings by part of speech, Anh–Việt examples, UK/US IPA,
CEFR level and the deck's study order. Audio links (Oxford's servers) are not kept: the app reads words
with the device voice.

Checks while building (the script stops on a hard error, prints the soft ones):
  - every note has a word, a level A1–C1, at least one meaning and one example with its translation
  - with --oxford (the saved HTML of https://www.oxfordlearnersdictionaries.com/wordlists/oxford3000-5000)
    and --oxford-us (the American Oxford 3000/5000 "by CEFR level" PDFs linked from that page, the deck
    uses both lists): every word is in an official list, and its level is one of Oxford's levels for it
  - with --it (scripts/wordlists/data/oxfordIt.json): the IT words (learnt first within their level)

Usage:
  python3 scripts/wordlists/build_catalog_from_anki.py --apkg deck.apkg \
      --oxford oxford3000-5000.html --oxford-us American_Oxford_3000_by_CEFR_level.pdf \
      American_Oxford_5000_by_CEFR_level.pdf --it scripts/wordlists/data/oxfordIt.json
"""
import argparse
import datetime
import html
import json
import os
import re
import sqlite3
import sys
import tempfile
import zipfile

DECK_URL = "https://ankiweb.net/shared/info/632690606"
LEVELS = ["A1", "A2", "B1", "B2", "C1"]
POS_NAMES = {
    "n.": "noun", "v.": "verb", "adj.": "adjective", "adv.": "adverb", "prep.": "preposition",
    "conj.": "conjunction", "pron.": "pronoun", "det.": "determiner", "number": "number",
    "exclam.": "exclamation", "modal v.": "modal verb", "auxiliary v.": "auxiliary verb",
}


def read_notes(apkg):
    z = zipfile.ZipFile(apkg)
    names = z.namelist()
    member = next((n for n in ("collection.anki21", "collection.anki2") if n in names), None)
    if member is None:
        sys.exit("No collection.anki21/anki2 in the package (an anki21b-only package needs zstd first)")
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "collection.db")
        with open(path, "wb") as f:
            f.write(z.read(member))
        db = sqlite3.connect(path)
        models = json.loads(db.execute("select models from col").fetchone()[0])
        fields = {int(mid): [f["name"] for f in m["flds"]] for mid, m in models.items()}
        notes = [dict(zip(fields[mid], flds.split("\x1f"))) for mid, flds in db.execute("select mid, flds from notes")]
        db.close()
    return notes


def parse_json(text, default):
    try:
        return json.loads(text) if text.strip() else default
    except json.JSONDecodeError:
        return default


def unique(items):
    out = []
    for x in items:
        if x and x not in out:
            out.append(x)
    return out


def official_levels(path):
    """word -> set of Oxford levels (3000 and 5000 lists)"""
    s = open(path, encoding="utf-8").read()
    levels = {}
    for attrs, text in re.findall(r'<li data-hw="[^"]*"([^>]*)>\s*<a href="[^"]*">([^<]*)</a>', s):
        m = re.search(r'data-ox5000="([a-c][12])"', attrs) or re.search(r'data-ox3000="([a-c][12])"', attrs)
        if m:
            word = html.unescape(text).replace("™", "").strip().lower()
            levels.setdefault(word, set()).add(m.group(1).upper())
    return levels


POS_RE = re.compile(
    r"\s+(?:n\.|v\.|adj\.|adv\.|prep\.|conj\.|pron\.|det\.|exclam\.|number|indefinite article|definite article|"
    r"auxiliary v\.|modal v\.|linking v\.|infinitive marker|ordinal number)"
)


def official_levels_pdf(paths):
    """word -> set of levels, from the American Oxford 3000/5000 'by CEFR level' PDFs (needs pypdf)"""
    from pypdf import PdfReader

    levels, level = {}, None
    for path in paths:
        for page in PdfReader(path).pages:
            for line in page.extract_text().splitlines():
                line = line.strip()
                if line in LEVELS:
                    level = line
                    continue
                m = POS_RE.search(line)
                if level and m and m.start() > 0:
                    head = re.sub(r"\s*\([^)]*\)", "", line[: m.start()]).strip()
                    for word in [head, *[w.strip() for w in head.split(",")]]:
                        levels.setdefault(word.lower(), set()).add(level)
    return levels


def build(notes, it_words):
    words, problems = [], []
    for n in notes:
        word = n["Word"].strip()
        cefr = n["CEFR"].strip().upper()
        if not word or cefr not in LEVELS:
            problems.append(f"bad word/level: {word!r} {cefr!r}")
            continue
        senses, examples = [], []
        for sense in parse_json(n["Example Data"], []):
            pos = POS_NAMES.get(sense.get("pos", ""), sense.get("pos", ""))
            vn = (sense.get("meaning_vi") or "").strip()
            if vn and not any(s["pos"] == pos and s["vn"] == vn for s in senses):
                senses.append({"pos": pos, "vn": vn})
            for ex in sense.get("examples", []):
                en, vi = (ex.get("example_en") or "").strip(), (ex.get("example_vi") or "").strip()
                if en and vi and not any(e["en"] == en for e in examples):
                    examples.append({"en": en, "vi": vi, "focus": unique(ex.get("focus_en") or [])})
        if not senses or not examples:
            problems.append(f"no meaning/example: {word}")
            continue
        pron = parse_json(n["Pronunciation Data"], [])
        ipa_us = unique([i for p in pron if p.get("locale") == "US" for i in p.get("ipa", [])])
        ipa_uk = unique([i for p in pron if p.get("locale") == "UK" for i in p.get("ipa", [])])
        if not ipa_us and not ipa_uk and n.get("Phonetic", "").strip():
            ipa_uk = [n["Phonetic"].strip()]
        variants = unique([v["word"].strip() for v in parse_json(n["Variant Data"], []) if v.get("word")])
        irregular = unique([
            f for entry in parse_json(n["Irregular Forms"], [])
            for forms in (entry.get("forms") or {}).values() for f in forms
        ])
        words.append({
            # "may"/"May", "march"/"March", "it"/"IT" are different words: ids keep the case
            "id": word,
            "word": word,
            "cefr": cefr,
            "list": 3000 if "3000" in n["Oxford List"] else 5000,
            "order": int(n["Study Order"] or 0),
            "freq": int(n["Frequency"] or 0),
            "it": word in it_words,
            "pos": n["Part of Speech"].strip(),
            # The deck author's short combined meaning ("ánh sáng; đèn; nhẹ"), shown on cards and options
            "vn": n["Vietnamese"].strip() or "; ".join(x["vn"] for x in senses),
            "senses": senses,
            "ipaUs": ipa_us,
            "ipaUk": ipa_uk,
            "variants": variants,
            "irregular": irregular,
            "examples": examples,
        })
    return words, problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apkg", required=True)
    ap.add_argument("--oxford")
    ap.add_argument("--oxford-us", nargs="*", default=[])
    ap.add_argument("--it")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "..", "src", "data", "vocabCatalog.json"))
    args = ap.parse_args()

    it_words = set()
    if args.it:
        it_words = {w["word"] for w in json.load(open(args.it, encoding="utf-8"))["words"]}

    words, problems = build(read_notes(args.apkg), it_words)
    ids = [w["id"] for w in words]
    if len(set(ids)) != len(ids):
        sys.exit("duplicate words: " + ", ".join(sorted({i for i in ids if ids.count(i) > 1})))
    if problems:
        print(f"{len(problems)} notes skipped:", *problems[:20], sep="\n  ")

    if args.oxford:
        official = official_levels(args.oxford)
        for word, lv in official_levels_pdf(args.oxford_us).items() if args.oxford_us else []:
            official.setdefault(word, set()).update(lv)
        missing = [w["word"] for w in words if w["word"].lower() not in official]
        level_off = [f'{w["word"]} {w["cefr"]} (Oxford: {"/".join(sorted(official[w["word"].lower()]))})'
                     for w in words if w["word"].lower() in official and w["cefr"] not in official[w["word"].lower()]]
        print(f"not in the official Oxford 3000/5000 page: {len(missing)}", missing[:30])
        print(f"level not among Oxford's levels for the word: {len(level_off)}", level_off[:30])
        if len(missing) > len(words) * 0.01:
            sys.exit("more than 1% of the words are not on Oxford's list: wrong deck?")

    if it_words:
        found = sum(1 for w in words if w["it"])
        print(f"IT words found: {found}/{len(it_words)}", sorted(it_words - {w["word"] for w in words}))

    words.sort(key=lambda w: (w["order"], w["id"]))
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump({
            "source": DECK_URL,
            "note": "Words, CEFR levels and IPA from the Oxford 3000/5000; Vietnamese meanings and examples by the deck's author (examples marked llm_authored in the deck).",
            "version": 1,
            "retrieved": datetime.date.today().isoformat(),
            "words": words,
        }, f, ensure_ascii=False, separators=(",", ":"))
    by_level = {l: sum(1 for w in words if w["cefr"] == l) for l in LEVELS}
    print(f"{len(words)} words written {by_level}; {sum(len(w['examples']) for w in words)} examples; "
          f"{os.path.getsize(args.out) // 1024} KB")


if __name__ == "__main__":
    main()
