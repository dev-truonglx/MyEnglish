import fs from "fs";
import path from "path";

const VALID_CHAPTER_IDS = new Set(Array.from({ length: 31 }, (_, i) => `ch${String(i + 1).padStart(2, "0")}`));

export function validateFile(raw, fileName = "unnamed.json") {
  const errors = [];
  const warnings = [];

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { valid: false, errors: [{ file: fileName, message: "JSON is not an object" }], warnings };
  }

  const file = raw;
  const chapterId = String(file.chapterId || "").trim();

  if (file.format !== "myenglish-grammar-book") {
    errors.push({ file: fileName, message: `Invalid format: ${file.format}` });
  }
  if (file.version !== 1 && file.version !== 2) {
    errors.push({ file: fileName, message: `Invalid version: ${file.version}` });
  }
  if (!VALID_CHAPTER_IDS.has(chapterId)) {
    errors.push({ file: fileName, message: `Invalid chapterId: ${chapterId}` });
  }
  if (errors.length > 0) return { valid: false, errors, warnings };

  const prefix = `${chapterId}-`;
  const lessons = Array.isArray(file.lessons) ? file.lessons : [];
  for (const l of lessons) {
    if (!l.id || !l.id.startsWith(prefix)) {
      errors.push({ file: fileName, message: `Lesson id "${l.id}" must start with "${prefix}"` });
    }
  }

  const sets = Array.isArray(file.exerciseSets) ? file.exerciseSets : [];
  let itemCount = 0;
  for (const s of sets) {
    if (!s.id || !s.id.startsWith(prefix)) {
      errors.push({ file: fileName, message: `Set id "${s.id}" must start with "${prefix}"` });
    }
    const items = Array.isArray(s.items) ? s.items : [];
    itemCount += items.length;
    for (const it of items) {
      if (typeof it.n !== "number") {
        errors.push({ file: fileName, message: `Item in set ${s.id} missing integer n` });
      }
      if (!it.prompt || !it.prompt.trim()) {
        errors.push({ file: fileName, message: `Item ${s.id}#${it.n} missing prompt` });
      }
      if (!Array.isArray(it.answers) && !it.noKey && !it.selfGrade && !it.answerSentence) {
        warnings.push({ file: fileName, message: `Item ${s.id}#${it.n} has no answers or answerSentence` });
      }
    }
  }

  const groups = Array.isArray(file.practiceGroups) ? file.practiceGroups : [];
  for (const g of groups) {
    const items = Array.isArray(g.items) ? g.items : [];
    itemCount += items.length;
  }

  return { valid: errors.length === 0, errors, warnings, itemCount };
}

if (process.argv[1] && process.argv[1].endsWith("validate.mjs")) {
  const dir = "json-data";
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  let totalErrors = 0;
  let totalWarnings = 0;
  let totalItems = 0;
  const chapters = new Set();

  for (const f of files) {
    const content = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const res = validateFile(content, f);
    chapters.add(content.chapterId);
    totalItems += res.itemCount;
    if (!res.valid) {
      console.error(`❌ ${f}:`, res.errors);
      totalErrors += res.errors.length;
    } else {
      console.log(`✓ ${f}: valid, items = ${res.itemCount}`);
    }
    if (res.warnings.length > 0) {
      totalWarnings += res.warnings.length;
    }
  }

  console.log(`\nTổng kết: ${files.length} files, ${chapters.size} chương, ${totalItems} câu hỏi. Lỗi: ${totalErrors}, Cảnh báo: ${totalWarnings}`);
}
