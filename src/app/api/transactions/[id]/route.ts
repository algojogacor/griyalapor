import { db } from '@/lib/db'
import { json, errorJson } from '@/lib/http'

export const dynamic = 'force-dynamic'

// DELETE /api/transactions/[id]
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tid = Number(id)
  if (!tid) return errorJson('ID tidak valid', 400)
  await db.execute({ sql: 'DELETE FROM transactions WHERE id = ?', args: [tid] })
  return json({ ok: true })
}
