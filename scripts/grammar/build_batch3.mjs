import { buildChapter } from "./master_compiler.mjs";

const BATCH3 = [
  {
    id: "ch15",
    order: 15,
    title: "NOUNS",
    titleVn: "DANH TỪ",
    startPage: 85,
    endPage: 93,
    keyStartPage: 166,
    keyEndPage: 167,
    nextTitle: "PRONOUNS",
    nextKeyTitle: "PRONOUNS"
  },
  {
    id: "ch16",
    order: 16,
    title: "PRONOUNS",
    titleVn: "ĐẠI TỪ",
    startPage: 93,
    endPage: 100,
    keyStartPage: 167,
    keyEndPage: 168,
    nextTitle: "ADJECTIVES",
    nextKeyTitle: "ADJECTIVES"
  },
  {
    id: "ch17",
    order: 17,
    title: "ADJECTIVES",
    titleVn: "TÍNH TỪ",
    startPage: 100,
    endPage: 106,
    keyStartPage: 168,
    keyEndPage: 169,
    nextTitle: "ADVERBS",
    nextKeyTitle: "ADVERBS"
  },
  {
    id: "ch18",
    order: 18,
    title: "ADVERBS",
    titleVn: "TRẠNG TỪ",
    startPage: 106,
    endPage: 110,
    keyStartPage: 169,
    keyEndPage: 170,
    nextTitle: "DEGREES OF COMPARISON",
    nextKeyTitle: "CÁC MỨC ĐỘ SO SÁNH"
  },
  {
    id: "ch19",
    order: 19,
    title: "DEGREES OF COMPARISON OF ADJECTIVES AND ADVERBS",
    titleVn: "SO SÁNH CỦA TÍNH TỪ VÀ TRẠNG TỪ",
    startPage: 110,
    endPage: 115,
    keyStartPage: 170,
    keyEndPage: 171,
    nextTitle: "VERBS (ĐỘNG TỪ)",
    nextKeyTitle: "ĐỘNG TỪ"
  },
  {
    id: "ch20",
    order: 20,
    title: "VERBS",
    titleVn: "ĐỘNG TỪ",
    startPage: 115,
    endPage: 126,
    keyStartPage: 171,
    keyEndPage: 172,
    nextTitle: "NUMBERS",
    nextKeyTitle: "NUMBERS"
  },
  {
    id: "ch21",
    order: 21,
    title: "NUMBERS",
    titleVn: "SỐ TỪ",
    startPage: 126,
    endPage: 128,
    keyStartPage: 172,
    keyEndPage: 173,
    nextTitle: "PREPOSITIONS",
    nextKeyTitle: "PREPOSITIONS"
  }
];

let grandTotal = 0;
for (const c of BATCH3) {
  grandTotal += buildChapter(c);
}
console.log(`\n🎉 Batch 3 (ch15 - ch21) completed! Added ${grandTotal} items.`);
