/**
 * Irregular English forms the regular rules (-s, -ed, -ing) can't produce. Used to find a word in a
 * sentence ("We wrote the docs" contains "write") and to accept any correct form of a typed answer.
 */

/** Verbs whose every form is listed here (no regular -s / -ing either) */
const FULL_VERBS: Record<string, string[]> = {
  be: ["am", "is", "are", "was", "were", "been", "being"],
  have: ["has", "had", "having"],
  do: ["does", "did", "done", "doing"],
  go: ["goes", "went", "gone", "going"],
};

/** base past past-participle (extra variants after a "/"); -s and -ing stay regular */
const VERBS = `
become became become|begin began begun|bind bound bound|break broke broken|bring brought brought
broadcast broadcast broadcast|build built built|buy bought bought|catch caught caught|choose chose chosen
come came come|cost cost cost|cut cut cut|deal dealt dealt|draw drew drawn|drink drank drunk|drive drove driven
eat ate eaten|fall fell fallen|feed fed fed|feel felt felt|fight fought fought|find found found|fly flew flown
forecast forecast forecast|forget forgot forgotten|forgive forgave forgiven|freeze froze frozen|get got got/gotten
give gave given|grow grew grown|hang hung hung|hear heard heard|hide hid hidden|hit hit hit|hold held held
hurt hurt hurt|keep kept kept|know knew known|lay laid laid|lead led led|learn learned/learnt learned/learnt
leave left left|lend lent lent|let let let|light lit lit|lose lost lost|make made made|mean meant meant
meet met met|mislead misled misled|misunderstand misunderstood misunderstood|override overrode overridden
overwrite overwrote overwritten|pay paid paid|put put put|quit quit quit|read read read|rebuild rebuilt rebuilt
rerun reran rerun|reset reset reset|rewrite rewrote rewritten|ride rode ridden|ring rang rung|rise rose risen
run ran run|say said said|see saw seen|seek sought sought|sell sold sold|send sent sent|set set set
shake shook shaken|shine shone shone|shoot shot shot|show showed shown|shut shut shut|sing sang sung
sink sank sunk|sit sat sat|sleep slept slept|speak spoke spoken|spend spent spent|split split split
spread spread spread|stand stood stood|steal stole stolen|stick stuck stuck|strike struck struck|swim swam swum
take took taken|teach taught taught|tear tore torn|tell told told|think thought thought|throw threw thrown
understand understood understood|undo undid undone|upset upset upset|wake woke woken|wear wore worn|win won won
withdraw withdrew withdrawn|write wrote written
`;

/** singular plural (variants after a "/") */
const PLURALS = `
analysis analyses|appendix appendices/appendixes|axis axes|basis bases|calf calves|child children
crisis crises|criterion criteria|foot feet|goose geese|half halves|hypothesis hypotheses|index indices/indexes
knife knives|leaf leaves|life lives|loaf loaves|man men|matrix matrices/matrixes|medium media|mouse mice
person people|phenomenon phenomena|self selves|shelf shelves|thesis theses|thief thieves|tooth teeth
vertex vertices/vertexes|wife wives|wolf wolves|woman women
`;

function parseTable(table: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of table.split(/[|\n]/)) {
    const [base, ...rest] = row.trim().split(/\s+/);
    if (!base) continue;
    const forms = rest.flatMap((f) => f.split("/")).filter((f) => f && f !== base);
    map.set(base, [...new Set(forms)]);
  }
  return map;
}

export const IRREGULAR_VERB_FORMS: ReadonlyMap<string, string[]> = parseTable(VERBS);
export const IRREGULAR_PLURALS: ReadonlyMap<string, string[]> = parseTable(PLURALS);
export const FULL_VERB_FORMS: ReadonlyMap<string, string[]> = new Map(Object.entries(FULL_VERBS));
