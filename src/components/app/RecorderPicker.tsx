'use client'

import { useState } from 'react'
import { useFamilyMembers } from '@/lib/family'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { UserCircle, Plus, X, Settings2, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface RecorderPickerProps {
  value: string
  onChange: (name: string) => void
  compact?: boolean
}

/**
 * Picker untuk "siapa yang mencatat" — shortcut buttons anggota keluarga.
 * Anggota disimpan di cloud (settings), sync semua device.
 */
export function RecorderPicker({ value, onChange, compact }: RecorderPickerProps) {
  const { members, addMember, removeMember } = useFamilyMembers()
  const [manageOpen, setManageOpen] = useState(false)
  const [newName, setNewName] = useState('')

  function handleAdd() {
    if (!newName.trim()) return
    addMember(newName)
    setNewName('')
    toast.success(`Anggota "${newName.trim()}" ditambahkan`)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium flex items-center gap-1.5">
          <UserCircle className="w-4 h-4" /> Dicatat Oleh
        </span>
        <button
          type="button"
          onClick={() => setManageOpen(true)}
          className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
        >
          <Settings2 className="w-3 h-3" /> Kelola
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onChange('')}
          className={cn(
            'h-9 px-3 rounded-lg text-sm font-medium border transition-all',
            value === ''
              ? 'bg-secondary text-muted-foreground border-border'
              : 'bg-card hover:bg-secondary text-muted-foreground/70 border-transparent',
          )}
        >
          —
        </button>
        {members.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            className={cn(
              'h-9 px-3 rounded-lg text-sm font-medium border transition-all flex items-center gap-1',
              value === m
                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                : 'bg-card hover:bg-secondary hover:border-primary/30 border-border/50',
            )}
          >
            {value === m && <Check className="w-3 h-3" />}
            {m}
          </button>
        ))}
      </div>
      {!compact && value && (
        <p className="text-xs text-muted-foreground">Transaksi ini akan dicatat sebagai diisi oleh <strong className="text-foreground">{value}</strong></p>
      )}

      {/* Manage members dialog */}
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-w-sm" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCircle className="w-5 h-5 text-primary" /> Kelola Anggota Keluarga
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              Anggota tersimpan di cloud, sync di semua device. Klik anggota untuk hapus.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {members.map((m) => (
                <span
                  key={m}
                  className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-secondary text-sm font-medium group"
                >
                  {m}
                  <button
                    type="button"
                    onClick={() => removeMember(m)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    aria-label={`Hapus ${m}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
                placeholder="Nama anggota baru"
                className="h-10"
                maxLength={50}
              />
              <Button onClick={handleAdd} size="sm" className="h-10 px-3 shrink-0">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setManageOpen(false)} className="h-11 w-full">Selesai</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
