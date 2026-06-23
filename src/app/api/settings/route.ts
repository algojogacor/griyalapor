import { db } from '@/lib/db'
import { json, errorJson } from '@/lib/http'

export const dynamic = 'force-dynamic'

// GET /api/settings — semua setting sebagai object key->value
export async function GET() {
  const res = await db.execute('SELECT key, value FROM settings')
  const settings: Record<string, string> = {}
  for (const row of res.rows) {
    const r = row as { key: string; value: string }
    settings[r.key] = r.value
  }
  return json({ settings })
}

// PATCH /api/settings — upsert satu/lebih setting
export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, string> | null
  if (!body) return errorJson('Body tidak valid', 400)

  const entries = Object.entries(body)
  if (entries.length === 0) return errorJson('Tidak ada field', 400)

  const stmts = entries.map(([key, value]) => ({
    sql: 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    args: [key, String(value)],
  }))
  await db.batch(stmts)

  const res = await db.execute('SELECT key, value FROM settings')
  const settings: Record<string, string> = {}
  for (const row of res.rows) {
    const r = row as { key: string; value: string }
    settings[r.key] = r.value
  }
  return json({ settings })
}
