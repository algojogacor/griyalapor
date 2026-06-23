import { db } from '@/lib/db'
import { json, errorJson } from '@/lib/http'

export const dynamic = 'force-dynamic'

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

// GET /api/export?from=YYYY-MM-DD&to=YYYY-MM-DD&type=transactions|expenses
export async function GET(req: Request) {
  const url = new URL(req.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const type = url.searchParams.get('type') || 'transactions'
  const includeExpenses = url.searchParams.get('expenses') === '1'

  if (!from || !to) return errorJson('Parameter from & to wajib', 400)

  const cond = 'date >= ? AND date <= ?'

  if (type === 'expenses') {
    const res = await db.execute({
      sql: `SELECT date, label, amount FROM expenses WHERE ${cond} ORDER BY date`,
      args: [from, to],
    })
    const rows = [['Tanggal', 'Keterangan', 'Jumlah']]
    for (const r of res.rows) {
      const x = r as { date: string; label: string; amount: number }
      rows.push([x.date, x.label, String(x.amount)])
    }
    const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\n')
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="pengeluaran_${from}_${to}.csv"`,
      },
    })
  }

  // transactions
  const res = await db.execute({
    sql: `SELECT t.date, c.name as category, c.group_name as "group", t.qty, t.bill_per_unit, t.fee_per_unit, t.total,
                 (t.qty * (t.bill_per_unit + t.fee_per_unit)) as omzet, t.note
          FROM transactions t JOIN categories c ON c.id = t.category_id
          WHERE ${cond} ORDER BY t.date, t.id`,
    args: [from, to],
  })
  const rows: string[][] = [['Tanggal', 'Kategori', 'Grup', 'Jumlah', 'Tagihan/Unit', 'Fee/Unit', 'Pendapatan Bersih', 'Omzet', 'Catatan']]
  let grandAdmin = 0
  let grandOmzet = 0
  for (const r of res.rows) {
    const x = r as { date: string; category: string; group: string | null; qty: number; bill_per_unit: number; fee_per_unit: number; total: number; omzet: number; note: string | null }
    grandAdmin += x.total
    grandOmzet += x.omzet
    rows.push([x.date, x.category, x.group ?? '', String(x.qty), String(x.bill_per_unit), String(x.fee_per_unit), String(x.total), String(x.omzet), x.note ?? ''])
  }
  rows.push(['', '', '', '', '', '', `TOTAL BERSIH`, String(grandAdmin)])
  rows.push(['', '', '', '', '', '', `TOTAL OMZET`, String(grandOmzet)])

  let csv = rows.map((r) => r.map(csvEscape).join(',')).join('\n')

  if (includeExpenses) {
    const expRes = await db.execute({
      sql: `SELECT date, label, amount FROM expenses WHERE ${cond} ORDER BY date`,
      args: [from, to],
    })
    csv += '\n\nPENGELUARAN OPERASIONAL\n'
    const expRows: string[][] = [['Tanggal', 'Keterangan', 'Jumlah']]
    let expTotal = 0
    for (const r of expRes.rows) {
      const x = r as { date: string; label: string; amount: number }
      expTotal += x.amount
      expRows.push([x.date, x.label, String(x.amount)])
    }
    expRows.push(['', 'TOTAL', String(expTotal)])
    csv += expRows.map((r) => r.map(csvEscape).join(',')).join('\n')
    csv += `\n\nLABA OPERASIONAL (Pendapatan Bersih - Pengeluaran),${grandAdmin - expTotal}`
  }

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="laporan_${from}_${to}.csv"`,
    },
  })
}
