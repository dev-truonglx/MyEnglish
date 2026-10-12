import fs from "fs";
import path from "path";
import { validateFile } from "./validate.mjs";

function getPages(start, end) {
  let s = "";
  for (let p = start; p <= end; p++) {
    s += fs.readFileSync(`scratch/pdf_text/page_${String(p).padStart(3, "0")}.txt`, "utf8") + "\n";
  }
  return s;
}

function detectType(instr) {
  const s = instr.toLowerCase();
  if (s.includes("verb") || s.includes("tense") || s.includes("form of")) return "verb_form";
  if (s.includes("rewrite") || s.includes("make") || s.includes("combine") || s.includes("change") || s.includes("replace")) return "rewrite";
  if (s.includes("fill") || s.includes("supply") || s.includes("choose") || s.includes("use")) return "fill_blank";
  if (s.includes("complete")) return "complete_sentence";
  return "fill_blank";
}

export function buildChapter(config) {
  const { id, order, title, titleVn, startPage, endPage, keyStartPage, keyEndPage, nextTitle, nextKeyTitle } = config;

  const rawFull = getPages(startPage, endPage);
  let text = rawFull;
  if (title) {
    const idx = text.indexOf(title);
    if (idx !== -1) text = text.slice(idx);
  }
  if (nextTitle) {
    const nextIdx = text.indexOf(nextTitle);
    if (nextIdx !== -1) text = text.slice(0, nextIdx);
  }

  const rawKeys = (keyStartPage && keyEndPage) ? getPages(keyStartPage, keyEndPage) : "";
  let kText = rawKeys;
  const targetKeyTitle = config.keyTitle || title;
  if (targetKeyTitle) {
    const idx = kText.indexOf(targetKeyTitle);
    if (idx !== -1) kText = kText.slice(idx);
  }
  if (nextKeyTitle) {
    const nextIdx = kText.indexOf(nextKeyTitle);
    if (nextIdx !== -1) kText = kText.slice(0, nextIdx);
  }

  // 1. Separate Theory & Exercises
  let exIdx = text.indexOf(config.exerciseKeyword || "EXERCISES");
  if (config.isAllExercises) exIdx = 0;
  const theory = exIdx > 0 ? text.slice(0, exIdx) : (config.isAllExercises ? "" : (exIdx === 0 ? "" : text));
  const exercises = exIdx !== -1 ? text.slice(exIdx) : "";

  // 2. Build Lessons from theory
  const lessonSections = theory.split(/\n(?=(?:[I|V|X]+\.|\d+\.)\s+[A-ZÀ-Ỹa-zà-ỹ])/);
  const lessons = [];
  let lOrd = 0;

  for (let i = 0; i < lessonSections.length; i++) {
    const sec = lessonSections[i].trim();
    if (!sec || sec === title) continue;
    const lines = sec.split("\n").map(l => l.trim()).filter(Boolean);
    const headerLine = lines[0];
    const match = headerLine.match(/^(?:[I|V|X]+|\d+)\.\s*(.*)$/);
    if (!match && i === 0 && !headerLine.includes(".")) continue;

    lOrd++;
    const lTitle = match ? match[1] : headerLine;
    const blocks = [];
    let curText = [];

    for (let j = 1; j < lines.length; j++) {
      const line = lines[j];
      if (/^Ex:/i.test(line)) {
        if (curText.length > 0) {
          blocks.push({ type: "bullet", text: curText.join(" ") });
          curText = [];
        }
        blocks.push({ type: "example", en: line.replace(/^Ex:\s*/i, "").trim(), vi: "" });
      } else if (/^[A-Z\s\+\(\)\-]{4,}\+.*$/.test(line) || /^S\s*\+\s*/.test(line)) {
        if (curText.length > 0) {
          blocks.push({ type: "bullet", text: curText.join(" ") });
          curText = [];
        }
        blocks.push({ type: "formula", label: "Cấu trúc", text: line });
      } else if (/^/.test(line)) {
        blocks.push({ type: "example", en: line.replace(/^\s*/, ""), vi: "" });
      } else {
        curText.push(line);
      }
    }
    if (curText.length > 0) {
      blocks.push({ type: "text", text: curText.join(" ") });
    }

    lessons.push({
      id: `${id}-l${String(lOrd).padStart(2, "0")}`,
      order: lOrd,
      title: lTitle,
      titleVn: lTitle,
      page: startPage,
      blocks: blocks.length > 0 ? blocks : [{ type: "text", text: sec }]
    });
  }

  if (lessons.length === 0) {
    lessons.push({
      id: `${id}-l01`,
      order: 1,
      title,
      titleVn,
      page: startPage,
      blocks: [{ type: "text", text: theory }]
    });
  }

  // 3. Build Key Map from answer keys
  let rawKeySets = kText.split(/\n(?=[I|V|X]+\.\s)/);
  if (rawKeySets.length <= 1 && /(?:^|\s)1\.\s/.test(kText)) {
    rawKeySets = [`I. Answers\n` + kText];
  }
  const keyMap = new Map();

  for (const kSec of rawKeySets) {
    const kLines = kSec.trim().split("\n");
    const kMatch = kLines[0].match(/^([I|V|X]+)\.\s*(.*)$/);
    if (kMatch) {
      const roman = kMatch[1];
      const answers = new Map();
      const body = (kMatch[2] ? kMatch[2] + "\n" : "") + kLines.slice(1).join("\n");
      // Match both inline numbers "1. so 2. such" and multiline numbers
      const numMatches = [...body.matchAll(/(?:^|\s)(\d+)\.\s*([^\d\n][^\n]*?)(?=(?:\s+\d+\.|$|\n))/g)];
      for (const m of numMatches) {
        answers.set(parseInt(m[1], 10), m[2].trim());
      }
      keyMap.set(roman, answers);
    }
  }

  // 4. Build Exercise Sets
  let rawSets = exercises.split(/\n(?=[I|V|X]+\.\s)/);
  if (rawSets.length <= 1 && exercises.includes("1.")) {
    const lines = exercises.trim().split("\n");
    const inst = lines.slice(1).find(l => !/^\d+\./.test(l) && l.trim()) || "Exercises";
    rawSets = [`I. ${inst}\n` + exercises];
  }
  const exerciseSets = [];
  let sOrd = 0;

  for (const sSec of rawSets) {
    const sLines = sSec.trim().split("\n");
    const sMatch = sLines[0].match(/^([I|V|X]+)\.\s*(.*)$/);
    if (!sMatch) continue;

    const roman = sMatch[1];
    const instruction = sMatch[2].trim() || `Exercise ${roman}`;
    if (/^Các mẫu câu|Theory|Lý thuyết/i.test(instruction)) continue;

    sOrd++;
    const setId = `${id}-s${String(sOrd).padStart(2, "0")}`;

    const items = [];
    const itemMatches = [...sSec.matchAll(/(?:^|\n)(\d+)\.\s*([^\n]+(?:\n(?!\d+\.)[^\n]+)*)/g)];
    const setKeys = keyMap.get(roman) || new Map();

    for (const im of itemMatches) {
      const n = parseInt(im[1], 10);
      const prompt = im[2].replace(/\s+/g, " ").trim();
      if (prompt.endsWith(":") || /^(?:Yes\s*-\s*No|Wh-|Sentences with|Sentences of|Some special)/i.test(prompt)) continue;
      const ans = setKeys.get(n) || "";
      const answers = ans ? [[ans.replace(/\s+/g, " ").trim()]] : [[]];

      items.push({
        n,
        prompt,
        answers,
        answerSentence: ans ? ans : prompt,
        noKey: !ans,
        selfGrade: !ans
      });
    }

    if (items.length > 0) {
      exerciseSets.push({
        id: setId,
        roman,
        instruction,
        type: detectType(instruction),
        page: startPage,
        keyPage: keyStartPage,
        lessonIds: lessons.map(l => l.id),
        itemCount: items.length,
        items
      });
    }
  }

  // 5. Partition into Part 1 (Theory) and Part 2 (Exercises, split if > 60 items)
  const part1 = {
    format: "myenglish-grammar-book",
    version: 2,
    chapterId: id,
    part: 1,
    parts: exerciseSets.length > 5 ? 3 : (exerciseSets.length > 0 ? 2 : 1),
    chapter: {
      order,
      title,
      titleVn,
      pages: [startPage, endPage]
    },
    lessons,
    fixes: []
  };

  const filesToSave = [];
  filesToSave.push({ name: `${id}-p1.json`, data: part1 });

  if (exerciseSets.length > 0) {
    if (part1.parts === 3) {
      const mid = Math.ceil(exerciseSets.length / 2);
      const setsP2 = exerciseSets.slice(0, mid);
      const setsP3 = exerciseSets.slice(mid);

      filesToSave.push({
        name: `${id}-p2.json`,
        data: {
          format: "myenglish-grammar-book",
          version: 2,
          chapterId: id,
          part: 2,
          parts: 3,
          exerciseSets: setsP2,
          fixes: []
        }
      });
      filesToSave.push({
        name: `${id}-p3.json`,
        data: {
          format: "myenglish-grammar-book",
          version: 2,
          chapterId: id,
          part: 3,
          parts: 3,
          exerciseSets: setsP3,
          fixes: []
        }
      });
    } else {
      filesToSave.push({
        name: `${id}-p2.json`,
        data: {
          format: "myenglish-grammar-book",
          version: 2,
          chapterId: id,
          part: 2,
          parts: 2,
          exerciseSets,
          fixes: []
        }
      });
    }
  }

  let totalItems = 0;
  for (const f of filesToSave) {
    const target = path.join("json-data", f.name);
    fs.writeFileSync(target, JSON.stringify(f.data, null, 2), "utf8");
    const res = validateFile(f.data, f.name);
    if (!res.valid) {
      console.error(`❌ ${f.name} error:`, res.errors);
    } else {
      totalItems += res.itemCount;
    }
  }

  console.log(`✅ [${id}] ${title}: ${lessons.length} lessons, ${exerciseSets.length} sets, ${totalItems} items (${filesToSave.length} parts)`);
  return totalItems;
}

// ==========================================
// RUN BATCH 1 (COMPLETION: ch06 - ch11)
// ==========================================

const BATCH1_REST = [
  {
    id: "ch06",
    order: 6,
    title: "PHRASES AND CLAUSES OF RESULT",
    titleVn: "CỤM TỪ VÀ MỆNH ĐỀ CHỈ KẾT QUẢ",
    startPage: 32,
    endPage: 37,
    keyStartPage: 58,
    keyEndPage: 60,
    nextTitle: "PHRASES AND CLAUSES OF REASON",
    nextKeyTitle: "PHRASES AND CEAUSES OF REASON"
  },
  {
    id: "ch07",
    order: 7,
    title: "PHRASES AND CLAUSES OF REASON",
    titleVn: "CỤM TỪ VÀ MỆNH ĐỀ CHỈ LÝ DO",
    startPage: 37,
    endPage: 39,
    keyStartPage: 60,
    keyEndPage: 61,
    nextTitle: "PHRASES AND CLAUSES OF CONCESSION",
    nextKeyTitle: "PHRASES AND CLAUSES OF CONCESSION"
  },
  {
    id: "ch08",
    order: 8,
    title: "PHRASES AND CLAUSES OF CONCESSION",
    titleVn: "CỤM TỪ VÀ MỆNH ĐỀ CHỈ SỰ NHƯỢNG BỘ",
    startPage: 39,
    endPage: 41,
    keyStartPage: 61,
    keyEndPage: 62,
    nextTitle: "CLAUSES AFTER AS IF",
    nextKeyTitle: "CLAUSES AFTER AS IF"
  },
  {
    id: "ch09",
    order: 9,
    title: "CLAUSES AFTER AS IF, AS THOUGH, IT'S HIGH TIME",
    titleVn: "MỆNH ĐỀ SAU AS IF, AS THOUGH, IT'S TIME...",
    startPage: 41,
    endPage: 44,
    keyStartPage: 62,
    keyEndPage: 63,
    nextTitle: "NOUN CLAUSES",
    nextKeyTitle: "NOUN CLAUSES"
  },
  {
    id: "ch10",
    order: 10,
    title: "NOUN CLAUSES",
    titleVn: "MỆNH ĐỀ DANH TỪ",
    startPage: 44,
    endPage: 46,
    keyStartPage: 63,
    keyEndPage: 63,
    nextTitle: "RELATIVE CLAUSES",
    nextKeyTitle: "RELATIVE CLAUSES"
  },
  {
    id: "ch11",
    order: 11,
    title: "RELATIVE CLAUSES",
    titleVn: "MỆNH ĐỀ QUAN HỆ",
    startPage: 46,
    endPage: 54,
    keyStartPage: 63,
    keyEndPage: 68,
    nextTitle: "EXPRESSION OF QUANTITY",
    nextKeyTitle: "EXPRESSION OF QUANTITY"
  }
];

if (process.argv[1] && process.argv[1].endsWith("master_compiler.mjs")) {
  let grandTotal = 0;
  for (const c of BATCH1_REST) {
    grandTotal += buildChapter(c);
  }
  console.log(`\n🎉 Batch 1 (ch06 - ch11) completed! Added ${grandTotal} items.`);
}
