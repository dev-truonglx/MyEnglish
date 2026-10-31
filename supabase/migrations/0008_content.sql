-- MyEnglish: content tables for the web version. Run once in the SQL editor after 0001-0007.
--
-- The desktop app ships the Oxford word list and the grammar catalog inside the binary. The web version
-- cannot bundle them, so they live in the database and the browser reads them through the API:
--   * catalog_meta     small key/value rows describing the uploaded content ('vocab', 'grammar')
--   * catalog_words    the vocabulary catalog, one row per word, in the original order (idx)
--   * grammar_content  the grammar catalog, one row per chapter file; readable by signed-in users only, and only
--                      while catalog_meta 'grammar' has enabled = true (set it to false to hide everything)
-- Security model: RLS on, no insert/update/delete policy. Content is written only with the service_role key
-- (scripts/web/upload-content.mjs), which bypasses RLS and stays on the admin's machine.

-- ---------------------------------------------------------------------------------------------
-- catalog_meta
-- ---------------------------------------------------------------------------------------------
-- 'vocab'   value = { source, note, version, retrieved, count }
-- 'grammar' value = { version, totalFiles, enabled }
create table if not exists public.catalog_meta (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.catalog_meta enable row level security;
drop policy if exists catalog_meta_select on public.catalog_meta;
create policy catalog_meta_select on public.catalog_meta for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------------------------
-- catalog_words
-- ---------------------------------------------------------------------------------------------
create table if not exists public.catalog_words (
  idx int primary key,                -- position in vocabCatalog.json words[] (keeps the exact order)
  id text not null unique,            -- words[].id
  word text not null,
  cefr text not null,
  version int not null,               -- catalog version it was uploaded with
  data jsonb not null,                -- the full words[] entry, unchanged
  updated_at timestamptz not null default now()
);

alter table public.catalog_words enable row level security;
drop policy if exists catalog_words_select on public.catalog_words;
create policy catalog_words_select on public.catalog_words for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------------------------
-- grammar_content
-- ---------------------------------------------------------------------------------------------
create table if not exists public.grammar_content (
  idx int primary key,                -- position in grammarCatalog.json files[]
  version int not null,
  data jsonb not null,                -- the full files[] entry, unchanged
  updated_at timestamptz not null default now()
);

alter table public.grammar_content enable row level security;
drop policy if exists grammar_content_select on public.grammar_content;
create policy grammar_content_select on public.grammar_content for select to anon, authenticated
  using (exists (
    select 1 from public.catalog_meta m
    where m.key = 'grammar' and coalesce((m.value ->> 'enabled')::boolean, false)
  ));

-- ---------------------------------------------------------------------------------------------
-- Privileges: read only. Everything else is revoked; service_role keeps its own access.
-- ---------------------------------------------------------------------------------------------
revoke all on public.catalog_meta, public.catalog_words, public.grammar_content from anon, authenticated;
grant select on public.catalog_meta, public.catalog_words, public.grammar_content to anon, authenticated;
