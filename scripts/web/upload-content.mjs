// Upload the vocabulary and grammar catalogs to Supabase (tables from supabase/migrations/0008_content.sql).
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/web/upload-content.mjs \
//     [--vocab] [--grammar] [--grammar-enabled=true|false] [--dry-run]
//
// No content flag = both. With only --grammar-enabled=... the grammar flag is updated and nothing else.
// Prints counts, versions and byte sizes only, never content. --dry-run validates and makes no network call.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const args = process.argv.slice(2)
const flag = (n) => args.includes(n)
const enabledArg = args.find((a) => a.startsWith('--grammar-enabled='))
const known = ['--vocab', '--grammar', '--dry-run']
for (const a of args) {
  if (!known.includes(a) && !a.startsWith('--grammar-enabled=')) fail(`unknown argument: ${a}`)
}
if (enabledArg && !['true', 'false'].includes(enabledArg.split('=')[1])) fail('--grammar-enabled must be true or false')
const enabled = enabledArg ? enabledArg.split('=')[1] === 'true' : true
const dry = flag('--dry-run')
const onlyFlagUpdate = !!enabledArg && !flag('--vocab') && !flag('--grammar')
const doVocab = !onlyFlagUpdate && (flag('--vocab') || !flag('--grammar'))
const doGrammar = !onlyFlagUpdate && (flag('--grammar') || !flag('--vocab'))

function fail(msg) {
  console.error(`error: ${msg}`)
  process.exit(1)
}
const bytes = (v) => Buffer.byteLength(JSON.stringify(v))
const mb = (n) => (n / 1048576).toFixed(2) + ' MB'
const chunks = (arr, n) => {
  const out = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}
const load = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'))

// ---- Build the rows (and validate) ----
let vocab = null
let grammar = null
if (doVocab) {
  const cat = load('src/data/vocabCatalog.json')
  if (!Array.isArray(cat.words) || !Number.isInteger(cat.version)) fail('vocabCatalog.json: unexpected shape')
  const ids = new Set()
  const rows = cat.words.map((w, idx) => {
    if (!w.id || !w.word || !w.cefr) fail(`vocabCatalog.json: word at index ${idx} lacks id/word/cefr`)
    if (ids.has(w.id)) fail(`vocabCatalog.json: duplicate id at index ${idx}`)
    ids.add(w.id)
    return { idx, id: w.id, word: w.word, cefr: w.cefr, version: cat.version, data: w }
  })
  const meta = { source: cat.source, note: cat.note, version: cat.version, retrieved: cat.retrieved, count: rows.length }
  vocab = { rows, meta }
  console.log(`vocab: ${rows.length} words, version ${cat.version}, ${mb(bytes(rows))}`)
}
if (doGrammar) {
  const cat = load('src/data/grammarCatalog.json')
  if (!Array.isArray(cat.files) || !Number.isInteger(cat.version)) fail('grammarCatalog.json: unexpected shape')
  if (cat.totalFiles !== cat.files.length) fail(`grammarCatalog.json: totalFiles (${cat.totalFiles}) != files.length (${cat.files.length})`)
  const rows = cat.files.map((data, idx) => ({ idx, version: cat.version, data }))
  const sizes = rows.map((r) => bytes(r.data))
  grammar = { rows, meta: { version: cat.version, totalFiles: rows.length, enabled } }
  console.log(
    `grammar: ${rows.length} files, version ${cat.version}, ${mb(sizes.reduce((a, b) => a + b, 0))} total, ` +
      `largest file ${mb(Math.max(...sizes))}, enabled=${enabled}`
  )
}
if (onlyFlagUpdate) console.log(`grammar flag only: enabled=${enabled}`)

if (dry) {
  console.log('dry run: nothing uploaded')
  process.exit(0)
}

// ---- Upload ----
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) fail('set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or use --dry-run)')
console.warn('WARNING: SUPABASE_SERVICE_ROLE_KEY bypasses RLS. Keep it on this machine; never commit it or ship it in an app.')
const { createClient } = await import('@supabase/supabase-js')
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const check = (what, { error }) => {
  if (error) fail(`${what}: ${error.message}`)
}
const now = () => new Date().toISOString()

async function upsertRows(table, rows, size, onConflict) {
  let done = 0
  for (const batch of chunks(rows, size)) {
    check(`${table} upsert`, await sb.from(table).upsert(batch.map((r) => ({ ...r, updated_at: now() })), { onConflict }))
    done += batch.length
    console.log(`${table}: ${done}/${rows.length}`)
  }
}
const setMeta = async (k, value) => {
  check(`catalog_meta ${k}`, await sb.from('catalog_meta').upsert({ key: k, value, updated_at: now() }, { onConflict: 'key' }))
  console.log(`catalog_meta '${k}' updated`)
}

if (vocab) {
  await upsertRows('catalog_words', vocab.rows, 500, 'idx')
  check('catalog_words trim', await sb.from('catalog_words').delete().gte('idx', vocab.rows.length))
  await setMeta('vocab', vocab.meta)
}
if (grammar) {
  await upsertRows('grammar_content', grammar.rows, 5, 'idx')
  check('grammar_content trim', await sb.from('grammar_content').delete().gte('idx', grammar.rows.length))
  await setMeta('grammar', grammar.meta)
}
if (onlyFlagUpdate) {
  const { data, error } = await sb.from('catalog_meta').select('value').eq('key', 'grammar').maybeSingle()
  check('catalog_meta read', { error })
  if (!data) fail("catalog_meta 'grammar' does not exist yet: upload the grammar first (--grammar)")
  await setMeta('grammar', { ...data.value, enabled })
}
console.log('done')
