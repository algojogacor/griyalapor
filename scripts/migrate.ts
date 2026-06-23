/**
 * Migration + seed runner untuk GriyaLapor.
 * Jalankan: bun run scripts/migrate.ts
 */
import { createClient } from '@libsql/client'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const url = process.env.TURSO_URL ?? process.env.DATABASE_URL ?? ''
const authToken = process.env.TURSO_AUTH_TOKEN ?? undefined

if (!url) {
  console.error('TURSO_URL belum dikonfigurasi')
  process.exit(1)
}

const client = createClient({ url, authToken })

async function migrate() {
  const sql = readFileSync(resolve(__dirname, '../prisma/schema.sql'), 'utf-8')
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  for (const stmt of statements) {
    await client.execute(stmt)
  }
  console.log(`✓ Skema diterapkan (${statements.length} statements)`)

  // Migrasi tambahan: tambah kolom customer_name jika belum ada (idempotent)
  const cols = await client.execute("PRAGMA table_info(transactions)")
  const hasCustomer = cols.rows.some((r) => (r as { name: string }).name === 'customer_name')
  if (!hasCustomer) {
    await client.execute("ALTER TABLE transactions ADD COLUMN customer_name TEXT")
    console.log('✓ Migrasi: tambah kolom customer_name ke tabel transactions')
  } else {
    console.log('ℹ Kolom customer_name sudah ada. Skip migrasi.')
  }
}

const SEED_CATEGORIES: { name: string; group: string; fee: number }[] = [
  { name: 'PLN Prabayar', group: 'Listrik', fee: 2000 },
  { name: 'PLN Pascabayar', group: 'Listrik', fee: 3000 },
  { name: 'PLN Non-Tagihan', group: 'Listrik', fee: 3000 },
  { name: 'PDAM', group: 'Air', fee: 2500 },
  { name: 'BPJS Kesehatan', group: 'Asuransi', fee: 3000 },
  { name: 'BPJS Ketenagakerjaan', group: 'Asuransi', fee: 3000 },
  { name: 'Telkom', group: 'Telko', fee: 5000 },
  { name: 'Indihome', group: 'Telko', fee: 5000 },
  { name: 'Speedy', group: 'Telko', fee: 5000 },
  { name: 'Pulsa', group: 'Pulsa & Data', fee: 1500 },
  { name: 'Paket Data', group: 'Pulsa & Data', fee: 2000 },
  { name: 'Multifinance', group: 'Multifinance', fee: 5000 },
  { name: 'Gas PGN', group: 'Gas', fee: 4000 },
  { name: 'TV Kabel', group: 'TV & Hiburan', fee: 5000 },
  { name: 'Streaming', group: 'TV & Hiburan', fee: 3000 },
  { name: 'Top Up E-Wallet', group: 'Lainnya', fee: 1000 },
  { name: 'Zakat & Infaq', group: 'Lainnya', fee: 0 },
]

async function seed() {
  const existing = await client.execute('SELECT COUNT(*) as c FROM categories')
  const count = Number((existing.rows[0] as { c: number }).c)
  if (count > 0) {
    console.log(`ℹ Kategori sudah ada (${count}). Skip seed.`)
    return
  }
  for (const c of SEED_CATEGORIES) {
    await client.execute({
      sql: 'INSERT INTO categories (name, group_name, default_fee) VALUES (?, ?, ?)',
      args: [c.name, c.group, c.fee],
    })
  }
  console.log(`✓ Seed ${SEED_CATEGORIES.length} kategori PPOB default`)

  await client.batch([
    { sql: "INSERT INTO settings (key, value) VALUES ('expenses_enabled', '0')", args: [] },
    { sql: "INSERT INTO settings (key, value) VALUES ('font_size', 'large')", args: [] },
  ])
  console.log('✓ Seed settings default')
}

async function main() {
  try {
    await migrate()
    await seed()
    console.log('\n🎉 Migration & seed selesai. Database siap dipakai.')
  } catch (err) {
    console.error('❌ Gagal:', err)
    process.exit(1)
  }
}

main()
