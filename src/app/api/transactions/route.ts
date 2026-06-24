import { db } from '@/lib/db'
import { json, errorJson } from '@/lib/http'

export const dynamic = 'force-dynamic'

// GET /api/transactions?from=YYYY-MM-DD&to=YYYY-MM-DD&category_id=&limit=&offset=
// Default: return all transactions matching filter (for backward compat with frontend yang paginate client-side)
// Jika limit=0 (default), kembalikan semua. Frontend TransactionsSection sudah paginate client-side via visibleCount.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const categoryId = url.searchParams.get('category_id')
  const limit = Number(url.searchParams.get('limit') || 0) || 0
  const offset = Number(url.searchParams.get('offset') || 0) || 0

  const conditions: string[] = []
  const args: (string | number)[] = []
  if (from) {
    conditions.push('t.date >= ?')
    args.push(from)
  }
  if (to) {
    conditions.push('t.date <= ?')
    args.push(to)
  }
  if (categoryId) {
    conditions.push('t.category_id = ?')
    args.push(Number(categoryId))
  }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''

  let sql = `SELECT t.id, t.category_id, t.date, t.qty, t.fee_per_unit, t.total, t.total_paid, t.customer_name, t.recorded_by, t.note, t.created_at,
                    c.name as category_name, c.group_name as category_group
             FROM transactions t JOIN categories c ON c.id = t.category_id
             ${where} ORDER BY t.date DESC, t.id DESC`
  if (limit > 0) {
    sql += ' LIMIT ? OFFSET ?'
    args.push(limit, offset)
  }
  const res = await db.execute({ sql, args })

  // Total count untuk pagination
  const countRes = await db.execute({
    sql: `SELECT COUNT(*) as c FROM transactions t ${where}`,
    args,
  })
  const total = Number((countRes.rows[0] as { c: number }).c)

  return json({ transactions: res.rows, total })
}

// POST /api/transactions — tambah transaksi
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body) return errorJson('Body tidak valid', 400)

  const categoryId = Number(body.category_id)
  const date = String(body.date ?? '').trim()
  const qty = Math.max(0, Math.floor(Number(body.qty ?? 0) || 0))
  const feePerUnit = Math.max(0, Math.floor(Number(body.fee_per_unit ?? 0) || 0))
  const totalPaid = Math.max(0, Math.floor(Number(body.total_paid ?? 0) || 0))
  const customerName = body.customer_name ? String(body.customer_name).trim().slice(0, 100) : null
  const recordedBy = body.recorded_by ? String(body.recorded_by).trim().slice(0, 50) : null
  const note = body.note ? String(body.note).trim() : null

  if (!categoryId) return errorJson('Kategori wajib dipilih', 400)
  if (!date) return errorJson('Tanggal wajib diisi', 400)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return errorJson('Format tanggal harus YYYY-MM-DD', 400)
  if (qty <= 0) return errorJson('Jumlah (qty) harus > 0', 400)

  const total = qty * feePerUnit // pendapatan bersih (fee admin yang didapat)

  const res = await db.execute({
    sql: `INSERT INTO transactions (category_id, date, qty, fee_per_unit, total, total_paid, customer_name, recorded_by, note)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    args: [categoryId, date, qty, feePerUnit, total, totalPaid, customerName, recordedBy, note],
  })
  return json({ transaction: res.rows[0] }, 201)
}

// DELETE /api/transactions (bulk by ids) atau hapus terakhir
export async function DELETE(req: Request) {
  const url = new URL(req.url)
  const lastOnly = url.searchParams.get('last') === '1'
  if (lastOnly) {
    const res = await db.execute(
      `DELETE FROM transactions WHERE id = (SELECT id FROM transactions ORDER BY id DESC LIMIT 1) RETURNING id`,
    )
    return json({ deleted: res.rows.length > 0, id: res.rows[0]?.id ?? null })
  }
  return errorJson('Tidak didukung', 400)
}
