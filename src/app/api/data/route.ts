import { db } from '@/lib/db'
import { json, errorJson } from '@/lib/http'
import { todayISO, thisWeekRange, thisMonthRange } from '@/lib/format'

export const dynamic = 'force-dynamic'

// GET /api/data — preview jumlah data yang akan dihapus untuk rentang tertentu
// Query: ?range=today|week|month|all|custom&from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: Request) {
  const url = new URL(req.url)
  const range = url.searchParams.get('range') ?? 'today'
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')

  const { dateFrom, dateTo } = resolveRange(range, from, to)
  if (!dateFrom || !dateTo) return errorJson('Rentang tanggal tidak valid', 400)

  // Hitung jumlah transaksi
  const txRes = await db.execute({
    sql: 'SELECT COUNT(*) as count, COALESCE(SUM(total),0) as admin, COALESCE(SUM(total_paid),0) as omzet FROM transactions WHERE date >= ? AND date <= ?',
    args: [dateFrom, dateTo],
  })
  const tx = txRes.rows[0] as { count: number; admin: number; omzet: number }

  // Hitung jumlah pengeluaran
  const expRes = await db.execute({
    sql: 'SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as total FROM expenses WHERE date >= ? AND date <= ?',
    args: [dateFrom, dateTo],
  })
  const exp = expRes.rows[0] as { count: number; total: number }

  return json({
    range,
    from: dateFrom,
    to: dateTo,
    transactions: { count: Number(tx.count), admin: Number(tx.admin), omzet: Number(tx.omzet) },
    expenses: { count: Number(exp.count), total: Number(exp.total) },
  })
}

// DELETE /api/data — hapus transaksi & pengeluaran berdasarkan rentang
// Body: { range: 'today'|'week'|'month'|'all'|'custom', from?: string, to?: string, types: ('transactions'|'expenses')[], confirmCode: string }
export async function DELETE(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body) return errorJson('Body tidak valid', 400)

  const range = String(body.range ?? 'today')
  const types: string[] = Array.isArray(body.types) ? body.types : []
  const confirmCode = String(body.confirmCode ?? '')

  // Safety: require exact confirm code "HAPUS"
  if (confirmCode !== 'HAPUS') {
    return errorJson('Kode konfirmasi salah. Ketik "HAPUS" untuk mengonfirmasi.', 400)
  }
  if (types.length === 0) {
    return errorJson('Pilih minimal satu jenis data untuk dihapus', 400)
  }

  const { dateFrom, dateTo } = resolveRange(range, body.from, body.to)
  if (!dateFrom || !dateTo) return errorJson('Rentang tanggal tidak valid', 400)

  const result: {
    range: string
    from: string
    to: string
    deleted: { transactions: number; expenses: number }
  } = {
    range,
    from: dateFrom,
    to: dateTo,
    deleted: { transactions: 0, expenses: 0 },
  }

  // Delete transactions
  if (types.includes('transactions')) {
    if (range === 'all') {
      const r = await db.execute('DELETE FROM transactions')
      result.deleted.transactions = Number(r.rowsAffected ?? 0)
    } else {
      const r = await db.execute({
        sql: 'DELETE FROM transactions WHERE date >= ? AND date <= ?',
        args: [dateFrom, dateTo],
      })
      result.deleted.transactions = Number(r.rowsAffected ?? 0)
    }
  }

  // Delete expenses
  if (types.includes('expenses')) {
    if (range === 'all') {
      const r = await db.execute('DELETE FROM expenses')
      result.deleted.expenses = Number(r.rowsAffected ?? 0)
    } else {
      const r = await db.execute({
        sql: 'DELETE FROM expenses WHERE date >= ? AND date <= ?',
        args: [dateFrom, dateTo],
      })
      result.deleted.expenses = Number(r.rowsAffected ?? 0)
    }
  }

  return json(result)
}

// Helper: resolve rentang ke {from, to} tanggal YYYY-MM-DD
function resolveRange(
  range: string,
  from: string | undefined | null,
  to: string | undefined | null,
): { dateFrom: string; dateTo: string } {
  if (range === 'today') {
    const d = todayISO()
    return { dateFrom: d, dateTo: d }
  }
  if (range === 'week') {
    const w = thisWeekRange()
    return { dateFrom: w.from, dateTo: w.to }
  }
  if (range === 'month') {
    const m = thisMonthRange()
    return { dateFrom: m.from, dateTo: m.to }
  }
  if (range === 'all') {
    // tanggal sangat awal sampai sangat akhir → capture semua
    return { dateFrom: '1900-01-01', dateTo: '9999-12-31' }
  }
  if (range === 'custom') {
    if (!from || !to) return { dateFrom: '', dateTo: '' }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return { dateFrom: '', dateTo: '' }
    }
    // Swap kalau from > to
    if (from > to) return { dateFrom: to, dateTo: from }
    return { dateFrom: from, dateTo: to }
  }
  return { dateFrom: '', dateTo: '' }
}
