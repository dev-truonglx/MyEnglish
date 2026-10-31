// Replaces `@/data/vocabCatalog.json` on the web (next.config.ts): the same object, loaded from Supabase
import { fetchVocabCatalog } from "./content";

const catalog = await fetchVocabCatalog();
export default catalog;
