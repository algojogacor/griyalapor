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
  formatDateISO,
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
  Users,
  User,
  UserCircle,
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
  monthlyTrend: { ym: string; admin: number; omzet: number; expenses: number }[]
}

interface Txn {
  id: number
  date: string
  qty: number
  fee_per_unit: number
  total: number          // pendapatan bersih (admin)
  bill_per_unit: number
  total_paid: number
  customer_name: string | null
  recorded_by: string | null
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

interface Customer {
  name: string
  count: number
  admin: number
  omzet: number
  qty: number
  first_date: string
  last_date: string
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

  // Daftar pelanggan pada rentang ini — untuk filter & tracking
  const { data: custData } = useQuery({
    queryKey: ['customers', from, to],
    queryFn: () => fetchJSON<{ customers: Customer[] }>(`/api/customers?${rangeParams}`),
  })
  const [customerFilter, setCustomerFilter] = useState<string>('') // '' = semua
  const [recorderFilter, setRecorderFilter] = useState<string>('') // '' = semua
  const customers: Customer[] = custData?.customers ?? []

  const txns = (txData?.transactions ?? [])
    .filter((t) => !customerFilter || t.customer_name === customerFilter)
    .filter((t) => !recorderFilter || (recorderFilter === '__none__' ? !t.recorded_by : t.recorded_by === recorderFilter))
  const expenses = expData?.expenses ?? []

  const totalAdmin = useMemo(() => txns.reduce((s, t) => s + t.total, 0), [txns]) // pendapatan bersih (fee admin)
  const totalOmzet = useMemo(() => txns.reduce((s, t) => s + t.total_paid, 0), [txns]) // pendapatan kotor (total uang pembeli)
  const hasOmzet = useMemo(() => txns.some((t) => t.total_paid > 0), [txns])
  const txCount = txns.length
  const totalExpenses = useMemo(
    () => expenses.reduce((s, e) => s + e.amount, 0),
    [expenses],
  )
  const labaOperasional = totalAdmin - totalExpenses

  // Breakdown per kategori (untuk rentang yg dipilih)
  const breakdown = useMemo(() => {
    const map = new Map<
      string,
      { name: string; group: string | null; count: number; admin: number; omzet: number; qty: number }
    >()
    for (const t of txns) {
      const key = t.category_name
      const e =
        map.get(key) ?? {
          name: t.category_name,
          group: t.category_group,
          count: 0,
          admin: 0,
          omzet: 0,
          qty: 0,
        }
      e.count += 1
      e.qty += t.qty
      e.admin += t.total
      e.omzet += t.total_paid
      map.set(key, e)
    }
    return Array.from(map.values()).sort((a, b) => b.admin - a.admin)
  }, [txns])

  const maxCat = breakdown.length ? Math.max(...breakdown.map((b) => b.admin)) : 0
  const monthlyTrend = summary?.monthlyTrend ?? []

  function setRangePreset(kind: 'today' | '7d' | '30d' | 'month' | 'lastMonth' | 'week') {
    const now = new Date()
    if (kind === 'today') {
      const d = formatDateISO(now)
      setFrom(d); setTo(d)
      return
    }
    if (kind === '7d') {
      const start = new Date(now); start.setDate(now.getDate() - 6)
      setFrom(formatDateISO(start)); setTo(formatDateISO(now)); return
    }
    if (kind === '30d') {
      const start = new Date(now); start.setDate(now.getDate() - 29)
      setFrom(formatDateISO(start)); setTo(formatDateISO(now)); return
    }
    if (kind === 'month') {
      const r = thisMonthRange(); setFrom(r.from); setTo(r.to); return
    }
    if (kind === 'lastMonth') {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      setFrom(formatDateISO(new Date(d.getFullYear(), d.getMonth(), 1)))
      setTo(formatDateISO(new Date(d.getFullYear(), d.getMonth() + 1, 0)))
      return
    }
    if (kind === 'week') {
      const day = now.getDay()
      const diffToMonday = day === 0 ? -6 : 1 - day
      const monday = new Date(now); monday.setDate(now.getDate() + diffToMonday)
      const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
      setFrom(formatDateISO(monday)); setTo(formatDateISO(sunday)); return
    }
  }

  // Deteksi preset aktif untuk highlight tombol
  const activePreset: string | null = (() => {
    const now = new Date()
    const today = formatDateISO(now)
    if (from === today && to === today) return 'today'
    const d7 = new Date(now); d7.setDate(now.getDate() - 6)
    if (from === formatDateISO(d7) && to === today) return '7d'
    const d30 = new Date(now); d30.setDate(now.getDate() - 29)
    if (from === formatDateISO(d30) && to === today) return '30d'
    const mr = thisMonthRange()
    if (from === mr.from && to === mr.to) return 'month'
    const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    if (from === formatDateISO(new Date(lm.getFullYear(), lm.getMonth(), 1)) &&
        to === formatDateISO(new Date(lm.getFullYear(), lm.getMonth() + 1, 0))) return 'lastMonth'
    return null
  })()

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
      totalAdmin,
      totalOmzet,
      hasOmzet,
      totalExpenses,
      labaOperasional,
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
        </div>

        {/* Preset rentang cepat */}
        <div className="flex flex-wrap gap-2 mt-3">
          {([
            { id: 'today', label: 'Hari Ini' },
            { id: '7d', label: '7 Hari' },
            { id: '30d', label: '30 Hari' },
            { id: 'week', label: 'Minggu Ini' },
            { id: 'month', label: 'Bulan Ini' },
            { id: 'lastMonth', label: 'Bulan Lalu' },
          ] as const).map((p) => (
            <button
              key={p.id}
              onClick={() => setRangePreset(p.id)}
              className={cn(
                'h-10 px-3.5 rounded-lg text-sm font-medium border transition-colors',
                activePreset === p.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card hover:bg-secondary text-foreground/80',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Filter pelanggan — untuk tracking transaksi per pelanggan */}
        {customers.length > 0 && (
          <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2">
            <Label className="text-sm font-medium flex items-center gap-1.5 shrink-0">
              <User className="w-4 h-4" /> Filter Pelanggan:
            </Label>
            <div className="flex flex-wrap gap-2 flex-1">
              <button
                onClick={() => setCustomerFilter('')}
                className={cn(
                  'h-9 px-3 rounded-lg text-sm font-medium border transition-colors',
                  customerFilter === ''
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card hover:bg-secondary text-foreground/80',
                )}
              >
                Semua ({txData?.transactions?.length ?? 0})
              </button>
              {customers.slice(0, 8).map((c) => (
                <button
                  key={c.name}
                  onClick={() => setCustomerFilter(c.name)}
                  className={cn(
                    'h-9 px-3 rounded-lg text-sm font-medium border transition-colors max-w-[200px] truncate',
                    customerFilter === c.name
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card hover:bg-secondary text-foreground/80',
                  )}
                  title={`${c.name} · ${c.count} transaksi · ${formatRupiah(c.admin)}`}
                >
                  {c.name} <span className="opacity-60">({c.count})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Filter Dicatat Oleh — siapa yang mencatat transaksi */}
        {(txData?.transactions ?? []).some((t) => t.recorded_by) && (
          <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2">
            <Label className="text-sm font-medium flex items-center gap-1.5 shrink-0">
              <UserCircle className="w-4 h-4" /> Dicatat Oleh:
            </Label>
            <div className="flex flex-wrap gap-2 flex-1">
              <button
                onClick={() => setRecorderFilter('')}
                className={cn(
                  'h-9 px-3 rounded-lg text-sm font-medium border transition-colors',
                  recorderFilter === ''
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card hover:bg-secondary text-foreground/80',
                )}
              >
                Semua
              </button>
              {Array.from(new Set((txData?.transactions ?? []).map((t) => t.recorded_by).filter((x): x is string => !!x))).map((r) => {
                const count = (txData?.transactions ?? []).filter((t) => t.recorded_by === r).length
                return (
                  <button
                    key={r}
                    onClick={() => setRecorderFilter(r)}
                    className={cn(
                      'h-9 px-3 rounded-lg text-sm font-medium border transition-colors max-w-[200px] truncate',
                      recorderFilter === r
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card hover:bg-secondary text-foreground/80',
                    )}
                    title={`${r} · ${count} transaksi`}
                  >
                    {r} <span className="opacity-60">({count})</span>
                  </button>
                )
              })}
              {(txData?.transactions ?? []).some((t) => !t.recorded_by) && (
                <button
                  onClick={() => setRecorderFilter('__none__')}
                  className={cn(
                    'h-9 px-3 rounded-lg text-sm font-medium border transition-colors',
                    recorderFilter === '__none__'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card hover:bg-secondary text-foreground/80',
                  )}
                >
                  Tidak dicatat
                </button>
              )}
            </div>
          </div>
        )}

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
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Pendapatan Bersih"
          sub="fee admin yang didapat"
          value={totalAdmin}
          icon={<TrendingUp className="w-5 h-5" />}
          loading={txLoading}
          color="success"
        />
        <StatCard
          label="Pendapatan Kotor"
          sub="omzet / uang pembeli"
          value={totalOmzet}
          icon={<Wallet className="w-5 h-5" />}
          loading={txLoading}
          color="primary"
          dimmed={!hasOmzet}
        />
        <StatCard
          label="Jumlah Transaksi"
          value={txCount}
          icon={<Receipt className="w-5 h-5" />}
          loading={txLoading}
          isCount
        />
        {expensesEnabled ? (
          <StatCard
            label="Laba Operasional"
            sub="bersih − pengeluaran"
            value={labaOperasional}
            icon={<TrendingDown className="w-5 h-5" />}
            loading={txLoading || expLoading}
            color={labaOperasional >= 0 ? 'success' : 'destructive'}
          />
        ) : (
          <StatCard
            label="Total Pengeluaran"
            value={totalExpenses}
            icon={<TrendingDown className="w-5 h-5" />}
            loading={expLoading}
            color="destructive"
            dimmed={!expensesEnabled}
          />
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
        <p className="text-xs text-muted-foreground mt-2">
          Batang hijau = Pendapatan Bersih (fee admin). Batang biru = Omzet (uang pembeli, hanya jika nominal tagihan diisi).{expensesEnabled ? ' Batang merah = Pengeluaran.' : ''}
        </p>
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
                <TableHead className="min-w-[7rem]">Kategori</TableHead>
                <TableHead className="hidden sm:table-cell">Grup</TableHead>
                <TableHead className="text-right whitespace-nowrap">Qty</TableHead>
                <TableHead className="text-right whitespace-nowrap">Bersih</TableHead>
                {hasOmzet && <TableHead className="text-right hidden sm:table-cell whitespace-nowrap">Omzet</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {breakdown.map((b) => (
                <TableRow key={b.name}>
                  <TableCell>
                    <div className="font-medium">{b.name}</div>
                    <div className="mt-1.5">
                      <Progress
                        value={maxCat > 0 ? (b.admin / maxCat) * 100 : 0}
                        className="h-1.5 w-24 sm:w-40"
                      />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 sm:hidden">
                      {b.group ?? 'Lainnya'} · {b.qty}x
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {b.group ?? 'Lainnya'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums hidden xs:table-cell">
                    {b.qty}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold text-success whitespace-nowrap">
                    {formatRupiah(b.admin)}
                  </TableCell>
                  {hasOmzet && (
                    <TableCell className="text-right tabular-nums text-muted-foreground hidden sm:table-cell whitespace-nowrap">
                      {b.omzet > b.admin ? formatRupiah(b.omzet) : '—'}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Pelanggan teratas pada rentang ini — tracking siapa saja yang bayar */}
      {customers.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-5 h-5 text-primary" />
            <h2 className="font-bold text-lg">Pelanggan Teratas</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            Tracking pelanggan pada rentang {from} s/d {to}
            {customerFilter ? ` · sedang difilter: ${customerFilter}` : ''}
          </p>
          <div className="space-y-2 max-h-96 overflow-y-auto scroll-thin pr-1">
            {customers.map((c, i) => {
              const maxAdmin = customers[0]?.admin || 1
              const isActive = customerFilter === c.name
              return (
                <button
                  key={c.name}
                  onClick={() => setCustomerFilter(isActive ? '' : c.name)}
                  className={cn(
                    'w-full text-left py-2.5 px-3 rounded-xl border transition-colors',
                    isActive ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-secondary/60',
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={cn(
                        'w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-bold text-xs',
                        i === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                          : i === 1 ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                          : i === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                          : 'bg-primary/10 text-primary'
                      )}>
                        {i === 0 ? '★' : i + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{c.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {c.count} transaksi · {c.qty} pelanggan/IDPEL · terakhir {c.last_date}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-semibold tabular-nums">{formatRupiah(c.admin)}</div>
                      {c.omzet > c.admin && (
                        <div className="text-[11px] text-muted-foreground tabular-nums">omzet {formatRupiah(c.omzet)}</div>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(4, (c.admin / maxAdmin) * 100)}%` }} />
                  </div>
                </button>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Klik nama pelanggan untuk memfilter transaksi di atas. Klik lagi untuk batal.
          </p>
        </Card>
      )}
    </div>
  )
}

// ---------- Sub-komponen ----------

function StatCard({
  label,
  value,
  sub,
  icon,
  loading,
  color = 'default',
  isCount = false,
  dimmed = false,
}: {
  label: string
  value: number
  sub?: string
  icon?: React.ReactNode
  loading?: boolean
  color?: 'default' | 'success' | 'destructive' | 'primary'
  isCount?: boolean
  dimmed?: boolean
}) {
  const colorClass = {
    default: '',
    success: 'text-success',
    destructive: 'text-destructive',
    primary: 'text-primary',
  }[color]

  return (
    <Card className={cn('p-3 sm:p-4', dimmed && 'opacity-60')}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs sm:text-sm text-muted-foreground leading-tight">{label}</p>
        {icon && (
          <span className={cn('text-muted-foreground shrink-0', colorClass)}>{icon}</span>
        )}
      </div>
      <div
        className={cn(
          'text-lg sm:text-xl lg:text-2xl font-bold mt-1.5 sm:mt-2 tabular-nums break-all leading-tight',
          colorClass,
        )}
      >
        {loading ? (
          <Skeleton className="h-7 w-24 sm:h-8 sm:w-28" />
        ) : isCount ? (
          value
        ) : (
          formatRupiah(value)
        )}
      </div>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
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
  totalAdmin: number
  totalOmzet: number
  hasOmzet: boolean
  totalExpenses: number
  labaOperasional: number
}): string {
  const { from, to, txns, expenses, expensesEnabled, totalAdmin, totalOmzet, hasOmzet, totalExpenses, labaOperasional } = opts

  const esc = (s: string | null | undefined): string =>
    (s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

  const fmt = (n: number): string => 'Rp' + Math.round(n).toLocaleString('id-ID')

  const txRows = txns
    .map(
      (t) => {
        const omzet = t.total_paid
        const omzetCell = hasOmzet
          ? `<td style="text-align:right">${t.total_paid > 0 ? fmt(omzet) : '—'}</td>`
          : ''
        const billCell = hasOmzet
          ? `<td style="text-align:right">${t.total_paid > 0 ? fmt(omzet) : '—'}</td>`
          : ''
        return `
      <tr>
        <td>${esc(t.date)}</td>
        <td>${esc(t.category_name)}</td>
        <td>${esc(t.category_group ?? '')}</td>
        <td style="text-align:right">${t.qty}</td>
        <td style="text-align:right">${fmt(t.fee_per_unit)}</td>
        ${billCell}
        <td style="text-align:right">${fmt(t.total)}</td>
        ${omzetCell}
        <td>${esc(t.customer_name ?? '')}</td>
        <td>${esc(t.recorded_by ?? '')}</td>
        <td>${esc(t.note ?? '')}</td>
      </tr>`
      },
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
    <div class="net ${labaOperasional >= 0 ? 'positive' : 'negative'}">
      <strong>LABA OPERASIONAL (Pendapatan Bersih − Pengeluaran):</strong>
      <span>${fmt(labaOperasional)}</span>
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
        <th style="text-align:right">Qty</th>
        <th style="text-align:right">Fee/Unit</th>
        ${hasOmzet ? '<th style="text-align:right">Tagihan/Unit</th>' : ''}
        <th style="text-align:right">Pendapatan Bersih</th>
        ${hasOmzet ? '<th style="text-align:right">Omzet</th>' : ''}
        <th>Pelanggan</th>
        <th>Dicatat Oleh</th>
        <th>Catatan</th>
      </tr>
    </thead>
    <tbody>
      ${txRows || `<tr><td colspan="${hasOmzet ? 11 : 9}" style="text-align:center;color:#888">Tidak ada transaksi</td></tr>`}
      <tr class="total"><td colspan="5">TOTAL PENDAPATAN BERSIH (FEE ADMIN)</td>${hasOmzet ? '<td></td>' : ''}<td style="text-align:right">${fmt(totalAdmin)}</td>${hasOmzet ? '<td style="text-align:right">' + fmt(totalOmzet) + '</td>' : ''}<td></td><td></td><td></td></tr>
    </tbody>
  </table>

  ${expensesBlock}

  <div class="footer">Laporan ini dibuat otomatis oleh aplikasi GriyaLapor.</div>
</body>
</html>`
}
