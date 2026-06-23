import { db } from '@/lib/db'
import { json, errorJson } from '@/lib/http'

export const dynamic = 'force-dynamic'

// GET /api/expenses?from=&to=
export async function GET(req: Request) {
  const url = new URL(req.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const conditions: string[] = []
  const args: (string | number)[] = []
  if (from) { conditions.push('date >= ?'); args.push(from) }
  if (to) { conditions.push('date <= ?'); args.push(to) }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''
  const res = await db.execute({
    sql: `SELECT id, date, label, amount, created_at FROM expenses ${where} ORDER BY date DESC, id DESC`,
    args,
  })
  return json({ expenses: res.rows })
}

// POST /api/expenses
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body) return errorJson('Body tidak valid', 400)
  const date = String(body.date ?? '').trim()
  const label = String(body.label ?? '').trim()
  const amount = Math.max(0, Math.floor(Number(body.amount ?? 0) || 0))
  if (!date) return errorJson('Tanggal wajib diisi', 400)
  if (!label) return errorJson('Keterangan wajib diisi', 400)
  if (amount <= 0) return errorJson('Jumlah harus > 0', 400)

  const res = await db.execute({
    sql: 'INSERT INTO expenses (date, label, amount) VALUES (?, ?, ?) RETURNING *',
    args: [date, label, amount],
  })
  return json({ expense: res.rows[0] }, 201)
}
