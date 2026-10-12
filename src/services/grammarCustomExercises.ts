import { getDatabase } from "./db";
import { clearBookCache, getChapterMetadata } from "./grammarBook";
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

/**
 * Validates and parses the exercise JSON text.
 */
export function parseAndValidateExerciseJson(
  rawText: string,
  defaultChapterId: string = "ch01"
): ValidationResult {
  const cleaned = cleanRawJsonText(rawText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi cú pháp JSON: ${err instanceof Error ? err.message : String(err)}. Vui lòng kiểm tra dấu ngoặc kép hoặc dấu phẩy.`,
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "Nội dung JSON không hợp lệ (phải là một đối tượng JSON)." };
  }

  const obj = parsed as Record<string, unknown>;
  const warnings: string[] = [];

  // Determine chapterId
  let chapterId = typeof obj.chapterId === "string" && /^ch\d+$/i.test(obj.chapterId)
    ? obj.chapterId.toLowerCase()
    : defaultChapterId;

  // Check format: either "myenglish-grammar-exercises" or legacy/book format
  const exercisesInput: CustomExerciseItemInput[] = [];

  if (Array.isArray(obj.exercises)) {
    // New lightweight exercises format
    for (let i = 0; i < obj.exercises.length; i++) {
      const item = obj.exercises[i];
      if (!item || typeof item !== "object") continue;

      const prompt = typeof item.prompt === "string" ? item.prompt.trim() : "";
      if (!prompt) {
        return { ok: false, error: `Câu số ${i + 1} thiếu nội dung câu hỏi ("prompt").` };
      }
      if (!prompt.includes("___")) {
        warnings.push(`Câu số ${i + 1} không chứa chỗ trống '___'. Người học sẽ không thấy ô điền/chọn đáp án.`);
      }

      // Parse answers
      let answers: string[][] = [];
      if (Array.isArray(item.answers)) {
        answers = (item.answers as unknown[])
          .map((ans: unknown) =>
            Array.isArray(ans)
              ? (ans as unknown[]).map(String).map((s: string) => s.trim()).filter(Boolean)
              : [String(ans).trim()]
          )
          .filter((ansArr: string[]) => ansArr.length > 0);
      } else if (typeof item.answer === "string" && item.answer.trim()) {
        answers = [[item.answer.trim()]];
      }

      if (answers.length === 0) {
        return { ok: false, error: `Câu số ${i + 1} ("${prompt.slice(0, 30)}...") thiếu danh sách đáp án đúng ("answers").` };
      }

      // Parse options
      let options: string[] | undefined = undefined;
      if (Array.isArray(item.options)) {
        options = (item.options as unknown[]).map(String).map((s: string) => s.trim()).filter(Boolean);
      }

      const type = (typeof item.type === "string" ? item.type : options && options.length >= 2 ? "choose" : "fill_blank") as GrammarExerciseSetType;

      if (type === "choose" && (!options || options.length < 2)) {
        warnings.push(`Câu số ${i + 1} có dạng trắc nghiệm ("choose") nhưng có ít hơn 2 lựa chọn trong "options".`);
      }

      // Answer sentence fallback
      let answerSentence = typeof item.answerSentence === "string" ? item.answerSentence.trim() : "";
      if (!answerSentence) {
        // Synthesize by replacing ___ (and optional cue in parentheses) with the first accepted answer
        const firstAns = answers[0]?.[0] || "";
        answerSentence = prompt.replace(/_{3,}(?:\s*\([^)]*\))?/, firstAns);
      }

      exercisesInput.push({
        lessonId: typeof item.lessonId === "string" && item.lessonId.trim() ? item.lessonId.trim() : undefined,
        type,
        prompt,
        options,
        answers,
        answerSentence,
        explainVn: typeof item.explainVn === "string" ? item.explainVn.trim() : undefined,
        vi: typeof item.vi === "string" ? item.vi.trim() : undefined,
        underline: typeof item.underline === "string" ? item.underline.trim() : undefined,
        given: typeof item.given === "string" ? item.given.trim() : undefined,
      });
    }
  } else if (Array.isArray(obj.exerciseSets)) {
    // Standard book format (exerciseSets with items)
    for (const set of obj.exerciseSets as Array<Record<string, unknown>>) {
      if (!Array.isArray(set.items)) continue;
      for (const it of set.items as Array<Record<string, unknown>>) {
        const prompt = typeof it.prompt === "string" ? it.prompt.trim() : "";
        if (!prompt) continue;
        const answers: string[][] = Array.isArray(it.answers)
          ? it.answers.map((a: unknown) => (Array.isArray(a) ? a.map(String) : [String(a)]))
          : [];
        if (answers.length === 0) continue;

        exercisesInput.push({
          lessonId: Array.isArray(it.lessonIds) && it.lessonIds[0] ? String(it.lessonIds[0]) : undefined,
          type: (typeof set.type === "string" ? set.type : "fill_blank") as GrammarExerciseSetType,
          prompt,
          options: Array.isArray(it.options) ? it.options.map(String) : undefined,
          answers,
          answerSentence: typeof it.answerSentence === "string" ? it.answerSentence : prompt,
          explainVn: it.ai && typeof (it.ai as Record<string, unknown>).explainVn === "string" ? (it.ai as Record<string, unknown>).explainVn as string : undefined,
          vi: it.ai && typeof (it.ai as Record<string, unknown>).vi === "string" ? (it.ai as Record<string, unknown>).vi as string : undefined,
        });
      }
    }
  }

  if (exercisesInput.length === 0) {
    return {
      ok: false,
      error: "Không tìm thấy danh sách câu hỏi hợp lệ trong JSON. Hãy đảm bảo trường 'exercises' là mảng chứa các câu hỏi.",
    };
  }

  const title = typeof obj.title === "string" && obj.title.trim()
    ? obj.title.trim()
    : `Bài tập bổ sung (${exercisesInput.length} câu)`;

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

/**
 * Saves a validated batch of custom exercises into SQLite database.
 * Creates an entry in grammar_exercise_imports and returns the record.
 */
export async function saveCustomExerciseBatch(
  payload: CustomExercisesPayload,
  rawJson: string
): Promise<GrammarExerciseImportRecord> {
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

  // 1. Insert Exercise Set row
  const setMeta = {
    id: setId,
    roman: "AI",
    instruction: payload.title || "Bài tập bổ sung bằng AI",
    type: primaryType,
    importBatchId: batchId,
  };
  await db.execute(
    "INSERT OR REPLACE INTO grammar_book_sets (id, chapter_id, ord, data) VALUES ($1, $2, $3, $4);",
    [setId, chapterId, maxSetOrd + 1, JSON.stringify(setMeta)]
  );

  // 2. Insert Item rows
  const itemIds: string[] = [];
  for (let i = 0; i < payload.exercises.length; i++) {
    const ex = payload.exercises[i];
    const n = i + 1;
    const itemId = `${chapterId}:${setId}#${n}`;
    itemIds.push(itemId);
    curItemOrd++;

    const lessonIds = ex.lessonId ? [ex.lessonId] : primaryLessonId ? [primaryLessonId] : [];
    const itemData = {
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
    };

    await db.execute(
      "INSERT OR REPLACE INTO grammar_book_items (id, chapter_id, ord, data) VALUES ($1, $2, $3, $4);",
      [itemId, chapterId, curItemOrd, JSON.stringify(itemData)]
    );
  }

  // 3. Insert Import History row
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
      record.status,
    ]
  );

  // Invalidate cache & notify UI
  clearBookCache();
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("myenglish-grammar-updated", { detail: { book: true, chapterIds: [chapterId] } })
    );
  }

  return record;
}

/**
 * Reverts (undoes) an imported batch of custom exercises.
 * Deletes all items and sets belonging to this batch from SQLite, and marks status as 'reverted'.
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

  // Delete items
  for (const id of itemIds) {
    await db.execute("DELETE FROM grammar_book_items WHERE id = $1;", [id]);
  }

  // Delete sets
  for (const id of setIds) {
    await db.execute("DELETE FROM grammar_book_sets WHERE id = $1;", [id]);
  }

  // Update history record status
  await db.execute("UPDATE grammar_exercise_imports SET status = 'reverted' WHERE id = $1;", [batchId]);

  // Invalidate cache & notify UI
  clearBookCache();
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("myenglish-grammar-updated", { detail: { book: true, chapterIds: [row.chapter_id] } })
    );
  }

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
  if (rows.length > 0 && rows[0].status === "active") {
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
      status: (r.status as "active" | "reverted") || "active",
    }));
  } catch (err) {
    console.warn("Failed to load grammar exercise import history:", err);
    return [];
  }
}
