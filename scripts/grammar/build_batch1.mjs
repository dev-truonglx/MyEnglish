import fs from "fs";
import path from "path";
import { validateFile } from "./validate.mjs";

function save(file, data) {
  const target = path.join("json-data", file);
  fs.writeFileSync(target, JSON.stringify(data, null, 2), "utf8");
  const res = validateFile(data, file);
  if (!res.valid) {
    console.error(`❌ ${file} has errors:`, res.errors);
  } else {
    console.log(`✓ ${file}: valid, items = ${res.itemCount}`);
  }
}

// ==========================================
// CH03: CLAUSES OF CONDITION
// ==========================================

const ch03_p1 = {
  format: "myenglish-grammar-book",
  version: 2,
  chapterId: "ch03",
  part: 1,
  parts: 3,
  chapter: {
    order: 3,
    title: "CLAUSES OF CONDITION",
    titleVn: "CÂU ĐIỀU KIỆN",
    pages: [24, 27]
  },
  lessons: [
    {
      id: "ch03-l01",
      order: 1,
      title: "Three Types of Conditional Sentences",
      titleVn: "Ba loại câu điều kiện",
      page: 24,
      blocks: [
        { type: "text", text: "Mệnh đề điều kiện là mệnh đề phụ chỉ điều kiện, được nối với mệnh đề chính bởi liên từ IF (If-clause). Có 3 loại câu điều kiện cơ bản:" },
        { type: "heading", text: "1. Loại 1: Điều kiện có thật ở hiện tại hoặc tương lai (Real in present/future)" },
        { type: "formula", label: "Type 1", text: "If-clause: Simple Present (V1 / s/es)\nMain clause: S + will / can / shall / may + V(bare-inf)" },
        { type: "example", en: "If I have time, I'll help you.", vi: "Nếu tôi có thời gian, tôi sẽ giúp bạn." },
        { type: "example", en: "If you heat ice, it turns to water.", vi: "Nếu bạn làm nóng đá, nó tan thành nước." },
        { type: "heading", text: "2. Loại 2: Điều kiện không có thật ở hiện tại (Unreal in present)" },
        { type: "formula", label: "Type 2", text: "If-clause: Past Simple / Past Subjunctive (V2/ed; be -> were cho mọi ngôi)\nMain clause: S + would / could / should / might + V(bare-inf)" },
        { type: "example", en: "If I were you, I would come there.", vi: "Nếu tôi là bạn, tôi sẽ đến đó." },
        { type: "heading", text: "3. Loại 3: Điều kiện không có thật ở quá khứ (Unreal in past)" },
        { type: "formula", label: "Type 3", text: "If-clause: Past Perfect (had + V3/ed)\nMain clause: S + would / could / should / might + have + V3/ed" },
        { type: "example", en: "He would have passed his exam if he had studied hard.", vi: "Anh ấy đã đỗ kỳ thi nếu anh ấy học chăm." }
      ]
    },
    {
      id: "ch03-l02",
      order: 2,
      title: "Using UNLESS instead of IF",
      titleVn: "Dùng UNLESS thay cho IF",
      page: 25,
      blocks: [
        { type: "text", text: "UNLESS có nghĩa là 'nếu... không', 'trừ phi' (Unless = If ... not)." },
        { type: "bullet", text: "Khi đổi IF sang UNLESS, không được đổi mệnh đề IF ở thể khẳng định sang thể phủ định mà phải đổi mệnh đề chính theo thể ngược lại." },
        { type: "example", en: "If you don't study hard, you'll fail the exam. -> Unless you study hard, you'll fail the exam.", vi: "" },
        { type: "example", en: "If I have time, I'll help you. -> Unless I have time, I won't help you.", vi: "" },
        { type: "table", headers: ["IF-CLAUSE", "UNLESS"], rows: [
          ["Thể phủ định", "Thể khẳng định (mệnh đề chính giữ nguyên)"],
          ["Thể khẳng định", "Thể khẳng định (đổi động từ mệnh đề chính sang phủ định)"]
        ]}
      ]
    },
    {
      id: "ch03-l03",
      order: 3,
      title: "Inversion in Conditional Sentences",
      titleVn: "Đảo ngữ trong câu điều kiện",
      page: 25,
      blocks: [
        { type: "text", text: "Có thể diễn tả câu điều kiện mà không cần dùng IF hay UNLESS bằng cách đảo trợ động từ ra trước chủ ngữ:" },
        { type: "bullet", text: "Loại 1: Đảo Should ra đầu câu (Should + S + V-bare...)" },
        { type: "example", en: "If you should run into Peter, tell him he owes me a letter. -> Should you run into Peter, tell him...", vi: "" },
        { type: "bullet", text: "Loại 2: Đảo Were ra đầu câu (Were + S... / Were + S + to V...)" },
        { type: "example", en: "If they were stronger, they could lift the table. -> Were they stronger, they could lift the table.", vi: "" },
        { type: "bullet", text: "Loại 3: Đảo Had ra đầu câu (Had + S + V3/ed...)" },
        { type: "example", en: "If he had studied hard, he would have passed. -> Had he studied hard, he would have passed.", vi: "" }
      ]
    },
    {
      id: "ch03-l04",
      order: 4,
      title: "Other Conjunctions Replacing IF",
      titleVn: "Các liên từ khác thay thế IF",
      page: 25,
      blocks: [
        { type: "bullet", text: "Provided (that), On condition (that), As long as, So long as: miễn là, với điều kiện là" },
        { type: "bullet", text: "Suppose, Supposing: giả sử như" },
        { type: "bullet", text: "In case: phòng khi, trong trường hợp" },
        { type: "bullet", text: "Even if: ngay cả khi, dù cho" },
        { type: "example", en: "In case I forget, please remind me of my promise.", vi: "Phòng khi tôi quên, xin hãy nhắc lời hứa của tôi." }
      ]
    }
  ],
  fixes: []
};

const ch03_s01_items = [
  { n: 1, prompt: "If I see him, I ___ (give) him a gift.", answers: [["will give", "shall give"]], answerSentence: "If I see him, I will give him a gift." },
  { n: 2, prompt: "If I had a typewriter, I ___ (type) it myself.", answers: [["would type"]], answerSentence: "If I had a typewriter, I would type it myself." },
  { n: 3, prompt: "If I had known that you were in hospital, I ___ (visit) you.", answers: [["would have visited"]], answerSentence: "If I had known that you were in hospital, I would have visited you." },
  { n: 4, prompt: "You could make better progress if you ___ (attend) class regularly.", answers: [["attended"]], answerSentence: "You could make better progress if you attended class regularly." },
  { n: 5, prompt: "If I ___ (know) his telephone number, I’d give it to you.", answers: [["knew"]], answerSentence: "If I knew his telephone number, I’d give it to you." },
  { n: 6, prompt: "If you ___ (arrive) ten minutes earlier, you would have got a seat.", answers: [["had arrived"]], answerSentence: "If you had arrived ten minutes earlier, you would have got a seat." },
  { n: 7, prompt: "He could get a job easily if he ___ (have) a degree.", answers: [["had"]], answerSentence: "He could get a job easily if he had a degree." },
  { n: 8, prompt: "I shouldn’t have believed it if I ___ (not see) it with my own eyes.", answers: [["hadn’t seen", "had not seen"]], answerSentence: "I shouldn’t have believed it if I hadn't seen it with my own eyes." },
  { n: 9, prompt: "If he ___ (study) hard, he can pass the exam.", answers: [["studies"]], answerSentence: "If he studies hard, he can pass the exam." },
  { n: 10, prompt: "If she had asked you, ___ (you / accept)?", answers: [["would you have accepted"]], answerSentence: "If she had asked you, would you have accepted?" },
  { n: 11, prompt: "Rice plants ___ (grow) well if there is enough rain.", answers: [["grow", "will grow"]], answerSentence: "Rice plants grow well if there is enough rain." },
  { n: 12, prompt: "He might get fat if he ___ (stop) smoking.", answers: [["stopped"]], answerSentence: "He might get fat if he stopped smoking." },
  { n: 13, prompt: "What ___ (you / do) if you found a burglar in your house?", answers: [["would you do"]], answerSentence: "What would you do if you found a burglar in your house?" },
  { n: 14, prompt: "If she ___ (not hurry), she may be late.", answers: [["doesn’t hurry", "does not hurry"]], answerSentence: "If she doesn’t hurry, she may be late." },
  { n: 15, prompt: "If I ___ (try) again, I think that I would have succeeded.", answers: [["had tried"]], answerSentence: "If I had tried again, I think that I would have succeeded." },
  { n: 16, prompt: "Water ___ (not run) downhill if there were not gravity.", answers: [["wouldn’t run", "would not run"]], answerSentence: "Water wouldn’t run downhill if there were not gravity." },
  { n: 17, prompt: "If I tell you a secret, ___ (you / promise) not to tell it to anyone else?", answers: [["will you promise"]], answerSentence: "If I tell you a secret, will you promise not to tell it to anyone else?" },
  { n: 18, prompt: "Tell him to ring me if you ___ (see) him.", answers: [["see"]], answerSentence: "Tell him to ring me if you see him." },
  { n: 19, prompt: "The police ___ (arrest) him if they catch him.", answers: [["will arrest"]], answerSentence: "The police will arrest him if they catch him." },
  { n: 20, prompt: "If you ___ (speak) more slowly, he might have understood you.", answers: [["had spoken"]], answerSentence: "If you had spoken more slowly, he might have understood you." }
];

const ch03_s02_items = [
  { n: 1, prompt: "If you are not careful, you will cut yourself with that knife.\n-> Unless ___", answers: [["you are careful, you will cut yourself with that knife"]], answerSentence: "Unless you are careful, you will cut yourself with that knife." },
  { n: 2, prompt: "If you do not like this one, I’ll bring you another.\n-> Unless ___", answers: [["you like this one, I’ll bring you another", "you like this one, I'll bring you another"]], answerSentence: "Unless you like this one, I’ll bring you another." },
  { n: 3, prompt: "I’ll not be able to do any work if I do not have a quiet room.\n-> I’ll not be able to do any work unless ___", answers: [["I have a quiet room"]], answerSentence: "I’ll not be able to do any work unless I have a quiet room." },
  { n: 4, prompt: "If she does not hurry, she’ll be late.\n-> Unless ___", answers: [["she hurries, she’ll be late", "she hurries, she'll be late"]], answerSentence: "Unless she hurries, she’ll be late." },
  { n: 5, prompt: "If we had more rain, our crops would be better.\n-> Unless ___", answers: [["we had more rain, our crops wouldn’t be better", "we had more rain, our crops would not be better"]], answerSentence: "Unless we had more rain, our crops wouldn’t be better." },
  { n: 6, prompt: "The crops would have been ruined if the flood had risen higher.\n-> The crops wouldn’t have been ruined unless ___", answers: [["the flood had risen higher"]], answerSentence: "The crops wouldn’t have been ruined unless the flood had risen higher." },
  { n: 7, prompt: "If you had not sneezed, he wouldn’t have known that we were there.\n-> Unless ___", answers: [["you had sneezed, he wouldn’t have known that we were there", "you had sneezed, he would not have known that we were there"]], answerSentence: "Unless you had sneezed, he wouldn’t have known that we were there." },
  { n: 8, prompt: "If she did her hair differently, she would look quite nice.\n-> Unless ___", answers: [["she did her hair differently, she wouldn’t look quite nice", "she did her hair differently, she would not look quite nice"]], answerSentence: "Unless she did her hair differently, she wouldn’t look quite nice." },
  { n: 9, prompt: "If John had played for our football team, we would not have lost the game.\n-> Unless ___", answers: [["John had played for our football team, we would have lost the game"]], answerSentence: "Unless John had played for our football team, we would have lost the game." },
  { n: 10, prompt: "If I won a big prize in a lottery, I’d give up my job.\n-> Unless ___", answers: [["I won a big prize in a lottery, I’d not give up my job", "I won a big prize in a lottery, I wouldn't give up my job"]], answerSentence: "Unless I won a big prize in a lottery, I’d not give up my job." }
];

const ch03_s03_items = [
  { n: 1, prompt: "If I were you, I’d accept the job.\n-> Were ___", answers: [["I you, I’d accept the job", "I you, I'd accept the job"]], answerSentence: "Were I you, I’d accept the job." },
  { n: 2, prompt: "If you had told me that he never paid his debts, I wouldn’t have lent him money.\n-> Had ___", answers: [["you told me that he never paid his debts, I wouldn’t have lent him money", "you told me that he never paid his debts, I would not have lent him money"]], answerSentence: "Had you told me that he never paid his debts, I wouldn’t have lent him money." },
  { n: 3, prompt: "If he had known your telephone number he would have rung you.\n-> Had ___", answers: [["he known your telephone number, he would have rung you", "he known your telephone number he would have rung you"]], answerSentence: "Had he known your telephone number, he would have rung you." },
  { n: 4, prompt: "If it were nice, we would go for a walk.\n-> Were ___", answers: [["it nice, we would go for a walk"]], answerSentence: "Were it nice, we would go for a walk." },
  { n: 5, prompt: "I would come to her wedding if I were invited.\n-> Were ___", answers: [["I invited, I would come to her wedding"]], answerSentence: "Were I invited, I would come to her wedding." },
  { n: 6, prompt: "Would you visit me if I were sent to prison?\n-> Were ___", answers: [["I sent to prison, would you visit me?"]], answerSentence: "Were I sent to prison, would you visit me?" },
  { n: 7, prompt: "Would you have written to her if you had known her address?\n-> Had ___", answers: [["you known her address, would you have written to her?"]], answerSentence: "Had you known her address, would you have written to her?" },
  { n: 8, prompt: "What would you do if today were a holiday?\n-> Were ___", answers: [["today a holiday, what would you do?"]], answerSentence: "Were today a holiday, what would you do?" },
  { n: 9, prompt: "If they had asked me I would have helped them.\n-> Had ___", answers: [["they asked me, I would have helped them", "they asked me I would have helped them"]], answerSentence: "Had they asked me, I would have helped them." },
  { n: 10, prompt: "Scientists think that men could live on the moon if there were air and water on it.\n-> Scientists think that men could live on the moon were ___", answers: [["there air and water on it"]], answerSentence: "Scientists think that men could live on the moon were there air and water on it." }
];

const ch03_p2 = {
  format: "myenglish-grammar-book",
  version: 2,
  chapterId: "ch03",
  part: 2,
  parts: 3,
  exerciseSets: [
    {
      id: "ch03-s01",
      roman: "I",
      instruction: "Put the verbs in brackets into the correct tenses.",
      type: "verb_form",
      page: 26,
      keyPage: 54,
      lessonIds: ["ch03-l01"],
      itemCount: 20,
      items: ch03_s01_items
    },
    {
      id: "ch03-s02",
      roman: "II",
      instruction: "Use UNLESS instead of IF.",
      type: "rewrite",
      page: 26,
      keyPage: 55,
      lessonIds: ["ch03-l02"],
      itemCount: 10,
      items: ch03_s02_items
    },
    {
      id: "ch03-s03",
      roman: "III",
      instruction: "Make conditional sentences without conjunctions (Inversion).",
      type: "rewrite",
      page: 26,
      keyPage: 55,
      lessonIds: ["ch03-l03"],
      itemCount: 10,
      items: ch03_s03_items
    }
  ],
  fixes: []
};

const ch03_s04_items = [
  { n: 1, prompt: "If I were the Prime Minister, I ___", answers: [["would help the poor"]], answerSentence: "If I were the Prime Minister, I would help the poor." },
  { n: 2, prompt: "He could buy a new car if ___", answers: [["he had enough money"]], answerSentence: "He could buy a new car if he had enough money." },
  { n: 3, prompt: "If I had more time, ___", answers: [["I would take you to the circus"]], answerSentence: "If I had more time, I would take you to the circus." },
  { n: 4, prompt: "If he hadn’t been ill, ___", answers: [["he would have taken part in the trip with me"]], answerSentence: "If he hadn’t been ill, he would have taken part in the trip with me." },
  { n: 5, prompt: "They could have passed the exam if they ___", answers: [["had studied hard"]], answerSentence: "They could have passed the exam if they had studied hard." },
  { n: 6, prompt: "We could have come with you if we ___", answers: [["had been free"]], answerSentence: "We could have come with you if we had been free." },
  { n: 7, prompt: "If her parents had been richer, ___", answers: [["they would have bought her a new car"]], answerSentence: "If her parents had been richer, they would have bought her a new car." },
  { n: 8, prompt: "If he had come yesterday, ___", answers: [["he would have met you"]], answerSentence: "If he had come yesterday, he would have met you." },
  { n: 9, prompt: "If it hadn’t rained, ___", answers: [["we would have gone swimming"]], answerSentence: "If it hadn’t rained, we would have gone swimming." },
  { n: 10, prompt: "The world would be a better place if ___", answers: [["there were no war"]], answerSentence: "The world would be a better place if there were no war." }
];

const ch03_s05_items = [
  { n: 1, prompt: "Keep silent or you’ll wake the baby up.\n-> If you ___", answers: [["don’t keep silent, you’ll wake the baby up", "do not keep silent, you will wake the baby up"]], answerSentence: "If you don’t keep silent, you’ll wake the baby up." },
  { n: 2, prompt: "Because you don’t leave immediately, I call a policeman.\n-> If you ___", answers: [["left immediately, I wouldn’t call a policeman", "left immediately, I would not call a policeman"]], answerSentence: "If you left immediately, I wouldn’t call a policeman." },
  { n: 3, prompt: "I don’t know her number, so I don’t ring her up.\n-> If I ___", answers: [["knew her number, I would ring her up"]], answerSentence: "If I knew her number, I would ring her up." },
  { n: 4, prompt: "Go right now or you’ll be late for the train.\n-> If you ___", answers: [["don’t go right now, you’ll be late for the train", "do not go right now, you will be late for the train"]], answerSentence: "If you don’t go right now, you’ll be late for the train." },
  { n: 5, prompt: "As she is often absent from class, she can’t keep pace with her classmates.\n-> If she ___", answers: [["weren’t often absent from class, she could keep pace with her classmates", "were not often absent from class, she could keep pace with her classmates"]], answerSentence: "If she weren’t often absent from class, she could keep pace with her classmates." },
  { n: 6, prompt: "I couldn’t write to Alice because I didn’t know her address.\n-> If I ___", answers: [["had known her address, I would have written to Alice", "had known her address, I could have written to Alice"]], answerSentence: "If I had known her address, I would have written to Alice." },
  { n: 7, prompt: "I don’t know the answer, so I can’t tell you.\n-> If I ___", answers: [["knew the answer, I could tell you", "knew the answer, I would tell you"]], answerSentence: "If I knew the answer, I could tell you." },
  { n: 8, prompt: "We got lost because we didn’t have a map.\n-> If we ___", answers: [["had had a map, we wouldn’t have got lost", "had had a map, we would not have got lost"]], answerSentence: "If we had had a map, we wouldn’t have got lost." },
  { n: 9, prompt: "His friends were so late, so they missed the train.\n-> If his friends ___", answers: [["hadn’t been so late, they wouldn’t have missed the train", "had not been so late, they would not have missed the train"]], answerSentence: "If his friends hadn’t been so late, they wouldn’t have missed the train." },
  { n: 10, prompt: "Today isn’t Sunday, so the pupils can’t go swimming.\n-> If today ___", answers: [["were Sunday, the pupils could go swimming"]], answerSentence: "If today were Sunday, the pupils could go swimming." },
  { n: 11, prompt: "The heavy rain kept everybody from going out.\n-> If it ___", answers: [["hadn’t rained heavily, everybody would have gone out", "had not rained heavily, everybody would have gone out"]], answerSentence: "If it hadn’t rained heavily, everybody would have gone out." },
  { n: 12, prompt: "This chair is too heavy for him to move.\n-> If this chair ___", answers: [["weren’t too heavy, he could move it", "were not too heavy, he could move it"]], answerSentence: "If this chair weren’t too heavy, he could move it." },
  { n: 13, prompt: "He had a flu because he went out in the rain last night.\n-> If he ___", answers: [["hadn’t gone out in the rain last night, he wouldn’t have had a flu", "had not gone out in the rain last night, he would not have had a flu"]], answerSentence: "If he hadn’t gone out in the rain last night, he wouldn’t have had a flu." },
  { n: 14, prompt: "The church bells keep me from sleeping.\n-> If there ___", answers: [["weren’t the church bells, I could sleep", "were not the church bells, I could sleep"]], answerSentence: "If there weren’t the church bells, I could sleep." },
  { n: 15, prompt: "Morning exercises make me feel better.\n-> If we ___", answers: [["do morning exercises, we’ll feel better", "do morning exercises, we will feel better"]], answerSentence: "If we do morning exercises, we’ll feel better." },
  { n: 16, prompt: "Stop talking or you won’t understand the lesson.\n-> If you ___", answers: [["don’t stop talking, you won’t understand the lesson", "do not stop talking, you will not understand the lesson"]], answerSentence: "If you don’t stop talking, you won’t understand the lesson." },
  { n: 17, prompt: "The boy is so young that he can’t go to school.\n-> If the boy ___", answers: [["weren’t so young, he could go to school", "were not so young, he could go to school"]], answerSentence: "If the boy weren’t so young, he could go to school." },
  { n: 18, prompt: "The fridge keeps the food from spoiling.\n-> If there ___", answers: [["weren’t the fridge, the food would spoil", "were not the fridge, the food would spoil"]], answerSentence: "If there weren’t the fridge, the food would spoil." },
  { n: 19, prompt: "Why don’t you study hard?\n-> If I ___", answers: [["were you, I would study hard", "were you, I'd study hard"]], answerSentence: "If I were you, I would study hard." },
  { n: 20, prompt: "Why don’t you stop smoking?\n-> If I ___", answers: [["were you, I would stop smoking", "were you, I'd stop smoking"]], answerSentence: "If I were you, I would stop smoking." },
  { n: 21, prompt: "Be careful, or you’ll cut yourself with that knife.\n-> If you ___", answers: [["aren’t careful, you’ll cut yourself with that knife", "are not careful, you will cut yourself with that knife"]], answerSentence: "If you aren’t careful, you’ll cut yourself with that knife." },
  { n: 22, prompt: "Be calm, or you’ll make a wrong decision.\n-> If you ___", answers: [["aren’t calm, you’ll make a wrong decision", "are not calm, you will make a wrong decision"]], answerSentence: "If you aren’t calm, you’ll make a wrong decision." },
  { n: 23, prompt: "Without the air, we would die.\n-> If there ___", answers: [["weren’t the air, we would die", "were not the air, we would die"]], answerSentence: "If there weren’t the air, we would die." },
  { n: 24, prompt: "Without a visa, she couldn’t have come to that country.\n-> If she ___", answers: [["hadn’t had a visa, she couldn’t have come to that country", "had not had a visa, she could not have come to that country"]], answerSentence: "If she hadn’t had a visa, she couldn’t have come to that country." },
  { n: 25, prompt: "Without the sun, man would live in the darkness.\n-> If there ___", answers: [["weren’t the sun, man would live in the darkness", "were not the sun, man would live in the darkness"]], answerSentence: "If there weren’t the sun, man would live in the darkness." },
  { n: 26, prompt: "Without money, he wouldn’t have bought such a big house.\n-> If he ___", answers: [["hadn’t had money, he wouldn’t have bought such a big house", "had not had money, he would not have bought such a big house"]], answerSentence: "If he hadn’t had money, he wouldn’t have bought such a big house." },
  { n: 27, prompt: "Smoking makes him so weak.\n-> If he ___", answers: [["didn’t smoke, he wouldn’t be so weak", "did not smoke, he would not be so weak"]], answerSentence: "If he didn’t smoke, he wouldn’t be so weak." },
  { n: 28, prompt: "It was very cold yesterday, so we couldn’t go swimming.\n-> If it ___", answers: [["hadn’t been very cold yesterday, we could have gone swimming", "had not been very cold yesterday, we could have gone swimming"]], answerSentence: "If it hadn’t been very cold yesterday, we could have gone swimming." },
  { n: 29, prompt: "It is very cold, so we can’t go swimming.\n-> If it ___", answers: [["weren’t very cold, we could go swimming", "were not very cold, we could go swimming"]], answerSentence: "If it weren’t very cold, we could go swimming." },
  { n: 30, prompt: "I didn’t watch T.V last night because I was busy.\n-> If I ___", answers: [["hadn’t been busy, I would have watched TV last night", "had not been busy, I would have watched TV last night"]], answerSentence: "If I hadn’t been busy, I would have watched TV last night." }
];

const ch03_p3 = {
  format: "myenglish-grammar-book",
  version: 2,
  chapterId: "ch03",
  part: 3,
  parts: 3,
  exerciseSets: [
    {
      id: "ch03-s04",
      roman: "IV",
      instruction: "Complete the following sentences.",
      type: "complete_sentence",
      page: 26,
      keyPage: 55,
      lessonIds: ["ch03-l01"],
      itemCount: 10,
      items: ch03_s04_items
    },
    {
      id: "ch03-s05",
      roman: "V",
      instruction: "Make conditional sentences according to the facts provided.",
      type: "rewrite",
      page: 27,
      keyPage: 55,
      lessonIds: ["ch03-l01", "ch03-l02"],
      itemCount: 30,
      items: ch03_s05_items
    }
  ],
  fixes: []
};

save("ch03-p1.json", ch03_p1);
save("ch03-p2.json", ch03_p2);
save("ch03-p3.json", ch03_p3);

// ==========================================
// CH04: CLAUSES AFTER WISH, IF ONLY
// ==========================================

const ch04_p1 = {
  format: "myenglish-grammar-book",
  version: 2,
  chapterId: "ch04",
  part: 1,
  parts: 2,
  chapter: {
    order: 4,
    title: "CLAUSES AFTER WISH, IF ONLY",
    titleVn: "MỆNH ĐỀ SAU WISH, IF ONLY",
    pages: [27, 28]
  },
  lessons: [
    {
      id: "ch04-l01",
      order: 1,
      title: "Future Wish",
      titleVn: "Ao ước ở tương lai",
      page: 27,
      blocks: [
        { type: "text", text: "Dùng để diễn tả một mong muốn trong tương lai hoặc phàn nàn về một thói quen:" },
        { type: "formula", label: "Cấu trúc", text: "S + wish + S + would / could + V(bare-inf)\nIf only + S + would / could + V(bare-inf)" },
        { type: "example", en: "I wish it would stop raining!", vi: "Ước gì trời tạnh mưa!" },
        { type: "example", en: "I wish I could attend your wedding next week.", vi: "Ước gì tôi có thể dự đám cưới của bạn tuần sau." }
      ]
    },
    {
      id: "ch04-l02",
      order: 2,
      title: "Present Wish",
      titleVn: "Ao ước ở hiện tại",
      page: 28,
      blocks: [
        { type: "text", text: "Dùng để diễn tả một điều ao ước trái với thực tế ở hiện tại:" },
        { type: "formula", label: "Cấu trúc", text: "S + wish + S + V(Past Simple / Past Subjunctive - were)\nIf only + S + V(Past Simple / Past Subjunctive)" },
        { type: "bullet", text: "Động từ 'be' dùng 'were' cho tất cả các ngôi." },
        { type: "example", en: "I wish I were rich. (But I am poor now.)", vi: "Ước gì tôi giàu có." },
        { type: "example", en: "I wish I could swim. (I can't swim.)", vi: "Ước gì tôi biết bơi." }
      ]
    },
    {
      id: "ch04-l03",
      order: 3,
      title: "Past Wish",
      titleVn: "Ao ước ở quá khứ",
      page: 28,
      blocks: [
        { type: "text", text: "Dùng để diễn tả một điều ao ước hoặc nuối tiếc về một sự việc trong quá khứ:" },
        { type: "formula", label: "Cấu trúc", text: "S + wish + S + Past Perfect (had + V3/ed) / could have + V3\nIf only + S + had + V3/ed" },
        { type: "example", en: "I wish I hadn't failed my exam last year.", vi: "Ước gì năm ngoái tôi không thi trượt." },
        { type: "example", en: "If only I had met her yesterday.", vi: "Giá như hôm qua tôi đã gặp cô ấy." }
      ]
    }
  ],
  fixes: []
};

const ch04_s01_items = [
  { n: 1, prompt: "She wishes her father ___ (be) here now to help her.", answers: [["were", "was"]], answerSentence: "She wishes her father were here now to help her." },
  { n: 2, prompt: "I wish you ___ (not give) them my phone number yesterday.", answers: [["hadn’t given", "had not given"]], answerSentence: "I wish you hadn’t given them my phone number yesterday." },
  { n: 3, prompt: "I wish they ___ (visit) us when they were in town.", answers: [["had visited"]], answerSentence: "I wish they had visited us when they were in town." },
  { n: 4, prompt: "I wish someone ___ (give) me a job next month.", answers: [["would give"]], answerSentence: "I wish someone would give me a job next month." },
  { n: 5, prompt: "If only I ___ (can take) the trip to Hanoi with her next summer.", answers: [["could take"]], answerSentence: "If only I could take the trip to Hanoi with her next summer." },
  { n: 6, prompt: "We wish we ___ (understand) all the teacher’s explanation yesterday.", answers: [["had understood"]], answerSentence: "We wish we had understood all the teacher’s explanation yesterday." },
  { n: 7, prompt: "He missed an exciting football match on TV last night. He wishes he ___ (watch) it.", answers: [["had watched"]], answerSentence: "He wishes he had watched it." },
  { n: 8, prompt: "If only I ___ (have) more time to do this job.", answers: [["had"]], answerSentence: "If only I had more time to do this job." },
  { n: 9, prompt: "I wish she ___ (come) to see me yesterday.", answers: [["had come"]], answerSentence: "I wish she had come to see me yesterday." },
  { n: 10, prompt: "I wish that someday I ___ (be) able to marry her.", answers: [["would be"]], answerSentence: "I wish that someday I would be able to marry her." }
];

const ch04_s02_items = [
  { n: 1, prompt: "My father isn’t here now. I want him to be here now.\n-> I wish ___", answers: [["my father were here now", "my father was here now"]], answerSentence: "I wish my father were here now." },
  { n: 2, prompt: "You talk more than you work. The teacher wants you to work more than to talk.\n-> The teacher wishes ___", answers: [["you worked more than you talked"]], answerSentence: "The teacher wishes you worked more than you talked." },
  { n: 3, prompt: "John would like to be an astronaut when he grows up.\n-> John wishes ___", answers: [["he would be an astronaut in the future", "he would be an astronaut when he grew up"]], answerSentence: "John wishes he would be an astronaut in the future." },
  { n: 4, prompt: "I’m sorry I didn’t help you yesterday.\n-> I wish ___", answers: [["I had helped you yesterday"]], answerSentence: "I wish I had helped you yesterday." },
  { n: 5, prompt: "I regret that you didn’t give me a chance to tell you the truth.\n-> I wish ___", answers: [["you had given me a chance to tell you the truth"]], answerSentence: "I wish you had given me a chance to tell you the truth." },
  { n: 6, prompt: "Mary is afraid she won’t be able to attend your wedding next week.\n-> Mary wishes ___", answers: [["she would be able to attend your wedding next week"]], answerSentence: "Mary wishes she would be able to attend your wedding next week." },
  { n: 7, prompt: "We regret that we didn’t have enough money to buy that house.\n-> We wish ___", answers: [["we had had enough money to buy that house"]], answerSentence: "We wish we had had enough money to buy that house." },
  { n: 8, prompt: "You drive too fast. I’d like you to drive more slowly.\n-> I wish ___", answers: [["you drove more slowly", "you would drive more slowly"]], answerSentence: "I wish you drove more slowly." },
  { n: 9, prompt: "You are too lazy. The teacher wants you to be more studious.\n-> The teacher wishes ___", answers: [["you were more studious", "you were not too lazy"]], answerSentence: "The teacher wishes you were more studious." },
  { n: 10, prompt: "I’m afraid he won’t get over his illness soon.\n-> I wish ___", answers: [["he would get over his illness soon"]], answerSentence: "I wish he would get over his illness soon." },
  { n: 11, prompt: "I’m not a doctor.\n-> I wish ___", answers: [["I were a doctor", "I was a doctor"]], answerSentence: "I wish I were a doctor." },
  { n: 12, prompt: "I haven’t enough money to buy this book.\n-> I wish ___", answers: [["I had enough money to buy this book"]], answerSentence: "I wish I had enough money to buy this book." },
  { n: 13, prompt: "I live in a big city, but I don’t like it.\n-> I wish ___", answers: [["I didn’t live in a big city", "I did not live in a big city"]], answerSentence: "I wish I didn’t live in a big city." },
  { n: 14, prompt: "Nam is sorry now that he didn’t accept the job.\n-> Nam wishes ___", answers: [["he had accepted the job"]], answerSentence: "Nam wishes he had accepted the job." },
  { n: 15, prompt: "Tomorrow is a workday.\n-> I wish ___", answers: [["tomorrow weren’t a workday", "tomorrow were not a workday"]], answerSentence: "I wish tomorrow weren’t a workday." },
  { n: 16, prompt: "We have to work this Saturday.\n-> We wish ___", answers: [["we didn’t have to work this Saturday", "we wouldn’t have to work this Saturday"]], answerSentence: "We wish we didn’t have to work this Saturday." },
  { n: 17, prompt: "I feel sick because I ate too much ice-cream.\n-> I wish ___", answers: [["I hadn’t eaten too much ice-cream", "I had not eaten too much ice-cream"]], answerSentence: "I wish I hadn’t eaten too much ice-cream." },
  { n: 18, prompt: "It’s pity that you were not here last week.\n-> I wish ___", answers: [["you had been here last week"]], answerSentence: "I wish you had been here last week." },
  { n: 19, prompt: "I regret speaking to him so impolitely yesterday.\n-> I wish ___", answers: [["I hadn’t spoken to him so impolitely yesterday", "I had not spoken to him so impolitely yesterday"]], answerSentence: "I wish I hadn’t spoken to him so impolitely yesterday." },
  { n: 20, prompt: "Alan regretted asking Arthur to lend him 20$.\n-> Alan wished ___", answers: [["he hadn’t asked Arthur to lend him 20$", "he had not asked Arthur to lend him 20$"]], answerSentence: "Alan wished he hadn’t asked Arthur to lend him 20$." },
  { n: 21, prompt: "I want the baby to stop crying.\n-> I wish ___", answers: [["the baby stopped crying", "the baby would stop crying"]], answerSentence: "I wish the baby stopped crying." },
  { n: 22, prompt: "He is sorry now that he didn’t invite Molly to his party.\n-> He wishes ___", answers: [["he had invited Molly to his party"]], answerSentence: "He wishes he had invited Molly to his party." },
  { n: 23, prompt: "The hotel wasn’t good.\n-> I wish ___", answers: [["the hotel had been good"]], answerSentence: "I wish the hotel had been good." },
  { n: 24, prompt: "I didn’t understand the lesson.\n-> I wish ___", answers: [["I had understood the lesson"]], answerSentence: "I wish I had understood the lesson." },
  { n: 25, prompt: "My friend didn’t pass his exam.\n-> I wish ___", answers: [["my friend had passed his exam"]], answerSentence: "I wish my friend had passed his exam." }
];

const ch04_p2 = {
  format: "myenglish-grammar-book",
  version: 2,
  chapterId: "ch04",
  part: 2,
  parts: 2,
  exerciseSets: [
    {
      id: "ch04-s01",
      roman: "I",
      instruction: "Give the correct forms of the verbs in the parentheses.",
      type: "verb_form",
      page: 28,
      keyPage: 56,
      lessonIds: ["ch04-l01", "ch04-l02", "ch04-l03"],
      itemCount: 10,
      items: ch04_s01_items
    },
    {
      id: "ch04-s02",
      roman: "II",
      instruction: "Rewrite the sentences below, using WISH or IF ONLY.",
      type: "rewrite",
      page: 28,
      keyPage: 56,
      lessonIds: ["ch04-l01", "ch04-l02", "ch04-l03"],
      itemCount: 25,
      items: ch04_s02_items
    }
  ],
  fixes: []
};

save("ch04-p1.json", ch04_p1);
save("ch04-p2.json", ch04_p2);
