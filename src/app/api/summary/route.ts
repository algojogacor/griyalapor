import { db } from '@/lib/db'
import { json } from '@/lib/http'
import { todayISO, thisWeekRange, thisMonthRange, formatDateISO } from '@/lib/format'

export const dynamic = 'force-dynamic'

// GET /api/summary — ringkasan untuk dashboard & laporan
// Pendapatan bersih (admin) = SUM(total) = SUM(qty*fee_per_unit)
// Omzet (kotor) = SUM(qty*(bill_per_unit+fee_per_unit))
export async function GET() {
  const today = todayISO()
  const week = thisWeekRange()
  const month = thisMonthRange()

  // Helper aggregate transaksi: admin (bersih) + omzet (total uang pembeli)
  async function agg(range: { from: string; to: string }) {
    const r = await db.execute({
      sql: `SELECT COUNT(*) as count,
                   COALESCE(SUM(total),0) as admin,
                   COALESCE(SUM(total_paid),0) as omzet
            FROM transactions WHERE date >= ? AND date <= ?`,
      args: [range.from, range.to],
    })
    const x = r.rows[0] as { count: number; admin: number; omzet: number }
    return {
      count: Number(x.count),
      admin: Number(x.admin),       // pendapatan bersih (fee admin = qty*fee_per_unit)
      omzet: Number(x.omzet),       // pendapatan kotor (total uang dari pembeli)
    }
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
                 COUNT(t.id) as count,
                 COALESCE(SUM(t.total),0) as admin,
                 COALESCE(SUM(t.total_paid),0) as omzet
          FROM categories c
          LEFT JOIN transactions t ON t.category_id = c.id AND t.date >= ? AND t.date <= ?
          GROUP BY c.id ORDER BY admin DESC, c.name`,
    args: [month.from, month.to],
  })
  const breakdown = breakdownRes.rows
    .map((r) => ({
      category_id: Number((r as { category_id: number }).category_id),
      name: (r as { name: string }).name,
      group: (r as { group: string | null }).group,
      count: Number((r as { count: number }).count),
      admin: Number((r as { admin: number }).admin),
      omzet: Number((r as { omzet: number }).omzet),
    }))
    .filter((r) => r.count > 0)

  // Tren 6 bulan terakhir
  const now = new Date()
  const months: { ym: string; from: string; to: string }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const from = formatDateISO(new Date(d.getFullYear(), d.getMonth(), 1))
    const to = formatDateISO(new Date(d.getFullYear(), d.getMonth() + 1, 0))
    months.push({ ym, from, to })
  }
  const monthlyTrend: { ym: string; admin: number; omzet: number; expenses: number }[] = []
  for (const m of months) {
    const [inc, exp] = await Promise.all([
      db.execute({
        sql: 'SELECT COALESCE(SUM(total),0) as admin, COALESCE(SUM(total_paid),0) as omzet FROM transactions WHERE date >= ? AND date <= ?',
        args: [m.from, m.to],
      }),
      db.execute({ sql: 'SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE date >= ? AND date <= ?', args: [m.from, m.to] }),
    ])
    const ix = inc.rows[0] as { admin: number; omzet: number }
    monthlyTrend.push({
      ym: m.ym,
      admin: Number(ix.admin),
      omzet: Number(ix.omzet),
      expenses: Number((exp.rows[0] as { total: number }).total),
    })
  }

  // Transaksi terakhir (5)
  const recentRes = await db.execute({
    sql: `SELECT t.id, t.category_id, t.date, t.qty, t.fee_per_unit, t.total, t.total_paid, t.note,
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
