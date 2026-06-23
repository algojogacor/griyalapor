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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { formatRupiah, formatShortDate, todayISO, parseRupiahInput } from '@/lib/format'
import { getCategoryColor, getCategoryInitial } from '@/lib/category-colors'
import { toast } from 'sonner'
import { Plus, Trash2, Search, ReceiptText, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Category { id: number; name: string; group_name: string | null; default_fee: number }
interface Txn {
  id: number; date: string; qty: number; fee_per_unit: number; total: number; bill_per_unit: number; note: string | null
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
  const [bill, setBill] = useState('')
  const [note, setNote] = useState('')

  function selectCategory(id: string) {
    setCategoryId(id)
    const cat = categories.find((c) => c.id === Number(id))
    if (cat) setFee(String(cat.default_fee))
  }

  const q = parseRupiahInput(qty) || 0
  const f = parseRupiahInput(fee) || 0
  const b = parseRupiahInput(bill) || 0
  const pendapatanBersih = q * f   // fee admin yang didapat
  const omzet = q * (b + f)       // total uang dari pembeli (jika nominal diisi)

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
      setDate(todayISO()); setCategoryId(''); setQty(''); setFee(''); setBill(''); setNote('')
      setOpen(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  function submit() {
    if (!categoryId) return toast.error('Pilih kategori dulu')
    const qVal = parseRupiahInput(qty)
    if (qVal <= 0) return toast.error('Jumlah harus lebih dari 0')
    addMutation.mutate({
      category_id: Number(categoryId),
      date,
      qty: qVal,
      fee_per_unit: parseRupiahInput(fee),
      bill_per_unit: parseRupiahInput(bill),
      note: note.trim() || null,
    })
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
                <Label htmlFor="fee" className="text-sm font-medium">Fee per Pelanggan (Rp)</Label>
                <Input
                  id="fee" inputMode="numeric" value={fee}
                  onChange={(e) => setFee(formatNum(e.target.value))}
                  placeholder="3000" className="h-14 text-2xl font-bold text-center tabular-nums"
                />
                <p className="text-xs text-muted-foreground">Biaya admin. Otomatis dari kategori</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bill" className="text-sm font-medium">Nominal Tagihan per Pelanggan (opsional)</Label>
              <Input
                id="bill" inputMode="numeric" value={bill}
                onChange={(e) => setBill(formatNum(e.target.value))}
                placeholder="contoh: 200000" className="h-12 text-lg font-semibold text-center tabular-nums"
              />
              <p className="text-xs text-muted-foreground">Isi untuk menghitung omzet/kotor (uang pembeli). Boleh dikosongkan</p>
            </div>

            <div className="rounded-xl bg-primary/10 p-4 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-medium">Pendapatan Bersih (fee admin)</span>
                <span className="text-2xl font-bold tabular-nums text-primary">{formatRupiah(pendapatanBersih)}</span>
              </div>
              {b > 0 && (
                <div className="flex items-center justify-between text-sm text-muted-foreground pt-1 border-t border-primary/20">
                  <span>Omzet (uang dari pembeli)</span>
                  <span className="font-semibold tabular-nums">{formatRupiah(omzet)}</span>
                </div>
              )}
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
  const [editTxn, setEditTxn] = useState<Txn | null>(null)
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

  const grandAdmin = filtered.reduce((s, t) => s + t.total, 0)
  const grandOmzet = filtered.reduce((s, t) => s + (t.qty * (t.bill_per_unit + t.fee_per_unit)), 0)
  const hasOmzet = filtered.some((t) => t.bill_per_unit > 0)

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
            {filtered.map((t) => {
              const omzet = t.qty * (t.bill_per_unit + t.fee_per_unit)
              return (
                <div key={t.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-secondary/60 transition-colors group">
                  <div className={cn('w-11 h-11 rounded-xl flex flex-col items-center justify-center shrink-0 font-bold', getCategoryColor(t.category_group).bg, getCategoryColor(t.category_group).text)}>
                    <span className="text-[10px] leading-none opacity-70">{t.qty}x</span>
                    <span className="text-xs leading-tight">{getCategoryInitial(t.category_name)}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{t.category_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatShortDate(t.date)} · {t.qty} × {formatRupiah(t.fee_per_unit)}
                      {t.bill_per_unit > 0 ? ` (tagihan ${formatRupiah(t.bill_per_unit)})` : ''}
                      {t.note ? ` · ${t.note}` : ''}
                    </div>
                    {t.bill_per_unit > 0 && (
                      <div className="text-[11px] text-muted-foreground/80 mt-0.5">Omzet {formatRupiah(omzet)}</div>
                    )}
                  </div>
                  <div className="font-semibold text-success tabular-nums shrink-0">+{formatRupiah(t.total)}</div>
                  <button
                    onClick={() => setEditTxn(t)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-2 text-muted-foreground hover:text-primary"
                    aria-label="Edit transaksi"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteId(t.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-2 text-muted-foreground hover:text-destructive"
                    aria-label="Hapus transaksi"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )
            })}
          </div>
          <div className="mt-3 pt-3 border-t space-y-1">
            <div className="flex items-center justify-between font-semibold">
              <span>Total Pendapatan Bersih ({filtered.length} transaksi)</span>
              <span className="tabular-nums text-primary text-lg">{formatRupiah(grandAdmin)}</span>
            </div>
            {hasOmzet && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Total Omzet (uang pembeli)</span>
                <span className="tabular-nums font-medium">{formatRupiah(grandOmzet)}</span>
              </div>
            )}
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

      {editTxn && (
        <EditTransactionDialog
          txn={editTxn}
          onClose={() => setEditTxn(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['transactions'] })
            qc.invalidateQueries({ queryKey: ['summary'] })
            setEditTxn(null)
          }}
        />
      )}
    </Card>
  )
}

function EditTransactionDialog({ txn, onClose, onSaved }: { txn: Txn; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(txn.date)
  const [qty, setQty] = useState(String(txn.qty))
  const [fee, setFee] = useState(String(txn.fee_per_unit))
  const [bill, setBill] = useState(String(txn.bill_per_unit))
  const [note, setNote] = useState(txn.note ?? '')

  const q = parseRupiahInput(qty) || 0
  const f = parseRupiahInput(fee) || 0
  const b = parseRupiahInput(bill) || 0
  const bersih = q * f
  const omzet = q * (b + f)

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/transactions/${txn.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          qty: q,
          fee_per_unit: f,
          bill_per_unit: b,
          note: note.trim() || null,
        }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? 'Gagal') }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Transaksi diperbarui')
      onSaved()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Transaksi · {txn.category_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="font-medium">Tanggal</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-12" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="font-medium">Jumlah (qty)</Label>
              <Input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ''))} className="h-14 text-2xl font-bold text-center tabular-nums" />
            </div>
            <div className="space-y-1.5">
              <Label className="font-medium">Fee/Pelanggan</Label>
              <Input inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value.replace(/[^\d]/g, ''))} className="h-14 text-2xl font-bold text-center tabular-nums" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="font-medium">Nominal Tagihan/Pelanggan (opsional)</Label>
            <Input inputMode="numeric" value={bill} onChange={(e) => setBill(e.target.value.replace(/[^\d]/g, ''))} className="h-12 text-lg font-semibold text-center tabular-nums" />
          </div>
          <div className="rounded-xl bg-primary/10 p-3 space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span>Pendapatan Bersih</span>
              <span className="font-bold tabular-nums text-primary">{formatRupiah(bersih)}</span>
            </div>
            {b > 0 && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Omzet</span>
                <span className="font-semibold tabular-nums">{formatRupiah(omzet)}</span>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="font-medium">Catatan</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="h-11">Batal</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || q <= 0} className="h-11 font-semibold">
            {mutation.isPending ? 'Menyimpan...' : 'Simpan Perubahan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
