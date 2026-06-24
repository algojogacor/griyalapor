'use client'

import { useState, useRef, useEffect } from 'react'
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
import { RupiahInput } from '@/components/app/RupiahInput'
import { RecorderPicker } from '@/components/app/RecorderPicker'
import { useLastRecorder } from '@/lib/family'
import { formatRupiah, formatLongDate, todayISO, parseRupiahInput } from '@/lib/format'
import { getCategoryColor, getCategoryInitial } from '@/lib/category-colors'
import { toast } from 'sonner'
import { Plus, Trash2, Search, ReceiptText, Pencil, User, UserCircle, SlidersHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Category { id: number; name: string; group_name: string | null; default_fee: number }
interface Txn {
  id: number; date: string; qty: number; fee_per_unit: number; total: number; total_paid: number; customer_name: string | null; recorded_by: string | null; note: string | null
  category_name: string; category_group: string | null
}

export function TransactionsSection() {
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()
  const { data: catData } = useQuery({ queryKey: ['categories'], queryFn: () => fetch('/api/categories').then((r) => r.json()) })
  const categories: Category[] = catData?.categories ?? []
  const submittingRef = useRef(false)
  const { lastRecorder, setLastRecorder } = useLastRecorder()

  // Fetch summary untuk mini-stat hari ini di atas
  const { data: sumData } = useQuery({
    queryKey: ['summary'],
    queryFn: () => fetch('/api/summary').then((r) => r.json()),
  })
  const todayCount = sumData?.today?.count ?? 0
  const todayAdmin = sumData?.today?.admin ?? 0
  const todayOmzet = sumData?.today?.omzet ?? 0

  const [date, setDate] = useState(todayISO())
  const [categoryId, setCategoryId] = useState<string>('')
  const [qty, setQty] = useState('')
  const [fee, setFee] = useState('')
  const [totalPaid, setTotalPaid] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [recordedBy, setRecordedBy] = useState('')
  const [note, setNote] = useState('')

  // Default recordedBy ke last-used recorder (persist per-device)
  useEffect(() => {
    if (lastRecorder && !recordedBy) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRecordedBy(lastRecorder)
    }
  }, [lastRecorder])

  function selectCategory(id: string) {
    setCategoryId(id)
    const cat = categories.find((c) => c.id === Number(id))
    if (cat) setFee(String(cat.default_fee))
  }

  const q = parseRupiahInput(qty) || 0
  const f = parseRupiahInput(fee) || 0
  const tp = parseRupiahInput(totalPaid) || 0
  const pendapatanBersih = q * f   // fee admin yang didapat
  // omzet = total_paid langsung (uang dari pembeli), bukan dihitung per-pelanggan

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
      qc.invalidateQueries({ queryKey: ['customers'] })
      // Simpan recorder sebagai last-used (persist per-device)
      if (recordedBy) setLastRecorder(recordedBy)
      setDate(todayISO()); setCategoryId(''); setQty(''); setFee(''); setTotalPaid(''); setCustomerName(''); setNote('')
      setOpen(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  function submit() {
    if (submittingRef.current) return // anti double-submit
    if (!categoryId) return toast.error('Pilih kategori dulu')
    const qVal = parseRupiahInput(qty)
    if (qVal <= 0) return toast.error('Jumlah harus lebih dari 0')
    submittingRef.current = true
    addMutation.mutate({
      category_id: Number(categoryId),
      date,
      qty: qVal,
      fee_per_unit: parseRupiahInput(fee),
      total_paid: parseRupiahInput(totalPaid),
      customer_name: customerName.trim() || null,
      recorded_by: recordedBy || null,
      note: note.trim() || null,
    }, {
      onSettled: () => { submittingRef.current = false },
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

      {/* Mini ringkasan hari ini — context cepat tanpa harus ke Dashboard */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground leading-tight">Hari Ini</p>
          <div className="text-base sm:text-lg font-bold tabular-nums mt-0.5">{todayCount}<span className="text-xs font-normal text-muted-foreground ml-1">trx</span></div>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground leading-tight">Bersih</p>
          <div className="text-base sm:text-lg font-bold tabular-nums mt-0.5 text-success">{formatRupiah(todayAdmin)}</div>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground leading-tight">Omzet</p>
          <div className="text-base sm:text-lg font-bold tabular-nums mt-0.5 text-primary">{formatRupiah(todayOmzet)}</div>
        </Card>
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
                <RupiahInput
                  id="fee" value={fee} onChange={setFee}
                  placeholder="3.000" className="h-14 text-2xl font-bold text-center tabular-nums"
                />
                <p className="text-xs text-muted-foreground">Biaya admin. Otomatis dari kategori</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="totalpaid" className="text-sm font-medium">Total Dibayar Pembeli / Omzet (opsional)</Label>
              <RupiahInput
                id="totalpaid" value={totalPaid} onChange={setTotalPaid}
                placeholder="14.000.000" className="h-12 text-lg font-semibold text-center tabular-nums"
              />
              <p className="text-xs text-muted-foreground">Total seluruh uang dari pembeli (sudah termasuk fee). Tiap pelanggan beda nominal, jadi dijumlahkan. Boleh dikosongkan</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="customer" className="text-sm font-medium flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" /> Nama Pelanggan (opsional)
              </Label>
              <Input
                id="customer" value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                placeholder="contoh: Pak Budi" className="h-12" maxLength={100}
              />
              <p className="text-xs text-muted-foreground">Catat nama pelanggan untuk tracking siapa saja yang bayar. Boleh dikosongkan</p>
            </div>

            <RecorderPicker value={recordedBy} onChange={setRecordedBy} />

            <div className="rounded-xl bg-primary/10 p-4 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-medium">Pendapatan Bersih (fee admin)</span>
                <span className="text-2xl font-bold tabular-nums text-primary">{formatRupiah(pendapatanBersih)}</span>
              </div>
              {tp > 0 && (
                <div className="flex items-center justify-between text-sm text-muted-foreground pt-1 border-t border-primary/20">
                  <span>Omzet (uang dari pembeli)</span>
                  <span className="font-semibold tabular-nums">{formatRupiah(tp)}</span>
                </div>
              )}
              {customerName.trim() && (
                <div className="flex items-center justify-between text-sm text-muted-foreground pt-1 border-t border-primary/20">
                  <span>Pelanggan</span>
                  <span className="font-semibold truncate ml-2 max-w-[60%] text-right">{customerName.trim()}</span>
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
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [editTxn, setEditTxn] = useState<Txn | null>(null)
  const [filterRecorder, setFilterRecorder] = useState<string>('')
  const qc = useQueryClient()

  // Server-side pagination: API default limit=500, "Muat Lagi" fetch next 500
  // Frontend juga paginate client-side (visibleCount) untuk smooth rendering.
  // Jadi: API kirim 500, kita tampilkan 200 dulu, "Muat Lagi" tampilkan 200+200=400,
  // kalau perlu lebih dari 500, fetch page 2 (offset=500) dari server.
  const CLIENT_PAGE_SIZE = 200
  const SERVER_PAGE_SIZE = 500
  const [clientPage, setClientPage] = useState(0) // untuk client-side slice
  const [serverPages, setServerPages] = useState<{ transactions: Txn[]; total: number }[]>([])
  const [fetchingMore, setFetchingMore] = useState(false)

  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  if (search) params.set('q', search)

  // Initial fetch (page 1 dari server)
  const { data, isLoading } = useQuery({
    queryKey: ['transactions', from, to, search],
    queryFn: () => fetch('/api/transactions?' + params.toString()).then((r) => r.json()),
  })

  // Reset serverPages saat data awal berubah
  const dataKey = `${from}|${to}|${search}`
  const prevDataKeyRef = useRef(dataKey)
  if (prevDataKeyRef.current !== dataKey) {
    prevDataKeyRef.current = dataKey
    setServerPages([])
    setClientPage(0)
  }

  // Sync serverPages dengan data awal
  useEffect(() => {
    if (data?.transactions) {
      setServerPages([{ transactions: data.transactions, total: data.total }])
      setClientPage(0)
    }
  }, [data])

  // Gabungkan semua transaksi dari serverPages yang sudah di-fetch
  const txnsAll: Txn[] = serverPages.flatMap((p) => p.transactions)
  const totalCount: number = serverPages[0]?.total ?? data?.total ?? 0
  const hasMoreServer: boolean = data?.hasMore ?? false
  const serverOffset = txnsAll.length

  // Fetch next server page
  async function fetchMoreServer() {
    if (fetchingMore || !hasMoreServer) return
    setFetchingMore(true)
    try {
      const p = new URLSearchParams(params)
      p.set('limit', String(SERVER_PAGE_SIZE))
      p.set('offset', String(serverOffset))
      const res = await fetch('/api/transactions?' + p.toString())
      const json = await res.json()
      setServerPages((prev) => [...prev, { transactions: json.transactions, total: json.total }])
    } catch {
      toast.error('Gagal memuat transaksi lainnya')
    } finally {
      setFetchingMore(false)
    }
  }

  // Client-side filter (search, amount, recorder)
  const minVal = parseRupiahInput(minAmount) || 0
  const maxVal = parseRupiahInput(maxAmount) || 0
  const filteredAll = txnsAll.filter((t) => {
    if (search) {
      const hay = (t.category_name + ' ' + (t.customer_name ?? '') + ' ' + (t.note ?? '')).toLowerCase()
      if (!hay.includes(search.toLowerCase())) return false
    }
    if (minVal > 0 && t.total < minVal) return false
    if (maxVal > 0 && t.total > maxVal) return false
    if (filterRecorder) {
      if (filterRecorder === '__none__') {
        if (t.recorded_by) return false
      } else if (t.recorded_by !== filterRecorder) return false
    }
    return true
  })

  // Client-side pagination: tampilkan CLIENT_PAGE_SIZE * (clientPage+1) dari filteredAll
  const visibleCount = CLIENT_PAGE_SIZE * (clientPage + 1)
  const filtered = filteredAll.slice(0, visibleCount)
  // hasMore = masih ada di client slice, ATAU masih ada di server yang belum di-fetch
  const hasMoreClient = filteredAll.length > visibleCount
  const hasMore = hasMoreClient || hasMoreServer

  function loadMore() {
    if (hasMoreClient) {
      // Masih ada di client slice, tinggal tambah clientPage
      setClientPage((p) => p + 1)
    } else if (hasMoreServer) {
      // Perlu fetch server page berikutnya
      fetchMoreServer().then(() => setClientPage((p) => p + 1))
    }
  }

  const txns = filtered

  const hasAdvancedFilter = minVal > 0 || maxVal > 0

  // Build daftar recorder unik dari SEMUA transaksi yang sudah di-fetch
  const recorders = Array.from(new Set(txnsAll.map((t) => t.recorded_by).filter((x): x is string => !!x)))

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

  // Grand totals dari transaksi yang SUDAH di-load (bisa kurang dari total jika belum load semua)
  const grandAdmin = filteredAll.reduce((s, t) => s + t.total, 0)
  const grandOmzet = filteredAll.reduce((s, t) => s + t.total_paid, 0)
  const hasOmzet = filteredAll.some((t) => t.total_paid > 0)
  const allLoaded = !hasMoreServer && !hasMoreClient // true jika semua transaksi sudah di-load

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
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari kategori, pelanggan, atau catatan..." className="pl-9 h-11" />
      </div>

      {/* Advanced filter toggle */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className={cn(
            'text-xs px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5',
            showAdvanced || hasAdvancedFilter
              ? 'bg-primary/10 border-primary/30 text-primary'
              : 'bg-card hover:bg-secondary text-muted-foreground',
          )}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filter Nominal
          {hasAdvancedFilter && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
        </button>
        {hasAdvancedFilter && (
          <button
            onClick={() => { setMinAmount(''); setMaxAmount('') }}
            className="text-xs px-2.5 py-1.5 rounded-lg text-muted-foreground hover:text-destructive transition-colors"
          >
            Reset
          </button>
        )}
        {(search || from || to || hasAdvancedFilter || filterRecorder) && (
          <span className="text-xs text-muted-foreground ml-auto">
            {filteredAll.length} dari {txnsAll.length} transaksi
            {hasMore && ` · menampilkan ${filtered.length}`}
          </span>
        )}
      </div>

      {/* Advanced amount range filter */}
      {showAdvanced && (
        <div className="rounded-xl border bg-secondary/30 p-3 mb-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">Rentang Pendapatan Bersih (fee admin)</p>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <RupiahInput value={minAmount} onChange={setMinAmount} placeholder="Min: 0" className="h-10 text-sm tabular-nums" />
            </div>
            <span className="text-muted-foreground text-sm shrink-0">—</span>
            <div className="flex-1">
              <RupiahInput value={maxAmount} onChange={setMaxAmount} placeholder="Max: ∞" className="h-10 text-sm tabular-nums" />
            </div>
          </div>
          {(minVal > 0 || maxVal > 0) && (
            <p className="text-xs text-primary mt-2">
              Menampilkan transaksi dengan bersih {minVal > 0 ? formatRupiah(minVal) : 'Rp0'} – {maxVal > 0 ? formatRupiah(maxVal) : 'tanpa batas'}
            </p>
          )}
        </div>
      )}

      {/* Filter by recorder (Dicatat Oleh) — only show if there are recorders in the current data */}
      {recorders.length > 0 && (
        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
          <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
            <UserCircle className="w-3.5 h-3.5" /> Dicatat:
          </span>
          <button
            onClick={() => setFilterRecorder('')}
            className={cn(
              'text-xs px-2.5 py-1 rounded-full border transition-colors',
              filterRecorder === '' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:bg-secondary text-muted-foreground border-border/50',
            )}
          >
            Semua
          </button>
          {recorders.map((r) => (
            <button
              key={r}
              onClick={() => setFilterRecorder(filterRecorder === r ? '' : r)}
              className={cn(
                'text-xs px-2.5 py-1 rounded-full border transition-colors',
                filterRecorder === r ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:bg-secondary text-muted-foreground border-border/50',
              )}
            >
              {r}
            </button>
          ))}
          {txns.some((t) => !t.recorded_by) && (
            <button
              onClick={() => setFilterRecorder(filterRecorder === '__none__' ? '' : '__none__')}
              className={cn(
                'text-xs px-2.5 py-1 rounded-full border transition-colors',
                filterRecorder === '__none__' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:bg-secondary text-muted-foreground border-border/50',
              )}
            >
              Tidak ada
            </button>
          )}
          {filterRecorder && (
            <button
              onClick={() => setFilterRecorder('')}
              className="text-xs px-1.5 py-1 rounded-full text-muted-foreground hover:text-destructive transition-colors flex items-center gap-0.5"
              aria-label="Reset filter recorder"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : filteredAll.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <ReceiptText className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p>Belum ada transaksi pada rentang ini.</p>
        </div>
      ) : (
        <>
          <div className="space-y-3 max-h-[28rem] overflow-y-auto scroll-thin pr-1">
            {(() => {
              // Group by date (transaksi sudah sorted date DESC dari API)
              const groups: { date: string; items: Txn[] }[] = []
              for (const t of filtered) {
                const last = groups[groups.length - 1]
                if (last && last.date === t.date) last.items.push(t)
                else groups.push({ date: t.date, items: [t] })
              }
              const todayStr = todayISO()
              return groups.map((g) => {
                const dayTotal = g.items.reduce((s, t) => s + t.total, 0)
                const isToday = g.date === todayStr
                return (
                  <div key={g.date}>
                    <div className="flex items-center justify-between px-1 mb-1.5 sticky top-0 bg-card/95 backdrop-blur py-1 z-10">
                      <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                        {isToday && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                        {formatLongDate(g.date)}
                      </span>
                      <span className="text-xs font-semibold tabular-nums text-muted-foreground">{formatRupiah(dayTotal)}</span>
                    </div>
                    <div className="space-y-1.5">
                      {g.items.map((t) => {
                        return (
                          <div key={t.id} className="flex items-center gap-2 sm:gap-3 p-3 rounded-xl hover:bg-secondary/60 hover:shadow-sm transition-all group border border-transparent hover:border-border/50">
                            <div className={cn('w-11 h-11 rounded-xl flex flex-col items-center justify-center shrink-0 font-bold shadow-sm', getCategoryColor(t.category_group).bg, getCategoryColor(t.category_group).text)}>
                              <span className="text-[10px] leading-none opacity-70">{t.qty}x</span>
                              <span className="text-xs leading-tight">{getCategoryInitial(t.category_name)}</span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-medium leading-tight">{t.category_name}</div>
                              {(t.customer_name || t.recorded_by) && (
                                <div className="flex items-center gap-1 flex-wrap mt-0.5">
                                  {t.customer_name && (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary max-w-[140px]">
                                      <User className="w-2.5 h-2.5 shrink-0" /><span className="truncate">{t.customer_name}</span>
                                    </span>
                                  )}
                                  {t.recorded_by && (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-secondary text-secondary-foreground max-w-[140px]" title={`Dicatat oleh ${t.recorded_by}`}>
                                      <UserCircle className="w-2.5 h-2.5 shrink-0" /><span className="truncate">{t.recorded_by}</span>
                                    </span>
                                  )}
                                </div>
                              )}
                              <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap mt-0.5">
                                <span className="tabular-nums">{t.qty} × {formatRupiah(t.fee_per_unit)}</span>
                                {t.note && <span className="opacity-60">· {t.note}</span>}
                              </div>
                              {t.total_paid > 0 && (
                                <div className="text-[11px] text-muted-foreground/80 mt-0.5 tabular-nums">Omzet {formatRupiah(t.total_paid)}</div>
                              )}
                            </div>
                            <div className="font-bold text-success tabular-nums shrink-0 text-base sm:text-lg text-right">+{formatRupiah(t.total)}</div>
                            <div className="flex items-center gap-0.5 shrink-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => setEditTxn(t)}
                                className="p-1.5 sm:p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg"
                                aria-label="Edit transaksi"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setDeleteId(t.id)}
                                className="p-1.5 sm:p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
                                aria-label="Hapus transaksi"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })
            })()}
          </div>
          {/* Muat lagi — pagination button untuk load lebih banyak transaksi */}
          {hasMore && (
            <div className="mt-3 flex flex-col items-center gap-2">
              <Button
                variant="outline"
                onClick={loadMore}
                disabled={fetchingMore}
                className="h-11 px-6"
              >
                {fetchingMore ? (
                  'Memuat...'
                ) : (
                  `Muat Lagi (${totalCount - filtered.length} transaksi tersisa)`
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                Menampilkan {filtered.length} dari {totalCount} transaksi
              </p>
            </div>
          )}
          <div className="mt-3 pt-3 border-t space-y-1">
            <div className="flex items-center justify-between font-semibold">
              <span>Total Pendapatan Bersih ({filteredAll.length} transaksi{!allLoaded && ' dimuat'})</span>
              <span className="tabular-nums text-primary text-lg">{formatRupiah(grandAdmin)}</span>
            </div>
            {hasOmzet && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Total Omzet (uang pembeli){!allLoaded && ' (sebagian)'}</span>
                <span className="tabular-nums font-medium">{formatRupiah(grandOmzet)}</span>
              </div>
            )}
            {!allLoaded && (
              <p className="text-xs text-muted-foreground italic">
                Total dihitung dari {filteredAll.length} transaksi yang sudah dimuat. Klik "Muat Lagi" untuk memuat sisanya.
              </p>
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
  const [totalPaid, setTotalPaid] = useState(String(txn.total_paid))
  const [customerName, setCustomerName] = useState(txn.customer_name ?? '')
  const [recordedBy, setRecordedBy] = useState(txn.recorded_by ?? '')
  const [note, setNote] = useState(txn.note ?? '')

  const q = parseRupiahInput(qty) || 0
  const f = parseRupiahInput(fee) || 0
  const tp = parseRupiahInput(totalPaid) || 0
  const bersih = q * f

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/transactions/${txn.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          qty: q,
          fee_per_unit: f,
          total_paid: tp,
          customer_name: customerName.trim() || null,
          recorded_by: recordedBy || null,
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
      <DialogContent className="max-w-md" aria-describedby={undefined}>
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
              <RupiahInput value={fee} onChange={setFee} className="h-14 text-2xl font-bold text-center tabular-nums" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="font-medium">Total Dibayar Pembeli / Omzet (opsional)</Label>
            <RupiahInput value={totalPaid} onChange={setTotalPaid} className="h-12 text-lg font-semibold text-center tabular-nums" />
          </div>
          <div className="space-y-1.5">
            <Label className="font-medium flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Nama Pelanggan (opsional)</Label>
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="contoh: Pak Budi" className="h-12" maxLength={100} />
          </div>
          <RecorderPicker value={recordedBy} onChange={setRecordedBy} compact />
          <div className="rounded-xl bg-primary/10 p-3 space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span>Pendapatan Bersih</span>
              <span className="font-bold tabular-nums text-primary">{formatRupiah(bersih)}</span>
            </div>
            {tp > 0 && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Omzet</span>
                <span className="font-semibold tabular-nums">{formatRupiah(tp)}</span>
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
