import { db } from '@/lib/db'
import { json, errorJson } from '@/lib/http'

export const dynamic = 'force-dynamic'

// PATCH /api/categories/[id] — update kategori (name, group, default_fee)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cid = Number(id)
  if (!cid) return errorJson('ID tidak valid', 400)
  const body = await req.json().catch(() => null)
  if (!body) return errorJson('Body tidak valid', 400)

  const fields: string[] = []
  const args: (string | number | null)[] = []
  if (body.name !== undefined) {
    const n = String(body.name).trim()
    if (!n) return errorJson('Nama tidak boleh kosong', 400)
    fields.push('name = ?')
    args.push(n)
  }
  if (body.group !== undefined) {
    fields.push('group_name = ?')
    args.push(String(body.group).trim() || null)
  }
  if (body.default_fee !== undefined) {
    fields.push('default_fee = ?')
    args.push(Math.max(0, Math.floor(Number(body.default_fee) || 0)))
  }
  if (fields.length === 0) return errorJson('Tidak ada field untuk diupdate', 400)

  args.push(cid)
  try {
    const res = await db.execute({
      sql: `UPDATE categories SET ${fields.join(', ')} WHERE id = ? RETURNING *`,
      args,
    })
    if (res.rows.length === 0) return errorJson('Kategori tidak ditemukan', 404)
    return json({ category: res.rows[0] })
  } catch (e) {
    return errorJson('Gagal update: ' + (e as Error).message, 500)
  }
}

// DELETE /api/categories/[id]
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cid = Number(id)
  if (!cid) return errorJson('ID tidak valid', 400)

  // Cek apakah ada transaksi terkait
  const usage = await db.execute({
    sql: 'SELECT COUNT(*) as c FROM transactions WHERE category_id = ?',
    args: [cid],
  })
  const count = Number((usage.rows[0] as { c: number }).c)
  if (count > 0) {
    return errorJson(`Tidak bisa hapus: masih ada ${count} transaksi terkait. Hapus/transaksi ulang dulu.`, 409)
  }

  await db.execute({ sql: 'DELETE FROM categories WHERE id = ?', args: [cid] })
  return json({ ok: true })
}
