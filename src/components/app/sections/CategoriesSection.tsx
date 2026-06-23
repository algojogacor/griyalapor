'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import { formatRupiah, parseRupiahInput } from '@/lib/format'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, ChevronDown, Tags, FolderTree } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Category { id: number; name: string; group_name: string | null; default_fee: number }

export function CategoriesSection() {
  const { data, isLoading } = useQuery({ queryKey: ['categories'], queryFn: () => fetch('/api/categories').then((r) => r.json()) })
  const categories: Category[] = data?.categories ?? []
  const groups = groupCategories(categories)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [name, setName] = useState('')
  const [group, setGroup] = useState('')
  const [fee, setFee] = useState('')
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const qc = useQueryClient()

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { name: name.trim(), group: group.trim() || null, default_fee: parseRupiahInput(fee) }
      if (editing) {
        const res = await fetch(`/api/categories/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? 'Gagal') }
      } else {
        const res = await fetch('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? 'Gagal') }
      }
    },
    onSuccess: () => {
      toast.success(editing ? 'Kategori diperbarui' : 'Kategori ditambahkan')
      qc.invalidateQueries({ queryKey: ['categories'] })
      qc.invalidateQueries({ queryKey: ['summary'] })
      setDialogOpen(false); setEditing(null); setName(''); setGroup(''); setFee('')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? 'Gagal') }
    },
    onSuccess: () => {
      toast.success('Kategori dihapus')
      qc.invalidateQueries({ queryKey: ['categories'] })
      setDeleteId(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  function openNew() {
    setEditing(null); setName(''); setGroup(''); setFee(''); setDialogOpen(true)
  }
  function openEdit(c: Category) {
    setEditing(c); setName(c.name); setGroup(c.group_name ?? ''); setFee(String(c.default_fee)); setDialogOpen(true)
  }

  const existingGroups = Array.from(new Set(categories.map((c) => c.group_name).filter(Boolean))) as string[]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Kategori Layanan</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{categories.length} kategori PPOB terdaftar</p>
        </div>
        <Button onClick={openNew} className="h-12 px-5 font-semibold">
          <Plus className="w-5 h-5" /> Tambah
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : Object.keys(groups).length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          <Tags className="w-10 h-10 mx-auto mb-2 opacity-40" />
          Belum ada kategori.
        </Card>
      ) : (
        <div className="space-y-3">
          {Object.entries(groups).sort().map(([groupName, cats]) => (
            <CategoryGroup
              key={groupName}
              groupName={groupName}
              cats={cats}
              onEdit={openEdit}
              onDelete={(id) => setDeleteId(id)}
            />
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Kategori' : 'Tambah Kategori Baru'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="font-medium">Nama Kategori</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="contoh: PLN Prabayar" className="h-12" />
            </div>
            <div className="space-y-1.5">
              <Label className="font-medium">Grup</Label>
              <Input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="contoh: Listrik" list="group-list" className="h-12" />
              <datalist id="group-list">{existingGroups.map((g) => <option key={g} value={g} />)}</datalist>
              <p className="text-xs text-muted-foreground">Kategori dengan grup sama akan dikelompokkan bersama</p>
            </div>
            <div className="space-y-1.5">
              <Label className="font-medium">Fee Default (Rp)</Label>
              <Input
                value={fee} onChange={(e) => setFee(e.target.value.replace(/[^\d]/g, ''))}
                inputMode="numeric" placeholder="3000" className="h-14 text-xl font-bold text-center tabular-nums"
              />
              <p className="text-xs text-muted-foreground">Fee otomatis terisi saat catat transaksi, bisa diubah per transaksi</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="h-11">Batal</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !name.trim()} className="h-11 font-semibold">
              {saveMutation.isPending ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus kategori ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Kategori hanya bisa dihapus jika tidak ada transaksi terkait. Transaksi historis akan tetap aman.
            </AlertDialogDescription>
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
    </div>
  )
}

function CategoryGroup({ groupName, cats, onEdit, onDelete }: { groupName: string; cats: Category[]; onEdit: (c: Category) => void; onDelete: (id: number) => void }) {
  const [open, setOpen] = useState(true)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="overflow-hidden">
        <CollapsibleTrigger className="w-full flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <FolderTree className="w-5 h-5" />
            </div>
            <div className="text-left">
              <div className="font-semibold">{groupName}</div>
              <div className="text-xs text-muted-foreground">{cats.length} layanan</div>
            </div>
          </div>
          <ChevronDown className={cn('w-5 h-5 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="divide-y">
            {cats.map((c) => (
              <div key={c.id} className="flex items-center gap-3 p-3 pl-4 group">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{c.name}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Fee default</div>
                  <div className="font-semibold tabular-nums">{formatRupiah(c.default_fee)}</div>
                </div>
                <button onClick={() => onEdit(c)} className="p-2 text-muted-foreground hover:text-primary" aria-label="Edit">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => onDelete(c.id)} className="p-2 text-muted-foreground hover:text-destructive" aria-label="Hapus">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
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
