// Replaces `@/data/grammarCatalog.json` on the web (next.config.ts): loaded from Supabase with local fallback
import { fetchGrammarCatalog } from "./content";

let catalog = await fetchGrammarCatalog();
if (!catalog?.files || !Array.isArray(catalog.files) || catalog.files.length === 0) {
  try {
    const local = await import("../../src/data/grammarCatalog.json");
    catalog = (local.default ?? local) as Record<string, unknown>;
  } catch {
    // Keep empty catalog if local file cannot be loaded
  }
}
export default catalog;
