import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  generateExercisePrompt,
  cleanRawJsonText,
  parseAndValidateExerciseJson,
  saveCustomExerciseBatch,
  revertCustomExerciseBatch,
  listExerciseImportHistory,
  deleteExerciseImportRecord,
  type CustomExercisesPayload,
} from "@/services/grammarCustomExercises";
import { getDatabase } from "@/services/db";
import * as book from "@/services/grammarBook";
import type { GrammarBookFile } from "@/types/grammarBook";
import p1 from "./fixtures/grammarBook/ch01-p1.json";
import p2 from "./fixtures/grammarBook/ch01-p2.json";

/** The sample chapter (lessons ch01-l01 .. l03) imported, as the AI batches need an imported chapter */
async function importSampleChapter() {
  const chapter = book.mergeChapterParts([structuredClone(p1), structuredClone(p2)] as unknown as GrammarBookFile[]).get("ch01")!;
  await book.saveGrammarBookChapter(chapter);
}

describe("Grammar Custom Exercises & AI Prompt", () => {
  beforeEach(async () => {
    const db = await getDatabase();
    // Clean test tables
    await db.execute("DELETE FROM grammar_exercise_imports;");
    await db.execute("DELETE FROM grammar_book_items WHERE id LIKE 'ch01:ch01-s-ai-%';");
    await db.execute("DELETE FROM grammar_book_sets WHERE id LIKE 'ch01-s-ai-%';");
    await importSampleChapter();
  });

  describe("generateExercisePrompt", () => {
    it("generates default prompt with ch01", () => {
      const prompt = generateExercisePrompt();
      expect(prompt).toContain("myenglish-grammar-exercises");
      expect(prompt).toContain('"chapterId": "ch01"');
      expect(prompt).toContain("___");
      expect(prompt).toContain("explainVn");
    });

    it("customizes prompt with specific lesson info", () => {
      const prompt = generateExercisePrompt({
        chapterId: "ch03",
        lessonId: "ch03-l01",
        lessonTitle: "Câu điều kiện loại 1",
      });
      expect(prompt).toContain('"chapterId": "ch03"');
      expect(prompt).toContain('"lessonId": "ch03-l01"');
      expect(prompt).toContain("Câu điều kiện loại 1");
    });

    it("generates prompt with multiple chosen tenses and question counts", () => {
      const prompt = generateExercisePrompt({
        chapterId: "ch01",
        tenses: [
          { id: "ch01-l01", titleVn: "Thì hiện tại đơn", titleEn: "Present Simple", count: 5 },
          { id: "ch01-l02", titleVn: "Thì hiện tại tiếp diễn", titleEn: "Present Continuous", count: 7 },
          { id: "ch01-l05", titleVn: "Thì quá khứ đơn", titleEn: "Past Simple", count: 10 },
        ],
      });

      expect(prompt).toContain("DANH SÁCH THÌ VÀ SỐ LƯỢNG BÀI TẬP YÊU CẦU:");
      expect(prompt).toContain('Thì hiện tại đơn (Present Simple) [Mã lessonId: "ch01-l01"] -> 5 câu');
      expect(prompt).toContain('Thì hiện tại tiếp diễn (Present Continuous) [Mã lessonId: "ch01-l02"] -> 7 câu');
      expect(prompt).toContain('Thì quá khứ đơn (Past Simple) [Mã lessonId: "ch01-l05"] -> 10 câu');
      expect(prompt).toContain("=> TỔNG CỘNG: 22 câu hỏi.");
      expect(prompt).toContain('"lessonId": "ch01-l01"');
      expect(prompt).toContain('"lessonId": "ch01-l02"');
      expect(prompt).toContain("Bài tập tổng hợp 3 thì tiếng Anh (22 câu)");
    });
  });

  describe("cleanRawJsonText", () => {
    it("strips markdown json fences", () => {
      const raw = "```json\n{\n  \"format\": \"myenglish-grammar-exercises\"\n}\n```";
      expect(cleanRawJsonText(raw)).toBe('{\n  "format": "myenglish-grammar-exercises"\n}');
    });

    it("removes trailing commas", () => {
      const raw = '{"a": 1, "b": [1, 2, ], }';
      expect(cleanRawJsonText(raw)).toBe('{"a": 1, "b": [1, 2 ] }');
    });
  });

  describe("parseAndValidateExerciseJson", () => {
    it("validates well-formed JSON exercises successfully", () => {
      const raw = JSON.stringify({
        format: "myenglish-grammar-exercises",
        chapterId: "ch01",
        title: "Test exercises",
        exercises: [
          {
            lessonId: "ch01-l01",
            type: "choose",
            prompt: "He usually ___ (deploy) on Mondays.",
            options: ["deploys", "deploy", "deployed", "deploying"],
            answers: [["deploys"]],
            explainVn: "Hiện tại đơn chủ ngữ số ít",
            vi: "Anh ấy thường deploy vào thứ Hai.",
          },
          {
            lessonId: "ch01-l01",
            type: "fill_blank",
            prompt: "The server ___ (respond) within 20ms.",
            answers: [["responds"]],
          },
        ],
      });

      const res = parseAndValidateExerciseJson(raw);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.payload.exercises).toHaveLength(2);
        expect(res.payload.exercises[0].prompt).toBe("He usually ___ (deploy) on Mondays.");
        expect(res.payload.exercises[0].answers).toEqual([["deploys"]]);
        // Synthesized answerSentence
        expect(res.payload.exercises[1].answerSentence).toBe("The server responds within 20ms.");
      }
    });

    it("rejects invalid JSON syntax with friendly error message", () => {
      const badJson = '{"format": "myenglish-grammar-exercises", exercises: [';
      const res = parseAndValidateExerciseJson(badJson);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain("Lỗi cú pháp JSON");
      }
    });

    it("rejects exercise missing prompt or answers", () => {
      const missingPrompt = JSON.stringify({
        format: "myenglish-grammar-exercises",
        exercises: [{ answers: [["works"]] }],
      });
      const res1 = parseAndValidateExerciseJson(missingPrompt);
      expect(res1.ok).toBe(false);

      const missingAnswers = JSON.stringify({
        format: "myenglish-grammar-exercises",
        exercises: [{ prompt: "She ___ here." }],
      });
      const res2 = parseAndValidateExerciseJson(missingAnswers);
      expect(res2.ok).toBe(false);
    });

    it("warns if prompt has no blanks", () => {
      const noBlank = JSON.stringify({
        format: "myenglish-grammar-exercises",
        exercises: [
          {
            prompt: "She works here.",
            answers: [["works"]],
          },
        ],
      });
      const res = parseAndValidateExerciseJson(noBlank);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.warnings.length).toBeGreaterThan(0);
        expect(res.warnings[0]).toContain("không chứa chỗ trống '___'");
      }
    });
  });

  describe("reading the AI's JSON like a book file", () => {
    const exercise = { lessonId: "ch01-l01", prompt: "They ___ (visit) us every summer.", answers: [["visit"]] };

    it("takes text before the JSON with no code fence, and a trailing comma", () => {
      const raw = `Đây là bộ bài tập của bạn nhé:\n{ "chapterId": "ch01", "exercises": [ ${JSON.stringify(exercise)}, ], }\nChúc bạn học tốt!`;
      const res = parseAndValidateExerciseJson(raw);
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.payload.exercises).toHaveLength(1);
    });

    it("leaves a comma-bracket sequence inside a string alone", () => {
      const raw = JSON.stringify({
        exercises: [{ ...exercise, explainVn: "Giữ nguyên chuỗi này: [a, ], {b, }" }],
      });
      const res = parseAndValidateExerciseJson(raw);
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.payload.exercises[0].explainVn).toBe("Giữ nguyên chuỗi này: [a, ], {b, }");
    });

    it("rejects an answer that is an object instead of turning it into text", () => {
      const raw = JSON.stringify({ exercises: [{ ...exercise, answers: [{ text: "visit" }] }] });
      const res = parseAndValidateExerciseJson(raw);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toContain("answers");
    });

    it("keeps an empty answer in its place so the other blanks do not shift", () => {
      const raw = JSON.stringify({
        exercises: [{ prompt: "I ___ the ___ report ___ today.", answers: [["read"], [""], ["again"]] }],
      });
      const res = parseAndValidateExerciseJson(raw);
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.payload.exercises[0].answers).toEqual([["read"], [""], ["again"]]);
    });

    it("a flat list of two answers for one blank is two accepted answers, not two blanks", () => {
      const raw = JSON.stringify({ exercises: [{ prompt: "We ___ happy.", answers: ["are", "were"] }] });
      const res = parseAndValidateExerciseJson(raw);
      expect(res.ok && res.payload.exercises[0].answers).toEqual([["are", "were"]]);
    });

    it("reads 'ch1' as ch01 and falls back to the chosen chapter for a chapter that does not exist", () => {
      const ok = parseAndValidateExerciseJson(JSON.stringify({ chapterId: "ch5", exercises: [exercise] }), "ch02");
      expect(ok.ok && ok.payload.chapterId).toBe("ch05");
      const bad = parseAndValidateExerciseJson(JSON.stringify({ chapterId: "ch99", exercises: [exercise] }), "ch02");
      expect(bad.ok && bad.payload.chapterId).toBe("ch02");
      expect(bad.ok && bad.warnings.some((w) => w.includes("ch99"))).toBe(true);
    });
  });

  describe("Database Operations & Undo History", () => {
    it("saves custom batch, records history, and reverts (undoes) cleanly", async () => {
      const payload: CustomExercisesPayload = {
        format: "myenglish-grammar-exercises",
        chapterId: "ch01",
        title: "Test AI Batch",
        exercises: [
          {
            lessonId: "ch01-l01",
            type: "choose",
            prompt: "He ___ (write) clean code.",
            options: ["writes", "write", "writing", "wrote"],
            answers: [["writes"]],
            answerSentence: "He writes clean code.",
            explainVn: "Hiện tại đơn",
            vi: "Anh ấy viết mã nguồn sạch.",
          },
          {
            lessonId: "ch01-l01",
            type: "fill_blank",
            prompt: "We ___ (test) our app thoroughly.",
            answers: [["test"]],
            answerSentence: "We test our app thoroughly.",
          },
        ],
      };

      const rawJson = JSON.stringify(payload);
      const record = await saveCustomExerciseBatch(payload, rawJson);

      expect(record.status).toBe("active");
      expect(record.itemCount).toBe(2);
      expect(record.itemIds).toHaveLength(2);
      expect(record.setIds).toHaveLength(1);

      // Verify in history
      const history = await listExerciseImportHistory();
      expect(history.length).toBeGreaterThanOrEqual(1);
      const found = history.find((h) => h.id === record.id);
      expect(found).toBeDefined();
      expect(found?.status).toBe("active");
      expect(found?.itemCount).toBe(2);

      // Verify items exist in grammar_book_items
      const db = await getDatabase();
      const itemsInDb = await db.select<Array<{ id: string }>>(
        "SELECT id FROM grammar_book_items WHERE id = $1 OR id = $2;",
        [record.itemIds[0], record.itemIds[1]]
      );
      expect(itemsInDb).toHaveLength(2);

      // Revert (Undo) the batch
      const revertOk = await revertCustomExerciseBatch(record.id);
      expect(revertOk).toBe(true);

      // Verify items are DELETED from grammar_book_items
      const itemsAfterRevert = await db.select<Array<{ id: string }>>(
        "SELECT id FROM grammar_book_items WHERE id = $1 OR id = $2;",
        [record.itemIds[0], record.itemIds[1]]
      );
      expect(itemsAfterRevert).toHaveLength(0);

      // Verify history status is updated to 'reverted'
      const updatedHistory = await listExerciseImportHistory();
      const revertedRecord = updatedHistory.find((h) => h.id === record.id);
      expect(revertedRecord?.status).toBe("reverted");

      // Delete history record
      await deleteExerciseImportRecord(record.id);
      const historyAfterDelete = await listExerciseImportHistory();
      expect(historyAfterDelete.find((h) => h.id === record.id)).toBeUndefined();
    });

    const batch = (over: Partial<CustomExercisesPayload> = {}): CustomExercisesPayload => ({
      format: "myenglish-grammar-exercises",
      chapterId: "ch01",
      title: "Batch",
      exercises: [{ lessonId: "ch01-l01", type: "fill_blank", prompt: "She ___ (read) every night.", answers: [["reads"]] }],
      ...over,
    });

    it("refuses a chapter that is not imported and a lesson that is not in the chapter", async () => {
      await expect(saveCustomExerciseBatch(batch({ chapterId: "ch05" }), "{}")).rejects.toThrow(/chưa được nhập/);
      await expect(
        saveCustomExerciseBatch(batch({ exercises: [{ lessonId: "ch01-l77", prompt: "A ___ b.", answers: [["x"]] }] }), "{}")
      ).rejects.toThrow(/ch01-l77/);
      await expect(
        saveCustomExerciseBatch(batch({ exercises: [{ prompt: "A ___ b.", answers: [["x"]] }] }), "{}")
      ).rejects.toThrow(/lessonId/);
      // Nothing was written by the refused saves
      expect(await listExerciseImportHistory()).toHaveLength(0);
    });

    it("a save that fails half-way leaves no rows behind and a history that cannot mislead", async () => {
      const db = await getDatabase();
      const original = db.execute.bind(db);
      const spy = vi.spyOn(db, "execute").mockImplementation(async (sql: string, params?: unknown[]) => {
        if (/INSERT OR REPLACE INTO grammar_book_items/.test(sql)) throw new Error("disk full");
        return original(sql, params);
      });
      await expect(saveCustomExerciseBatch(batch(), "{}")).rejects.toThrow("disk full");
      spy.mockRestore();
      const left = await db.select<Array<{ id: string }>>("SELECT id FROM grammar_book_sets WHERE id LIKE 'ch01-s-ai-%';");
      expect(left).toHaveLength(0);
      const history = await listExerciseImportHistory();
      expect(history.every((h) => h.status === "reverted")).toBe(true);
    });

    it("an interrupted save stays pending in the table, is listed as active, and undoing it removes every row stamped with its id", async () => {
      const db = await getDatabase();
      const original = db.execute.bind(db);
      // The cleanup of the failed save fails too: the pending history and the half-written set stay
      const spy = vi.spyOn(db, "execute").mockImplementation(async (sql: string, params?: unknown[]) => {
        if (/INSERT OR REPLACE INTO grammar_book_items/.test(sql) || /^DELETE FROM grammar_book_/.test(sql.trim())) throw new Error("io");
        return original(sql, params);
      });
      await expect(saveCustomExerciseBatch(batch(), "{}")).rejects.toThrow("io");
      spy.mockRestore();
      const [row] = await listExerciseImportHistory();
      expect(row.status).toBe("active");
      const raw = await db.select<Array<{ status: string }>>("SELECT status FROM grammar_exercise_imports;");
      expect(raw[0].status).toBe("pending");
      // A stray item of the batch that the history does not list
      await db.execute("INSERT INTO grammar_book_items (id, chapter_id, ord, data) VALUES ($1, 'ch01', 999, $2);", [
        "ch01:stray#1",
        JSON.stringify({ setId: "stray", n: 1, prompt: "x ___", answers: [["y"]], importBatchId: row.id }),
      ]);
      expect(await revertCustomExerciseBatch(row.id)).toBe(true);
      const sets = await db.select<Array<{ id: string }>>("SELECT id FROM grammar_book_sets WHERE id LIKE 'ch01-s-ai-%';");
      const stray = await db.select<Array<{ id: string }>>("SELECT id FROM grammar_book_items WHERE id = 'ch01:stray#1';");
      expect(sets).toHaveLength(0);
      expect(stray).toHaveLength(0);
      expect((await listExerciseImportHistory())[0].status).toBe("reverted");
    });

    it("replacing the chapter keeps the AI batches; resetting the book marks their history as reverted", async () => {
      const record = await saveCustomExerciseBatch(batch(), "{}");
      const again = book.mergeChapterParts([structuredClone(p1)] as unknown as GrammarBookFile[]).get("ch01")!;
      await book.saveGrammarBookChapter(again, { mode: "replace" });
      const db = await getDatabase();
      const items = await db.select<Array<{ id: string }>>("SELECT id FROM grammar_book_items WHERE id = $1;", [record.itemIds[0]]);
      expect(items).toHaveLength(1);
      const chapter = await book.getBookChapter("ch01");
      expect(chapter!.practiceGroups!.flatMap((g) => g.items).some((it) => it.prompt.startsWith("She ___ (read)"))).toBe(true);
      expect((await listExerciseImportHistory())[0].status).toBe("active");

      await book.clearGrammarBook();
      expect((await listExerciseImportHistory())[0].status).toBe("reverted");
    });
  });
});
