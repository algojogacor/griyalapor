'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { formatRupiah, formatShortDate, todayISO, parseRupiahInput } from '@/lib/format'
import { toast } from 'sonner'
import { Plus, Trash2, Search, ReceiptText } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Category { id: number; name: string; group_name: string | null; default_fee: number }
interface Txn {
  id: number; date: string; qty: number; fee_per_unit: number; total: number; note: string | null
  category_name: string; category_group: string | null
}

export function TransactionsSection() {
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()
  const { data: catData } = useQuery({ queryKey: ['categories'], queryFn: () => fetch('/api/categories').then((r) => r.json()) })
  const categories: Category[] = catData?.categories ?? []

  const [date, setDate] = useState(todayISO())
  const [categoryId, setCategoryId] = useState<string>('')
  const [qty, setQty] = useState('')
  const [fee, setFee] = useState('')
  const [note, setNote] = useState('')

  function selectCategory(id: string) {
    setCategoryId(id)
    const cat = categories.find((c) => c.id === Number(id))
    if (cat) setFee(String(cat.default_fee))
  }

  const total = (parseRupiahInput(qty) || 0) * (parseRupiahInput(fee) || 0)

  const addMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch('/api/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? 'Gagal') }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Transaksi berhasil dicatat')
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['summary'] })
      setDate(todayISO()); setCategoryId(''); setQty(''); setFee(''); setNote('')
      setOpen(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  function submit() {
    if (!categoryId) return toast.error('Pilih kategori dulu')
    const q = parseRupiahInput(qty)
    if (q <= 0) return toast.error('Jumlah harus lebih dari 0')
    addMutation.mutate({ category_id: Number(categoryId), date, qty: q, fee_per_unit: parseRupiahInput(fee), note: note.trim() || null })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Transaksi</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Catat dan lihat semua transaksi harian</p>
        </div>
        <Button onClick={() => setOpen((v) => !v)} className="h-12 px-5 font-semibold">
          <Plus className="w-5 h-5" /> {open ? 'Tutup' : 'Catat'}
        </Button>
      </div>

      {open && (
        <Card className="p-5 border-primary/30">
          <h2 className="font-bold text-lg mb-4">Catat Transaksi Baru</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="date" className="text-sm font-medium">Tanggal</Label>
                <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-12" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Kategori</Label>
                <Select value={categoryId} onValueChange={selectCategory}>
                  <SelectTrigger className="h-12"><SelectValue placeholder="Pilih kategori" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {Object.entries(groupCategories(categories)).map(([group, cats]) => (
                      <div key={group}>
                        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase">{group}</div>
                        {cats.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)} className="py-2.5">
                            <span className="flex items-center justify-between w-full">
                              <span>{c.name}</span>
                              <span className="text-xs text-muted-foreground ml-2">{formatRupiah(c.default_fee)}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="qty" className="text-sm font-medium">Jumlah (qty)</Label>
                <Input
                  id="qty" inputMode="numeric" value={qty}
                  onChange={(e) => setQty(formatNum(e.target.value))}
                  placeholder="contoh: 49" className="h-14 text-2xl font-bold text-center tabular-nums"
                />
                <p className="text-xs text-muted-foreground">Jumlah IDPEL/pelanggan</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fee" className="text-sm font-medium">Fee per Unit (Rp)</Label>
                <Input
                  id="fee" inputMode="numeric" value={fee}
                  onChange={(e) => setFee(formatNum(e.target.value))}
                  placeholder="3000" className="h-14 text-2xl font-bold text-center tabular-nums"
                />
                <p className="text-xs text-muted-foreground">Otomatis dari kategori, bisa diubah</p>
              </div>
            </div>

            <div className="rounded-xl bg-primary/10 p-4 flex items-center justify-between">
              <span className="font-medium">Total pendapatan</span>
              <span className="text-2xl font-bold tabular-nums text-primary">{formatRupiah(total)}</span>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="note" className="text-sm font-medium">Catatan (opsional)</Label>
              <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Contoh: shift sore" />
            </div>

            <div className="flex gap-2">
              <Button onClick={submit} disabled={addMutation.isPending} className="h-12 flex-1 font-semibold text-base">
                {addMutation.isPending ? 'Menyimpan...' : 'Simpan Transaksi'}
              </Button>
              <Button variant="outline" onClick={() => setOpen(false)} className="h-12 px-5">Batal</Button>
            </div>
          </div>
        </Card>
      )}

      <TransactionList />
    </div>
  )
}

function TransactionList() {
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const qc = useQueryClient()

  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  if (search) params.set('q', search)

  const { data, isLoading } = useQuery({
    queryKey: ['transactions', from, to],
    queryFn: () => fetch('/api/transactions?' + params.toString()).then((r) => r.json()),
  })
  const txns: Txn[] = data?.transactions ?? []
  const filtered = search
    ? txns.filter((t) => (t.category_name + ' ' + (t.note ?? '')).toLowerCase().includes(search.toLowerCase()))
    : txns

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Gagal hapus')
      return id
    },
    onSuccess: () => {
      toast.success('Transaksi dihapus')
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['summary'] })
      setDeleteId(null)
    },
    onError: () => toast.error('Gagal menghapus transaksi'),
  })

  const grandTotal = filtered.reduce((s, t) => s + t.total, 0)

  return (
    <Card className="p-5">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between mb-4">
        <h2 className="font-bold text-lg">Riwayat Transaksi</h2>
        <div className="flex flex-wrap gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10 w-auto" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-10 w-auto" />
        </div>
      </div>

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari kategori atau catatan..." className="pl-9 h-11" />
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <ReceiptText className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p>Belum ada transaksi pada rentang ini.</p>
        </div>
      ) : (
        <>
          <div className="space-y-1.5 max-h-[28rem] overflow-y-auto scroll-thin pr-1">
            {filtered.map((t) => (
              <div key={t.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-secondary/60 transition-colors group">
                <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0">
                  {t.qty}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{t.category_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatShortDate(t.date)} · {t.qty} × {formatRupiah(t.fee_per_unit)}
                    {t.note ? ` · ${t.note}` : ''}
                  </div>
                </div>
                <div className="font-semibold text-success tabular-nums shrink-0">+{formatRupiah(t.total)}</div>
                <button
                  onClick={() => setDeleteId(t.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-2 text-muted-foreground hover:text-destructive"
                  aria-label="Hapus transaksi"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t flex items-center justify-between font-semibold">
            <span>Total ({filtered.length} transaksi)</span>
            <span className="tabular-nums text-primary text-lg">{formatRupiah(grandTotal)}</span>
          </div>
        </>
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus transaksi ini?</AlertDialogTitle>
            <AlertDialogDescription>Transaksi yang dihapus tidak bisa dikembalikan.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="h-11 bg-destructive hover:bg-destructive/90"
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

function groupCategories(cats: Category[]): Record<string, Category[]> {
  const out: Record<string, Category[]> = {}
  for (const c of cats) {
    const g = c.group_name ?? 'Lainnya'
    ;(out[g] ??= []).push(c)
  }
  return out
}

function formatNum(s: string): string {
  return s.replace(/[^\d]/g, '')
}
