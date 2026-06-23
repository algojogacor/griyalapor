'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatRupiah, formatLongDate, todayISO } from '@/lib/format'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppStore } from '@/lib/store'
import { toast } from 'sonner'
import { ArrowUpRight, Undo2, Plus, TrendingUp, Wallet, CalendarDays, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Summary {
  ranges: { today: string; week: { from: string; to: string }; month: { from: string; to: string } }
  today: { count: number; total: number }
  week: { count: number; total: number }
  month: { count: number; total: number }
  expenses: { today: { count: number; total: number }; week: { count: number; total: number }; month: { count: number; total: number } }
  breakdown: { category_id: number; name: string; group: string | null; count: number; total: number }[]
  recentTransactions: {
    id: number; date: string; qty: number; fee_per_unit: number; total: number;
    note: string | null; category_name: string; category_group: string | null
  }[]
}

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error((await res.json().catch(() => ({})).error) ?? 'Gagal memuat')
  return res.json()
}

export function DashboardSection() {
  const { setSection } = useAppStore()
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => fetchJSON<{ settings: Record<string, string> }>('/api/settings') })
  const expensesEnabled = settings?.settings?.expenses_enabled === '1'
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['summary'],
    queryFn: () => fetchJSON<Summary>('/api/summary'),
    refetchInterval: 60_000,
  })

  const undoMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/transactions?last=1', { method: 'DELETE' })
      if (!res.ok) throw new Error('Gagal membatalkan')
      return res.json()
    },
    onSuccess: (d) => {
      if (d.deleted) {
        toast.success('Transaksi terakhir dibatalkan')
        qc.invalidateQueries({ queryKey: ['summary'] })
        qc.invalidateQueries({ queryKey: ['transactions'] })
      } else {
        toast.info('Tidak ada transaksi untuk dibatalkan')
      }
    },
    onError: () => toast.error('Gagal membatalkan transaksi'),
  })

  const today = todayISO()

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <div>
        <p className="text-sm text-muted-foreground flex items-center gap-1.5">
          <CalendarDays className="w-4 h-4" /> {formatLongDate(today)}
        </p>
        <h1 className="text-2xl md:text-3xl font-bold mt-1">Selamat datang di GriyaLapor</h1>
      </div>

      {/* Hero card hari ini */}
      <Card className="p-5 md:p-7 bg-gradient-to-br from-primary to-primary/80 text-primary-foreground border-0 shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-primary-foreground/80 text-sm font-medium flex items-center gap-1.5">
              <Wallet className="w-4 h-4" /> Pendapatan Hari Ini
            </p>
            <div className="text-3xl md:text-5xl font-bold mt-1 tracking-tight tabular-nums">
              {isLoading ? <Skeleton className="h-12 w-48 bg-white/20" /> : formatRupiah(data?.today.total)}
            </div>
            <p className="text-primary-foreground/80 text-sm mt-2">
              {data?.today.count ?? 0} transaksi tercatat
            </p>
          </div>
          <div className="hidden sm:flex w-14 h-14 rounded-2xl bg-white/15 items-center justify-center">
            <TrendingUp className="w-7 h-7" />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <Button
            onClick={() => setSection('transactions')}
            className="bg-white text-primary hover:bg-white/90 font-semibold h-12 px-5"
          >
            <Plus className="w-5 h-5" /> Catat Transaksi
          </Button>
          <Button
            onClick={() => undoMutation.mutate()}
            disabled={undoMutation.isPending}
            variant="secondary"
            className="bg-white/15 text-primary-foreground hover:bg-white/25 border-0 h-12 px-4"
          >
            <Undo2 className="w-5 h-5" /> Batal Terakhir
          </Button>
        </div>
      </Card>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Hari Ini" value={data?.today.total} count={data?.today.count} loading={isLoading} highlight />
        <StatCard label="Minggu Ini" value={data?.week.total} count={data?.week.count} loading={isLoading} />
        <StatCard label="Bulan Ini" value={data?.month.total} count={data?.month.count} loading={isLoading} />
      </div>

      {expensesEnabled && (
        <div className="grid grid-cols-3 gap-3">
          <ExpenseMini label="Hari Ini" value={data?.expenses.today.total} loading={isLoading} />
          <ExpenseMini label="Minggu Ini" value={data?.expenses.week.total} loading={isLoading} />
          <ExpenseMini label="Bulan Ini" value={data?.expenses.month.total} loading={isLoading} />
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3">
        <QuickLink
          title="Impor CSV"
          desc="Impor banyak transaksi sekaligus"
          icon="upload"
          onClick={() => setSection('import')}
        />
        <QuickLink
          title="Lihat Laporan"
          desc="Grafik & rekap bulanan"
          icon="chart"
          onClick={() => setSection('reports')}
        />
      </div>

      {/* Breakdown + recent */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-lg">Per Kategori (Bulan Ini)</h2>
            <Button variant="ghost" size="sm" onClick={() => setSection('reports')} className="text-primary">
              Detail <ArrowUpRight className="w-4 h-4" />
            </Button>
          </div>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : data?.breakdown.length ? (
            <div className="space-y-2 max-h-72 overflow-y-auto scroll-thin pr-1">
              {data.breakdown.slice(0, 8).map((b) => (
                <div key={b.category_id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{b.name}</div>
                    <div className="text-xs text-muted-foreground">{b.group ?? 'Lainnya'} · {b.count} transaksi</div>
                  </div>
                  <div className="font-semibold tabular-nums shrink-0 ml-3">{formatRupiah(b.total)}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm py-6 text-center">Belum ada transaksi bulan ini.</p>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-lg">Transaksi Terakhir</h2>
            <Button variant="ghost" size="sm" onClick={() => setSection('transactions')} className="text-primary">
              Semua <ArrowUpRight className="w-4 h-4" />
            </Button>
          </div>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : data?.recentTransactions.length ? (
            <div className="space-y-1.5 max-h-72 overflow-y-auto scroll-thin pr-1">
              {data.recentTransactions.map((t) => (
                <div key={t.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{t.category_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {t.date} · {t.qty} × {formatRupiah(t.fee_per_unit)}
                    </div>
                  </div>
                  <div className="font-semibold text-success tabular-nums shrink-0 ml-3">+{formatRupiah(t.total)}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm py-6 text-center">Belum ada transaksi.</p>
          )}
        </Card>
      </div>

      {/* AI hint */}
      <Card className="p-4 border-dashed bg-secondary/40 flex items-center gap-3">
        <Sparkles className="w-5 h-5 text-primary shrink-0" />
        <p className="text-sm text-muted-foreground">
          Mau catat lebih cepat? Ketik saja <span className="font-medium text-foreground">"tadi 49 idpel PLN admin 3000"</span> di Asisten AI.
        </p>
      </Card>
    </div>
  )
}

function StatCard({ label, value, count, loading, highlight }: { label: string; value?: number; count?: number; loading?: boolean; highlight?: boolean }) {
  return (
    <Card className={cn('p-4', highlight && 'ring-1 ring-primary/30')}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="text-2xl font-bold mt-1 tabular-nums">{loading ? <Skeleton className="h-8 w-28" /> : formatRupiah(value)}</div>
      <p className="text-xs text-muted-foreground mt-0.5">{count ?? 0} transaksi</p>
    </Card>
  )
}

function ExpenseMini({ label, value, loading }: { label: string; value?: number; loading?: boolean }) {
  return (
    <Card className="p-3 bg-destructive/5 border-destructive/20">
      <p className="text-xs text-muted-foreground">Pengeluaran {label}</p>
      <div className="text-lg font-bold mt-0.5 tabular-nums text-destructive">
        {loading ? <Skeleton className="h-6 w-20" /> : '-' + formatRupiah(value)}
      </div>
    </Card>
  )
}

function QuickLink({ title, desc, icon, onClick }: { title: string; desc: string; icon: 'upload' | 'chart'; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-left">
      <Card className="p-4 hover:border-primary/40 hover:shadow-sm transition-all h-full">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            {icon === 'upload' ? (
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            ) : (
              <BarChartIcon />
            )}
          </div>
          <div>
            <div className="font-semibold">{title}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
          </div>
        </div>
      </Card>
    </button>
  )
}

function BarChartIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" /></svg>
  )
}
