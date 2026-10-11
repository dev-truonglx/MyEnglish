/**
 * Types for the Grammar Book digitization system (v1 and v2 formats)
 */

export type GrammarBlockType =
  | "heading"
  | "text"
  | "bullet"
  | "formula"
  | "example"
  | "note"
  | "table"
  | "wordlist";

export interface GrammarBlockHeading {
  type: "heading";
  text: string;
}

export interface GrammarBlockText {
  type: "text";
  text: string;
}

export interface GrammarBlockBullet {
  type: "bullet";
  text: string;
}

export interface GrammarBlockFormula {
  type: "formula";
  label?: string;
  text: string;
}

export interface GrammarBlockExample {
  type: "example";
  en: string;
  vi: string;
}

export interface GrammarBlockNote {
  type: "note";
  text: string;
}

export interface GrammarBlockTable {
  type: "table";
  headers: string[];
  rows: string[][];
}

export interface GrammarBlockWordlist {
  type: "wordlist";
  items: Array<{ en: string; vi: string }>;
}

export type GrammarBlock =
  | GrammarBlockHeading
  | GrammarBlockText
  | GrammarBlockBullet
  | GrammarBlockFormula
  | GrammarBlockExample
  | GrammarBlockNote
  | GrammarBlockTable
  | GrammarBlockWordlist;

export interface GrammarBookLesson {
  id: string; // e.g. "ch01-l01"
  order: number;
  title: string;
  titleVn: string;
  page?: number;
  blocks: GrammarBlock[];
}

export type GrammarExerciseSetType =
  | "verb_form"
  | "choose"
  | "fill_blank"
  | "word_form"
  | "rewrite"
  | "combine"
  | "question"
  | "tag"
  | "complete"
  | "correct"
  | "identify"
  | "translate"
  | "write";

export interface GrammarBookItemAi {
  vi?: string;
  distractors?: string[][];
  wrongSentences?: string[];
  explainVn?: string;
  suggestedAnswers?: string[][];
  lessonIds?: string[];
}

export interface GrammarBookItem {
  setId?: string; // e.g. "ch01-s01"
  n: number;
  lessonIds?: string[];
  prompt: string; // contains blanks as "___"
  given?: string;
  underline?: string;
  options?: string[];
  answers: string[][]; // each blank has a list of acceptable answers
  answerSentence: string;
  keyRaw?: string;
  keyPartial?: boolean;
  noKey?: boolean;
  parts?: Array<{ text: string; role: string }>; // for identify role
  ai?: GrammarBookItemAi;
  /** Internal / imported flag when self-grading is needed due to minor issues */
  selfGrade?: boolean;
  /** Hidden by user if defective */
  hidden?: boolean;
  /** Custom user-accepted answers */
  userAcceptedAnswers?: string[];
}

export interface GrammarBookPracticeGroup {
  id: string; // e.g. "ch01-g01" or "ch01-g01-02"
  lessonIds: string[];
  title: string;
  items: GrammarBookItem[];
}

export interface GrammarBookExerciseSet {
  id: string; // e.g. "ch01-s01"
  roman: string; // e.g. "I", "II"
  instruction: string;
  type: GrammarExerciseSetType;
  lessonIds?: string[];
  page?: number;
  keyPage?: number;
  wordBank?: string[];
  example?: string | null;
  passage?: string | null;
  itemCount?: number;
  /** Present in v1 format; in v2 items are organized in practiceGroups */
  items?: GrammarBookItem[];
}

export interface GrammarBookChapterMeta {
  order: number;
  title: string;
  titleVn: string;
  pages?: [number, number];
}

export interface GrammarBookFile {
  format: "myenglish-grammar-book";
  version: 1 | 2;
  chapterId: string; // "ch01" through "ch31"
  part?: number;
  parts?: number;
  chapter?: GrammarBookChapterMeta;
  lessons?: GrammarBookLesson[];
  chapterNotes?: GrammarBlock[];
  exerciseSets?: GrammarBookExerciseSet[];
  practiceGroups?: GrammarBookPracticeGroup[];
  fixes?: Array<{ page: number; from: string; to: string }>;
  stats?: {
    lessons?: number;
    sets?: number;
    groups?: number;
    items?: number;
  };
  /** Parts already imported for this chapter (kept in the database; set by the importer) */
  importedParts?: number[];
}

/** "merge" adds the new files to what is already imported; "replace" drops the chapter's old content first */
export type GrammarBookImportMode = "merge" | "replace";

export interface ItemValidationError {
  file?: string;
  chapterId: string;
  setId?: string;
  itemN?: number;
  message: string;
  severity: "error" | "warning"; // error skips, warning converts to self-grade
  /** The item, lesson or set was left out of the import (the rest of the file is kept) */
  dropped?: boolean;
}

export interface GrammarBookImportReport {
  totalFiles: number;
  chaptersCount: number;
  lessonsCount: number;
  setsCount: number;
  practiceGroupsCount: number;
  itemsCount: number;
  errors: ItemValidationError[];
  warnings: ItemValidationError[];
}
