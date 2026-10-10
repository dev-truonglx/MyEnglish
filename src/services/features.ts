/**
 * Feature switches.
 *
 * AI_VOCAB_ENABLED: words are generated or enriched by the AI CLI (Capture tab, Quick Input, reading tab,
 * related terms, auto-replenish, leech "new examples"). Off while the bundled Oxford deck is the only
 * vocabulary source: it would add words outside the deck and could overwrite the deck's meanings and
 * examples. The code stays, so it can be switched back on. AI grading, writing correction, grammar
 * exercises and memory aids are not affected.
 */
export const AI_VOCAB_ENABLED = false;
