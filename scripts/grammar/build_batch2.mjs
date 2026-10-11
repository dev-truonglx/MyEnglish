import { buildChapter } from "./master_compiler.mjs";

const BATCH2 = [
  {
    id: "ch12",
    order: 12,
    title: "EXPRESSION OF QUANTITY",
    titleVn: "TỪ CHỈ SỐ LƯỢNG",
    startPage: 68,
    endPage: 74,
    keyStartPage: 73,
    keyEndPage: 74,
    nextTitle: "STYLES",
    nextKeyTitle: "STYLES"
  },
  {
    id: "ch13",
    order: 13,
    title: "STYLES",
    titleVn: "VĂN PHONG",
    startPage: 74,
    endPage: 81,
    keyStartPage: 80,
    keyEndPage: 81,
    nextTitle: "EMPHASIS",
    nextKeyTitle: "EMPHASIS"
  },
  {
    id: "ch14",
    order: 14,
    title: "EMPHASIS",
    titleVn: "DẠNG NHẤN MẠNH",
    startPage: 81,
    endPage: 85,
    keyStartPage: 84,
    keyEndPage: 85,
    keyTitle: "ĐÁP ÁN",
    nextTitle: "ĐÁP ÁN",
    nextKeyTitle: "NOUNS"
  }
];

let grandTotal = 0;
for (const c of BATCH2) {
  grandTotal += buildChapter(c);
}
console.log(`\n🎉 Batch 2 (ch12 - ch14) completed! Added ${grandTotal} items.`);
