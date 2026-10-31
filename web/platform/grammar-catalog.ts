// Replaces `@/data/grammarCatalog.json` on the web (next.config.ts): the same object, loaded from Supabase
import { fetchGrammarCatalog } from "./content";

const catalog = await fetchGrammarCatalog();
export default catalog;
