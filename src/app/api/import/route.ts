import { db } from '@/lib/db'
import { json, errorJson } from '@/lib/http'

export const dynamic = 'force-dynamic'

interface ImportRow {
  date: string
  category: string
  group?: string | null
  qty: number
  fee_per_unit: number
  total_paid?: number
  note?: string | null
}

// POST /api/import — impor transaksi dari CSV (sudah dipetakan client-side)
// Body: { rows: ImportRow[], createMissing?: boolean }
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body || !Array.isArray(body.rows)) return errorJson('Body tidak valid', 400)

  const rows = body.rows as ImportRow[]
  const createMissing = body.createMissing !== false // default true
  if (rows.length === 0) return errorJson('Tidak ada baris untuk diimpor', 400)

  // Cache kategori by nama (lowercase)
  const catRes = await db.execute('SELECT id, name, group_name, default_fee FROM categories')
  const catCache = new Map<string, { id: number; name: string; group: string | null; fee: number }>()
  for (const r of catRes.rows) {
    const x = r as { id: number; name: string; group_name: string | null; default_fee: number }
    catCache.set(x.name.toLowerCase(), { id: x.id, name: x.name, group: x.group_name, fee: x.default_fee })
  }

  const inserted: number[] = []
  const createdCategories: string[] = []
  const errors: { row: number; error: string }[] = []
  const batchStmts: { sql: string; args: (string | number | null)[] }[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    try {
      const date = String(row.date ?? '').trim()
      const catName = String(row.category ?? '').trim()
      const qty = Math.max(0, Math.floor(Number(row.qty ?? 0) || 0))
      const fee = Math.max(0, Math.floor(Number(row.fee_per_unit ?? 0) || 0))
      const totalPaid = Math.max(0, Math.floor(Number(row.total_paid ?? 0) || 0))
      const note = row.note ? String(row.note).trim().slice(0, 200) : null

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        errors.push({ row: i + 1, error: `Format tanggal tidak valid: "${date}"` }); continue
      }
      if (!catName) { errors.push({ row: i + 1, error: 'Kategori kosong' }); continue }
      if (qty <= 0) { errors.push({ row: i + 1, error: 'Qty harus > 0' }); continue }

      let cat = catCache.get(catName.toLowerCase())
      if (!cat) {
        if (!createMissing) { errors.push({ row: i + 1, error: `Kategori "${catName}" tidak ditemukan` }); continue }
        const group = row.group ? String(row.group).trim() : null
        const ins = await db.execute({
          sql: 'INSERT INTO categories (name, group_name, default_fee) VALUES (?, ?, ?) RETURNING id',
          args: [catName, group, fee],
        })
        const newId = Number((ins.rows[0] as { id: number }).id)
        cat = { id: newId, name: catName, group, fee }
        catCache.set(catName.toLowerCase(), cat)
        createdCategories.push(catName)
      }

      const total = qty * fee
      batchStmts.push({
        sql: 'INSERT INTO transactions (category_id, date, qty, fee_per_unit, total, total_paid, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: [cat.id, date, qty, fee, total, totalPaid, note],
      })
      inserted.push(i + 1)
    } catch (e) {
      errors.push({ row: i + 1, error: (e as Error).message })
    }
  }

  if (batchStmts.length > 0) {
    await db.batch(batchStmts)
  }

  return json({
    imported: inserted.length,
    errors,
    createdCategories,
  })
}
