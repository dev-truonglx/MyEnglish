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
// CH05: PHRASES AND CLAUSES OF PURPOSE
// ==========================================

const ch05_p1 = {
  format: "myenglish-grammar-book",
  version: 2,
  chapterId: "ch05",
  part: 1,
  parts: 3,
  chapter: {
    order: 5,
    title: "PHRASES AND CLAUSES OF PURPOSE",
    titleVn: "CỤM TỪ VÀ MỆNH ĐỀ CHỈ MỤC ĐÍCH",
    pages: [29, 32]
  },
  lessons: [
    {
      id: "ch05-l01",
      order: 1,
      title: "Phrases of Purpose",
      titleVn: "Cụm từ chỉ mục đích",
      page: 29,
      blocks: [
        { type: "text", text: "Để diễn đạt mục đích khẳng định hay phủ định bằng một cụm từ (phrase):" },
        { type: "heading", text: "1. Khẳng định" },
        { type: "formula", label: "Cấu trúc", text: "to-infinitive / in order to / so as to + V(bare-inf)" },
        { type: "example", en: "I try to study to pass my next exam.", vi: "Tôi cố gắng học để thi đỗ kỳ thi tới." },
        { type: "example", en: "We worked hard in order to complete the project in time.", vi: "Chúng tôi làm việc chăm chỉ để hoàn thành dự án kịp giờ." },
        { type: "heading", text: "2. Phủ định" },
        { type: "formula", label: "Cấu trúc", text: "in order not to / so as not to + V(bare-inf)" },
        { type: "example", en: "She got up early so as not to miss the bus.", vi: "Cô ấy dậy sớm để không bị lỡ xe buýt." },
        { type: "heading", text: "3. Khác chủ ngữ" },
        { type: "formula", label: "Cấu trúc", text: "in order for + O + to-infinitive" },
        { type: "example", en: "He gave me his address in order for me to visit him.", vi: "Anh ấy đưa địa chỉ để tôi đến thăm." }
      ]
    },
    {
      id: "ch05-l02",
      order: 2,
      title: "Adverbial Clauses of Purpose",
      titleVn: "Mệnh đề trạng ngữ chỉ mục đích",
      page: 30,
      blocks: [
        { type: "text", text: "Mệnh đề chỉ mục đích thường bắt đầu bằng SO THAT hoặc IN ORDER THAT:" },
        { type: "formula", label: "Cấu trúc", text: "S + V + so that / in order that + S + will/would / can/could / may/might + V(bare-inf)" },
        { type: "bullet", text: "Mệnh đề chính ở hiện tại -> dùng will / can / may ở mệnh đề mục đích." },
        { type: "bullet", text: "Mệnh đề chính ở quá khứ -> dùng would / could / might ở mệnh đề mục đích." },
        { type: "example", en: "I study English in order that I can find a better job.", vi: "Tôi học tiếng Anh để có thể tìm công việc tốt hơn." },
        { type: "example", en: "He hurried so that he wouldn't miss the train.", vi: "Anh ấy vội vã để không lỡ chuyến tàu." }
      ]
    },
    {
      id: "ch05-l03",
      order: 3,
      title: "Exercise Transformations",
      titleVn: "Các dạng bài tập biến đổi câu",
      page: 30,
      blocks: [
        { type: "bullet", text: "Dạng 1: Nối 2 câu cùng chủ ngữ thành cụm từ (to V) hoặc mệnh đề (so that + S + can/could...)" },
        { type: "bullet", text: "Dạng 2: Nối 2 câu khác chủ ngữ (want + O) -> dùng 'so that + S + can...' hoặc 'in order for + O + to V'" },
        { type: "bullet", text: "Dạng 3: Đổi từ cụm từ sang mệnh đề hoặc ngược lại (so as to <-> so that)" }
      ]
    }
  ],
  fixes: []
};

const ch05_s01_items = [
  { n: 1, prompt: "The boy stood on the benches. They wanted to get a better view.\n-> The boy stood on the benches ___", answers: [["to get a better view", "so that he could get a better view", "so that they could get a better view"]], answerSentence: "The boy stood on the benches to get a better view." },
  { n: 2, prompt: "We lower the volume of the radio. We don’t want to bother our neighbours.\n-> We lower the volume of the radio ___", answers: [["so as not to bother our neighbours", "so that we will not bother our neighbours", "so that we won't bother our neighbours"]], answerSentence: "We lower the volume of the radio so as not to bother our neighbours." },
  { n: 3, prompt: "I’ll write to you. I want you to know my decision soon.\n-> I’ll write to you in order ___", answers: [["that you’ll know my decision soon", "for you to know my decision soon", "that you will know my decision soon"]], answerSentence: "I’ll write to you in order that you’ll know my decision soon." },
  { n: 4, prompt: "These men were talking in whispers. They didn’t want anyone to hear their conversation.\n-> These men were talking in whispers in order ___", answers: [["that nobody could hear their conversation", "that no one could hear their conversation", "for nobody to hear their conversation"]], answerSentence: "These men were talking in whispers in order that nobody could hear their conversation." },
  { n: 5, prompt: "The boy feigned to be sick. He hoped we didn’t make him work.\n-> The boy feigned to be sick so that ___", answers: [["we wouldn’t make him work", "we would not make him work"]], answerSentence: "The boy feigned to be sick so that we wouldn’t make him work." },
  { n: 6, prompt: "The man spoke loudly. He wanted everybody to hear him clearly.\n-> The man spoke loudly so that ___", answers: [["everybody could hear him clearly", "everyone could hear him clearly"]], answerSentence: "The man spoke loudly so that everybody could hear him clearly." },
  { n: 7, prompt: "Doris often goes home as soon as the class is over. She doesn’t want her mother to wait for her.\n-> Doris often goes home as soon as the class is over so that ___", answers: [["her mother won’t wait for her", "her mother will not wait for her"]], answerSentence: "Doris often goes home as soon as the class is over so that her mother won’t wait for her." },
  { n: 8, prompt: "John gets up early. He doesn’t want to be late for class.\n-> John gets up early so that ___", answers: [["he won’t be late for class", "he will not be late for class", "so as not to be late for class"]], answerSentence: "John gets up early so that he won’t be late for class." },
  { n: 9, prompt: "Mary hid the novel under her pillow. She didn’t want her father to see it.\n-> Mary hid the novel under her pillow so that ___", answers: [["her father wouldn’t see it", "her father would not see it"]], answerSentence: "Mary hid the novel under her pillow so that her father wouldn’t see it." },
  { n: 10, prompt: "Alice prepares her lesson carefully. She wants to get high marks in class.\n-> Alice prepares her lesson carefully in order ___", answers: [["that she will get high marks in class", "to get high marks in class"]], answerSentence: "Alice prepares her lesson carefully in order that she will get high marks in class." },
  { n: 11, prompt: "The robber changed his address all the time. He didn’t want the police to find him.\n-> The robber changed his address all the time in order ___", answers: [["that the police couldn’t find him", "that the police could not find him"]], answerSentence: "The robber changed his address all the time in order that the police couldn’t find him." },
  { n: 12, prompt: "They did their jobs well. They hoped the boss would increase their salary.\n-> They did their jobs well so that ___", answers: [["the boss would increase their salary"]], answerSentence: "They did their jobs well so that the boss would increase their salary." },
  { n: 13, prompt: "You should walk slowly. Your sister can follow you.\n-> You should walk slowly so that ___", answers: [["your sister can follow you"]], answerSentence: "You should walk slowly so that your sister can follow you." },
  { n: 14, prompt: "I’m studying hard. I want to keep pace with my classmates.\n-> I’m studying hard to ___", answers: [["keep pace with my classmates", "so that I can keep pace with my classmates"]], answerSentence: "I’m studying hard to keep pace with my classmates." },
  { n: 15, prompt: "We turned out the lights. We didn’t want to waste electricity.\n-> We turned out the lights so as not ___", answers: [["to waste electricity", "to waste power"]], answerSentence: "We turned out the lights so as not to waste electricity." },
  { n: 16, prompt: "This pupil read only for short periods each day. He didn’t want to strain his eyes.\n-> This pupil read only for short periods each day in order not ___", answers: [["to strain his eyes", "to tire his eyes"]], answerSentence: "This pupil read only for short periods each day in order not to strain his eyes." },
  { n: 17, prompt: "I whispered. I didn’t want to disturb anyone.\n-> I whispered so as not ___", answers: [["to disturb anyone", "to bother anyone"]], answerSentence: "I whispered so as not to disturb anyone." },
  { n: 18, prompt: "The clown took off his mask. He didn’t want to frighten the children.\n-> The clown took off his mask in order not ___", answers: [["to frighten the children", "to scare the children"]], answerSentence: "The clown took off his mask in order not to frighten the children." },
  { n: 19, prompt: "My father drove carefully. He didn’t want to cause accidents.\n-> My father drove carefully so as not ___", answers: [["to cause accidents", "to have accidents"]], answerSentence: "My father drove carefully so as not to cause accidents." },
  { n: 20, prompt: "Sue dutifully followed her parents’ advice. She didn’t want to cause trouble for her parents.\n-> Sue dutifully followed her parents’ advice in order not ___", answers: [["to cause trouble for her parents"]], answerSentence: "Sue dutifully followed her parents’ advice in order not to cause trouble for her parents." },
  { n: 21, prompt: "Mr Thompson is learning Vietnamese. He wishes to read Kim Van Kieu.\n-> Mr Thompson is learning Vietnamese to ___", answers: [["read Kim Van Kieu", "in order to read Kim Van Kieu"]], answerSentence: "Mr Thompson is learning Vietnamese to read Kim Van Kieu." },
  { n: 22, prompt: "Please shut the door. I don’t want the dog to go out of the house.\n-> Please shut the door so that ___", answers: [["the dog won’t go out of the house", "the dog will not go out of the house"]], answerSentence: "Please shut the door so that the dog won’t go out of the house." },
  { n: 23, prompt: "The farmer built a high wall around his garden. The fruits wouldn’t be stolen.\n-> The farmer built a high wall around his garden so that ___", answers: [["the fruits wouldn’t be stolen", "the fruits would not be stolen"]], answerSentence: "The farmer built a high wall around his garden so that the fruits wouldn’t be stolen." },
  { n: 24, prompt: "The police stopped the traffic every few minutes. The pedestrians might cross the road.\n-> The police stopped the traffic every few minutes so that ___", answers: [["the pedestrians might cross the road", "the pedestrians could cross the road"]], answerSentence: "The police stopped the traffic every few minutes so that the pedestrians might cross the road." },
  { n: 25, prompt: "The notices are written in several languages. Everyone may understand them.\n-> The notices are written in several languages so that ___", answers: [["everyone may understand them", "everyone can understand them"]], answerSentence: "The notices are written in several languages so that everyone may understand them." },
  { n: 26, prompt: "I wish to have enough money. I want to buy a new house.\n-> I wish to have enough money to ___", answers: [["buy a new house", "so that I can buy a new house"]], answerSentence: "I wish to have enough money to buy a new house." },
  { n: 27, prompt: "Dick is practising the guitar. He can play for the dance.\n-> Dick is practising the guitar so that ___", answers: [["he can play for the dance"]], answerSentence: "Dick is practising the guitar so that he can play for the dance." },
  { n: 28, prompt: "She needs a job. She wants to support her old parents.\n-> She needs a job in order ___", answers: [["to support her old parents", "that she can support her old parents"]], answerSentence: "She needs a job in order to support her old parents." },
  { n: 29, prompt: "He moved to the front row. He could hear the speaker better.\n-> He moved to the front row so that ___", answers: [["he could hear the speaker better"]], answerSentence: "He moved to the front row so that he could hear the speaker better." },
  { n: 30, prompt: "She put the meat into the oven. She wanted it to be ready for dinner.\n-> She put the meat into the oven so that ___", answers: [["it would be ready for dinner"]], answerSentence: "She put the meat into the oven so that it would be ready for dinner." }
];

const ch05_s02_items = [
  { n: 1, prompt: "Leave early so that you may get home before dark.\n-> Leave early to ___", answers: [["get home before dark"]], answerSentence: "Leave early to get home before dark." },
  { n: 2, prompt: "This man changed his address constantly so that he could avoid the police.\n-> This man changed his address constantly in order ___", answers: [["to avoid the police"]], answerSentence: "This man changed his address constantly in order to avoid the police." },
  { n: 3, prompt: "I shouted in order that I could warn everyone of danger.\n-> I shouted to ___", answers: [["warn everyone of danger"]], answerSentence: "I shouted to warn everyone of danger." },
  { n: 4, prompt: "Banks are developed so that they can keep people’s money safe.\n-> Banks are developed to ___", answers: [["keep people’s money safe", "keep people's money safe"]], answerSentence: "Banks are developed to keep people’s money safe." },
  { n: 5, prompt: "Mary went to the library in order that she could borrow some books.\n-> Mary went to the library to ___", answers: [["borrow some books"]], answerSentence: "Mary went to the library to borrow some books." },
  { n: 6, prompt: "Yesterday father went to the bank so that he would open a checking account.\n-> Yesterday father went to the bank in order ___", answers: [["to open a checking account"]], answerSentence: "Yesterday father went to the bank in order to open a checking account." },
  { n: 7, prompt: "I went to see him so that I could find out what had happened.\n-> I went to see him to ___", answers: [["find out what had happened"]], answerSentence: "I went to see him to find out what had happened." },
  { n: 8, prompt: "Tom is saving up so that he can buy a new bicycle.\n-> Tom is saving up to ___", answers: [["buy a new bicycle"]], answerSentence: "Tom is saving up to buy a new bicycle." },
  { n: 9, prompt: "He hurried so that he could catch the train.\n-> He hurried in order ___", answers: [["to catch the train"]], answerSentence: "He hurried in order to catch the train." },
  { n: 10, prompt: "She is learning French so that she will be able to speak it when she comes to Paris.\n-> She is learning French to ___", answers: [["be able to speak it when she comes to Paris"]], answerSentence: "She is learning French to be able to speak it when she comes to Paris." }
];

const ch05_p2 = {
  format: "myenglish-grammar-book",
  version: 2,
  chapterId: "ch05",
  part: 2,
  parts: 3,
  exerciseSets: [
    {
      id: "ch05-s01",
      roman: "I",
      instruction: "Use a phrase or clause of purpose to combine each pair of sentences below.",
      type: "rewrite",
      page: 31,
      keyPage: 56,
      lessonIds: ["ch05-l01", "ch05-l02"],
      itemCount: 30,
      items: ch05_s01_items
    },
    {
      id: "ch05-s02",
      roman: "II",
      instruction: "Rewrite the following sentences, using phrases of purpose.",
      type: "rewrite",
      page: 32,
      keyPage: 58,
      lessonIds: ["ch05-l01"],
      itemCount: 10,
      items: ch05_s02_items
    }
  ],
  fixes: []
};

const ch05_s03_items = [
  { n: 1, prompt: "We hurried to school so as not to be late.\n-> We hurried to school so that ___", answers: [["we wouldn’t be late", "we would not be late"]], answerSentence: "We hurried to school so that we wouldn’t be late." },
  { n: 2, prompt: "He climbed the tree in order to get a better view.\n-> He climbed the tree so that ___", answers: [["he could get a better view", "he would get a better view"]], answerSentence: "He climbed the tree so that he could get a better view." },
  { n: 3, prompt: "You should get up early so that you will have time to review your lesson.\n-> You should get up early to ___", answers: [["have time to review your lesson", "in order to have time to review your lesson"]], answerSentence: "You should get up early to have time to review your lesson." },
  { n: 4, prompt: "Some young people like to earn their own living in order that they will be independent of their parents.\n-> Some young people like to earn their own living to ___", answers: [["be independent of their parents", "in order to be independent of their parents"]], answerSentence: "Some young people like to earn their own living to be independent of their parents." },
  { n: 5, prompt: "We should do morning exercises regularly so as to improve our health.\n-> We should do morning exercises regularly so that ___", answers: [["we can improve our health", "we will improve our health"]], answerSentence: "We should do morning exercises regularly so that we can improve our health." },
  { n: 6, prompt: "We should take advantage of scientific achievements so that we can develop our national economy.\n-> We should take advantage of scientific achievements in order ___", answers: [["to develop our national economy"]], answerSentence: "We should take advantage of scientific achievements in order to develop our national economy." },
  { n: 7, prompt: "Every people in the world must unite their efforts to maintain and protect peace.\n-> Every people in the world must unite their efforts so that ___", answers: [["they can maintain and protect peace", "they will maintain and protect peace"]], answerSentence: "Every people in the world must unite their efforts so that they can maintain and protect peace." },
  { n: 8, prompt: "She put on warm clothes so that she wouldn’t catch cold.\n-> She put on warm clothes so as not ___", answers: [["to catch cold"]], answerSentence: "She put on warm clothes so as not to catch cold." },
  { n: 9, prompt: "He hurried to the station so as not to miss the train.\n-> He hurried to the station so that ___", answers: [["he wouldn’t miss the train", "he would not miss the train"]], answerSentence: "He hurried to the station so that he wouldn’t miss the train." },
  { n: 10, prompt: "She locked the door so as not to be disturbed.\n-> She locked the door so that ___", answers: [["she wouldn’t be disturbed", "she would not be disturbed"]], answerSentence: "She locked the door so that she wouldn’t be disturbed." }
];

const ch05_s04_items = [
  { n: 1, prompt: "Tom hurried so that ___", answers: [["he wouldn’t miss the bus", "he wouldn't miss the train"]], answerSentence: "Tom hurried so that he wouldn’t miss the bus." },
  { n: 2, prompt: "Mary asked her parents for permission in order ___", answers: [["to go to the cinema with Tom", "to go out with friends"]], answerSentence: "Mary asked her parents for permission in order to go to the cinema with Tom." },
  { n: 3, prompt: "They’re studying English so that ___", answers: [["they can talk to foreigners", "they can find a good job"]], answerSentence: "They’re studying English so that they can talk to foreigners." },
  { n: 4, prompt: "He stood up to ___", answers: [["hear the speaker better", "speak to the audience"]], answerSentence: "He stood up to hear the speaker better." },
  { n: 5, prompt: "I gave her my telephone number in order that ___", answers: [["she could contact me", "she could call me"]], answerSentence: "I gave her my telephone number in order that she could contact me." },
  { n: 6, prompt: "I’ll come there early in order ___", answers: [["to help you", "to get a good seat"]], answerSentence: "I’ll come there early in order to help you." },
  { n: 7, prompt: "The teacher explained the lesson again so that ___", answers: [["the pupils could understand it", "all students could understand it"]], answerSentence: "The teacher explained the lesson again so that the pupils could understand it." },
  { n: 8, prompt: "The firemen rushed into the burning house to ___", answers: [["save the child", "put out the fire"]], answerSentence: "The firemen rushed into the burning house to save the child." },
  { n: 9, prompt: "He is saving money so that ___", answers: [["he can buy a house", "he can buy a car"]], answerSentence: "He is saving money so that he can buy a house." },
  { n: 10, prompt: "They are in a hurry so as not ___", answers: [["to be late", "to miss the train"]], answerSentence: "They are in a hurry so as not to be late." },
  { n: 11, prompt: "We study hard in order ___", answers: [["to pass the exam", "to acquire knowledge"]], answerSentence: "We study hard in order to pass the exam." },
  { n: 12, prompt: "Mary has made a big cake so that ___", answers: [["everyone can enjoy it", "her family can celebrate"]], answerSentence: "Mary has made a big cake so that everyone can enjoy it." },
  { n: 13, prompt: "They went to Paris to ___", answers: [["visit the Eiffel Tower", "spend their vacation"]], answerSentence: "They went to Paris to visit the Eiffel Tower." },
  { n: 14, prompt: "He tries to go to work in time so as not ___", answers: [["to be scolded by the boss", "to get penalized"]], answerSentence: "He tries to go to work in time so as not to be scolded by the boss." },
  { n: 15, prompt: "The workers went on strike so that ___", answers: [["they could get higher wages", "the company would increase their salary"]], answerSentence: "The workers went on strike so that they could get higher wages." }
];

const ch05_p3 = {
  format: "myenglish-grammar-book",
  version: 2,
  chapterId: "ch05",
  part: 3,
  parts: 3,
  exerciseSets: [
    {
      id: "ch05-s03",
      roman: "III",
      instruction: "Change phrases of purpose to clauses of purpose or vice versa.",
      type: "rewrite",
      page: 32,
      keyPage: 58,
      lessonIds: ["ch05-l01", "ch05-l02"],
      itemCount: 10,
      items: ch05_s03_items
    },
    {
      id: "ch05-s04",
      roman: "IV",
      instruction: "Complete the following sentences.",
      type: "complete_sentence",
      page: 32,
      keyPage: 58,
      lessonIds: ["ch05-l01", "ch05-l02"],
      itemCount: 15,
      items: ch05_s04_items
    }
  ],
  fixes: []
};

save("ch05-p1.json", ch05_p1);
save("ch05-p2.json", ch05_p2);
save("ch05-p3.json", ch05_p3);
