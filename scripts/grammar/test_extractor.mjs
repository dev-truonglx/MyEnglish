import fs from "fs";

function getPages(start, end) {
  let s = "";
  for (let p = start; p <= end; p++) {
    s += fs.readFileSync(`scratch/pdf_text/page_${String(p).padStart(3, "0")}.txt`, "utf8") + "\n";
  }
  return s;
}

export function parseChapter(chapterId, title, titleVn, startPage, endPage, keyStartPage, keyEndPage) {
  const fullText = getPages(startPage, endPage);
  const keyText = getPages(keyStartPage, keyEndPage);

  // 1. Slice text specifically for this chapter if multiple chapters share pages
  const chIdx = fullText.indexOf(title);
  const textFromTitle = chIdx !== -1 ? fullText.slice(chIdx) : fullText;

  const exIdx = textFromTitle.indexOf("EXERCISES");
  const theoryText = exIdx !== -1 ? textFromTitle.slice(0, exIdx) : textFromTitle;
  const exerciseText = exIdx !== -1 ? textFromTitle.slice(exIdx) : "";

  // 2. Parse Lessons from theory
  // Look for sections like I. Cụm từ... II. Mệnh đề... or 1. ... 2. ...
  const lessonSections = theoryText.split(/\n(?=(?:[I|V|X]+\.|\d+\.)\s+[A-ZÀ-Ỹ])/);
  const lessons = [];
  let lessonOrder = 0;

  for (let i = 0; i < lessonSections.length; i++) {
    const sec = lessonSections[i].trim();
    if (!sec || sec === title) continue;
    const lines = sec.split("\n").map(l => l.trim()).filter(Boolean);
    const headerLine = lines[0];
    const match = headerLine.match(/^(?:[I|V|X]+|\d+)\.\s+(.*)$/);
    if (!match && i === 0) continue; // skip chapter title block if unnumbered

    lessonOrder++;
    const lessonTitle = match ? match[1] : headerLine;
    const blocks = [];

    let currentText = [];
    for (let j = 1; j < lines.length; j++) {
      const line = lines[j];
      if (/^Ex:/i.test(line)) {
        if (currentText.length > 0) {
          blocks.push({ type: "bullet", text: currentText.join(" ") });
          currentText = [];
        }
        const en = line.replace(/^Ex:\s*/i, "").trim();
        blocks.push({ type: "example", en, vi: "" });
      } else if (/^[A-Z\s\+\(\)\-]{4,}\+.*$/.test(line) || /^S\s*\+\s*/.test(line)) {
        if (currentText.length > 0) {
          blocks.push({ type: "bullet", text: currentText.join(" ") });
          currentText = [];
        }
        blocks.push({ type: "formula", label: "Cấu trúc", text: line });
      } else if (/^/.test(line)) {
        blocks.push({ type: "example", en: line.replace(/^\s*/, ""), vi: "" });
      } else {
        currentText.push(line);
      }
    }
    if (currentText.length > 0) {
      blocks.push({ type: "text", text: currentText.join(" ") });
    }

    lessons.push({
      id: `${chapterId}-l${String(lessonOrder).padStart(2, "0")}`,
      order: lessonOrder,
      title: lessonTitle,
      titleVn: lessonTitle,
      page: startPage,
      blocks: blocks.length > 0 ? blocks : [{ type: "text", text: sec }]
    });
  }

  // 3. Parse Exercise Sets
  const rawSets = exerciseText.split(/\n(?=[I|V|X]+\.\s)/);
  const exerciseSets = [];
  let setOrder = 0;

  // Find corresponding key section
  const keyChIdx = keyText.indexOf(title);
  const relevantKeyText = keyChIdx !== -1 ? keyText.slice(keyChIdx) : keyText;
  const rawKeys = relevantKeyText.split(/\n(?=[I|V|X]+\.\s)/);
  const keyMap = new Map();

  for (const kSec of rawKeys) {
    const kLines = kSec.trim().split("\n");
    const kMatch = kLines[0].match(/^([I|V|X]+)\.\s*(.*)$/);
    if (kMatch) {
      const roman = kMatch[1];
      const answers = new Map();
      // Match "1. ans 2. ans" or multiline
      const body = (kMatch[2] ? kMatch[2] + "\n" : "") + kLines.slice(1).join("\n");
      const numMatches = [...body.matchAll(/(?:^|\s)(\d+)\.\s*([^0-9\n][^\n]*?)(?=(?:\s\d+\.|$))/g)];
      for (const m of numMatches) {
        answers.set(parseInt(m[1], 10), m[2].trim());
      }
      keyMap.set(roman, answers);
    }
  }

  for (const sSec of rawSets) {
    const sLines = sSec.trim().split("\n");
    const sMatch = sLines[0].match(/^([I|V|X]+)\.\s*(.*)$/);
    if (!sMatch) continue;

    setOrder++;
    const roman = sMatch[1];
    const instruction = sMatch[2].trim();
    const setId = `${chapterId}-s${String(setOrder).padStart(2, "0")}`;

    // Extract items
    const items = [];
    const itemMatches = [...sSec.matchAll(/(?:^|\n)(\d+)\.\s*([^\n]+(?:\n(?!\d+\.)[^\n]+)*)/g)];
    const setKeys = keyMap.get(roman) || new Map();

    for (const im of itemMatches) {
      const n = parseInt(im[1], 10);
      const prompt = im[2].replace(/\s+/g, " ").trim();
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

    exerciseSets.push({
      id: setId,
      roman,
      instruction,
      type: detectType(instruction),
      page: startPage,
      keyPage: keyStartPage,
      itemCount: items.length,
      items
    });
  }

  return { lessons, exerciseSets };
}

function detectType(instr) {
  const s = instr.toLowerCase();
  if (s.includes("verb") || s.includes("tense")) return "verb_form";
  if (s.includes("rewrite") || s.includes("make") || s.includes("combine") || s.includes("change")) return "rewrite";
  if (s.includes("fill") || s.includes("supply") || s.includes("choose") || s.includes("use")) return "fill_blank";
  if (s.includes("complete")) return "complete_sentence";
  return "fill_blank";
}

const res = parseChapter("ch06", "PHRASES AND CLAUSES OF RESULT", "CỤM TỪ VÀ MỆNH ĐỀ CHỈ KẾT QUẢ", 32, 36, 58, 60);
console.log(`Parsed ch06: ${res.lessons.length} lessons, ${res.exerciseSets.length} sets`);
for (const s of res.exerciseSets) {
  console.log(`  Set ${s.roman} (${s.id}): ${s.items.length} items, keys matched: ${s.items.filter(it => !it.noKey).length}`);
}
