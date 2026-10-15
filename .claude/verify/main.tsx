import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import { getDatabase } from "@/services/db";
import { buildNudgePayload, saveReminderSettings } from "@/services/reminderSettings";
import FocusReviewModal from "@/components/FocusReviewModal";
import ReviewNudge from "@/components/ReviewNudge";
import WeeklyProgressCard from "@/components/WeeklyProgressCard";
import { getAllWords } from "@/services/db";
import { saveReviewLog } from "@/services/smartReview";
import { saveMnemonic } from "@/services/aiMnemonic";
import FlashcardReview from "@/components/FlashcardReview";
import LearningInsightsCard from "@/components/LearningInsightsCard";
import HabitInsightsCard from "@/components/HabitInsightsCard";
import { logLearningEvent } from "@/services/learningEvents";
import AdvancedLearningSettings from "@/components/dashboard/AdvancedLearningSettings";
import { buildReviewSession, getNewCardsIntroducedToday } from "@/services/smartReview";
import { getDueWordsFromDb } from "@/services/db";
import ReviewTab from "@/components/dashboard/ReviewTab";
import { useWordsStore } from "@/stores/wordsStore";
import { summarizeTodayWork } from "@/services/smartReview";
import { applyComebackToWork, resolveComeback } from "@/services/comeback";
import { getLocalDateString } from "@/services/streak";
import OnboardingFlow from "@/components/OnboardingFlow";
import ReadingTab from "@/components/dashboard/ReadingTab";
import WritingTab from "@/components/dashboard/WritingTab";
import { saveMistakes } from "@/services/mistakes";
import TodayTab from "@/components/dashboard/TodayTab";
import PronunciationTab from "@/components/dashboard/PronunciationTab";
import VocabTab from "@/components/dashboard/VocabTab";
import VocabSetupScreen from "@/components/VocabSetupScreen";
import { setStudyLevels, topUpNewWords } from "@/services/vocabFeed";
import { loadCatalogDistractors } from "@/services/vocabCatalog";
import LetterTilesExercise from "@/components/exercises/LetterTilesExercise";
import PlacementTest from "@/components/PlacementTest";
import AccountSettings from "@/components/dashboard/AccountSettings";
import LeaderboardTab from "@/components/dashboard/LeaderboardTab";
import { useAuthStore } from "@/stores/authStore";
import { RankPanel, RankLine, RankDelta } from "@/components/dashboard/RankWidgets";
import { useStandingStore } from "@/stores/standingStore";
import { calculateStreakAndGoal } from "@/services/streak";
import GrammarHub from "@/components/grammar/GrammarHub";
import { mergeChapterParts, saveGrammarBookChapter } from "@/services/grammarBook";
import type { GrammarBookFile } from "@/types/grammarBook";
import sampleP1 from "../../test/fixtures/grammarBook/ch01-p1.json";
import sampleP2 from "../../test/fixtures/grammarBook/ch01-p2.json";

const TENSE_TITLES: Array<[string, string]> = [
  ["The Present Simple Tense", "Thì hiện tại đơn"], ["The Present Continuous Tense", "Thì hiện tại tiếp diễn"],
  ["The Present Perfect Tense", "Thì hiện tại hoàn thành"], ["The Present Perfect Continuous Tense", "Thì hiện tại hoàn thành tiếp diễn"],
  ["The Past Simple Tense", "Thì quá khứ đơn"], ["The Past Continuous Tense", "Thì quá khứ tiếp diễn"],
  ["The Past Perfect Tense", "Thì quá khứ hoàn thành"], ["The Past Perfect Continuous Tense", "Thì quá khứ hoàn thành tiếp diễn"],
  ["The simple Future Tense", "Thì tương lai đơn"], ["Near Future", "Tương lai gần"],
  ["The Future Continuous Tense", "Thì tương lai tiếp diễn"], ["The Future Perfect Tense", "Thì tương lai hoàn thành"],
  ["The Future Perfect Continuous Tense", "Thì tương lai hoàn thành tiếp diễn"],
];

/**
 * The test fixture (sentences written for the tests, not book content) as the imported grammar book.
 * ?tenses: the chapter has the 13 tense lessons (titles only) to see the tense table, plus a second chapter.
 */
async function importSampleGrammar() {
  const files = [sampleP1, sampleP2] as unknown as GrammarBookFile[];
  if (new URLSearchParams(location.search).has("tenses")) {
    const p1 = structuredClone(files[0]);
    p1.lessons = TENSE_TITLES.map(([title, titleVn], i) => ({
      id: `ch01-l${String(i + 1).padStart(2, "0")}`, order: i + 1, title, titleVn, page: 1,
      blocks: [{ type: "formula", label: "Khẳng định", text: "S + …" }],
    }));
    files[0] = p1;
    const ch2: GrammarBookFile = {
      format: "myenglish-grammar-book", version: 2, chapterId: "ch02", part: 1, parts: 1,
      chapter: { order: 2, title: "SEQUENCE OF TENSES", titleVn: "SỰ PHỐI HỢP CÁC THÌ" },
      lessons: [
        { id: "ch02-l01", order: 1, title: "Main and subordinate clauses", titleVn: "Mệnh đề chính và mệnh đề phụ", blocks: [] },
        { id: "ch02-l02", order: 2, title: "Adverbial clauses of time", titleVn: "Mệnh đề trạng ngữ chỉ thời gian", blocks: [] },
      ],
      exerciseSets: [], practiceGroups: [],
    };
    files.push(ch2);
  }
  for (const chapter of mergeChapterParts(files).values()) await saveGrammarBookChapter(chapter);
}

const DAY = 864e5;
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();

async function seed() {
  const db = await getDatabase();
  const words: Array<[string, string, string, string, string, string | null]> = [
    // id, word, pos, meaning, topic, example
    ["w-new", "idempotent", "adjective", "Lũy đẳng: gọi nhiều lần vẫn cho cùng kết quả", "DevOps", "A PUT request should be idempotent."],
    ["w-deploy", "deploy", "verb", "Triển khai", "DevOps", "We deploy every Friday."],
    ["w-release", "release", "verb", "Phát hành", "DevOps", null],
    ["w-rollback", "rollback", "verb", "Hoàn tác phiên bản", "DevOps", null],
    ["w-pipeline", "pipeline", "noun", "Luồng xử lý", "DevOps", null],
    ["w-banana", "banana", "noun", "Quả chuối", "Food", null],
    ["w-apple", "apple", "noun", "Quả táo", "Food", null],
  ];
  for (const [id, word, pos, meaning, topic, ex] of words) {
    await db.execute(
      `INSERT OR REPLACE INTO words (id, word, part_of_speech, meaning_vn, synonyms, antonyms, topic, created_at) VALUES ($1,$2,$3,$4,'[]','[]',$5,$6)`,
      [id, word, pos, meaning, topic, iso(-5 * DAY)]
    );
    if (ex) await db.execute(`INSERT INTO examples (id, word_id, sentence_en, sentence_vn, grammar_analysis) VALUES ($1,$2,$3,$4,'')`, [`e-${id}`, id, ex, "Câu ví dụ."]);
    if (id !== "w-new") {
      await db.execute(
        `INSERT OR REPLACE INTO srs_reviews (word_id, ease_factor, interval, repetitions, next_review_date, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review, learning_steps)
         VALUES ($1, 2.5, 3, 3, $2, 3, 5, 3, 3, 3, 0, 2, $3, 0)`,
        [id, id === "w-deploy" ? iso(-60000) : iso(5 * DAY), iso(-3 * DAY)]
      );
    }
  }
}

function Weekly() {
  const [words, setWords] = useState<any[] | null>(null);
  React.useEffect(() => {
    (async () => {
      const base = { exerciseType: "multiple_choice" as const, responseTimeMs: 1000, wrongAttempts: 0, xpEarned: 10, direction: "recognition" as const, timestamp: new Date().toISOString() };
      for (let i = 0; i < 8; i++) await saveReviewLog({ ...base, wordId: "w-deploy", isCorrect: true, rating: 3, isScheduled: true });
      await saveReviewLog({ ...base, wordId: "w-release", isCorrect: false, rating: 1, isScheduled: true });
      setWords(await getAllWords());
    })();
  }, []);
  return words ? <div className="p-6 max-w-2xl mx-auto"><WeeklyProgressCard words={words} /></div> : null;
}

function Flash() {
  const [state, setState] = useState<{ session: any[]; all: any[] } | null>(null);
  React.useEffect(() => {
    (async () => {
      // ?flash&newonly: a session of three new words and no reviews (a learner's first day)
      if (new URLSearchParams(location.search).has("newonly")) {
        const db = await getDatabase();
        for (const [id, word, meaning] of [["w-cache", "cache", "Bộ nhớ đệm"], ["w-queue", "queue", "Hàng đợi"]]) {
          await db.execute(
            `INSERT OR REPLACE INTO words (id, word, part_of_speech, meaning_vn, synonyms, antonyms, topic, created_at) VALUES ($1,$2,'noun',$3,'[]','[]','DevOps',$4)`,
            [id, word, meaning, iso(-5 * DAY)]
          );
        }
        await db.execute(`UPDATE srs_reviews SET next_review_date = $1 WHERE word_id = 'w-deploy'`, [iso(5 * DAY)]);
      }
      const due = await getDueWordsFromDb();
      const session = buildReviewSession(due, await getNewCardsIntroducedToday());
      setState({ session, all: await getAllWords() });
      (window as any).__session = session.map((c: any) => `${c.word}:${c.direction}`);
    })();
  }, []);
  return state ? (
    <div className="h-screen">
      <FlashcardReview wordsToReview={state.session} distractorPool={state.all} onFinish={() => {}} onExit={() => {}} />
    </div>
  ) : null;
}

// ?deckflash: a session of the Oxford deck's first A1 words (new words: introduction card with "Đã biết")
function DeckFlash() {
  const [state, setState] = useState<{ session: any[]; pool: any[] } | null>(null);
  React.useEffect(() => {
    (async () => {
      const db = await getDatabase();
      await db.execute(`DELETE FROM words WHERE catalog_id IS NULL`);
      setStudyLevels(["A1"]);
      await topUpNewWords();
      const due = await getDueWordsFromDb();
      const session = buildReviewSession(due, await getNewCardsIntroducedToday());
      const pool = [...(await getAllWords()), ...(await loadCatalogDistractors(["A1"]))];
      (window as any).__session = session.map((c: any) => `${c.word}:${c.direction}`);
      setState({ session, pool });
    })();
  }, []);
  return state ? (
    <div className="h-screen">
      <FlashcardReview wordsToReview={state.session} distractorPool={state.pool} onFinish={() => {}} onExit={() => {}} />
    </div>
  ) : <div>loading deck…</div>;
}

// ?levels: the vocabulary path (levels, progress, skimming, search) with A1–A2 chosen
function Levels() {
  const [ready, setReady] = useState(false);
  React.useEffect(() => {
    (async () => {
      setStudyLevels(["A1", "A2"]);
      await topUpNewWords();
      useWordsStore.setState({ words: await getAllWords() });
      setReady(true);
    })();
  }, []);
  return ready ? <VocabTab /> : <div>loading deck…</div>;
}

function Insights() {
  React.useEffect(() => {
    (async () => {
      const base = { exerciseType: "multiple_choice" as const, responseTimeMs: 4000, wrongAttempts: 0, xpEarned: 10, direction: "recognition" as const };
      for (let i = 0; i < 30; i++) {
        const r = 0.7 + (i % 6) * 0.05;
        await saveReviewLog({ ...base, wordId: "w-deploy", isCorrect: i % 5 !== 0, rating: i % 5 === 0 ? 1 : 3, isScheduled: true,
          timestamp: new Date(Date.now() - i * 3600e3).toISOString(),
          before: { state: 2, stability: 5, difficulty: 5, retrievability: r, elapsedDays: 3 } });
      }
      window.dispatchEvent(new CustomEvent("words-changed"));
    })();
  }, []);
  return <div className="p-6 max-w-3xl mx-auto space-y-4"><LearningInsightsCard /><AdvancedLearningSettings /></div>;
}

function Habits() {
  const [words, setWords] = useState<any[] | null>(null);
  React.useEffect(() => {
    (async () => {
      const day = (d: number, h: number) => { const x = new Date(); x.setDate(x.getDate() - d); x.setHours(h, 5, 0, 0); return x; };
      for (let d = 0; d < 12; d++) {
        await logLearningEvent("nudge_shown", { at: day(d, 9) });
        await logLearningEvent(d % 4 === 0 ? "nudge_snoozed" : "nudge_opened", { at: day(d, 9) });
        await logLearningEvent("nudge_shown", { at: day(d, 15) });
        await logLearningEvent("nudge_ignored", { at: day(d, 15) });
        await logLearningEvent("popup_shown", { at: day(d, 9) });
        await logLearningEvent(d % 3 === 0 ? "popup_closed_early" : "popup_completed", { at: day(d, 9) });
      }
      for (let w = 0; w < 8; w++) for (let k = 0; k < (w * 3) % 7; k++) await logLearningEvent("mastered", { direction: "recognition", wordId: "w-deploy", at: day(w * 7, 10) });
      const base = { exerciseType: "multiple_choice" as const, responseTimeMs: 4000, wrongAttempts: 0, xpEarned: 10, direction: "recognition" as const, isCorrect: true, rating: 3, isScheduled: true };
      for (let i = 0; i < 40; i++) await saveReviewLog({ ...base, wordId: "w-deploy", timestamp: day(i % 10, i % 3 === 0 ? 21 : 9).toISOString() });
      setWords(await getAllWords());
    })();
  }, []);
  return words ? <div className="p-6 max-w-3xl mx-auto"><HabitInsightsCard words={words} /></div> : null;
}

// ?comeback: 45 reviews overdue and the last study 5 days ago -> today's share instead of the pile.
// ?comeback&done=N: N answers already given today.
function Comeback() {
  const [state, setState] = useState<any>(null);
  React.useEffect(() => {
    (async () => {
      const db = await getDatabase();
      for (let i = 0; i < 45; i++) {
        const id = `w-cb-${i}`;
        await db.execute(
          `INSERT OR REPLACE INTO words (id, word, part_of_speech, meaning_vn, synonyms, antonyms, topic, created_at) VALUES ($1,$2,'noun',$3,'[]','[]','DevOps',$4)`,
          [id, `term${i}`, `nghĩa ${i}`, iso(-40 * DAY)]
        );
        await db.execute(
          `INSERT OR REPLACE INTO srs_reviews (word_id, ease_factor, interval, repetitions, next_review_date, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review, learning_steps)
           VALUES ($1, 2.5, 5, 3, $2, 5, 5, 5, 5, 3, 0, 2, $3, 0)`,
          [id, iso(-(i % 9 + 1) * DAY), iso(-15 * DAY)]
        );
      }
      const d = new Date(); d.setDate(d.getDate() - 6);
      const done = Number(new URLSearchParams(location.search).get("done") || 0);
      localStorage.setItem("myenglish_study_logs_v1", JSON.stringify({ [getLocalDateString(d)]: 12, ...(done ? { [getLocalDateString()]: done } : {}) }));
      const words = await getAllWords();
      useWordsStore.setState({ words });
      const work = summarizeTodayWork(words, await getNewCardsIntroducedToday());
      const cb = resolveComeback(work.reviews, 30);
      setState({ cb, due: applyComebackToWork(work, cb).total });
    })();
  }, []);
  return state ? (
    <ReviewTab
      dueCount={state.due}
      comeback={state.cb}
      libraryStats={{ dueWords: [], learnedCount: 0, leechCount: 0, perTopic: {} }}
      availableTopics={[]}
      handleStartReview={() => ((window as any).__started = true)}
      setMessage={() => {}}
    />
  ) : null;
}

// ?onboarding: the first-run flow; the result is exposed on window.__onboarding
function Onboarding() {
  const [done, setDone] = useState<string | null>(null);
  return done ? (
    <pre className="p-6 text-xs">{done}</pre>
  ) : (
    <OnboardingFlow
      onFinish={async (startNow) => {
        const words = await getAllWords();
        const summary = { startNow, words: words.length, first: words.filter((w) => w.catalog_id).sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(0, 9).map((w) => `${w.word}:${w.cefr_level}`) };
        (window as any).__onboarding = summary;
        setDone(JSON.stringify(summary, null, 2));
      }}
    />
  );
}

// ?today: the opening screen with the seeded words. Options (combine freely):
//   &goal=30   daily goal of the 10-minute plan (3 things; default 10 -> 5-minute plan, 2 things)
//   &book      the sample grammar book imported (a grammar lesson on the list)
//   &done      everything done today: nothing due, pronunciation practised, 32 answers, a card back tonight
//   &late      19:30 (the "Chỉ 1 phút" button stressed when nothing was studied today); &at=9: 9:00
//   &rich      120 words remembered for the long run (milestone), last week's numbers (weekly card), coverage gain
//   &empty     no words at all (where words come from, U6)
//   &simple    simple mode
function Today() {
  const q = new URLSearchParams(location.search);
  const [words, setWords] = useState<Awaited<ReturnType<typeof getAllWords>> | null>(null);
  const [introduced, setIntroduced] = useState<Awaited<ReturnType<typeof getNewCardsIntroducedToday>> | null>(null);
  const fixedNow = React.useMemo(() => {
    const hour = q.has("late") ? 19.5 : q.get("at") ? Number(q.get("at")) : null;
    if (hour === null) return undefined;
    const d = new Date();
    d.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
    return d;
  }, []);
  React.useEffect(() => {
    (async () => {
      if (q.has("signedin")) {
        installFakeCloud(q);
        await useAuthStore.getState().init();
      }
      const db = await getDatabase();
      // localStorage outlives a reload (the database does not): start each scenario clean
      for (const k of ["myenglish_pronunciation_last_day_v1", "myenglish_remembered_milestone_v1", "myenglish_weekly_card_v1",
        "myenglish_coverage_baseline_v1", "myenglish_daily_goal_v1", "myenglish_simple_mode_v1", "myenglish_goal_celebrated_v1"]) localStorage.removeItem(k);
      const dayStr = (back: number) => { const d = new Date(); d.setDate(d.getDate() - back); return getLocalDateString(d); };
      const logs: Record<string, number> = {};
      for (let back = 1; back <= 5; back++) logs[dayStr(back)] = 15;
      if (q.get("goal")) localStorage.setItem("myenglish_daily_goal_v1", q.get("goal")!);
      if (q.has("empty")) {
        await db.execute(`DELETE FROM srs_reviews`);
        await db.execute(`DELETE FROM words`);
      }
      if (q.has("done")) {
        await db.execute(`UPDATE srs_reviews SET next_review_date = $1 WHERE word_id = 'w-deploy'`, [iso(4 * DAY)]);
        await db.execute(`DELETE FROM words WHERE id = 'w-new'`);
        // A learning card back tonight (one minute-step left)
        await db.execute(`UPDATE srs_reviews SET state = 1, stability = 0.5, scheduled_days = 0, next_review_date = $1 WHERE word_id = 'w-banana'`, [
          new Date(Math.min(Date.now() + 3 * 3600e3, new Date().setHours(23, 50, 0, 0))).toISOString(),
        ]);
        localStorage.setItem("myenglish_pronunciation_last_day_v1", getLocalDateString());
        logs[getLocalDateString()] = 32;
      }
      if (q.has("rich")) {
        for (let i = 0; i < 120; i++) {
          const id = `w-long-${i}`;
          await db.execute(
            `INSERT OR REPLACE INTO words (id, word, part_of_speech, meaning_vn, synonyms, antonyms, topic, created_at) VALUES ($1,$2,'noun',$3,'[]','[]','DevOps',$4)`,
            [id, `term${i}`, `nghĩa ${i}`, iso(-60 * DAY)]
          );
          await db.execute(
            `INSERT OR REPLACE INTO srs_reviews (word_id, ease_factor, interval, repetitions, next_review_date, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review, learning_steps)
             VALUES ($1, 2.5, 30, 5, $2, 30, 4, 10, 30, 5, 0, 2, $3, 0)`,
            [id, iso(20 * DAY), iso(-10 * DAY)]
          );
        }
        const lastWeek = (k: number) => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7 + k); d.setHours(10, 0, 0, 0); return d; };
        for (let k = 0; k < 18; k++) await logLearningEvent("mastered", { direction: "recognition", wordId: `w-long-${k}`, at: lastWeek(k % 7) });
        for (let k = 0; k < 12; k++) await logLearningEvent("mastered", { direction: "recognition", wordId: `w-long-${50 + k}`, at: new Date(lastWeek(k % 7).getTime() - 7 * DAY) });
        const base = { exerciseType: "multiple_choice" as const, responseTimeMs: 3000, wrongAttempts: 0, xpEarned: 10, direction: "recognition" as const };
        for (let k = 0; k < 40; k++) {
          await saveReviewLog({ ...base, wordId: `w-long-${k}`, isCorrect: k % 8 !== 0, rating: k % 8 === 0 ? 1 : 3, isScheduled: true,
            timestamp: lastWeek(k % 5).toISOString(), before: { state: 2, stability: 12, difficulty: 5, retrievability: 0.9, elapsedDays: 10 } });
        }
        for (let k = 0; k < 5; k++) logs[getLocalDateString(lastWeek(k))] = 20;
        localStorage.setItem("myenglish_coverage_baseline_v1", JSON.stringify({ percent: 41, day: dayStr(14) }));
      }
      localStorage.setItem("myenglish_study_logs_v1", JSON.stringify(logs));
      if (q.has("simple")) localStorage.setItem("myenglish_simple_mode_v1", "1");
      setStudyLevels(["A1"]);
      const all = await getAllWords();
      useWordsStore.setState({ words: all });
      setIntroduced(await getNewCardsIntroducedToday());
      setWords(all);
    })();
  }, []);
  if (!words || !introduced) return null;
  const work = summarizeTodayWork(words, introduced, fixedNow);
  return (
    <TodayTab
      words={words}
      todayWork={work}
      comeback={null}
      streakStats={calculateStreakAndGoal(words, work.total)}
      onStart={() => ((window as any).__started = true)}
      onQuickStart={() => ((window as any).__quick = true)}
      setActiveTab={(t) => ((window as any).__tab = t)}
      simpleMode={q.has("simple")}
      now={fixedNow}
    />
  );
}

// ?tiles: the letter-tiles exercise on "deploy"; the result is exposed on window.__tiles
function Tiles() {
  const [word, setWord] = useState<Awaited<ReturnType<typeof getAllWords>>[number] | null>(null);
  React.useEffect(() => {
    getAllWords().then((ws) => setWord(ws.find((w) => w.word === "deploy") ?? null));
  }, []);
  return word ? (
    <div className="p-6">
      <LetterTilesExercise word={word} onSpeak={() => {}} onComplete={(ok, attempts, rating) => ((window as any).__tiles = { ok, attempts, rating })} />
    </div>
  ) : null;
}

// ?reading: the reading tab with a sample text already pasted
function Reading() {
  const [ready, setReady] = useState(false);
  React.useEffect(() => {
    (async () => {
      localStorage.setItem(
        "myenglish_reading_draft_v1",
        "We deployed the release on Friday, but the rollback took longer than expected.\n" +
          "The PUT endpoint must be idempotent: retrying the same request should not create duplicate records. " +
          "Our pipeline now validates the payload before it reaches the database, which reduced latency spikes."
      );
      useWordsStore.setState({ words: await getAllWords() });
      setReady(true);
    })();
  }, []);
  return ready ? <ReadingTab /> : null;
}

// ?writing: the writing tab; the AI correction is answered with a fixed sample, two old mistakes are due
function Writing() {
  const [ready, setReady] = useState(false);
  React.useEffect(() => {
    (async () => {
      (globalThis as any).__tauriInvoke = async (cmd: string) => {
        if (cmd !== "correct_writing_ai") return undefined;
        await new Promise((r) => setTimeout(r, 400));
        return JSON.stringify({
          score: 70,
          corrections: [
            { wrong: "I fix", right: "I fixed", sentence: "Yesterday I fixed the login bug.", category: "tense", why_vn: "Có 'yesterday' nên dùng quá khứ đơn." },
            { wrong: "a API", right: "an API", sentence: "Today I am writing an API for payments.", category: "article", why_vn: "API đọc bắt đầu bằng nguyên âm /eɪ/." },
          ],
          better_version: "Yesterday I fixed the login bug. Today I am writing an API for payments. No blockers.",
          explanation_vn: "Hai lỗi nhỏ về thì và mạo từ, ý rõ ràng.",
        });
      };
      const past = new Date(Date.now() - 3 * DAY);
      await saveMistakes([{ wrong: "He go", right: "He goes", category: "agreement", sentence: "He goes to the office every day.", whyVn: "Chủ ngữ số ít ở hiện tại đơn: thêm -es." },
        { wrong: "discuss about", right: "discuss", category: "preposition", sentence: "We need to discuss the plan.", whyVn: "discuss không đi với about." }], { source: "standup" }, past);
      localStorage.setItem("myenglish_standup_draft_v1", "Yesterday I fix the login bug. Today I am writing a API for payments. No blockers.");
      useWordsStore.setState({ words: await getAllWords() });
      setReady(true);
    })();
  }, []);
  return ready ? <WritingTab onOpenGrammarLesson={(id) => ((window as any).__lesson = id)} /> : null;
}

function App() {
  const [ready, setReady] = useState(false);
  React.useEffect(() => {
    // ?grammar: the popup mixes in grammar questions (a fresh learner meets the first A1 lesson as an intro)
    const withGrammar = new URLSearchParams(location.search).has("grammar");
    saveReminderSettings({ includeGrammar: withGrammar, wordsPerSession: withGrammar ? 5 : 3, snoozeMinutes: 10, intervalMinutes: 30 });
    saveMnemonic("w-deploy", "Deploy = đẩy (ploy) code ra (de) server", "Triển khai");
    seed()
      .then(async () => {
        // ?grammarhub / ?lesson / ?grammar: the sample chapter is imported (add &empty for a learner without data)
        const params = new URLSearchParams(location.search);
        if ((params.has("grammarhub") || params.has("lesson") || params.has("grammar") || params.has("book")) && !params.has("empty")) await importSampleGrammar();
        // ?milestone: "deploy" is fading (seen 80 days ago, stability 15): remembering it now crosses 21 days
        if (new URLSearchParams(location.search).has("milestone")) {
          const db = await getDatabase();
          await db.execute(`UPDATE srs_reviews SET stability = 15, difficulty = 4, reps = 5, state = 2, last_review = $1, next_review_date = $2 WHERE word_id = 'w-deploy'`, [iso(-80 * DAY), iso(-65 * DAY)]);
        }
      })
      .then(() => setReady(true));
  }, []);
  if (!ready) return <div>seeding…</div>;
  const q = new URLSearchParams(location.search);
  if (q.has("account") || q.has("leaderboard") || q.has("rank")) return <Account />;
  if (q.has("weekly")) return <Weekly />;
  if (q.has("flash")) return <Flash />;
  if (q.has("insights")) return <Insights />;
  if (q.has("habits")) return <Habits />;
  if (q.has("comeback")) return <Comeback />;
  if (q.has("onboarding")) return <Onboarding />;
  if (q.has("reading")) return <Reading />;
  if (q.has("writing")) return <Writing />;
  if (q.has("today")) return <Today />;
  if (q.has("levels")) return <Levels />;
  if (q.has("deckflash")) return <DeckFlash />;
  if (q.has("setup")) return <VocabSetupScreen mode="migrate" onDone={() => ((window as any).__setupDone = true)} />;
  if (q.has("pron")) return <PronunciationTab />;
  if (q.has("lesson")) return <GrammarHub initialLessonId={q.get("lesson") || "ch01-l01"} />;
  if (q.has("grammarhub")) return <GrammarHub />;
  if (q.has("tiles")) return <Tiles />;
  if (q.has("placement"))
    return <PlacementTest onClose={() => {}} onDone={(level) => ((window as any).__placement = level)} />;
  if (q.has("nudge") && q.has("quiz")) {
    // ?nudge&quiz: the corner card opens on its one-question quiz (payload served as the native app would)
    (window as any).__TAURI_INTERNALS__ = {};
    (globalThis as any).__tauriInvoke = (cmd: string) => {
      if (cmd === "take_review_nudge_payload") {
        return {
          ...buildNudgePayload(5),
          motivation: { tone: "level_1_encouraging", title: "Một câu nhanh?", message: "1 câu rồi quay lại việc.", mascotMood: "happy", isMicroQuizPreferred: true },
          microQuiz: {
            wordId: "w-deploy",
            word: "deploy",
            direction: "recognition",
            targetMeaning: "Triển khai",
            options: [
              { id: "a", text: "Hoàn tác", isCorrect: false },
              { id: "b", text: "Triển khai", isCorrect: true },
              { id: "c", text: "Phát hành", isCorrect: false },
            ],
          },
        };
      }
      if (cmd === "is_cursor_over_nudge") return false;
      return null;
    };
  }
  return q.has("nudge") ? <ReviewNudge onDone={() => ((window as any).__nudgeDone = true)} /> : <FocusReviewModal isPreview />;
}
/** Pre-seeds a stored session and answers fake.supabase.co requests (see Account) */
function installFakeCloud(q: URLSearchParams) {
  const me = { id: "u-me", email: "me@example.com" };
    if (q.has("signedin") || q.has("leaderboard") || q.has("rank")) {
      localStorage.setItem("sb-fake-auth-token", JSON.stringify({
        access_token: "x", refresh_token: "y", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { ...me, aud: "authenticated", app_metadata: {}, user_metadata: {} },
      }));
    }
    const board = [
      { rank: 1, display_name: "Linh", avatar: "fox-amber", xp: 1820, level: 9, streak: 21, is_me: false },
      { rank: 2, display_name: "Minh", avatar: "owl-violet", xp: 1340, level: 8, streak: 5, is_me: false },
      { rank: 3, display_name: "Hà", avatar: null, xp: 990, level: 7, streak: 12, is_me: false },
      { rank: 4, display_name: "Bạn A", avatar: "rocket-indigo", xp: 410, level: 5, streak: 3, is_me: true },
    ];
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    const realFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (!url.startsWith("https://fake.supabase.co")) return realFetch(input, init);
      // ?legacy: a project without migration 0006 (the app falls back to my_standing + leaderboard)
      if (url.includes("/rpc/standing_board")) {
        if (q.has("legacy")) {
          return new Response(JSON.stringify({ code: "PGRST202", message: "Could not find the function public.standing_board(p_from, p_group, p_limit) in the schema cache" }), { status: 404, headers: { "content-type": "application/json" } });
        }
        const flags = (r: (typeof board)[number]) => ({ ...r, is_above: r.display_name === "Hà", is_below: false, total: 24 });
        return json([...board.map(flags), { rank: 5, display_name: "Tú", avatar: null, xp: 120, level: 3, streak: 1, is_me: false, is_above: false, is_below: true, total: 24 }]);
      }
      if (url.includes("/rpc/my_standing")) return json([{ rank: 4, total: 24, xp: 410, above_name: "Hà", above_xp: 990, below_name: "Tú", below_xp: 120 }]);
      if (url.includes("/rpc/leaderboard")) return json(q.has("empty") ? [] : board);
      if (url.includes("/rpc/my_groups")) return json([{ id: "g1", name: "Team IT", invite_code: "3F9A12BC", member_count: 4, is_owner: true }]);
      if (url.includes("/rest/v1/profiles")) return json({ display_name: "Bạn A", level: 5, streak: 3, avatar: "rocket-indigo" });
      if (url.includes("/rpc/")) return json([]);
      if (url.includes("/auth/v1/user")) return json({ ...me, aud: "authenticated" });
      return json({});
    };
}

/**
 * ?account[&signedin] / ?leaderboard: the real account screens against a fake Supabase. Requests to
 * fake.supabase.co are answered here (real supabase-js code runs); signedin pre-seeds a stored session.
 */
function Account() {
  const q = new URLSearchParams(location.search);
  const [ready, setReady] = useState(false);
  React.useEffect(() => {
    installFakeCloud(q);
    useAuthStore.getState().init().then(async () => {
      if (q.has("rank")) await useStandingStore.getState().refresh(true);
      setReady(true);
    });
  }, []);
  if (!ready) return <div>signing in…</div>;
  if (q.has("rank")) {
    useStandingStore.getState().captureBaseline();
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 p-6 max-w-xl mx-auto space-y-4">
        <RankPanel onNavigate={() => {}} />
        <div className="w-64"><RankLine onOpen={() => {}} /></div>
        <RankDelta />
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 p-6 max-w-3xl mx-auto">
      {q.has("leaderboard") ? <LeaderboardTab /> : <AccountSettings />}
    </div>
  );
}

// The app switches Tailwind's dark mode with a class: follow the (emulated) system theme
if (window.matchMedia("(prefers-color-scheme: dark)").matches) document.documentElement.classList.add("dark");
ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
