import { buildChapter } from "./master_compiler.mjs";

const BATCH5 = [
  {
    id: "ch28",
    order: 28,
    title: "REPORTED SPEECH",
    titleVn: "LỜI NÓI GIÁN TIẾP",
    startPage: 177,
    endPage: 181,
    nextTitle: "ĐÁP ÁN",
    keyStartPage: 181,
    keyEndPage: 183,
    keyTitle: "ĐÁP ÁN",
    nextKeyTitle: "THE PASSIVE AND ACTIVE SENTENCES"
  },
  {
    id: "ch29",
    order: 29,
    title: "THE PASSIVE AND ACTIVE SENTENCES",
    titleVn: "CÂU CHỦ ĐỘNG VÀ BỊ ĐỘNG",
    startPage: 183,
    endPage: 189,
    nextTitle: "ĐÁP ÁN",
    keyStartPage: 189,
    keyEndPage: 192,
    keyTitle: "ĐÁP ÁN",
    nextKeyTitle: "SENTENCES"
  },
  {
    id: "ch30",
    order: 30,
    title: "SENTENCES",
    titleVn: "CÂU",
    startPage: 192,
    endPage: 199,
    nextTitle: "ĐÁP ÁN",
    keyStartPage: 199,
    keyEndPage: 201,
    keyTitle: "ĐÁP ÁN",
    nextKeyTitle: "PRACTICE TEST"
  },
  {
    id: "ch31",
    order: 31,
    title: "PRACTICE TEST",
    titleVn: "BÀI KIỂM TRA TỔNG HỢP",
    startPage: 201,
    endPage: 215,
    nextTitle: "ĐÁP ÁN",
    isAllExercises: true,
    keyStartPage: 215,
    keyEndPage: 222,
    keyTitle: "ĐÁP ÁN",
    nextKeyTitle: null
  }
];

let grandTotal = 0;
for (const c of BATCH5) {
  grandTotal += buildChapter(c);
}
console.log(`\n🎉 Batch 5 (ch28 - ch31) completed! Added ${grandTotal} items.`);
