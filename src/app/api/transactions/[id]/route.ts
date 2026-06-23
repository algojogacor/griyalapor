import { db } from '@/lib/db'
import { json, errorJson } from '@/lib/http'

export const dynamic = 'force-dynamic'

// PATCH /api/transactions/[id] — edit transaksi (qty, fee_per_unit, bill_per_unit, date, note)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tid = Number(id)
  if (!tid) return errorJson('ID tidak valid', 400)
  const body = await req.json().catch(() => null)
  if (!body) return errorJson('Body tidak valid', 400)

  const fields: string[] = []
  const args: (string | number | null)[] = []
  if (body.date !== undefined) {
    const d = String(body.date).trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return errorJson('Format tanggal harus YYYY-MM-DD', 400)
    fields.push('date = ?'); args.push(d)
  }
  if (body.qty !== undefined) {
    const q = Math.max(0, Math.floor(Number(body.qty) || 0))
    if (q <= 0) return errorJson('Jumlah (qty) harus > 0', 400)
    fields.push('qty = ?'); args.push(q)
  }
  if (body.fee_per_unit !== undefined) {
    fields.push('fee_per_unit = ?'); args.push(Math.max(0, Math.floor(Number(body.fee_per_unit) || 0)))
  }
  if (body.total_paid !== undefined) {
    fields.push('total_paid = ?'); args.push(Math.max(0, Math.floor(Number(body.total_paid) || 0)))
  }
  if (body.note !== undefined) {
    fields.push('note = ?'); args.push(body.note ? String(body.note).trim().slice(0, 200) : null)
  }
  if (fields.length === 0) return errorJson('Tidak ada field untuk diupdate', 400)

  // Recompute total = qty * fee_per_unit (ambil nilai terbaru)
  // Karena libSQL tidak mendukung subquery UPDATE sederhana di sini, kita fetch dulu lalu set total
  const existing = await db.execute({ sql: 'SELECT qty, fee_per_unit FROM transactions WHERE id = ?', args: [tid] })
  if (existing.rows.length === 0) return errorJson('Transaksi tidak ditemukan', 404)
  const cur = existing.rows[0] as { qty: number; fee_per_unit: number }
  const newQty = body.qty !== undefined ? Math.max(0, Math.floor(Number(body.qty) || 0)) : cur.qty
  const newFee = body.fee_per_unit !== undefined ? Math.max(0, Math.floor(Number(body.fee_per_unit) || 0)) : cur.fee_per_unit
  fields.push('total = ?'); args.push(newQty * newFee)

  args.push(tid)
  try {
    await db.execute({ sql: `UPDATE transactions SET ${fields.join(', ')} WHERE id = ?`, args })
    return json({ ok: true })
  } catch (e) {
    return errorJson('Gagal update: ' + (e as Error).message, 500)
  }
}

// DELETE /api/transactions/[id]
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tid = Number(id)
  if (!tid) return errorJson('ID tidak valid', 400)
  await db.execute({ sql: 'DELETE FROM transactions WHERE id = ?', args: [tid] })
  return json({ ok: true })
}
