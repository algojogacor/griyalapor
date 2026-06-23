'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { formatRupiah, formatShortDate, todayISO, parseRupiahInput } from '@/lib/format'
import { RupiahInput } from '@/components/app/RupiahInput'
import { toast } from 'sonner'
import { Plus, Trash2, TrendingDown, Receipt } from 'lucide-react'

interface Expense {
  id: number
  date: string
  label: string
  amount: number
  created_at: string
}

const COMMON_LABELS = ['Listrik tempat', 'Bensin ke bank', 'Internet', 'Pulsa modem', 'Air', 'Sewa tempat', 'ATK', 'Lainnya']

export function ExpensesSection() {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(todayISO())
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const qc = useQueryClient()

  const total = parseRupiahInput(amount) || 0

  const addMutation = useMutation({
    mutationFn: async (payload: { date: string; label: string; amount: number }) => {
      const res = await fetch('/api/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? 'Gagal') }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Pengeluaran dicatat')
      qc.invalidateQueries({ queryKey: ['expenses'] })
      qc.invalidateQueries({ queryKey: ['summary'] })
      setDate(todayISO()); setLabel(''); setAmount('')
      setOpen(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  function submit() {
    const l = label.trim()
    if (!l) return toast.error('Isi keterangan dulu')
    const a = parseRupiahInput(amount)
    if (a <= 0) return toast.error('Jumlah harus lebih dari 0')
    addMutation.mutate({ date, label: l, amount: a })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <TrendingDown className="w-7 h-7 text-destructive" /> Pengeluaran
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Catat biaya operasional (bensin, listrik tempat, dll)</p>
        </div>
        <Button onClick={() => setOpen((v) => !v)} variant="destructive" className="h-12 px-5 font-semibold">
          <Plus className="w-5 h-5" /> {open ? 'Tutup' : 'Catat'}
        </Button>
      </div>

      {open && (
        <Card className="p-5 border-destructive/30">
          <h2 className="font-bold text-lg mb-4">Catat Pengeluaran Baru</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edate" className="text-sm font-medium">Tanggal</Label>
                <Input id="edate" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-12" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="eamount" className="text-sm font-medium">Jumlah (Rp)</Label>
                <RupiahInput
                  id="eamount" value={amount} onChange={setAmount}
                  placeholder="50.000" className="h-14 text-2xl font-bold text-center tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="elabel" className="text-sm font-medium">Keterangan</Label>
              <Input
                id="elabel" value={label} onChange={(e) => setLabel(e.target.value)}
                placeholder="contoh: Bensin ke bank" className="h-12 text-base"
                list="expense-labels"
              />
              <datalist id="expense-labels">
                {COMMON_LABELS.map((l) => <option key={l} value={l} />)}
              </datalist>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {COMMON_LABELS.slice(0, 5).map((l) => (
                  <button
                    key={l} type="button" onClick={() => setLabel(l)}
                    className="text-xs px-2.5 py-1 rounded-full border bg-card hover:bg-secondary transition-colors"
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl bg-destructive/5 border border-destructive/20 p-4 flex items-center justify-between">
              <span className="font-medium">Total pengeluaran</span>
              <span className="text-2xl font-bold tabular-nums text-destructive">-{formatRupiah(total)}</span>
            </div>

            <div className="flex gap-2">
              <Button onClick={submit} disabled={addMutation.isPending} variant="destructive" className="h-12 flex-1 font-semibold text-base">
                {addMutation.isPending ? 'Menyimpan...' : 'Simpan Pengeluaran'}
              </Button>
              <Button variant="outline" onClick={() => setOpen(false)} className="h-12 px-5">Batal</Button>
            </div>
          </div>
        </Card>
      )}

      <ExpenseList />
    </div>
  )
}

function ExpenseList() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const qc = useQueryClient()

  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)

  const { data, isLoading } = useQuery({
    queryKey: ['expenses', from, to],
    queryFn: () => fetch('/api/expenses?' + params.toString()).then((r) => r.json()),
  })
  const expenses: Expense[] = data?.expenses ?? []

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Gagal hapus')
      return id
    },
    onSuccess: () => {
      toast.success('Pengeluaran dihapus')
      qc.invalidateQueries({ queryKey: ['expenses'] })
      qc.invalidateQueries({ queryKey: ['summary'] })
      setDeleteId(null)
    },
    onError: () => toast.error('Gagal menghapus pengeluaran'),
  })

  const grandTotal = expenses.reduce((s, e) => s + e.amount, 0)

  return (
    <Card className="p-5">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between mb-4">
        <h2 className="font-bold text-lg">Riwayat Pengeluaran</h2>
        <div className="flex flex-wrap gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10 w-auto" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-10 w-auto" />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : expenses.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <Receipt className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p>Belum ada pengeluaran pada rentang ini.</p>
          <p className="text-xs mt-1">Klik "Catat" untuk menambah pengeluaran operasional.</p>
        </div>
      ) : (
        <>
          <div className="space-y-1.5 max-h-[28rem] overflow-y-auto scroll-thin pr-1">
            {expenses.map((e) => (
              <div key={e.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-secondary/60 transition-colors group">
                <div className="w-11 h-11 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
                  <TrendingDown className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{e.label}</div>
                  <div className="text-xs text-muted-foreground">{formatShortDate(e.date)}</div>
                </div>
                <div className="font-semibold text-destructive tabular-nums shrink-0">-{formatRupiah(e.amount)}</div>
                <button
                  onClick={() => setDeleteId(e.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-2 text-muted-foreground hover:text-destructive"
                  aria-label="Hapus pengeluaran"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t flex items-center justify-between font-semibold">
            <span>Total ({expenses.length} pengeluaran)</span>
            <span className="tabular-nums text-destructive text-lg">-{formatRupiah(grandTotal)}</span>
          </div>
        </>
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus pengeluaran ini?</AlertDialogTitle>
            <AlertDialogDescription>Pengeluaran yang dihapus tidak bisa dikembalikan.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11" disabled={deleteMutation.isPending}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
              className="h-11 bg-destructive hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Menghapus...' : 'Hapus'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
