import { db } from '@/lib/db'
import { json } from '@/lib/http'
import { todayISO, thisWeekRange, thisMonthRange, formatDateISO } from '@/lib/format'

export const dynamic = 'force-dynamic'

// GET /api/summary — ringkasan untuk dashboard & laporan
export async function GET() {
  const today = todayISO()
  const week = thisWeekRange()
  const month = thisMonthRange()

  // Helper aggregate
  async function agg(range: { from: string; to: string }) {
    const r = await db.execute({
      sql: `SELECT COUNT(*) as count, COALESCE(SUM(total),0) as total FROM transactions WHERE date >= ? AND date <= ?`,
      args: [range.from, range.to],
    })
    return { count: Number((r.rows[0] as { count: number }).count), total: Number((r.rows[0] as { total: number }).total) }
  }
  async function expensesAgg(range: { from: string; to: string }) {
    const r = await db.execute({
      sql: `SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as total FROM expenses WHERE date >= ? AND date <= ?`,
      args: [range.from, range.to],
    })
    return { count: Number((r.rows[0] as { count: number }).count), total: Number((r.rows[0] as { total: number }).total) }
  }

  const [todayAgg, weekAgg, monthAgg, todayExp, weekExp, monthExp] = await Promise.all([
    agg({ from: today, to: today }),
    agg(week),
    agg(month),
    expensesAgg({ from: today, to: today }),
    expensesAgg(week),
    expensesAgg(month),
  ])

  // Breakdown per kategori bulan ini
  const breakdownRes = await db.execute({
    sql: `SELECT c.id as category_id, c.name, c.group_name as "group",
                 COUNT(t.id) as count, COALESCE(SUM(t.total),0) as total
          FROM categories c
          LEFT JOIN transactions t ON t.category_id = c.id AND t.date >= ? AND t.date <= ?
          GROUP BY c.id ORDER BY total DESC, c.name`,
    args: [month.from, month.to],
  })
  const breakdown = breakdownRes.rows
    .map((r) => ({
      category_id: Number((r as { category_id: number }).category_id),
      name: (r as { name: string }).name,
      group: (r as { group: string | null }).group,
      count: Number((r as { count: number }).count),
      total: Number((r as { total: number }).total),
    }))
    .filter((r) => r.count > 0)

  // Tren 6 bulan terakhir
  const now = new Date()
  const months: { ym: string; label: string; from: string; to: string }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const from = formatDateISO(new Date(d.getFullYear(), d.getMonth(), 1))
    const to = formatDateISO(new Date(d.getFullYear(), d.getMonth() + 1, 0))
    months.push({ ym, label: ym, from, to })
  }
  const monthlyTrend: { ym: string; total: number; expenses: number }[] = []
  for (const m of months) {
    const [inc, exp] = await Promise.all([
      db.execute({ sql: 'SELECT COALESCE(SUM(total),0) as total FROM transactions WHERE date >= ? AND date <= ?', args: [m.from, m.to] }),
      db.execute({ sql: 'SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE date >= ? AND date <= ?', args: [m.from, m.to] }),
    ])
    monthlyTrend.push({
      ym: m.ym,
      total: Number((inc.rows[0] as { total: number }).total),
      expenses: Number((exp.rows[0] as { total: number }).total),
    })
  }

  // Transaksi terakhir (5)
  const recentRes = await db.execute({
    sql: `SELECT t.id, t.category_id, t.date, t.qty, t.fee_per_unit, t.total, t.note,
                 c.name as category_name, c.group_name as category_group
          FROM transactions t JOIN categories c ON c.id = t.category_id
          ORDER BY t.id DESC LIMIT 5`,
  })

  return json({
    ranges: { today, week, month },
    today: todayAgg,
    week: weekAgg,
    month: monthAgg,
    expenses: { today: todayExp, week: weekExp, month: monthExp },
    breakdown,
    monthlyTrend,
    recentTransactions: recentRes.rows,
  })
}
