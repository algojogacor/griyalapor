'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatRupiah, formatLongDate, todayISO } from '@/lib/format'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { RupiahInput } from '@/components/app/RupiahInput'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppStore } from '@/lib/store'
import { toast } from 'sonner'
import { ArrowUpRight, Undo2, Plus, TrendingUp, Wallet, CalendarDays, Sparkles, Zap, User, Users, Settings2 } from 'lucide-react'
import { getCategoryColor, getCategoryInitial } from '@/lib/category-colors'
import { cn } from '@/lib/utils'
import { ManageQuickAccessDialog, type QuickAccessItem } from '@/components/app/ManageQuickAccess'

interface Category { id: number; name: string; group_name: string | null; default_fee: number }

interface Summary {
  ranges: { today: string; week: { from: string; to: string }; month: { from: string; to: string } }
  today: { count: number; admin: number; omzet: number }
  week: { count: number; admin: number; omzet: number }
  month: { count: number; admin: number; omzet: number }
  expenses: { today: { count: number; total: number }; week: { count: number; total: number }; month: { count: number; total: number } }
  breakdown: { category_id: number; name: string; group: string | null; count: number; admin: number; omzet: number }[]
  topCustomers: { name: string; count: number; admin: number; omzet: number; last_date: string }[]
  recentTransactions: {
    id: number; date: string; qty: number; fee_per_unit: number; total: number; total_paid: number;
    customer_name: string | null; note: string | null; category_name: string; category_group: string | null
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

  // Fetch categories untuk quick-add
  const { data: catData } = useQuery({ queryKey: ['categories'], queryFn: () => fetch('/api/categories').then((r) => r.json()) })
  const categories: Category[] = catData?.categories ?? []
  const [quickCat, setQuickCat] = useState<Category | null>(null)
  const [quickFeeOverride, setQuickFeeOverride] = useState<number | undefined>(undefined)
  const [manageOpen, setManageOpen] = useState(false)

  // Akses Cepat: jika user sudah kustomisasi (settings.quick_access), pakai itu.
  // Jika belum, fallback ke top categories dari breakdown bulan ini.
  const quickAccessSetting: QuickAccessItem[] = (() => {
    const raw = settings?.settings?.quick_access
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw) as QuickAccessItem[]
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })()

  const topCategories: { cat: Category; feeOverride?: number }[] = (() => {
    // Mode kustom: pakai daftar dari settings
    if (quickAccessSetting.length > 0 && categories.length > 0) {
      const result: { cat: Category; feeOverride?: number }[] = []
      for (const item of quickAccessSetting) {
        const cat = categories.find((c) => c.id === item.id)
        if (cat) result.push({ cat, feeOverride: item.fee })
        if (result.length >= 8) break
      }
      return result
    }
    // Mode otomatis: ambil kategori paling sering dipakai bulan ini
    if (!data?.breakdown?.length || categories.length === 0) {
      const popularNames = ['PLN Prabayar', 'PLN Pascabayar', 'PDAM', 'BPJS Kesehatan', 'Pulsa']
      return popularNames.map((n) => categories.find((c) => c.name === n)).filter((c): c is Category => !!c).slice(0, 6).map((cat) => ({ cat }))
    }
    const result: { cat: Category; feeOverride?: number }[] = []
    for (const b of data.breakdown) {
      const cat = categories.find((c) => c.id === b.category_id)
      if (cat) result.push({ cat })
      if (result.length >= 6) break
    }
    if (result.length < 4) {
      const existingIds = new Set(result.map((r) => r.cat.id))
      for (const cat of categories) {
        if (!existingIds.has(cat.id) && cat.default_fee > 0) {
          result.push({ cat })
          if (result.length >= 6) break
        }
      }
    }
    return result
  })()

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
      <Card className="relative overflow-hidden p-5 md:p-7 bg-gradient-to-br from-primary to-primary/80 text-primary-foreground border-0 shadow-lg">
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 20% 30%, white 1px, transparent 1px), radial-gradient(circle at 70% 60%, white 1px, transparent 1px)', backgroundSize: '48px 48px, 64px 64px' }} />
        <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/5 blur-2xl pointer-events-none" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-primary-foreground/80 text-sm font-medium flex items-center gap-1.5">
              <Wallet className="w-4 h-4" /> Pendapatan Hari Ini (fee admin)
            </p>
            <div className="text-3xl md:text-5xl font-bold mt-1 tracking-tight tabular-nums drop-shadow-sm">
              {isLoading ? <Skeleton className="h-12 w-48 bg-white/20" /> : formatRupiah(data?.today.admin)}
            </div>
            <p className="text-primary-foreground/80 text-sm mt-2">
              {data?.today.count ?? 0} transaksi tercatat
            </p>
            {data && data.today.omzet > data.today.admin && (
              <p className="text-primary-foreground/70 text-xs mt-1">
                Omzet (uang pembeli): {formatRupiah(data.today.omzet)}
              </p>
            )}
          </div>
          <div className="hidden sm:flex w-14 h-14 rounded-2xl bg-white/15 items-center justify-center shrink-0 backdrop-blur-sm">
            <TrendingUp className="w-7 h-7" />
          </div>
        </div>
        <div className="relative flex gap-2 mt-5">
          <Button
            onClick={() => setSection('transactions')}
            className="bg-white text-primary hover:bg-white/90 font-semibold h-12 px-5 shadow-sm"
          >
            <Plus className="w-5 h-5" /> Catat Transaksi
          </Button>
          <Button
            onClick={() => undoMutation.mutate()}
            disabled={undoMutation.isPending}
            variant="secondary"
            className="bg-white/15 text-primary-foreground hover:bg-white/25 border-0 h-12 px-4 backdrop-blur-sm"
          >
            <Undo2 className="w-5 h-5" /> Batal Terakhir
          </Button>
        </div>
      </Card>

      {/* Nudge "Tutup Buku" — muncul kalau belum ada transaksi hari ini */}
      {!isLoading && data && data.today.count === 0 && (
        <Card className="p-4 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
              <CalendarDays className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm text-amber-900 dark:text-amber-100">Belum ada catatan hari ini</p>
              <p className="text-xs text-amber-800/80 dark:text-amber-200/80 mt-0.5">
                Yuk catat transaksi hari ini sebelum lupa. Klik "Catat Transaksi" atau pakai Akses Cepat di bawah.
              </p>
            </div>
            <Button
              onClick={() => setSection('transactions')}
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white h-9 shrink-0"
            >
              <Plus className="w-4 h-4" /> Catat
            </Button>
          </div>
        </Card>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Hari Ini" value={data?.today.admin} omzet={data?.today.omzet} count={data?.today.count} loading={isLoading} highlight />
        <StatCard label="Minggu Ini" value={data?.week.admin} omzet={data?.week.omzet} count={data?.week.count} loading={isLoading} />
        <StatCard label="Bulan Ini" value={data?.month.admin} omzet={data?.month.omzet} count={data?.month.count} loading={isLoading} />
      </div>

      {expensesEnabled && (
        <div className="grid grid-cols-3 gap-3">
          <ExpenseMini label="Hari Ini" value={data?.expenses.today.total} loading={isLoading} />
          <ExpenseMini label="Minggu Ini" value={data?.expenses.week.total} loading={isLoading} />
          <ExpenseMini label="Bulan Ini" value={data?.expenses.month.total} loading={isLoading} />
        </div>
      )}

      {/* Akses Cepat — tombol kategori untuk catat sekali klik */}
      {topCategories.length > 0 && (
        <Card className="p-4 md:p-5">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-5 h-5 text-primary" />
            <h2 className="font-bold text-lg">Akses Cepat</h2>
            <span className="text-xs text-muted-foreground hidden sm:inline">— pilih kategori, isi jumlah, selesai</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setManageOpen(true)}
              className="ml-auto text-muted-foreground hover:text-primary h-8 px-2"
              title="Kelola Akses Cepat"
            >
              <Settings2 className="w-4 h-4" /> <span className="hidden sm:inline text-xs">Kelola</span>
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {topCategories.map(({ cat, feeOverride }) => {
              const color = getCategoryColor(cat.group_name)
              const effectiveFee = feeOverride ?? cat.default_fee
              const hasOverride = feeOverride !== undefined
              return (
                <button
                  key={cat.id}
                  onClick={() => { setQuickCat(cat); setQuickFeeOverride(feeOverride) }}
                  className="group flex items-center gap-2.5 p-3 rounded-xl border bg-card hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5 transition-all text-left active:scale-[0.98]"
                >
                  <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs shrink-0', color.bg, color.text)}>
                    {getCategoryInitial(cat.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm leading-tight line-clamp-1">{cat.name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      fee {formatRupiah(effectiveFee)}
                      {hasOverride && <span className="text-[9px] text-amber-600 dark:text-amber-400 font-medium">kustom</span>}
                    </div>
                  </div>
                  <Plus className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                </button>
              )
            })}
          </div>
          {quickAccessSetting.length === 0 && (
            <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
              <Settings2 className="w-3 h-3" /> Mode otomatis: kategori teratas bulan ini. Klik "Kelola" untuk atur sendiri.
            </p>
          )}
        </Card>
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
              {data.breakdown.slice(0, 8).map((b) => {
                const color = getCategoryColor(b.group)
                const maxAdmin = data.breakdown[0]?.admin || 1
                return (
                  <div key={b.category_id} className="py-2 border-b last:border-0">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-bold text-[11px]', color.bg, color.text)}>
                          {getCategoryInitial(b.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium truncate">{b.name}</div>
                          <div className="text-xs text-muted-foreground">{b.group ?? 'Lainnya'} · {b.count} transaksi</div>
                        </div>
                      </div>
                      <div className="font-semibold tabular-nums shrink-0">{formatRupiah(b.admin)}</div>
                    </div>
                    <div className="mt-1.5 ml-[42px] h-1 rounded-full bg-secondary overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(4, (b.admin / maxAdmin) * 100)}%` }} />
                    </div>
                  </div>
                )
              })}
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
              {data.recentTransactions.map((t) => {
                const color = getCategoryColor(t.category_group)
                return (
                  <div key={t.id} className="flex items-center gap-2.5 py-2 border-b last:border-0">
                    <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-bold text-[11px]', color.bg, color.text)}>
                      {getCategoryInitial(t.category_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{t.category_name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {t.date} · {t.qty} × {formatRupiah(t.fee_per_unit)}
                        {t.customer_name ? ` · ${t.customer_name}` : ''}
                      </div>
                    </div>
                    <div className="font-semibold text-success tabular-nums shrink-0">+{formatRupiah(t.total)}</div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm py-6 text-center">Belum ada transaksi.</p>
          )}
        </Card>
      </div>

      {/* Pelanggan teratas bulan ini — untuk tracking siapa saja yang bayar */}
      {!isLoading && data && data.topCustomers && data.topCustomers.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-5 h-5 text-primary" />
            <h2 className="font-bold text-lg">Pelanggan Teratas Bulan Ini</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Pelanggan yang paling banyak membayar — bantu tracking siapa saja yang aktif</p>
          <div className="space-y-1.5 max-h-72 overflow-y-auto scroll-thin pr-1">
            {data.topCustomers.map((c, i) => {
              const maxAdmin = data.topCustomers[0]?.admin || 1
              return (
                <div key={c.name} className="py-2 border-b last:border-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-bold text-[11px]',
                        i === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-primary/10 text-primary'
                      )}>
                        {i === 0 ? '★' : i + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{c.name}</div>
                        <div className="text-xs text-muted-foreground">{c.count} transaksi · terakhir {c.last_date}</div>
                      </div>
                    </div>
                    <div className="font-semibold tabular-nums shrink-0">{formatRupiah(c.admin)}</div>
                  </div>
                  <div className="mt-1.5 ml-[42px] h-1 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(4, (c.admin / maxAdmin) * 100)}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* AI hint */}
      <Card className="p-4 border-dashed bg-secondary/40 flex items-center gap-3">
        <Sparkles className="w-5 h-5 text-primary shrink-0" />
        <p className="text-sm text-muted-foreground">
          Mau catat lebih cepat? Ketik saja <span className="font-medium text-foreground">"tadi 49 idpel PLN admin 3000 dari Pak Budi"</span> di Asisten AI.
        </p>
      </Card>

      {quickCat && (
        <QuickAddDialog
          category={quickCat}
          feeOverride={quickFeeOverride}
          onClose={() => { setQuickCat(null); setQuickFeeOverride(undefined) }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['summary'] })
            qc.invalidateQueries({ queryKey: ['transactions'] })
            setQuickCat(null)
            setQuickFeeOverride(undefined)
          }}
        />
      )}

      <ManageQuickAccessDialog open={manageOpen} onOpenChange={setManageOpen} />
    </div>
  )
}

function QuickAddDialog({ category, feeOverride, onClose, onSaved }: { category: Category; feeOverride?: number; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(todayISO())
  const [qty, setQty] = useState('')
  const [fee, setFee] = useState(String(feeOverride ?? category.default_fee))
  const [totalPaid, setTotalPaid] = useState('')
  const [customerName, setCustomerName] = useState('')

  const q = Number(qty.replace(/[^\d]/g, '')) || 0
  const f = Number(fee.replace(/[^\d]/g, '')) || 0
  const tp = Number(totalPaid.replace(/[^\d]/g, '')) || 0
  const bersih = q * f

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id: category.id,
          date,
          qty: q,
          fee_per_unit: f,
          total_paid: tp,
          customer_name: customerName.trim() || null,
          note: null,
        }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? 'Gagal') }
      return res.json()
    },
    onSuccess: () => {
      toast.success(`${category.name} dicatat`)
      onSaved()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" /> Catat Cepat · {category.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label className="font-medium">Tanggal</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-12" />
          </div>
          <div className="space-y-1.5">
            <Label className="font-medium">Jumlah Pelanggan / IDPEL</Label>
            <Input
              autoFocus inputMode="numeric" value={qty}
              onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="contoh: 49" className="h-16 text-3xl font-bold text-center tabular-nums"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="font-medium text-xs">Fee/Pelanggan</Label>
              <RupiahInput value={fee} onChange={setFee} className="h-12 text-lg font-bold text-center tabular-nums" />
            </div>
            <div className="space-y-1.5">
              <Label className="font-medium text-xs">Total Dibayar Pembeli (opsional)</Label>
              <RupiahInput value={totalPaid} onChange={setTotalPaid} placeholder="0" className="h-12 text-lg font-semibold text-center tabular-nums" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="font-medium text-xs flex items-center gap-1.5"><User className="w-3 h-3" /> Nama Pelanggan (opsional)</Label>
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="contoh: Pak Budi" className="h-11" maxLength={100} />
          </div>
          <div className="rounded-xl bg-primary/10 p-3 space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Pendapatan Bersih (fee admin)</span>
              <span className="font-bold tabular-nums text-primary">{formatRupiah(bersih)}</span>
            </div>
            {tp > 0 && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Omzet (uang pembeli)</span>
                <span className="font-semibold tabular-nums">{formatRupiah(tp)}</span>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="h-12">Batal</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || q <= 0} className="h-12 font-semibold flex-1">
            {mutation.isPending ? 'Menyimpan...' : `Simpan ${formatRupiah(bersih)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function StatCard({ label, value, omzet, count, loading, highlight }: { label: string; value?: number; omzet?: number; count?: number; loading?: boolean; highlight?: boolean }) {
  const showOmzet = omzet !== undefined && value !== undefined && omzet > value
  return (
    <Card className={cn('relative overflow-hidden p-4 transition-all duration-200', highlight && 'ring-1 ring-primary/30 shadow-sm')}>
      {highlight && <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-primary/5 blur-xl pointer-events-none" />}
      <div className="relative">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="text-2xl font-bold mt-1 tabular-nums">{loading ? <Skeleton className="h-8 w-28" /> : formatRupiah(value)}</div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {count ?? 0} transaksi{showOmzet ? ` · Omzet ${formatRupiah(omzet)}` : ''}
        </p>
      </div>
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
      <Card className="p-4 hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5 transition-all h-full">
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
