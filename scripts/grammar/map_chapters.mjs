import fs from "fs";

function page(n) {
  return fs.readFileSync(`scratch/pdf_text/page_${String(n).padStart(3, "0")}.txt`, "utf8");
}

let fullDoc = [];
for (let p = 1; p <= 222; p++) {
  fullDoc.push({ page: p, text: page(p) });
}

console.log("Loaded 222 pages.");

// Check where each chapter title appears
const CHAPTER_TITLES = [
  { id: "ch01", title: "TENSES", titleVn: "CÁC THÌ" },
  { id: "ch02", title: "SEQUENCE OF TENSES", titleVn: "SỰ PHỐI HỢP CÁC THÌ" },
  { id: "ch03", title: "CLAUSES OF CONDITION", titleVn: "CÂU ĐIỀU KIỆN" },
  { id: "ch04", title: "CLAUSES AFTER WISH", titleVn: "MỆNH ĐỀ SAU WISH, IF ONLY" },
  { id: "ch05", title: "PHRASES AND CLAUSES OF PURPOSE", titleVn: "CỤM TỪ VÀ MỆNH ĐỀ CHỈ MỤC ĐÍCH" },
  { id: "ch06", title: "PHRASES AND CLAUSES OF RESULT", titleVn: "CỤM TỪ VÀ MỆNH ĐỀ CHỈ KẾT QUẢ" },
  { id: "ch07", title: "PHRASES AND CLAUSES OF REASON", titleVn: "CỤM TỪ VÀ MỆNH ĐỀ CHỈ LÝ DO" },
  { id: "ch08", title: "PHRASES AND CLAUSES OF CONCESSION", titleVn: "CỤM TỪ VÀ MỆNH ĐỀ CHỈ SỰ NHƯỢNG BỘ" },
  { id: "ch09", title: "CLAUSES AFTER AS IF", titleVn: "MỆNH ĐỀ SAU AS IF, AS THOUGH..." },
  { id: "ch10", title: "NOUN CLAUSES", titleVn: "MỆNH ĐỀ DANH TỪ" },
  { id: "ch11", title: "RELATIVE CLAUSES", titleVn: "MỆNH ĐỀ QUAN HỆ" },
  { id: "ch12", title: "EXPRESSION OF QUANTITY", titleVn: "TỪ CHỈ SỐ LƯỢNG" },
  { id: "ch13", title: "STYLES", titleVn: "VĂN PHONG" },
  { id: "ch14", title: "EMPHASIS", titleVn: "DẠNG NHẤN MẠNH" },
  { id: "ch15", title: "NOUNS", titleVn: "DANH TỪ" },
  { id: "ch16", title: "PRONOUNS", titleVn: "ĐẠI TỪ" },
  { id: "ch17", title: "ADJECTIVES", titleVn: "TÍNH TỪ" },
  { id: "ch18", title: "ADVERBS", titleVn: "TRẠNG TỪ" },
  { id: "ch19", title: "DEGREES OF COMPARISON", titleVn: "SO SÁNH CỦA TÍNH TỪ VÀ TRẠNG TỪ" },
  { id: "ch20", title: "VERBS", titleVn: "ĐỘNG TỪ" },
  { id: "ch21", title: "NUMBERS", titleVn: "SỐ TỪ" },
  { id: "ch22", title: "PREPOSITIONS", titleVn: "GIỚI TỪ" },
  { id: "ch23", title: "CONJUNCTIONS", titleVn: "LIÊN TỪ" },
  { id: "ch24", title: "ARTICLES", titleVn: "MẠO TỪ" },
  { id: "ch25", title: "WORD FORMATIONS", titleVn: "CẤU TẠO TỪ VÀ DẠNG TỪ" },
  { id: "ch26", title: "ACRONYMS", titleVn: "TỪ VIẾT TẮT" },
  { id: "ch27", title: "IDIOMATIC EXPRESSIONS", titleVn: "THÀNH NGỮ" },
  { id: "ch28", title: "REPORTED SPEECH", titleVn: "LỜI NÓI GIÁN TIẾP" },
  { id: "ch29", title: "PASSIVE AND ACTIVE", titleVn: "CÂU CHỦ ĐỘNG VÀ BỊ ĐỘNG" },
  { id: "ch30", title: "SENTENCES", titleVn: "CÂU" },
  { id: "ch31", title: "PRACTICE TEST", titleVn: "BÀI KIỂM TRA TỔNG HỢP" },
];

for (const c of CHAPTER_TITLES) {
  const matches = [];
  for (const p of fullDoc) {
    if (p.text.includes(c.title)) {
      matches.push(p.page);
    }
  }
  console.log(`${c.id}: ${c.title} -> pages: [${matches.join(", ")}]`);
}
