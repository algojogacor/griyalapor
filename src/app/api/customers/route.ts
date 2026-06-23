import { db } from '@/lib/db'
import { json } from '@/lib/http'

export const dynamic = 'force-dynamic'

// GET /api/customers?from=&to=
// Daftar semua pelanggan unik dengan statistik (jumlah transaksi, total admin, omzet, transaksi terakhir)
export async function GET(req: Request) {
  const url = new URL(req.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')

  const cond: string[] = ["customer_name IS NOT NULL", "TRIM(customer_name) != ''"]
  const args: string[] = []
  if (from) { cond.push('date >= ?'); args.push(from) }
  if (to) { cond.push('date <= ?'); args.push(to) }
  const where = 'WHERE ' + cond.join(' AND ')

  const res = await db.execute({
    sql: `SELECT customer_name as name,
                 COUNT(*) as count,
                 COALESCE(SUM(total),0) as admin,
                 COALESCE(SUM(total_paid),0) as omzet,
                 COALESCE(SUM(qty),0) as qty,
                 MIN(date) as first_date,
                 MAX(date) as last_date
          FROM transactions
          ${where}
          GROUP BY customer_name
          ORDER BY admin DESC, count DESC`,
    args,
  })
  const customers = res.rows.map((r) => {
    const x = r as { name: string; count: number; admin: number; omzet: number; qty: number; first_date: string; last_date: string }
    return {
      name: x.name,
      count: Number(x.count),
      admin: Number(x.admin),
      omzet: Number(x.omzet),
      qty: Number(x.qty),
      first_date: x.first_date,
      last_date: x.last_date,
    }
  })
  return json({ customers, total: customers.length })
}
