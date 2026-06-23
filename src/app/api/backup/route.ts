import { db } from '@/lib/db'
import { json, errorJson } from '@/lib/http'

export const dynamic = 'force-dynamic'

// GET /api/backup — export semua data sebagai JSON (untuk backup)
export async function GET() {
  const [cats, txns, expenses, settings] = await Promise.all([
    db.execute('SELECT id, name, group_name, default_fee, created_at FROM categories ORDER BY id'),
    db.execute('SELECT id, category_id, date, qty, fee_per_unit, total, total_paid, customer_name, recorded_by, note, created_at FROM transactions ORDER BY id'),
    db.execute('SELECT id, date, label, amount, recurring_id, created_at FROM expenses ORDER BY id'),
    db.execute('SELECT key, value FROM settings ORDER BY key'),
  ])

  const backup = {
    app: 'GriyaLapor',
    version: 1,
    exported_at: new Date().toISOString(),
    counts: {
      categories: cats.rows.length,
      transactions: txns.rows.length,
      expenses: expenses.rows.length,
      settings: settings.rows.length,
    },
    data: {
      categories: cats.rows,
      transactions: txns.rows,
      expenses: expenses.rows,
      settings: settings.rows,
    },
  }

  return new Response(JSON.stringify(backup, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="griyalapor-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  })
}

// POST /api/backup — restore data dari JSON backup
// Body: { data: BackupJSON, mode: 'merge' | 'replace' }
// - merge: tambah data baru (skip duplikat by id), aman
// - replace: hapus semua data lama lalu impor (berbahaya, perlu konfirmasi)
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body || !body.data) return errorJson('Body backup tidak valid', 400)

  const mode = body.mode === 'replace' ? 'replace' : 'merge'
  // `data` bisa berupa: (a) seluruh file backup {app, version, data:{categories,...}}
  // atau (b) langsung {categories, transactions, ...}
  const envelope = body.data
  const data = envelope?.data?.categories ? envelope.data : envelope

  if (!data.categories || !data.transactions) {
    return errorJson('Format backup tidak valid: categories & transactions wajib ada', 400)
  }

  type CategoryRow = { id: number; name: string; group_name: string | null; default_fee: number; created_at: string }
  type TxnRow = { id: number; category_id: number; date: string; qty: number; fee_per_unit: number; total: number; total_paid: number; customer_name: string | null; recorded_by: string | null; note: string | null; created_at: string }
  type ExpenseRow = { id: number; date: string; label: string; amount: number; recurring_id?: number | null; created_at: string }
  type SettingRow = { key: string; value: string }

  const categories = data.categories as CategoryRow[]
  const transactions = data.transactions as TxnRow[]
  const expenses = (data.expenses ?? []) as ExpenseRow[]
  const settings = (data.settings ?? []) as SettingRow[]

  const results = { categories: 0, transactions: 0, expenses: 0, settings: 0, skipped: 0 }

  // Mode replace: bersihkan database dulu
  if (mode === 'replace') {
    await db.batch([
      { sql: 'DELETE FROM transactions', args: [] },
      { sql: 'DELETE FROM expenses', args: [] },
      { sql: 'DELETE FROM categories', args: [] },
    ])
  }

  // Impor kategori (skip duplikat by id di mode merge)
  if (mode === 'merge') {
    for (const c of categories) {
      const existing = await db.execute({ sql: 'SELECT id FROM categories WHERE id = ?', args: [c.id] })
      if (existing.rows.length > 0) { results.skipped++; continue }
      await db.execute({
        sql: 'INSERT INTO categories (id, name, group_name, default_fee, created_at) VALUES (?, ?, ?, ?, ?)',
        args: [c.id, c.name, c.group_name, c.default_fee, c.created_at],
      })
      results.categories++
    }
  } else {
    for (const c of categories) {
      await db.execute({
        sql: 'INSERT INTO categories (id, name, group_name, default_fee, created_at) VALUES (?, ?, ?, ?, ?)',
        args: [c.id, c.name, c.group_name, c.default_fee, c.created_at],
      })
      results.categories++
    }
  }

  // Impor transaksi
  for (const t of transactions) {
    if (mode === 'merge') {
      const existing = await db.execute({ sql: 'SELECT id FROM transactions WHERE id = ?', args: [t.id] })
      if (existing.rows.length > 0) { results.skipped++; continue }
    }
    await db.execute({
      sql: 'INSERT INTO transactions (id, category_id, date, qty, fee_per_unit, total, total_paid, customer_name, recorded_by, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      args: [t.id, t.category_id, t.date, t.qty, t.fee_per_unit, t.total, t.total_paid, t.customer_name, t.recorded_by, t.note, t.created_at],
    })
    results.transactions++
  }

  // Impor pengeluaran
  for (const e of expenses) {
    if (mode === 'merge') {
      const existing = await db.execute({ sql: 'SELECT id FROM expenses WHERE id = ?', args: [e.id] })
      if (existing.rows.length > 0) { results.skipped++; continue }
    }
    await db.execute({
      sql: 'INSERT INTO expenses (id, date, label, amount, recurring_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: [e.id, e.date, e.label, e.amount, e.recurring_id ?? null, e.created_at],
    })
    results.expenses++
  }

  // Impor settings (upsert)
  for (const s of settings) {
    await db.execute({
      sql: 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      args: [s.key, s.value],
    })
    results.settings++
  }

  return json({ ok: true, mode, results })
}
