'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RupiahInput } from '@/components/app/RupiahInput'
import { toast } from 'sonner'
import { formatRupiah, parseRupiahInput } from '@/lib/format'
import { getCategoryColor, getCategoryInitial } from '@/lib/category-colors'
import { ArrowUp, ArrowDown, Plus, Trash2, RotateCcw, GripVertical, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Category {
  id: number
  name: string
  group_name: string | null
  default_fee: number
}

// Item di Akses Cepat: category_id + optional custom fee override
export interface QuickAccessItem {
  id: number
  fee?: number // null/undefined = pakai default_fee kategori
}

interface ManageQuickAccessDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ManageQuickAccessDialog({ open, onOpenChange }: ManageQuickAccessDialogProps) {
  const qc = useQueryClient()
  const { data: catData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => fetch('/api/categories').then((r) => r.json()),
  })
  const categories: Category[] = catData?.categories ?? []

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => fetch('/api/settings').then((r) => r.json()),
  })

  // State lokal: daftar item Akses Cepat
  const [items, setItems] = useState<QuickAccessItem[]>([])
  const [addingCatId, setAddingCatId] = useState<string>('')
  const [loaded, setLoaded] = useState(false)

  // Load dari settings saat dialog dibuka
  useEffect(() => {
    if (!open || loaded || !categories.length) return
    const raw = settings?.settings?.quick_access
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as QuickAccessItem[]
        if (Array.isArray(parsed)) {
          // Filter hanya kategori yang masih ada (mungkin sudah dihapus)
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setItems(parsed.filter((it) => categories.some((c) => c.id === it.id)))
        }
      } catch {
        setItems([])
      }
    }
    setLoaded(true)
  }, [open, categories, settings])

  function reset() {
    setItems([])
    setAddingCatId('')
    setLoaded(false)
  }

  const saveMutation = useMutation({
    mutationFn: async (newItems: QuickAccessItem[]) => {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quick_access: JSON.stringify(newItems) }),
      })
      if (!res.ok) throw new Error('Gagal menyimpan')
      return res.json()
    },
    onSuccess: () => {
      toast.success('Akses Cepat disimpan')
      qc.invalidateQueries({ queryKey: ['settings'] })
      onOpenChange(false)
      setTimeout(() => reset(), 200)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  function addItem(catId: number) {
    if (items.some((it) => it.id === catId)) {
      toast.info('Kategori sudah ada di Akses Cepat')
      return
    }
    const cat = categories.find((c) => c.id === catId)
    if (!cat) return
    setItems((prev) => [...prev, { id: catId }])
    setAddingCatId('')
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  function moveItem(idx: number, dir: -1 | 1) {
    setItems((prev) => {
      const next = [...prev]
      const target = idx + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }

  function setItemFee(idx: number, fee: string) {
    const val = parseRupiahInput(fee)
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, fee: val } : it)))
  }

  function clearCustomFee(idx: number) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, fee: undefined } : it)))
  }

  function save() {
    saveMutation.mutate(items)
  }

  function resetToAuto() {
    saveMutation.mutate([])
  }

  const availableToAdd = categories.filter((c) => !items.some((it) => it.id === c.id))

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setTimeout(() => reset(), 200) }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto scroll-thin" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GripVertical className="w-5 h-5 text-primary" /> Kelola Akses Cepat
          </DialogTitle>
          <p className="text-sm text-muted-foreground font-normal">
            Atur kategori yang tampil di Akses Cepat Dashboard. Ubah urutan, hapus, tambah, dan atur fee admin khusus.
          </p>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Daftar item saat ini */}
          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              Belum ada item. Tambahkan kategori di bawah, atau kosongkan untuk mode otomatis (otomatis pilih kategori teratas).
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((it, idx) => {
                const cat = categories.find((c) => c.id === it.id)
                if (!cat) return null
                const color = getCategoryColor(cat.group_name)
                const effectiveFee = it.fee ?? cat.default_fee
                const hasOverride = it.fee !== undefined
                return (
                  <div key={it.id} className="rounded-xl border p-3 space-y-2 bg-card">
                    <div className="flex items-center gap-2.5">
                      <div className="flex flex-col gap-0.5">
                        <button
                          onClick={() => moveItem(idx, -1)}
                          disabled={idx === 0}
                          className="p-0.5 text-muted-foreground hover:text-primary disabled:opacity-20 disabled:cursor-not-allowed"
                          aria-label="Naikkan urutan"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => moveItem(idx, 1)}
                          disabled={idx === items.length - 1}
                          className="p-0.5 text-muted-foreground hover:text-primary disabled:opacity-20 disabled:cursor-not-allowed"
                          aria-label="Turunkan urutan"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs shrink-0', color.bg, color.text)}>
                        {getCategoryInitial(cat.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate">{cat.name}</div>
                        <div className="text-xs text-muted-foreground">{cat.group_name ?? 'Lainnya'}</div>
                      </div>
                      <button
                        onClick={() => removeItem(idx)}
                        className="p-2 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                        aria-label={`Hapus ${cat.name} dari Akses Cepat`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2 pl-[52px]">
                      <Label className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
                        <Pencil className="w-3 h-3" /> Fee:
                      </Label>
                      <RupiahInput
                        value={String(effectiveFee)}
                        onChange={(v) => setItemFee(idx, v)}
                        className="h-9 text-sm font-semibold tabular-nums flex-1"
                      />
                      {hasOverride && (
                        <button
                          onClick={() => clearCustomFee(idx)}
                          className="text-xs text-muted-foreground hover:text-primary shrink-0 px-2"
                          title={`Kembali ke default (${formatRupiah(cat.default_fee)})`}
                        >
                          reset
                        </button>
                      )}
                      {hasOverride && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 shrink-0">kustom</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Tambah kategori */}
          {availableToAdd.length > 0 && (
            <div className="rounded-xl bg-secondary/50 p-3 space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Plus className="w-4 h-4" /> Tambah Kategori
              </Label>
              <Select value={addingCatId} onValueChange={setAddingCatId}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue placeholder="Pilih kategori untuk ditambahkan..." />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {availableToAdd.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)} className="py-2.5">
                      <span className="flex items-center justify-between w-full">
                        <span>{c.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">{formatRupiah(c.default_fee)}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {addingCatId && (
                <Button
                  onClick={() => addItem(Number(addingCatId))}
                  className="h-10 w-full"
                  size="sm"
                >
                  <Plus className="w-4 h-4" /> Tambah ke Akses Cepat
                </Button>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="ghost"
            onClick={resetToAuto}
            disabled={saveMutation.isPending}
            className="h-11 sm:mr-auto text-muted-foreground"
            title="Kosongkan daftar — Dashboard akan otomatis pilih kategori teratas"
          >
            <RotateCcw className="w-4 h-4" /> Mode Otomatis
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-11">
            Batal
          </Button>
          <Button onClick={save} disabled={saveMutation.isPending} className="h-11 font-semibold">
            {saveMutation.isPending ? 'Menyimpan...' : 'Simpan Akses Cepat'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
