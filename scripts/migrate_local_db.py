#!/usr/bin/env python3
"""
Direct migration script for the user's local SQLite database (~/Library/Application Support/com.myenglish.app/myenglish.db).
Performs:
  1. ALTER TABLE examples ADD COLUMN sense_index INTEGER;
  2. PRAGMA user_version = 13;
  3. Updates vocab_catalog to version 2 with senseIndex.
  4. Backfills sense_index for all existing studied words in examples table.
  5. Sets vocab_catalog_meta version = '2' and words_version = '2'.
"""
import sqlite3
import json
import os

db_path = os.path.expanduser("~/Library/Application Support/com.myenglish.app/myenglish.db")
if not os.path.exists(db_path):
    print("Database file not found at:", db_path)
    exit(1)

catalog_path = os.path.join(os.path.dirname(__file__), "..", "src", "data", "vocabCatalog.json")
with open(catalog_path, "r", encoding="utf-8") as f:
    cat = json.load(f)

conn = sqlite3.connect(db_path)
c = conn.cursor()

# 1. Add sense_index column if missing
c.execute("PRAGMA table_info(examples);")
cols = [r[1] for r in c.fetchall()]
if "sense_index" not in cols:
    print("Adding column 'sense_index' to examples table...")
    c.execute("ALTER TABLE examples ADD COLUMN sense_index INTEGER;")
else:
    print("Column 'sense_index' already exists in examples table.")

# 2. PRAGMA user_version
c.execute("PRAGMA user_version = 13;")

# 3. Update vocab_catalog with version 2
print(f"Updating vocab_catalog table with {len(cat['words'])} words...")
for w in cat["words"]:
    data = {
        "senses": w["senses"],
        "ipaUs": w["ipaUs"],
        "ipaUk": w["ipaUk"],
        "variants": w["variants"],
        "irregular": w["irregular"],
        "examples": w["examples"],
    }
    c.execute(
        """INSERT INTO vocab_catalog (id, word, cefr, list, study_order, freq, it, pos, vn, data)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET word=excluded.word, cefr=excluded.cefr, list=excluded.list,
             study_order=excluded.study_order, freq=excluded.freq, it=excluded.it, pos=excluded.pos,
             vn=excluded.vn, data=excluded.data;""",
        (w["id"], w["word"], w["cefr"], w["list"], w["order"], w["freq"], 1 if w["it"] else 0, w["pos"], w["vn"], json.dumps(data, ensure_ascii=False))
    )

c.execute("INSERT OR REPLACE INTO vocab_catalog_meta (key, value) VALUES ('count', ?);", (str(len(cat["words"])),))
c.execute("INSERT OR REPLACE INTO vocab_catalog_meta (key, value) VALUES ('version', '2');")

# 4. Backfill existing examples
c.execute("""
    SELECT e.id, e.word_id, e.sentence_en, w.catalog_id
    FROM examples e
    JOIN words w ON w.id = e.word_id
    WHERE w.catalog_id IS NOT NULL AND e.sense_index IS NULL;
""")
unindexed = c.fetchall()
print(f"Found {len(unindexed)} unindexed examples in your current study list.")

cat_lookup = {w["id"]: w for w in cat["words"]}
updated_count = 0

for ex_id, word_id, sentence_en, catalog_id in unindexed:
    word_entry = cat_lookup.get(catalog_id)
    if not word_entry:
        continue
    matched = next((ex for ex in word_entry["examples"] if ex["en"].strip() == sentence_en.strip()), None)
    if matched and "senseIndex" in matched:
        c.execute("UPDATE examples SET sense_index = ? WHERE id = ?;", (matched["senseIndex"], ex_id))
        updated_count += 1

c.execute("INSERT OR REPLACE INTO vocab_catalog_meta (key, value) VALUES ('words_version', '2');")

conn.commit()
conn.close()
print(f"Done! {updated_count} examples successfully updated with sense_index.")
