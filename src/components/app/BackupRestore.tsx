'use client'

import { useState, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { Download, Upload, FileJson, AlertTriangle, Database } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BackupData {
  app: string
  version: number
  exported_at: string
  counts: { categories: number; transactions: number; expenses: number; settings: number }
  data: {
    categories: unknown[]
    transactions: unknown[]
    expenses: unknown[]
    settings: unknown[]
  }
}

interface RestoreResult {
  ok: boolean
  mode: string
  results: { categories: number; transactions: number; expenses: number; settings: number; skipped: number }
}

export function BackupRestore() {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pendingBackup, setPendingBackup] = useState<BackupData | null>(null)
  const [restoreMode, setRestoreMode] = useState<'merge' | 'replace'>('merge')
  const [restoring, setRestoring] = useState(false)

  function downloadBackup() {
    window.location.href = '/api/backup'
    toast.success('Mengunduh file backup JSON...')
  }

  function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.json') && file.type !== 'application/json') {
      toast.error('File harus berekstensi .json')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as BackupData
        if (!parsed.data?.categories || !parsed.data?.transactions) {
          toast.error('Format backup tidak valid')
          return
        }
        setPendingBackup(parsed)
      } catch {
        toast.error('Gagal membaca file JSON')
      }
    }
    reader.onerror = () => toast.error('Gagal membaca file')
    reader.readAsText(file)
  }

  async function confirmRestore() {
    if (!pendingBackup) return
    setRestoring(true)
    try {
      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: pendingBackup, mode: restoreMode }),
      })
      const data = (await res.json().catch(() => null)) as RestoreResult & { error?: string }
      if (!res.ok) throw new Error(data?.error ?? 'Gagal restore')
      const r = data.results
      toast.success(`Restore selesai`, {
        description: `${r.categories} kategori, ${r.transactions} transaksi, ${r.expenses} pengeluaran${r.skipped > 0 ? `, ${r.skipped} dilewati (duplikat)` : ''}`,
      })
      // Invalidate semua query agar data baru dimuat
      qc.invalidateQueries()
      setPendingBackup(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setRestoring(false)
    }
  }

  return (
    <Card className="p-5">
      <h2 className="font-bold text-lg mb-1 flex items-center gap-2">
        <Database className="w-5 h-5 text-primary" /> Database
      </h2>
      <p className="text-xs text-muted-foreground mb-3">
        Data tersimpan di cloud (Turso), bisa diakses dari semua device. Backup berkala disarankan untuk keamanan.
      </p>

      {/* Backup section */}
      <div className="rounded-xl border p-4 space-y-2.5">
        <div className="flex items-start gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Download className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm">Backup Data</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Unduh semua data (kategori, transaksi, pengeluaran, pengaturan) sebagai file JSON.
            </p>
          </div>
        </div>
        <Button onClick={downloadBackup} variant="outline" className="w-full h-11">
          <FileJson className="w-4 h-4" /> Unduh Backup JSON
        </Button>
      </div>

      {/* Restore section */}
      <div className="rounded-xl border p-4 space-y-2.5 mt-3">
        <div className="flex items-start gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 flex items-center justify-center shrink-0">
            <Upload className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm">Restore Data</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pulihkan data dari file backup JSON. Pilih mode gabung (aman) atau ganti total.
            </p>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
          }}
        />
        <Button onClick={() => fileRef.current?.click()} variant="outline" className="w-full h-11">
          <Upload className="w-4 h-4" /> Pilih File Backup JSON
        </Button>
      </div>

      {/* Konfirmasi restore */}
      <AlertDialog open={pendingBackup !== null} onOpenChange={(v) => !v && setPendingBackup(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" /> Konfirmasi Restore
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  File backup berisi <strong>{pendingBackup?.counts.transactions ?? 0} transaksi</strong>,{' '}
                  <strong>{pendingBackup?.counts.categories ?? 0} kategori</strong>,{' '}
                  <strong>{pendingBackup?.counts.expenses ?? 0} pengeluaran</strong>.
                </p>
                <div className="space-y-2">
                  <p className="font-medium text-foreground">Pilih mode restore:</p>
                  <label className={cn(
                    'flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors',
                    restoreMode === 'merge' ? 'border-primary bg-primary/5' : 'hover:bg-secondary',
                  )}>
                    <input
                      type="radio"
                      name="restoreMode"
                      checked={restoreMode === 'merge'}
                      onChange={() => setRestoreMode('merge')}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-medium">Gabung (aman)</p>
                      <p className="text-xs text-muted-foreground">Tambah data baru, lewati yang sudah ada (by ID). Data lama tidak hilang.</p>
                    </div>
                  </label>
                  <label className={cn(
                    'flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors',
                    restoreMode === 'replace' ? 'border-destructive bg-destructive/5' : 'hover:bg-secondary',
                  )}>
                    <input
                      type="radio"
                      name="restoreMode"
                      checked={restoreMode === 'replace'}
                      onChange={() => setRestoreMode('replace')}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-medium text-destructive">Ganti Total (berbahaya)</p>
                      <p className="text-xs text-muted-foreground">Hapus SEMUA data lama, lalu impor dari backup. Tidak bisa dibatalkan.</p>
                    </div>
                  </label>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11" disabled={restoring}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmRestore() }}
              disabled={restoring}
              className={cn('h-11', restoreMode === 'replace' ? 'bg-destructive hover:bg-destructive/90' : '')}
            >
              {restoring ? 'Memulihkan...' : restoreMode === 'replace' ? 'Ganti Total & Restore' : 'Gabung & Restore'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
