#!/usr/bin/env python3
"""
Picks the IT words of the Oxford 3000 (scripts/wordlists/data/oxfordIt.json): the words of the bundled
vocabulary deck that are learnt first within their level (see build_catalog_from_anki.py, which reads
this file). Each pick keeps the reason it was picked (an Oxford IT/work topic, or how often it appears in
technical docs) and its US IPA from the CMU Pronouncing Dictionary.

Inputs (downloaded by hand, not kept in the repo):
  --wordlist  the saved HTML of https://www.oxfordlearnersdictionaries.com/wordlists/oxford3000-5000
  --topics    a folder of saved Oxford topic pages, named topic-<topic>.html, from
              https://www.oxfordlearnersdictionaries.com/topic/<topic>  (computers,
              phones-email-and-the-internet, working-life, jobs, business, scientific-research)
  --cmudict   cmudict.dict from https://github.com/cmusphinx/cmudict (BSD licence)
  --corpus    folders of English technical docs (README.md…) used to measure how often developers meet
              a word; only shown as evidence for the picks that are not in an Oxford IT topic

Nothing is invented: every picked word must exist in the Oxford 3000 with the given part of speech
(the script stops otherwise), its level is Oxford's, and its IPA is CMU's. Only the choice of which
words are "IT words" is ours: an Oxford IT/work topic, or frequent in technical docs with a clear
meaning at work.

Usage:
  python3 scripts/wordlists/build_oxford_it.py --wordlist ox.html --topics topics/ \
      --cmudict cmudict.dict --corpus node_modules ~/.cargo/registry/src
"""
import argparse
import datetime
import glob
import html
import json
import os
import re
import sys
from collections import defaultdict

WORDLIST_URL = "https://www.oxfordlearnersdictionaries.com/wordlists/oxford3000-5000"
TOPIC_URL = "https://www.oxfordlearnersdictionaries.com/topic/"

# Oxford topic sublists that are about computers, the internet or working in a team
IT_SUBLISTS = {
    "computer_hardware_t", "computer_problems_t", "computer_programming_t", "computer_software_t",
    "using_a_computer_t", "email_t", "using_the_internet_t", "websites_t", "text_messages_t",
    "communication_devices_t", "office_life_t", "business_meetings_t", "describing_work_t",
    "job_titles_t", "business_people_t", "data_t", "experiments_t", "results_t", "study_t",
    "running_a_business_t", "jobs_and_professions_t", "job_interviews_t", "making_calls_t",
    "social_networking_t", "marketing_t",
}

# The foundation decks: "word:part of speech" (one Oxford entry per word)
DECKS = {
    "it-core-1": """
computer:noun laptop:noun screen:noun keyboard:noun mouse:noun printer:noun tablet:noun smartphone:noun
device:noun machine:noun memory:noun battery:noun cable:noun monitor:noun camera:noun Wi-Fi:noun
button:noun key:noun window:noun menu:noun option:noun setting:noun file:noun document:noun page:noun
image:noun video:noun software:noun app:noun application:noun program:noun system:noun platform:noun
user:noun
open:verb close:verb save:verb copy:verb cut:verb print:verb type:verb click:verb press:verb
select:verb search:verb download:verb install:verb load:verb run:verb quit:verb connect:verb
access:verb enter:verb scan:verb export:verb import:verb drag:verb edit:verb start:verb stop:verb
hide:verb add:verb remove:verb move:verb change:verb create:verb
""",
    "it-core-2": """
code:noun language:noun function:noun command:noun instruction:noun script:noun data:noun
technology:noun environment:noun process:noun operation:noun architecture:noun version:noun
feature:noun value:noun method:noun item:noun list:noun table:noun record:noun column:noun row:noun
library:noun package:noun source:noun path:noun event:noun structure:noun pattern:noun model:noun
chart:noun diagram:noun branch:noun request:noun response:noun development:noun
digital:adjective technical:adjective electronic:adjective virtual:adjective
generate:verb update:verb release:verb build:verb develop:verb design:verb support:verb return:verb
define:verb depend:verb require:verb include:verb contain:verb allow:verb enable:verb provide:verb
replace:verb convert:verb store:verb
""",
    "it-core-3": """
internet:noun network:noun website:noun site:noun web:noun link:noun email:noun message:noun
text:noun address:noun blog:noun profile:noun account:noun comment:noun connection:noun
communication:noun information:noun
online:adjective mobile:adjective
chat:verb call:verb contact:verb attach:verb reply:verb send:verb receive:verb post:verb
publish:verb share:verb visit:verb
""",
    "it-core-4": """
team:noun project:noun task:noun plan:noun meeting:noun manager:noun boss:noun colleague:noun
customer:noun client:noun company:noun office:noun department:noun job:noun employee:noun
engineer:noun designer:noun leader:noun staff:noun schedule:noun target:noun goal:noun agenda:noun
appointment:noun product:noun service:noun business:noun skill:noun experience:noun training:noun
interview:noun career:noun salary:noun progress:noun management:noun question:noun answer:noun
idea:noun note:noun priority:noun
work:verb attend:verb meet:verb discuss:verb agree:verb decide:verb explain:verb understand:verb
manage:verb achieve:verb organize:verb complete:verb finish:verb review:verb
remote:adjective responsible:adjective
""",
    "it-core-5": """
error:noun problem:noun issue:noun mistake:noun warning:noun solution:noun test:noun result:noun
report:noun failure:noun success:noun virus:noun quality:noun performance:noun speed:noun size:noun
limit:noun level:noun sample:noun analysis:noun research:noun status:noun condition:noun case:noun
step:noun security:noun
fix:verb solve:verb check:verb pass:verb fail:verb crash:verb freeze:verb detect:verb confirm:verb
increase:verb reduce:verb improve:verb measure:verb compare:verb
""",
    "it-core-6": """
correct:adjective wrong:adjective available:adjective current:adjective latest:adjective
previous:adjective main:adjective simple:adjective complex:adjective fast:adjective slow:adjective
empty:adjective full:adjective ready:adjective local:adjective global:adjective public:adjective
private:adjective secure:adjective stable:adjective single:adjective multiple:adjective
successful:adjective possible:adjective
""",
}

# Words whose stress moves with the part of speech (CMU lists both without saying which is which)
VERB_STRESS_LAST = {"export", "import", "convert", "increase", "record", "progress", "update", "release", "contact"}
# CMU variant to use when its first one is a less common pronunciation (index into the word's variants)
PREFER_VARIANT = {"employee": 1, "enable": 1, "require": 2}
# The only pronunciations CMU lacks: "email" is only stressed on "-mail" there, "export" only as a noun
CMU_FIX = {("email", "noun"): "IY1 M EY2 L", ("export", "verb"): "IH0 K S P AO1 R T"}


def parse_wordlist(path):
    s = open(path, encoding="utf-8").read()
    rows = re.findall(
        r'<li data-hw="([^"]*)"([^>]*)>\s*<a href="([^"]*)">([^<]*)</a>\s*<span class="pos">([^<]*)</span>', s
    )
    entries = []
    for _hw, attrs, href, text, pos in rows:
        m = re.search(r'data-ox3000="([a-c][12])"', attrs)
        if m:
            word = html.unescape(text).replace("™", "").strip()
            entries.append({"word": word, "pos": pos, "cefr": m.group(1).upper(), "href": href})
    if len(entries) < 3500:
        sys.exit(f"Only {len(entries)} Oxford 3000 entries found: has the page layout changed?")
    return entries


def parse_topics(folder, by_href):
    topics = defaultdict(set)
    for f in sorted(glob.glob(os.path.join(folder, "topic-*.html"))):
        s = open(f, encoding="utf-8").read()
        for m in re.finditer(
            r'<li id="[^"]*" data-hw="[^"]*"((?: data-[a-z_0-9]+="[a-z0-9]+")+)>\s*<a href="([^"]*)">', s
        ):
            attrs, href = m.groups()
            if href in by_href:
                topics[href].update(x for x in re.findall(r'data-([a-z_0-9]+)="', attrs) if x in IT_SUBLISTS)
    return topics


def doc_frequency(dirs, words):
    docs = []
    for d in dirs:
        for p in glob.glob(os.path.join(os.path.expanduser(d), "**", "*.md"), recursive=True):
            try:
                t = open(p, encoding="utf-8", errors="ignore").read()
            except OSError:
                continue
            t = re.sub(r"```.*?```", "", t, flags=re.S)
            t = re.sub(r"`[^`]*`|https?://\S+|<[^>]+>", "", t)
            if len(t.split()) >= 80:
                docs.append(set(re.findall(r"[a-z]+(?:-[a-z]+)?", t.lower())))

    def forms(w):
        f = {w, w + "s", w + "es", w + "ed", w + "d", w + "ing"}
        if w.endswith("y"):
            f |= {w[:-1] + "ies", w[:-1] + "ied"}
        if w.endswith("e"):
            f.add(w[:-1] + "ing")
        return f

    n = max(1, len(docs))
    return {w: round(100 * sum(1 for d in docs if d & forms(w.lower())) / n) for w in words}, len(docs)


# --- CMU (ARPAbet) -> IPA, US, in the style of the Oxford US transcriptions ---
VOWELS = {
    "AA": "ɑː", "AE": "æ", "AO": "ɔː", "AW": "aʊ", "AY": "aɪ", "EH": "e", "EY": "eɪ", "IH": "ɪ",
    "OW": "oʊ", "OY": "ɔɪ", "UH": "ʊ",
}
CONS = {
    "B": "b", "CH": "tʃ", "D": "d", "DH": "ð", "F": "f", "G": "ɡ", "HH": "h", "JH": "dʒ", "K": "k",
    "L": "l", "M": "m", "N": "n", "NG": "ŋ", "P": "p", "R": "r", "S": "s", "SH": "ʃ", "T": "t",
    "TH": "θ", "V": "v", "W": "w", "Y": "j", "Z": "z", "ZH": "ʒ",
}
ONSETS = {
    tuple(x.split())
    for x in """P R|B R|T R|D R|K R|G R|F R|TH R|SH R|P L|B L|K L|G L|F L|S L|S P|S T|S K|S M|S N|S W|
    T W|D W|K W|G W|TH W|S P R|S T R|S K R|S P L|S K W|P Y|B Y|K Y|G Y|F Y|V Y|M Y|HH Y|S K Y|S P Y""".replace(
        "\n", ""
    ).split("|")
}


def vowel_ipa(ph, stress, last):
    if ph == "AH":
        return "ə" if stress == "0" else "ʌ"
    if ph == "ER":
        return "ər" if stress == "0" else "ɜːr"
    if ph == "IY":
        return "i" if stress == "0" else "iː"
    if ph == "UW":
        return "u" if stress == "0" and not last else "uː"
    return VOWELS[ph]


def to_ipa(arpabet):
    """
    ARPAbet -> IPA in the Oxford US style: primary stress, a secondary stress only two or more syllables
    before it (/ˌæplɪˈkeɪʃn/, not on a prefix /ɪnˈstɔːl/ or after the primary /ˈlæptɑːp/), syllabic
    final /l/ and /n/ (/ˈteɪbl/, /ˈvɜːrʒn/), no stress mark on one-syllable words
    """
    phones = arpabet.split()
    # "correct" K ER0 EH1 K T: the r starts the stressed syllable (/kəˈrekt/)
    fixed = []
    for i, p in enumerate(phones):
        if p == "ER0" and i + 1 < len(phones) and phones[i + 1][-1].isdigit():
            fixed += ["AH0", "R"]
        else:
            fixed.append(p)
    phones = fixed
    nuclei = [i for i, p in enumerate(phones) if p[-1].isdigit()]
    primaries = [i for i in nuclei if phones[i].endswith("1")]
    primary = primaries[-1] if primaries else None  # "engineer" has two in CMU: the last one wins
    stress_of = {}
    for n, v in enumerate(nuclei):
        st = phones[v][-1]
        if v == primary:
            stress_of[v] = "1"
        elif st in "12" and primary is not None and v < primary and nuclei.index(primary) - n >= 2:
            stress_of[v] = "2"
        else:
            # dropped secondary keeps its full vowel, except the "happy" /i/
            stress_of[v] = "0" if st == "0" or phones[v][:-1] == "IY" else "x"

    marks = {}
    if len(nuclei) > 1:
        prev = -1
        for v in nuclei:
            cons = phones[prev + 1 : v]
            onset = len(cons) if prev == -1 else 0
            if prev != -1:
                for k in range(min(3, len(cons)), 0, -1):
                    cl = tuple(cons[len(cons) - k :])
                    if (k == 1 and cl[0] != "NG") or cl in ONSETS:
                        onset = k
                        break
            if stress_of[v] in "12":
                marks[v - onset] = "ˈ" if stress_of[v] == "1" else "ˌ"
            prev = v

    out = []
    for i, p in enumerate(phones):
        if i in marks:
            out.append(marks[i])
        if p[-1].isdigit():
            ph, st = p[:-1], stress_of[i]
            last = i == len(phones) - 1
            final_syllabic = ph == "AH" and st == "0" and i == len(phones) - 2 and i > 0 and not phones[i - 1][-1].isdigit()
            if final_syllabic and (phones[-1] == "L" or (phones[-1] == "N" and phones[i - 1] in ("T", "D", "S", "Z", "SH", "ZH"))):
                continue
            out.append(vowel_ipa(ph, "2" if st == "x" else st, last))
        else:
            out.append(CONS[p])
    return "/" + "".join(out) + "/"


def load_cmudict(path):
    d = defaultdict(list)
    for line in open(path, encoding="utf-8"):
        line = line.split("#")[0].strip()
        if not line:
            continue
        head, pron = line.split(" ", 1)
        d[re.sub(r"\(\d+\)$", "", head)].append(pron.strip())
    return d


def pick_pron(word, pos, prons):
    """First CMU pronunciation, except for noun/verb stress pairs (verb: stress on the last syllable)"""
    if (word, pos) in CMU_FIX:
        return CMU_FIX[(word, pos)]
    if word in PREFER_VARIANT and len(prons) > PREFER_VARIANT[word]:
        return prons[PREFER_VARIANT[word]]
    if len(prons) > 1 and word in VERB_STRESS_LAST:
        def first_stress(p):
            vs = [x for x in p.split() if x[-1].isdigit()]
            return next(i for i, x in enumerate(vs) if x.endswith("1"))
        ordered = sorted(prons, key=first_stress)
        return ordered[-1] if pos == "verb" else ordered[0]
    return prons[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--wordlist", required=True)
    ap.add_argument("--topics", required=True)
    ap.add_argument("--cmudict", required=True)
    ap.add_argument("--corpus", nargs="*", default=[])
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "data"))
    args = ap.parse_args()

    entries = parse_wordlist(args.wordlist)
    by_href = {e["href"]: e for e in entries}
    by_key = {(e["word"], e["pos"]): e for e in entries}
    topics = parse_topics(args.topics, by_href)
    cmu = load_cmudict(args.cmudict)
    today = datetime.date.today().isoformat()

    picks, seen, missing = [], set(), []
    for deck, spec in DECKS.items():
        for item in spec.split():
            word, pos = item.split(":")
            e = by_key.get((word, pos))
            if not e:
                missing.append(item)
                continue
            if word in seen:
                sys.exit(f"{word} is picked twice")
            seen.add(word)
            prons = cmu.get(word.lower())
            if not prons:
                missing.append(f"{item} (no CMU pronunciation)")
                continue
            picks.append({
                "word": word, "pos": pos, "cefr": e["cefr"], "ipa": to_ipa(pick_pron(word.lower(), pos, prons)),
                "deck": deck, "topics": sorted(topics.get(e["href"], [])),
            })
    if missing:
        sys.exit("Not in the Oxford 3000 / CMU dictionary: " + ", ".join(missing))

    if args.corpus:
        df, ndocs = doc_frequency(args.corpus, [p["word"] for p in picks])
        for p in picks:
            p["docs"] = df[p["word"]]
        print(f"technical docs measured: {ndocs}")

    os.makedirs(args.out, exist_ok=True)
    with open(os.path.join(args.out, "oxfordIt.json"), "w", encoding="utf-8") as f:
        json.dump({
            "source": WORDLIST_URL,
            "topics": TOPIC_URL,
            "ipa": "CMU Pronouncing Dictionary (https://github.com/cmusphinx/cmudict), converted to IPA",
            "retrieved": today,
            "words": picks,
        }, f, ensure_ascii=False, indent=1)
    in_topic = sum(1 for p in picks if p["topics"])
    print(f"Oxford 3000 entries: {len(entries)}; IT picks: {len(picks)} ({in_topic} in an Oxford IT/work topic)")


if __name__ == "__main__":
    main()
