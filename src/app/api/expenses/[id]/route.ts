import { db } from '@/lib/db'
import { json, errorJson } from '@/lib/http'

export const dynamic = 'force-dynamic'

// DELETE /api/expenses/[id]
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const eid = Number(id)
  if (!eid) return errorJson('ID tidak valid', 400)
  await db.execute({ sql: 'DELETE FROM expenses WHERE id = ?', args: [eid] })
  return json({ ok: true })
}
