'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import {
  formatRupiah,
  formatMonthLabel,
  thisMonthRange,
} from '@/lib/format'
import { toast } from 'sonner'
import {
  Download,
  FileText,
  TrendingUp,
  TrendingDown,
  Wallet,
  Receipt,
  CalendarRange,
  BarChart3,
  ReceiptText,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Lazy-load recharts (berat) — hanya dieksekusi saat chart benar-benar dirender
const MonthlyChart = dynamic(
  () => import('./MonthlyChart').then((m) => m.MonthlyChart),
  {
    ssr: false,
    loading: () => <Skeleton className="h-72 w-full" />,
  },
)

// ---------- Tipe data dari API ----------
interface Summary {
  monthlyTrend: { ym: string; total: number; expenses: number }[]
}

interface Txn {
  id: number
  date: string
  qty: number
  fee_per_unit: number
  total: number
  note: string | null
  category_name: string
  category_group: string | null
}

interface Expense {
  id: number
  date: string
  label: string
  amount: number
}

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const e = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(e.error ?? 'Gagal memuat data')
  }
  return res.json()
}

export function ReportsSection() {
  const { from: defFrom, to: defTo } = thisMonthRange()
  const [from, setFrom] = useState(defFrom)
  const [to, setTo] = useState(defTo)

  // Settings — cek apakah pengeluaran operasional diaktifkan
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => fetchJSON<{ settings: Record<string, string> }>('/api/settings'),
  })
  const expensesEnabled = settings?.settings?.expenses_enabled === '1'

  // Summary — untuk monthlyTrend 6 bulan
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['summary'],
    queryFn: () => fetchJSON<Summary>('/api/summary'),
  })

  // Transaksi pada rentang tanggal yg dipilih
  const rangeParams = useMemo(() => {
    const p = new URLSearchParams()
    p.set('from', from)
    p.set('to', to)
    return p.toString()
  }, [from, to])

  const { data: txData, isLoading: txLoading } = useQuery({
    queryKey: ['transactions', from, to],
    queryFn: () =>
      fetchJSON<{ transactions: Txn[]; total: number }>(
        `/api/transactions?${rangeParams}`,
      ),
  })

  const { data: expData, isLoading: expLoading } = useQuery({
    queryKey: ['expenses', from, to],
    queryFn: () => fetchJSON<{ expenses: Expense[] }>(`/api/expenses?${rangeParams}`),
    enabled: expensesEnabled,
  })

  const txns = txData?.transactions ?? []
  const expenses = expData?.expenses ?? []

  const totalIncome = useMemo(() => txns.reduce((s, t) => s + t.total, 0), [txns])
  const txCount = txns.length
  const totalExpenses = useMemo(
    () => expenses.reduce((s, e) => s + e.amount, 0),
    [expenses],
  )
  const netProfit = totalIncome - totalExpenses

  // Breakdown per kategori (untuk rentang yg dipilih)
  const breakdown = useMemo(() => {
    const map = new Map<
      string,
      { name: string; group: string | null; count: number; total: number }
    >()
    for (const t of txns) {
      const key = t.category_name
      const e =
        map.get(key) ?? {
          name: t.category_name,
          group: t.category_group,
          count: 0,
          total: 0,
        }
      e.count += 1
      e.total += t.total
      map.set(key, e)
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total)
  }, [txns])

  const maxCat = breakdown.length ? breakdown[0].total : 0
  const monthlyTrend = summary?.monthlyTrend ?? []

  function setRangePreset(kind: 'month' | 'week') {
    if (kind === 'month') {
      const r = thisMonthRange()
      setFrom(r.from)
      setTo(r.to)
    }
  }

  function exportCSV() {
    const params = new URLSearchParams({ from, to })
    if (expensesEnabled) params.set('expenses', '1')
    window.location.href = `/api/export?${params.toString()}`
    toast.success('Mengekspor CSV...', {
      description: `Rentang ${from} s/d ${to}`,
    })
  }

  function exportPDF() {
    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) {
      toast.error('Popup diblokir browser', {
        description: 'Izinkan popup untuk situs ini agar bisa ekspor PDF.',
      })
      return
    }
    const html = buildPrintHTML({
      from,
      to,
      txns,
      expenses,
      expensesEnabled,
      totalIncome,
      totalExpenses,
      netProfit,
    })
    w.document.open()
    w.document.write(html)
    w.document.close()
    w.focus()
    // Beri waktu render sebelum print dialog
    setTimeout(() => {
      try {
        w.print()
      } catch {
        toast.error('Gagal mencetak')
      }
    }, 350)
    toast.success('Membuka jendela cetak PDF...')
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Laporan</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Rekap pendapatan {expensesEnabled ? '& pengeluaran ' : ''}per rentang tanggal
        </p>
      </div>

      {/* Filter rentang tanggal + export */}
      <Card className="p-4 md:p-5">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label
              htmlFor="rpt-from"
              className="text-sm font-medium flex items-center gap-1.5"
            >
              <CalendarRange className="w-4 h-4" /> Dari Tanggal
            </Label>
            <Input
              id="rpt-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-12"
            />
          </div>
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="rpt-to" className="text-sm font-medium">
              Sampai Tanggal
            </Label>
            <Input
              id="rpt-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-12"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => setRangePreset('month')}
            className="h-12 px-4 shrink-0"
          >
            Bulan Ini
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          <Button onClick={exportCSV} variant="outline" className="h-11">
            <Download className="w-4 h-4" /> Export CSV
          </Button>
          <Button onClick={exportPDF} variant="outline" className="h-11">
            <FileText className="w-4 h-4" /> Export PDF
          </Button>
        </div>
      </Card>

      {/* Kartu ringkasan */}
      <div
        className={cn(
          'grid gap-3',
          expensesEnabled ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2',
        )}
      >
        <StatCard
          label="Total Pendapatan"
          value={totalIncome}
          icon={<TrendingUp className="w-5 h-5" />}
          loading={txLoading}
          color="success"
        />
        <StatCard
          label="Jumlah Transaksi"
          value={txCount}
          icon={<Receipt className="w-5 h-5" />}
          loading={txLoading}
          isCount
        />
        {expensesEnabled && (
          <>
            <StatCard
              label="Total Pengeluaran"
              value={totalExpenses}
              icon={<TrendingDown className="w-5 h-5" />}
              loading={expLoading}
              color="destructive"
            />
            <StatCard
              label="Laba Bersih"
              value={netProfit}
              icon={<Wallet className="w-5 h-5" />}
              loading={txLoading || expLoading}
              color={netProfit >= 0 ? 'primary' : 'destructive'}
            />
          </>
        )}
      </div>

      {/* Grafik bulanan 6 bulan */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" /> Tren 6 Bulan Terakhir
            </h2>
            <p className="text-sm text-muted-foreground">
              Pendapatan {expensesEnabled ? '& pengeluaran ' : ''}per bulan
            </p>
          </div>
        </div>
        <div className="h-72">
          {summaryLoading ? (
            <Skeleton className="h-full w-full" />
          ) : monthlyTrend.length > 0 ? (
            <MonthlyChart data={monthlyTrend} expensesEnabled={expensesEnabled} />
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              Belum ada data.
            </div>
          )}
        </div>
      </Card>

      {/* Breakdown per kategori */}
      <Card className="p-5">
        <h2 className="font-bold text-lg mb-1">Rincian per Kategori</h2>
        <p className="text-sm text-muted-foreground mb-3">
          Rentang {from} s/d {to}
        </p>
        {txLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : breakdown.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <ReceiptText className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p>Belum ada transaksi pada rentang ini.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kategori</TableHead>
                <TableHead className="hidden sm:table-cell">Grup</TableHead>
                <TableHead className="text-right">Jumlah</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {breakdown.map((b) => (
                <TableRow key={b.name}>
                  <TableCell>
                    <div className="font-medium">{b.name}</div>
                    <div className="mt-1.5">
                      <Progress
                        value={maxCat > 0 ? (b.total / maxCat) * 100 : 0}
                        className="h-1.5 w-28 sm:w-40"
                      />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 sm:hidden">
                      {b.group ?? 'Lainnya'}
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {b.group ?? 'Lainnya'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {b.count}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {formatRupiah(b.total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}

// ---------- Sub-komponen ----------

function StatCard({
  label,
  value,
  icon,
  loading,
  color = 'default',
  isCount = false,
}: {
  label: string
  value: number
  icon?: React.ReactNode
  loading?: boolean
  color?: 'default' | 'success' | 'destructive' | 'primary'
  isCount?: boolean
}) {
  const colorClass = {
    default: '',
    success: 'text-success',
    destructive: 'text-destructive',
    primary: 'text-primary',
  }[color]

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        {icon && (
          <span className={cn('text-muted-foreground', colorClass)}>{icon}</span>
        )}
      </div>
      <div
        className={cn(
          'text-2xl font-bold mt-2 tabular-nums break-all',
          colorClass,
        )}
      >
        {loading ? (
          <Skeleton className="h-8 w-28" />
        ) : isCount ? (
          value
        ) : (
          formatRupiah(value)
        )}
      </div>
    </Card>
  )
}

// ---------- Print HTML builder (untuk Export PDF) ----------

function buildPrintHTML(opts: {
  from: string
  to: string
  txns: Txn[]
  expenses: Expense[]
  expensesEnabled: boolean
  totalIncome: number
  totalExpenses: number
  netProfit: number
}): string {
  const { from, to, txns, expenses, expensesEnabled, totalIncome, totalExpenses, netProfit } = opts

  const esc = (s: string | null | undefined): string =>
    (s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

  const fmt = (n: number): string => 'Rp' + Math.round(n).toLocaleString('id-ID')

  const txRows = txns
    .map(
      (t) => `
      <tr>
        <td>${esc(t.date)}</td>
        <td>${esc(t.category_name)}</td>
        <td>${esc(t.category_group ?? '')}</td>
        <td style="text-align:right">${t.qty}</td>
        <td style="text-align:right">${fmt(t.fee_per_unit)}</td>
        <td style="text-align:right">${fmt(t.total)}</td>
        <td>${esc(t.note ?? '')}</td>
      </tr>`,
    )
    .join('')

  const expRows = expenses
    .map(
      (e) => `
      <tr>
        <td>${esc(e.date)}</td>
        <td>${esc(e.label)}</td>
        <td style="text-align:right">${fmt(e.amount)}</td>
      </tr>`,
    )
    .join('')

  const expensesBlock = expensesEnabled
    ? `
    <h2>Pengeluaran Operasional</h2>
    <table>
      <thead>
        <tr><th>Tanggal</th><th>Keterangan</th><th style="text-align:right">Jumlah</th></tr>
      </thead>
      <tbody>
        ${expRows || '<tr><td colspan="3" style="text-align:center;color:#888">Tidak ada pengeluaran</td></tr>'}
        <tr class="total"><td></td><td>TOTAL PENGELUARAN</td><td style="text-align:right">${fmt(totalExpenses)}</td></tr>
      </tbody>
    </table>
    <div class="net ${netProfit >= 0 ? 'positive' : 'negative'}">
      <strong>LABA BERSIH (Pendapatan − Pengeluaran):</strong>
      <span>${fmt(netProfit)}</span>
    </div>`
    : ''

  const printedAt = new Date().toLocaleString('id-ID', {
    dateStyle: 'long',
    timeStyle: 'short',
  })

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Laporan Keuangan GriyaLapor ${from}_${to}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
    color: #1a1a1a;
    padding: 24px;
    font-size: 12px;
    margin: 0;
  }
  .header { border-bottom: 3px solid #15803d; padding-bottom: 12px; margin-bottom: 16px; }
  h1 { font-size: 22px; margin: 0; color: #14532d; }
  .meta { color: #666; margin-top: 4px; font-size: 11px; }
  h2 {
    font-size: 14px;
    margin: 1.5rem 0 8px 0;
    border-bottom: 2px solid #15803d;
    padding-bottom: 4px;
    color: #14532d;
  }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; font-size: 11px; vertical-align: top; }
  th { background: #f0fdf4; text-align: left; color: #14532d; font-weight: 600; }
  tr.total td { font-weight: bold; background: #f0fdf4; }
  tbody tr:nth-child(even) td { background: #fafdfa; }
  .net {
    margin-top: 14px;
    padding: 10px 14px;
    border-radius: 6px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 14px;
  }
  .net.positive { background: #dcfce7; border-left: 4px solid #15803d; color: #14532d; }
  .net.negative { background: #fee2e2; border-left: 4px solid #dc2626; color: #991b1b; }
  .net span { font-weight: bold; font-size: 16px; }
  .footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #ddd; font-size: 10px; color: #999; text-align: center; }
  @media print {
    body { padding: 0; }
    @page { margin: 1.5cm; }
  }
</style>
</head>
<body>
  <div class="header">
    <h1>Laporan Keuangan GriyaLapor</h1>
    <div class="meta">Rentang: <strong>${from}</strong> s/d <strong>${to}</strong> &middot; Dicetak: ${printedAt}</div>
  </div>

  <h2>Transaksi Pendapatan</h2>
  <table>
    <thead>
      <tr>
        <th>Tanggal</th>
        <th>Kategori</th>
        <th>Grup</th>
        <th style="text-align:right">Jumlah</th>
        <th style="text-align:right">Fee/Unit</th>
        <th style="text-align:right">Total</th>
        <th>Catatan</th>
      </tr>
    </thead>
    <tbody>
      ${txRows || '<tr><td colspan="7" style="text-align:center;color:#888">Tidak ada transaksi</td></tr>'}
      <tr class="total"><td colspan="5">TOTAL PENDAPATAN</td><td style="text-align:right">${fmt(totalIncome)}</td><td></td></tr>
    </tbody>
  </table>

  ${expensesBlock}

  <div class="footer">Laporan ini dibuat otomatis oleh aplikasi GriyaLapor.</div>
</body>
</html>`
}
