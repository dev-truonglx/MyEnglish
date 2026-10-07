const fs = require('fs');

let content = fs.readFileSync('src/components/exercises/MeaningMatchExercise.tsx', 'utf8');

content = content.replace(/import \{ prepareContextMatch, type ContextMatchPair \} from "@\/services\/smartReview";/, 'import { prepareMeaningMatch } from "@/services/smartReview";');
content = content.replace(/ContextMatchPair/g, '{ wordId: string; word: string; meaningVN: string }');
content = content.replace(/prepareContextMatch/g, 'prepareMeaningMatch');
content = content.replace(/Ghép từ vào ngữ cảnh câu thích hợp/g, 'Mini-game Nối từ');
content = content.replace(/Chọn một từ ở cột trái rồi chọn câu có chỗ trống tương ứng ở cột phải\./g, 'Chọn một từ tiếng Anh ở cột trái rồi chọn nghĩa tiếng Việt tương ứng ở cột phải.');
content = content.replace(/Câu ngữ cảnh \(Chỗ trống\)/g, 'Nghĩa tiếng Việt');
content = content.replace(/s\.maskedSentence\.includes\(BLANK\)/g, 'false');
content = content.replace(/s\.maskedSentence/g, 's.meaningVN');

// To remove the old MeaningVN from the left column in the words mapping
content = content.replace(/<p className="text-\[11px\] text-slate-400 dark:text-zinc-500 line-clamp-1">.*?<\/p>/gs, '');

fs.writeFileSync('src/components/exercises/MeaningMatchExercise.tsx', content);
