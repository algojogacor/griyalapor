'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { formatRupiah, formatLongDate, todayISO, thisWeekRange, thisMonthRange } from '@/lib/format'
import { toast } from 'sonner'
import {
  Trash2,
  AlertTriangle,
  Calendar,
  CalendarDays,
  CalendarRange,
  ReceiptText,
  TrendingDown,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Range = 'today' | 'week' | 'month' | 'custom' | 'all'

interface DeleteDataDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const RANGE_OPTIONS: {
  value: Range
  label: string
  desc: string
  icon: typeof Calendar
  danger?: 'high' | 'medium' | 'low'
}[] = [
  { value: 'today', label: 'Hari Ini', desc: 'Hapus transaksi & pengeluaran tanggal hari ini saja', icon: Calendar, danger: 'low' },
  { value: 'week', label: 'Minggu Ini', desc: 'Hapus data 7 hari terakhir (Senin–Minggu)', icon: CalendarRange, danger: 'low' },
  { value: 'month', label: 'Bulan Ini', desc: 'Hapus data sejak awal bulan berjalan', icon: CalendarDays, danger: 'medium' },
  { value: 'custom', label: 'Pilih Tanggal', desc: 'Pilih rentang tanggal manual (from – to)', icon: CalendarRange, danger: 'medium' },
  { value: 'all', label: 'Seluruh Data', desc: 'HAPUS SEMUA transaksi & pengeluaran sejak awal', icon: Trash2, danger: 'high' },
]

export function DeleteDataDialog({ open, onOpenChange }: DeleteDataDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="w-5 h-5" /> Hapus Data
          </DialogTitle>
        </DialogHeader>
        {/* Inner component akan remount saat dialog open/close, sehingga state reset otomatis */}
        {open && <DeleteDataContent onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function DeleteDataContent({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [range, setRange] = useState<Range>('today')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [types, setTypes] = useState<('transactions' | 'expenses')[]>(['transactions', 'expenses'])
  const [confirmCode, setConfirmCode] = useState('')
  const [done, setDone] = useState<{ transactions: number; expenses: number } | null>(null)

  // Query params untuk preview
  const queryParams = new URLSearchParams()
  queryParams.set('range', range)
  if (range === 'custom') {
    if (from) queryParams.set('from', from)
    if (to) queryParams.set('to', to)
  }

  // Preview jumlah data yang akan dihapus (hanya di step 2 & 3)
  const { data: preview, isLoading: previewLoading } = useQuery({
    queryKey: ['delete-preview', range, from, to],
    queryFn: () => fetch(`/api/data?${queryParams.toString()}`).then((r) => r.json()),
    // DeleteDataContent hanya di-mount saat dialog open, jadi tidak perlu cek open lagi
    enabled: (step === 2 || step === 3) && (range !== 'custom' || (!!from && !!to)),
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/data', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          range,
          from: range === 'custom' ? from : undefined,
          to: range === 'custom' ? to : undefined,
          types,
          confirmCode,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'Gagal menghapus data')
      return data
    },
    onSuccess: (data) => {
      setDone({ transactions: data.deleted.transactions, expenses: data.deleted.expenses })
      // Invalidate semua query agar UI refresh
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['summary'] })
      qc.invalidateQueries({ queryKey: ['expenses'] })
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['categories'] })
      toast.success(`Berhasil menghapus ${data.deleted.transactions} transaksi & ${data.deleted.expenses} pengeluaran`)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // Range label untuk display
  const rangeLabel = (() => {
    if (range === 'today') return `Hari Ini (${formatLongDate(todayISO())})`
    if (range === 'week') {
      const w = thisWeekRange()
      return `Minggu Ini (${w.from} s/d ${w.to})`
    }
    if (range === 'month') {
      const m = thisMonthRange()
      return `Bulan Ini (${m.from} s/d ${m.to})`
    }
    if (range === 'custom') return `Custom (${from || '?'} s/d ${to || '?'})`
    return 'Seluruh Data (sejak awal)'
  })()

  function toggleType(t: 'transactions' | 'expenses') {
    setTypes((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])
  }

  function canProceedStep1() {
    if (range === 'custom' && (!from || !to)) return false
    if (types.length === 0) return false
    return true
  }

  return (
    <div className="space-y-4">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((s, i) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div className={cn(
              'flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 transition-colors',
              step >= s ? 'bg-destructive text-white' : 'bg-secondary text-muted-foreground',
            )}>
              {step > s ? '✓' : s}
            </div>
            {i < 2 && <div className={cn('h-0.5 flex-1 transition-colors', step > s ? 'bg-destructive' : 'bg-border')} />}
          </div>
        ))}
      </div>

      {/* Step 1: Pilih rentang & jenis data */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <Label className="text-sm font-medium mb-2 block">Pilih Rentang Waktu</Label>
            <div className="space-y-2">
              {RANGE_OPTIONS.map((opt) => {
                const Icon = opt.icon
                return (
                  <button
                    key={opt.value}
                    onClick={() => setRange(opt.value)}
                    className={cn(
                      'w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all',
                      range === opt.value
                        ? 'border-destructive bg-destructive/5 ring-1 ring-destructive/20'
                        : 'border-border hover:border-destructive/30 hover:bg-secondary/50',
                    )}
                  >
                    <Icon className={cn('w-5 h-5 shrink-0 mt-0.5', range === opt.value ? 'text-destructive' : 'text-muted-foreground')} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{opt.label}</span>
                        {opt.danger === 'high' && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive">BERBAHAYA</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {range === 'custom' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="del-from" className="text-xs font-medium">Dari Tanggal</Label>
                <Input
                  id="del-from"
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="del-to" className="text-xs font-medium">Sampai Tanggal</Label>
                <Input
                  id="del-to"
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="h-11"
                />
              </div>
            </div>
          )}

          <div>
            <Label className="text-sm font-medium mb-2 block">Jenis Data yang Dihapus</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => toggleType('transactions')}
                className={cn(
                  'flex items-center gap-2 p-3 rounded-xl border text-left transition-all',
                  types.includes('transactions')
                    ? 'border-destructive bg-destructive/5 ring-1 ring-destructive/20'
                    : 'border-border hover:bg-secondary/50',
                )}
              >
                <ReceiptText className={cn('w-4 h-4 shrink-0', types.includes('transactions') ? 'text-destructive' : 'text-muted-foreground')} />
                <span className="text-sm font-medium">Transaksi</span>
              </button>
              <button
                onClick={() => toggleType('expenses')}
                className={cn(
                  'flex items-center gap-2 p-3 rounded-xl border text-left transition-all',
                  types.includes('expenses')
                    ? 'border-destructive bg-destructive/5 ring-1 ring-destructive/20'
                    : 'border-border hover:bg-secondary/50',
                )}
              >
                <TrendingDown className={cn('w-4 h-4 shrink-0', types.includes('expenses') ? 'text-destructive' : 'text-muted-foreground')} />
                <span className="text-sm font-medium">Pengeluaran</span>
              </button>
            </div>
            {types.length === 0 && (
              <p className="text-xs text-destructive mt-1.5 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Pilih minimal satu jenis data
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={onDone} className="h-11 flex-1">
              Batal
            </Button>
            <Button
              onClick={() => setStep(2)}
              disabled={!canProceedStep1()}
              className="h-11 flex-1 bg-destructive hover:bg-destructive/90 text-white"
            >
              Lanjut <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Preview & konfirmasi pemahaman */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-semibold text-sm text-destructive">Perhatian!</p>
                <p className="text-xs text-destructive/90 mt-1">
                  Data yang dihapus <strong>tidak bisa dikembalikan</strong>. Pastikan Anda sudah backup data jika ragu.
                </p>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Rentang yang dipilih</p>
            <p className="text-sm font-medium">{rangeLabel}</p>
          </div>

          {previewLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : preview ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Data yang akan dihapus:</p>
              {types.includes('transactions') && (
                <Card className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
                      <ReceiptText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-sm">Transaksi</div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {preview.transactions.count} data · Bersih {formatRupiah(preview.transactions.admin)}
                        {preview.transactions.omzet > 0 && ` · Omzet ${formatRupiah(preview.transactions.omzet)}`}
                      </div>
                    </div>
                  </div>
                  <div className="font-bold text-destructive tabular-nums shrink-0">{preview.transactions.count}</div>
                </Card>
              )}
              {types.includes('expenses') && (
                <Card className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
                      <TrendingDown className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-sm">Pengeluaran</div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {preview.expenses.count} data · Total {formatRupiah(preview.expenses.total)}
                      </div>
                    </div>
                  </div>
                  <div className="font-bold text-destructive tabular-nums shrink-0">{preview.expenses.count}</div>
                </Card>
              )}
              {types.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Tidak ada jenis data dipilih</p>
              )}
              {preview.transactions.count === 0 && preview.expenses.count === 0 && (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-1 text-muted-foreground/40" />
                  Tidak ada data pada rentang ini
                </div>
              )}
            </div>
          ) : null}

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(1)} className="h-11 flex-1">
              <ArrowLeft className="w-4 h-4" /> Kembali
            </Button>
            <Button
              onClick={() => setStep(3)}
              disabled={
                !preview ||
                (preview.transactions.count === 0 && preview.expenses.count === 0) ||
                (range === 'all' && types.length === 2 && preview.transactions.count === 0 && preview.expenses.count === 0)
              }
              className="h-11 flex-1 bg-destructive hover:bg-destructive/90 text-white"
            >
              Saya Mengerti, Lanjut <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Ketik HAPUS untuk konfirmasi final */}
      {step === 3 && !done && (
        <div className="space-y-4">
          <div className="rounded-xl bg-destructive/15 border-2 border-destructive/40 p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-6 h-6 text-destructive shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-bold text-sm text-destructive">LANGKAH TERAKHIR — TIDAK BISA DIBATALKAN</p>
                <p className="text-xs text-destructive/90 mt-1">
                  Anda akan menghapus <strong>{preview?.transactions.count ?? 0} transaksi</strong> dan{' '}
                  <strong>{preview?.expenses.count ?? 0} pengeluaran</strong> pada rentang:
                </p>
                <p className="text-xs font-semibold text-destructive mt-1">{rangeLabel}</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-code" className="text-sm font-medium">
              Ketik <span className="font-mono font-bold text-destructive bg-destructive/10 px-2 py-0.5 rounded">HAPUS</span> untuk konfirmasi
            </Label>
            <Input
              id="confirm-code"
              value={confirmCode}
              onChange={(e) => setConfirmCode(e.target.value.toUpperCase())}
              placeholder="Ketik HAPUS di sini"
              className="h-12 text-center font-mono text-lg font-bold tracking-widest"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Ketik persis "HAPUS" (huruf kapital) untuk mengaktifkan tombol hapus
            </p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(2)} className="h-11 flex-1">
              <ArrowLeft className="w-4 h-4" /> Kembali
            </Button>
            <Button
              onClick={() => deleteMutation.mutate()}
              disabled={confirmCode !== 'HAPUS' || deleteMutation.isPending}
              className="h-11 flex-1 bg-destructive hover:bg-destructive/90 text-white"
            >
              {deleteMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Menghapus...</>
              ) : (
                <><Trash2 className="w-4 h-4" /> Hapus Permanen</>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Done state */}
      {done && (
        <div className="space-y-4 text-center py-4">
          <div className="w-16 h-16 rounded-full bg-success/15 text-success flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div>
            <h3 className="font-bold text-lg">Data Berhasil Dihapus</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {done.transactions} transaksi & {done.expenses} pengeluaran telah dihapus permanen
            </p>
            <p className="text-xs text-muted-foreground mt-2">{rangeLabel}</p>
          </div>
          <Button onClick={onDone} className="h-11 w-full">
            Selesai
          </Button>
        </div>
      )}
    </div>
  )
}
