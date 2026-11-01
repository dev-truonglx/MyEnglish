// Replaces `@/data/vocabCatalog.json` on the web (next.config.ts): the same object, loaded from Supabase with local fallback
import { fetchVocabCatalog } from "./content";

let catalog: Record<string, unknown>;
try {
  catalog = await fetchVocabCatalog();
} catch {
  const local = await import("../../src/data/vocabCatalog.json");
  catalog = (local.default ?? local) as unknown as Record<string, unknown>;
}
export default catalog;
