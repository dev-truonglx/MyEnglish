import { getDatabase } from "./db";
import { fillBlanks } from "./grammarItems";
import {
  countBlanks,
  getBookChapter,
  getChapterMetadata,
  normalizeAnswers,
  notifyBookUpdated,
  parseGrammarBookJson,
  VALID_CHAPTER_IDS,
} from "./grammarBook";
import type { GrammarExerciseSetType } from "@/types/grammarBook";

export interface CustomExerciseItemInput {
  lessonId?: string;
  type?: GrammarExerciseSetType;
  prompt: string;
  options?: string[];
  answers: string[][];
  answerSentence?: string;
  explainVn?: string;
  vi?: string;
  underline?: string;
  given?: string;
}

export interface CustomExercisesPayload {
  format: "myenglish-grammar-exercises" | "myenglish-grammar-book";
  version?: number;
  chapterId: string;
  title?: string;
  exercises: CustomExerciseItemInput[];
}

export interface GrammarExerciseImportRecord {
  id: string; // batchId
  timestamp: number;
  chapterId: string;
  lessonId?: string | null;
  title: string;
  itemCount: number;
  itemIds: string[];
  setIds: string[];
  rawJson: string;
  /** A batch whose save was interrupted ("pending" in the table) is listed as "active" so it can be undone */
  status: "active" | "reverted";
}

export type ValidationResult =
  | { ok: true; payload: CustomExercisesPayload; warnings: string[] }
  | { ok: false; error: string; lineHint?: number };

export interface TensePromptSelection {
  id: string;
  titleVn: string;
  titleEn?: string;
  count: number;
}

export interface GeneratePromptOptions {
  chapterId?: string;
  lessonId?: string;
  lessonTitle?: string;
  tenses?: TensePromptSelection[];
}

/**
 * Generates an AI prompt template tailored for creating English grammar exercises.
 * Can optionally be targeted to specific tenses with question counts, or a specific chapter/lesson.
 */
export function generateExercisePrompt(options?: GeneratePromptOptions): string {
  const chapterId = options?.chapterId || "ch01";
  const activeTenses = options?.tenses?.filter((t) => t.count > 0) || [];

  // Multi-tense custom prompt
  if (activeTenses.length > 0) {
    const totalCount = activeTenses.reduce((sum, t) => sum + t.count, 0);
    const tenseListLines = activeTenses.map(
      (t, idx) =>
        `${idx + 1}. ${t.titleVn}${t.titleEn ? ` (${t.titleEn})` : ""} [Mã lessonId: "${t.id}"] -> ${t.count} câu`
    );

    const titleText =
      activeTenses.length === 1
        ? `Bài tập thì: ${activeTenses[0].titleVn}`
        : `Bài tập tổng hợp ${activeTenses.length} thì tiếng Anh (${totalCount} câu)`;

    const firstTense = activeTenses[0];
    const secondTense = activeTenses.length > 1 ? activeTenses[1] : activeTenses[0];

    return `Bạn là chuyên gia biên soạn bài tập ngữ pháp tiếng Anh (chuyên ngành Công nghệ Thông tin & Tiếng Anh giao tiếp công sở).
Dưới đây là yêu cầu tạo bộ câu hỏi bài tập ngữ pháp tiếng Anh theo ĐÚNG danh sách các thì và số lượng cụ thể sau:

DANH SÁCH THÌ VÀ SỐ LƯỢNG BÀI TẬP YÊU CẦU:
${tenseListLines.join("\n")}
=> TỔNG CỘNG: ${totalCount} câu hỏi.

---
[NẾU CÓ TÀI LIỆU HOẶC GHI CHÚ RIÊNG, HÃY DÁN VÀO ĐÂY ĐỂ AI DỰA VÀO ĐÓ SOẠN BÀI, HOẶC ĐỂ TRỐNG ĐỂ AI TỰ BIÊN SOẠN CÂU HỎI THEO CHỦ ĐỀ CÔNG NGHỆ THÔNG TIN / VĂN PHÒNG]
---

Yêu cầu về nội dung & phân bổ:
- BẮT BUỘC tạo ĐÚNG ${totalCount} câu hỏi theo đúng số lượng đã phân chia cho từng thì ở danh sách trên.
- BẮT BUỘC gán thuộc tính "lessonId" chính xác cho từng câu hỏi tương ứng với mã bài của thì đó (Ví dụ: các câu của "${firstTense.titleVn}" phải có "lessonId": "${firstTense.id}"${
      secondTense.id !== firstTense.id ? `, các câu của "${secondTense.titleVn}" phải có "lessonId": "${secondTense.id}"` : ""
    }).
- Câu hỏi có ngữ cảnh tự nhiên, ưu tiên công việc ngành IT, lập trình, văn phòng hoặc giao tiếp hàng ngày.
- Đa dạng giữa 2 dạng: "choose" (trắc nghiệm chọn 1 trong 4 đáp án) và "fill_blank" (điền từ / chia động từ vào chỗ trống).
- Mỗi câu PHẢI có giải thích ngữ pháp bằng tiếng Việt ("explainVn") và dịch nghĩa câu ("vi").

BẮT BUỘC xuất ra DUY NHẤT một khối mã JSON hợp lệ theo định dạng bên dưới (không viết thêm lời chào hay giải thích nào ngoài khối \`\`\`json):

\`\`\`json
{
  "format": "myenglish-grammar-exercises",
  "version": 1,
  "chapterId": "${chapterId}",
  "title": "${titleText}",
  "exercises": [
    {
      "lessonId": "${firstTense.id}",
      "type": "choose",
      "prompt": "Our DevOps engineer usually ___ the production server every Sunday midnight.",
      "options": ["restarts", "restart", "is restarting", "restarted"],
      "answers": [["restarts"]],
      "answerSentence": "Our DevOps engineer usually restarts the production server every Sunday midnight.",
      "explainVn": "Diễn tả hành động lặp đi lặp lại có chu kỳ, chủ ngữ số ít nên động từ thêm 's'.",
      "vi": "Kỹ sư DevOps của chúng tôi thường khởi động lại máy chủ production vào nửa đêm mỗi Chủ nhật."
    },
    {
      "lessonId": "${secondTense.id}",
      "type": "fill_blank",
      "prompt": "The engineering team ___ (investigate) the memory leak right now.",
      "answers": [["is investigating"]],
      "answerSentence": "The engineering team is investigating the memory leak right now.",
      "explainVn": "Dấu hiệu 'right now' diễn tả hành động đang diễn ra tại thời điểm nói.",
      "vi": "Đội ngũ kỹ thuật hiện đang điều tra lỗi tràn bộ nhớ."
    }
  ]
}
\`\`\`

Quy tắc cấu trúc JSON:
1. "format": Bắt buộc là "myenglish-grammar-exercises".
2. "chapterId": Bắt buộc là "${chapterId}".
3. "lessonId": BẮT BUỘC điền đúng mã bài học của thì tương ứng (như danh sách mã lessonId đã cho ở trên).
4. "prompt": Câu hỏi bài tập. Chỗ cần điền hoặc chọn đáp án PHẢI dùng đúng 3 dấu gạch dưới: "___". Nếu là bài tập chia động từ thì ghi rõ dạng nguyên thể trong ngoặc, ví dụ: "___ (investigate)".
5. "options": Mảng 4 phương án lựa chọn (bắt buộc đối với type "choose").
6. "answers": Mảng 2 chiều chứa các phương án đúng được chấp nhận, ví dụ: [["restarts"]] hoặc [["is investigating"]].
7. "answerSentence": Toàn bộ câu hoàn chỉnh sau khi điền đáp án đúng.
8. "explainVn": Giải thích chi tiết ngữ pháp bằng tiếng Việt vì sao chọn đáp án đó.
9. "vi": Bản dịch nghĩa tiếng Việt của toàn bộ câu.`;
  }

  // Fallback for single chapter or lesson
  const chapterMeta = getChapterMetadata(chapterId);
  const chapterName = chapterMeta ? `${chapterMeta.title} (${chapterMeta.titleVn})` : "Thì hiện tại đơn";
  const lessonContext = options?.lessonTitle
    ? `Bài học: ${options.lessonTitle}${options.lessonId ? ` [${options.lessonId}]` : ""}`
    : `Chương: ${chapterName} [${chapterId}]`;

  return `Bạn là chuyên gia biên soạn bài tập ngữ pháp tiếng Anh (chuyên ngành Công nghệ Thông tin & Tiếng Anh giao tiếp công sở).
Dưới đây là tài liệu / ghi chú ngữ pháp của tôi (hoặc yêu cầu tạo bài tập cho ${lessonContext}):
---
[DÁN NỘI DUNG TÀI LIỆU HOẶC GHI YÊU CẦU CỦA BẠN VÀO ĐÂY]
---

Hãy tạo cho tôi một bộ bài tập ngữ pháp gồm 5 đến 15 câu hỏi.
Yêu cầu về nội dung:
- Câu hỏi có ngữ cảnh tự nhiên, ưu tiên công việc ngành IT, lập trình, văn phòng hoặc giao tiếp hàng ngày.
- Đa dạng giữa 2 dạng: "choose" (trắc nghiệm chọn 1 trong 4 đáp án) và "fill_blank" (điền từ / chia động từ vào chỗ trống).
- Mỗi câu PHẢI có giải thích ngữ pháp bằng tiếng Việt ("explainVn") và dịch nghĩa câu ("vi").

BẮT BUỘC xuất ra DUY NHẤT một khối mã JSON hợp lệ theo định dạng bên dưới (không viết thêm lời chào hay giải thích nào ngoài khối \`\`\`json):

\`\`\`json
{
  "format": "myenglish-grammar-exercises",
  "version": 1,
  "chapterId": "${chapterId}",
  "title": "Bài tập bổ sung: ${options?.lessonTitle || chapterMeta?.titleVn || "Ngữ pháp"}",
  "exercises": [
    {
      "lessonId": "${options?.lessonId || `${chapterId}-l01`}",
      "type": "choose",
      "prompt": "Our DevOps engineer usually ___ the production server every Sunday midnight.",
      "options": ["restarts", "restart", "is restarting", "restarted"],
      "answers": [["restarts"]],
      "answerSentence": "Our DevOps engineer usually restarts the production server every Sunday midnight.",
      "explainVn": "Diễn tả hành động lặp đi lặp lại có chu kỳ (thì hiện tại đơn), chủ ngữ 'DevOps engineer' là số ít nên động từ thêm 's'.",
      "vi": "Kỹ sư DevOps của chúng tôi thường khởi động lại máy chủ production vào nửa đêm mỗi Chủ nhật."
    },
    {
      "lessonId": "${options?.lessonId || `${chapterId}-l01`}",
      "type": "fill_blank",
      "prompt": "The background worker ___ (process) queue messages automatically.",
      "answers": [["processes"]],
      "answerSentence": "The background worker processes queue messages automatically.",
      "explainVn": "Thì hiện tại đơn diễn tả quy trình tự động, chủ ngữ số ít.",
      "vi": "Worker chạy ngầm tự động xử lý các tin nhắn trong hàng đợi."
    }
  ]
}
\`\`\`

Quy tắc cấu trúc JSON:
1. "format": Bắt buộc là "myenglish-grammar-exercises".
2. "chapterId": Mã chương từ "ch01" đến "ch31" (hiện tại là "${chapterId}").
3. "lessonId": Mã bài học cụ thể (ví dụ: "${options?.lessonId || `${chapterId}-l01`}").
4. "prompt": Câu hỏi bài tập. Chỗ cần điền hoặc chọn đáp án PHẢI dùng đúng 3 dấu gạch dưới: "___". Nếu là bài tập chia động từ thì ghi rõ dạng nguyên thể trong ngoặc, ví dụ: "___ (process)".
5. "options": Mảng 4 phương án lựa chọn (bắt buộc đối với type "choose").
6. "answers": Mảng 2 chiều chứa các phương án đúng được chấp nhận, ví dụ: [["processes"]] hoặc [["don't", "do not"]].
7. "answerSentence": Toàn bộ câu hoàn chỉnh sau khi điền đáp án đúng.
8. "explainVn": Giải thích chi tiết ngữ pháp bằng tiếng Việt vì sao chọn đáp án đó.
9. "vi": Bản dịch nghĩa tiếng Việt của toàn bộ câu.`;
}

/**
 * Normalizes and cleans raw text from an AI chat:
 * Drops markdown code fences (```json ... ```), BOM, leading/trailing text, and trailing commas.
 * (Reading a file uses parseGrammarBookJson, which also copes with text before the "{" and with line breaks
 * inside strings; this plain cleaner is kept for callers that only want the text.)
 */
export function cleanRawJsonText(raw: string): string {
  let s = raw.replace(/^\uFEFF/, "").trim();
  // Strip code block fences
  const matchFence = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(s);
  if (matchFence) {
    s = matchFence[1].trim();
  }
  // Remove trailing commas before } or ]
  s = s.replace(/,(\s*[}\]])/g, "$1");
  return s;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** Synthesize the complete sentence: each blank (and the cue after it) is replaced by the first accepted answer */
function sentenceFrom(prompt: string, answers: string[][]): string {
  const blanks = countBlanks(prompt);
  if (blanks === 0) return answers[0]?.[0] || prompt;
  return fillBlanks(prompt, answers.map((a) => a[0] ?? ""));
}

/**
 * One exercise from the AI's JSON (either format). `where` names it in messages ("Câu số 3"); `defaults`
 * are what the book format takes from the set. A fatal problem comes back as an error.
 */
function readExercise(
  item: Obj,
  where: string,
  defaults: { type?: string; lessonId?: string }
): { ok: true; exercise: CustomExerciseItemInput; warnings: string[] } | { ok: false; error: string } {
  const warnings: string[] = [];
  const prompt = str(item.prompt) ?? "";
  if (!prompt) return { ok: false, error: `${where} thiếu nội dung câu hỏi ("prompt").` };
  const blanks = countBlanks(prompt);
  if (blanks === 0) warnings.push(`${where} không chứa chỗ trống '___'. Người học sẽ không thấy ô điền/chọn đáp án.`);

  // The book's reader keeps an empty answer ("nothing goes here") and its place among the blanks
  const parsed = normalizeAnswers(item.answers !== undefined ? item.answers : item.answer, blanks);
  if (parsed === null) {
    return { ok: false, error: `${where} ("${prompt.slice(0, 30)}...") có "answers" sai định dạng: mỗi đáp án phải là chữ hoặc danh sách chữ.` };
  }
  const answers = parsed.map((slot) => slot.map((a) => a.trim()));
  if (!answers.some((slot) => slot.some(Boolean))) {
    return { ok: false, error: `${where} ("${prompt.slice(0, 30)}...") thiếu danh sách đáp án đúng ("answers").` };
  }
  if (blanks > 0 && answers.length !== blanks) {
    warnings.push(`${where} có ${blanks} chỗ trống nhưng ${answers.length} đáp án: câu này sẽ do bạn tự chấm.`);
  }

  let options: string[] | undefined;
  if (Array.isArray(item.options)) {
    options = item.options
      .filter((o): o is string | number => typeof o === "string" || typeof o === "number")
      .map((o) => String(o).trim())
      .filter(Boolean);
  }
  const type = (str(item.type) ?? defaults.type ?? (options && options.length >= 2 ? "choose" : "fill_blank")) as GrammarExerciseSetType;
  if (type === "choose" && (!options || options.length < 2)) {
    warnings.push(`${where} có dạng trắc nghiệm ("choose") nhưng có ít hơn 2 lựa chọn trong "options".`);
  }

  const ai = isObj(item.ai) ? item.ai : undefined;
  const lessonIds = Array.isArray(item.lessonIds) ? item.lessonIds : undefined;
  return {
    ok: true,
    warnings,
    exercise: {
      lessonId: str(item.lessonId) ?? (lessonIds?.[0] !== undefined ? str(String(lessonIds[0])) : undefined) ?? defaults.lessonId,
      type,
      prompt,
      options,
      answers,
      answerSentence: str(item.answerSentence) ?? sentenceFrom(prompt, answers),
      explainVn: str(item.explainVn) ?? (ai ? str(ai.explainVn) : undefined),
      vi: str(item.vi) ?? (ai ? str(ai.vi) : undefined),
      underline: str(item.underline),
      given: str(item.given),
    },
  };
}

/**
 * Validates and parses the exercise JSON text. The text is read the way a book file is (parseGrammarBookJson):
 * text around the JSON, code fences, trailing commas and raw line breaks inside strings are all forgiven.
 */
export function parseAndValidateExerciseJson(
  rawText: string,
  defaultChapterId: string = "ch01"
): ValidationResult {
  const read = parseGrammarBookJson(rawText);
  if (!read.ok) {
    return { ok: false, error: `Lỗi cú pháp JSON: ${read.message}` };
  }
  if (!isObj(read.value)) {
    return { ok: false, error: "Nội dung JSON không hợp lệ (phải là một đối tượng JSON)." };
  }

  const obj = read.value;
  const warnings: string[] = [];

  // The chapter: the file's own ("ch1" is read as "ch01"), else the one chosen in the screen
  let chapterId = defaultChapterId;
  const given = typeof obj.chapterId === "string" ? obj.chapterId.trim().toLowerCase() : "";
  if (given) {
    const m = /^ch0*(\d{1,2})$/.exec(given);
    const id = m ? `ch${m[1].padStart(2, "0")}` : "";
    if (VALID_CHAPTER_IDS.has(id)) chapterId = id;
    else warnings.push(`chapterId "${String(obj.chapterId).slice(0, 20)}" không thuộc 31 chương (ch01 – ch31): dùng chương đang chọn (${defaultChapterId}).`);
  }

  const exercisesInput: CustomExerciseItemInput[] = [];
  if (Array.isArray(obj.exercises)) {
    // New lightweight exercises format
    for (let i = 0; i < obj.exercises.length; i++) {
      const item = obj.exercises[i];
      if (!isObj(item)) continue;
      const res = readExercise(item, `Câu số ${i + 1}`, {});
      if (!res.ok) return { ok: false, error: res.error };
      warnings.push(...res.warnings);
      exercisesInput.push(res.exercise);
    }
  } else if (Array.isArray(obj.exerciseSets)) {
    // Standard book format (exerciseSets with items): an item that cannot be used is left out with a warning
    let n = 0;
    for (const set of obj.exerciseSets) {
      if (!isObj(set) || !Array.isArray(set.items)) continue;
      for (const it of set.items) {
        n++;
        if (!isObj(it)) continue;
        const res = readExercise(it, `Câu số ${n}`, { type: str(set.type) ?? "fill_blank" });
        if (!res.ok) {
          warnings.push(`${res.error} → bỏ qua câu này.`);
          continue;
        }
        warnings.push(...res.warnings);
        exercisesInput.push(res.exercise);
      }
    }
  }

  if (exercisesInput.length === 0) {
    return {
      ok: false,
      error: "Không tìm thấy danh sách câu hỏi hợp lệ trong JSON. Hãy đảm bảo trường 'exercises' là mảng chứa các câu hỏi.",
    };
  }

  const title = str(obj.title) ?? `Bài tập bổ sung (${exercisesInput.length} câu)`;

  return {
    ok: true,
    warnings,
    payload: {
      format: "myenglish-grammar-exercises",
      version: 1,
      chapterId,
      title,
      exercises: exercisesInput,
    },
  };
}

const CH_LABEL = (chapterId: string) => chapterId.toUpperCase();

/**
 * The batch must land where the learner can reach it: the chapter has to be imported, and every lessonId has
 * to be one of its lessons (a question tied to no lesson is never asked). Throws an explanation in Vietnamese.
 */
async function assertBatchTargets(payload: CustomExercisesPayload): Promise<void> {
  const chapterId = payload.chapterId;
  if (!VALID_CHAPTER_IDS.has(chapterId)) {
    throw new Error(`Mã chương "${chapterId}" không thuộc 31 chương (ch01 – ch31).`);
  }
  if (payload.exercises.length === 0) throw new Error("Bộ bài tập không có câu nào.");
  const chapter = await getBookChapter(chapterId);
  if (!chapter) {
    throw new Error(
      `Chương ${CH_LABEL(chapterId)} chưa được nhập vào sách nên chưa có bài để gắn bài tập vào. Hãy nhập chương này trước, hoặc chọn chương khác.`
    );
  }
  const lessonIds = new Set((chapter.lessons ?? []).map((l) => l.id));
  const unknown = [...new Set(payload.exercises.map((e) => e.lessonId).filter((id): id is string => !!id && !lessonIds.has(id)))];
  if (unknown.length > 0) {
    throw new Error(
      `Bài ${unknown.slice(0, 5).join(", ")} không có trong chương ${CH_LABEL(chapterId)}. Hãy sửa "lessonId" cho đúng mã bài của chương này.`
    );
  }
  if (!payload.exercises.some((e) => e.lessonId)) {
    throw new Error('Chưa câu nào có "lessonId" (mã bài học). Câu không gắn bài nào sẽ không bao giờ được hỏi.');
  }
}

type BookDb = Awaited<ReturnType<typeof getDatabase>>;

/** Multi-row INSERT of (id, chapter_id, ord, data) rows, a hundred per statement */
async function insertBookRows(db: BookDb, table: string, rows: Array<[string, string, number, string]>): Promise<void> {
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const values = chunk.map((_, j) => `($${j * 4 + 1}, $${j * 4 + 2}, $${j * 4 + 3}, $${j * 4 + 4})`).join(", ");
    await db.execute(`INSERT OR REPLACE INTO ${table} (id, chapter_id, ord, data) VALUES ${values};`, chunk.flat());
  }
}

async function deleteBookRows(db: BookDb, table: string, ids: string[]): Promise<void> {
  const BATCH = 200;
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    await db.execute(`DELETE FROM ${table} WHERE id IN (${chunk.map((_, j) => `$${j + 1}`).join(", ")});`, chunk);
  }
}

/** Every row of a batch: the ones its history lists, and any other row stamped with its id (left by a failed save) */
async function deleteBatchRows(db: BookDb, chapterId: string, batchId: string, itemIds: string[], setIds: string[]): Promise<void> {
  const stamp = `%"importBatchId":"${batchId}"%`;
  for (const [table, ids] of [
    ["grammar_book_items", itemIds],
    ["grammar_book_sets", setIds],
  ] as const) {
    const orphans = await db.select<Array<{ id: string }>>(`SELECT id FROM ${table} WHERE chapter_id = $1 AND data LIKE $2;`, [chapterId, stamp]);
    await deleteBookRows(db, table, [...new Set([...ids, ...orphans.map((r) => r.id)])]);
  }
}

/**
 * Saves a validated batch of custom exercises into SQLite database.
 * Creates an entry in grammar_exercise_imports and returns the record.
 *
 * Writes are separate statements (the connection pool makes a transaction unsafe), so they are ordered to be
 * recoverable: the history row goes first as "pending" (it already lists every row to come), then the set and
 * the items, and only then the row becomes "active". A failure half-way is cleaned up here, and when even that
 * fails the pending history can still be undone, which removes whatever was written.
 */
export async function saveCustomExerciseBatch(
  payload: CustomExercisesPayload,
  rawJson: string
): Promise<GrammarExerciseImportRecord> {
  await assertBatchTargets(payload);
  const db = await getDatabase();
  const chapterId = payload.chapterId;
  const now = Date.now();
  const batchId = `batch_${now}_${Math.random().toString(36).slice(2, 7)}`;
  const setId = `${chapterId}-s-ai-${now.toString(36)}`;
  const groupId = `${chapterId}-g-ai-${now.toString(36)}`;

  // Find max ord in grammar_book_items and grammar_book_sets for this chapter
  const setRows = await db.select<Array<{ ord: number }>>(
    "SELECT MAX(ord) as ord FROM grammar_book_sets WHERE chapter_id = $1;",
    [chapterId]
  );
  const maxSetOrd = setRows[0]?.ord ? Number(setRows[0].ord) : 0;

  const itemRows = await db.select<Array<{ ord: number }>>(
    "SELECT MAX(ord) as ord FROM grammar_book_items WHERE chapter_id = $1;",
    [chapterId]
  );
  let curItemOrd = itemRows[0]?.ord ? Number(itemRows[0].ord) : 0;

  // Primary type and primary lessonId
  const primaryType: GrammarExerciseSetType = payload.exercises[0]?.type || "choose";
  const primaryLessonId = payload.exercises.find((e) => Boolean(e.lessonId))?.lessonId || null;

  const setMeta = {
    id: setId,
    roman: "AI",
    instruction: payload.title || "Bài tập bổ sung bằng AI",
    type: primaryType,
    importBatchId: batchId,
  };
  const itemIds: string[] = [];
  const itemData: Array<[string, string, number, string]> = payload.exercises.map((ex, i) => {
    const n = i + 1;
    const itemId = `${chapterId}:${setId}#${n}`;
    itemIds.push(itemId);
    const lessonIds = ex.lessonId ? [ex.lessonId] : primaryLessonId ? [primaryLessonId] : [];
    return [
      itemId,
      chapterId,
      ++curItemOrd,
      JSON.stringify({
        setId,
        n,
        prompt: ex.prompt,
        options: ex.options,
        answers: ex.answers,
        answerSentence: ex.answerSentence || ex.prompt,
        underline: ex.underline,
        given: ex.given,
        lessonIds,
        groupId,
        groupTitle: payload.title || "Bài tập bổ sung bằng AI",
        groupLessonIds: lessonIds,
        importBatchId: batchId,
        ai: {
          explainVn: ex.explainVn,
          vi: ex.vi,
          lessonIds,
        },
      }),
    ];
  });

  const record: GrammarExerciseImportRecord = {
    id: batchId,
    timestamp: now,
    chapterId,
    lessonId: primaryLessonId,
    title: payload.title || `Bài tập bổ sung (${payload.exercises.length} câu)`,
    itemCount: payload.exercises.length,
    itemIds,
    setIds: [setId],
    rawJson,
    status: "active",
  };

  // 1. The history row first, "pending": from here on the batch can always be found and undone
  await db.execute(
    `INSERT INTO grammar_exercise_imports (id, timestamp, chapter_id, lesson_id, title, item_count, item_ids, set_ids, raw_json, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);`,
    [
      record.id,
      record.timestamp,
      record.chapterId,
      record.lessonId,
      record.title,
      record.itemCount,
      JSON.stringify(record.itemIds),
      JSON.stringify(record.setIds),
      record.rawJson,
      "pending",
    ]
  );

  try {
    // 2. The exercise set, 3. its items, 4. the batch is complete
    await insertBookRows(db, "grammar_book_sets", [[setId, chapterId, maxSetOrd + 1, JSON.stringify(setMeta)]]);
    await insertBookRows(db, "grammar_book_items", itemData);
    await db.execute("UPDATE grammar_exercise_imports SET status = 'active' WHERE id = $1;", [batchId]);
  } catch (err) {
    try {
      await deleteBatchRows(db, chapterId, batchId, itemIds, record.setIds);
      await db.execute("UPDATE grammar_exercise_imports SET status = 'reverted' WHERE id = $1;", [batchId]);
    } catch {
      // The pending history stays: undoing it later removes the rows
    }
    notifyBookUpdated([chapterId]);
    throw err;
  }

  // Invalidate cache & notify UI (this window and the other ones)
  notifyBookUpdated([chapterId]);

  return record;
}

/**
 * Reverts (undoes) an imported batch of custom exercises.
 * Deletes all items and sets belonging to this batch from SQLite (the ones its history lists and any row
 * stamped with the batch id), and marks status as 'reverted'.
 */
export async function revertCustomExerciseBatch(batchId: string): Promise<boolean> {
  const db = await getDatabase();
  const rows = await db.select<Array<{
    id: string;
    chapter_id: string;
    item_ids: string;
    set_ids: string;
    status: string;
  }>>("SELECT id, chapter_id, item_ids, set_ids, status FROM grammar_exercise_imports WHERE id = $1;", [batchId]);

  if (rows.length === 0) return false;
  const row = rows[0];

  let itemIds: string[] = [];
  let setIds: string[] = [];
  try {
    itemIds = JSON.parse(row.item_ids || "[]");
    setIds = JSON.parse(row.set_ids || "[]");
  } catch {}

  await deleteBatchRows(db, row.chapter_id, batchId, itemIds, setIds);

  // Update history record status
  await db.execute("UPDATE grammar_exercise_imports SET status = 'reverted' WHERE id = $1;", [batchId]);

  notifyBookUpdated([row.chapter_id]);

  return true;
}

/**
 * Permanently deletes an import history record from database.
 * If the record is still active, it also reverts the items first.
 */
export async function deleteExerciseImportRecord(batchId: string): Promise<void> {
  const db = await getDatabase();
  const rows = await db.select<Array<{ status: string }>>(
    "SELECT status FROM grammar_exercise_imports WHERE id = $1;",
    [batchId]
  );
  if (rows.length > 0 && rows[0].status !== "reverted") {
    await revertCustomExerciseBatch(batchId);
  }
  await db.execute("DELETE FROM grammar_exercise_imports WHERE id = $1;", [batchId]);
}

/**
 * Lists all custom exercise import records from SQLite, ordered by newest first.
 */
export async function listExerciseImportHistory(
  chapterId?: string
): Promise<GrammarExerciseImportRecord[]> {
  try {
    const db = await getDatabase();
    let query = "SELECT id, timestamp, chapter_id, lesson_id, title, item_count, item_ids, set_ids, raw_json, status FROM grammar_exercise_imports";
    const params: unknown[] = [];
    if (chapterId) {
      query += " WHERE chapter_id = $1";
      params.push(chapterId);
    }
    query += " ORDER BY timestamp DESC;";

    const rows = await db.select<Array<{
      id: string;
      timestamp: number;
      chapter_id: string;
      lesson_id: string | null;
      title: string;
      item_count: number;
      item_ids: string;
      set_ids: string;
      raw_json: string;
      status: string;
    }>>(query, params);

    return rows.map((r) => ({
      id: r.id,
      timestamp: Number(r.timestamp),
      chapterId: r.chapter_id,
      lessonId: r.lesson_id,
      title: r.title,
      itemCount: Number(r.item_count),
      itemIds: (() => {
        try {
          return JSON.parse(r.item_ids);
        } catch {
          return [];
        }
      })(),
      setIds: (() => {
        try {
          return JSON.parse(r.set_ids);
        } catch {
          return [];
        }
      })(),
      rawJson: r.raw_json,
      // A batch still "pending" had its save interrupted: it is offered as active so it can be undone
      status: r.status === "reverted" ? "reverted" : "active",
    }));
  } catch (err) {
    console.warn("Failed to load grammar exercise import history:", err);
    return [];
  }
}
