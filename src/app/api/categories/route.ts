import { db } from '@/lib/db'
import { json, errorJson } from '@/lib/http'

export const dynamic = 'force-dynamic'

// GET /api/categories — semua kategori
export async function GET() {
  const res = await db.execute(
    'SELECT id, name, group_name, default_fee, created_at FROM categories ORDER BY group_name, name',
  )
  return json({ categories: res.rows })
}

// POST /api/categories — tambah kategori
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body) return errorJson('Body tidak valid', 400)
  const name = String(body.name ?? '').trim()
  const group = String(body.group ?? '').trim() || null
  const defaultFee = Math.max(0, Math.floor(Number(body.default_fee ?? 0) || 0))
  if (!name) return errorJson('Nama kategori wajib diisi', 400)

  const res = await db.execute({
    sql: 'INSERT INTO categories (name, group_name, default_fee) VALUES (?, ?, ?) RETURNING *',
    args: [name, group, defaultFee],
  })
  return json({ category: res.rows[0] }, 201)
}
