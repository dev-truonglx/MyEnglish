import { buildChapter } from "./master_compiler.mjs";

const BATCH4 = [
  {
    id: "ch22",
    order: 22,
    title: "PREPOSITIONS (GIỚI TỪ)",
    titleVn: "GIỚI TỪ",
    startPage: 127,
    endPage: 142,
    keyStartPage: 172,
    keyEndPage: 173,
    keyTitle: "GIỚI TỪ (PREPOSITIONS)",
    nextTitle: "CONJUNCTIONS (LIÊN TỪ)",
    nextKeyTitle: "LIÊN TỪ (CONJUNCTIONS)"
  },
  {
    id: "ch23",
    order: 23,
    title: "CONJUNCTIONS (LIÊN TỪ)",
    titleVn: "LIÊN TỪ",
    startPage: 142,
    endPage: 143,
    keyStartPage: 173,
    keyEndPage: 174,
    keyTitle: "LIÊN TỪ (CONJUNCTIONS)",
    nextTitle: "ARTICLES (MẠO TỪ)",
    nextKeyTitle: "MẠO TỪ (ARTICLES)"
  },
  {
    id: "ch24",
    order: 24,
    title: "ARTICLES (MẠO TỪ)",
    titleVn: "MẠO TỪ",
    startPage: 143,
    endPage: 147,
    keyStartPage: 174,
    keyEndPage: 174,
    keyTitle: "MẠO TỪ (ARTICLES)",
    nextTitle: "WORD STUDY (TỪ VỰNG HỌC)",
    nextKeyTitle: "WORD – FORM"
  },
  {
    id: "ch25",
    order: 25,
    title: "WORD FORMATIONS",
    titleVn: "CÁCH THÀNH LẬP TỪ VÀ HÌNH THÁI TỪ",
    startPage: 147,
    endPage: 162,
    keyStartPage: 174,
    keyEndPage: 176,
    keyTitle: "WORD – FORM",
    nextTitle: "ACRONYMS",
    nextKeyTitle: "IDIOMATIC EXPRESSIONS"
  },
  {
    id: "ch26",
    order: 26,
    title: "ACRONYMS",
    titleVn: "TỪ VIẾT TẮT",
    startPage: 162,
    endPage: 163,
    keyStartPage: 0,
    keyEndPage: 0,
    nextTitle: "IDIOMATIC EXPRESSIONS"
  },
  {
    id: "ch27",
    order: 27,
    title: "IDIOMATIC EXPRESSIONS",
    titleVn: "THÀNH NGỮ",
    startPage: 163,
    endPage: 165,
    keyStartPage: 176,
    keyEndPage: 177,
    keyTitle: "IDIOMATIC EXPRESSIONS",
    nextTitle: null,
    nextKeyTitle: "REPORTED SPEECH"
  }
];

let grandTotal = 0;
for (const c of BATCH4) {
  grandTotal += buildChapter(c);
}
console.log(`\n🎉 Batch 4 (ch22 - ch27) completed! Added ${grandTotal} items.`);
