'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppStore } from '@/lib/store'
import { toast } from 'sonner'
import { Database, Type, Wallet, Tags, Sun, Moon, ShieldCheck } from 'lucide-react'
import { useTheme } from 'next-themes'
import { BackupRestore } from '@/components/app/BackupRestore'

export function SettingsSection() {
  const qc = useQueryClient()
  const { setExpensesEnabled, setSection } = useAppStore()
  const { data, isLoading } = useQuery({ queryKey: ['settings'], queryFn: () => fetch('/api/settings').then((r) => r.json()) })
  const settings: Record<string, string> = data?.settings ?? {}

  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  const updateMutation = useMutation({
    mutationFn: async (payload: Record<string, string>) => {
      const res = await fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error('Gagal menyimpan')
      return res.json()
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      if ('expenses_enabled' in vars) setExpensesEnabled(vars.expenses_enabled === '1')
      toast.success('Pengaturan disimpan')
    },
    onError: () => toast.error('Gagal menyimpan pengaturan'),
  })

  function setFontSize(size: string) {
    localStorage.setItem('gl-font-size', size)
    document.documentElement.setAttribute('data-font-size', size)
    updateMutation.mutate({ font_size: size })
  }

  const expensesEnabled = settings.expenses_enabled === '1'
  const fontSize = settings.font_size || 'medium'

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Pengaturan</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Sesuaikan aplikasi sesuai kebutuhan</p>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="space-y-4">
          {/* Tampilan */}
          <Card className="p-5">
            <h2 className="font-bold text-lg mb-4 flex items-center gap-2"><Type className="w-5 h-5 text-primary" /> Tampilan</h2>
            <div className="space-y-4">
              <div>
                <Label className="font-medium">Ukuran Huruf</Label>
                <p className="text-xs text-muted-foreground mb-2">Pilih ukuran huruf yang nyaman di mata</p>
                <Select value={fontSize} onValueChange={setFontSize}>
                  <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small" className="py-2.5">Kecil (14px) — compact</SelectItem>
                    <SelectItem value="medium" className="py-2.5">Sedang (16px) — disarankan</SelectItem>
                    <SelectItem value="large" className="py-2.5">Besar (18px)</SelectItem>
                    <SelectItem value="xlarge" className="py-2.5">Sangat Besar (20px)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-medium">Mode Tampilan</Label>
                  <p className="text-xs text-muted-foreground">Terang (disarankan) atau Gelap</p>
                </div>
                {mounted && (
                  <Button
                    variant="outline"
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    className="h-11 px-4"
                  >
                    {theme === 'dark' ? <Sun className="w-4 h-4 mr-2" /> : <Moon className="w-4 h-4 mr-2" />}
                    {theme === 'dark' ? 'Mode Terang' : 'Mode Gelap'}
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {/* Pengeluaran operasional */}
          <Card className="p-5">
            <h2 className="font-bold text-lg mb-1 flex items-center gap-2"><Wallet className="w-5 h-5 text-primary" /> Pengeluaran Operasional</h2>
            <p className="text-xs text-muted-foreground mb-4">Aktifkan untuk mencatat pengeluaran (bensin, listrik tempat, dll) dan lihat laba bersih</p>
            <div className="flex items-center justify-between">
              <Label className="font-medium">Catat pengeluaran operasional</Label>
              <Switch
                checked={expensesEnabled}
                onCheckedChange={(v) => updateMutation.mutate({ expenses_enabled: v ? '1' : '0' })}
              />
            </div>
          </Card>

          {/* Kategori */}
          <Card className="p-5">
            <h2 className="font-bold text-lg mb-1 flex items-center gap-2"><Tags className="w-5 h-5 text-primary" /> Kategori Layanan</h2>
            <p className="text-xs text-muted-foreground mb-3">Kelola daftar kategori PPOB (PLN, PDAM, BPJS, dll)</p>
            <Button variant="outline" onClick={() => setSection('categories')} className="h-11">Buka Manajemen Kategori</Button>
          </Card>

          {/* Database — Backup & Restore */}
          <BackupRestore />

          {/* Info koneksi DB */}
          <Card className="p-4 bg-secondary/30">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" />
              Koneksi: <code className="font-mono text-[10px] break-all">{process.env.NEXT_PUBLIC_TURSO_URL ?? 'libsql://ppob-algojogacorbgt.aws-ap-northeast-1.turso.io'}</code>
            </p>
          </Card>

          {/* Keamanan */}
          <Card className="p-5 border-dashed">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-success shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium">Token & kunci API aman</p>
                <p className="text-muted-foreground mt-1">
                  Kredensial Turso & Mistral disimpan di server, tidak terekspos di browser. Hanya kamu dan keluarga yang memakai app ini.
                </p>
              </div>
            </div>
          </Card>

          <p className="text-center text-xs text-muted-foreground pt-2">GriyaLapor · v1.0 · Dibuat untuk usaha PPOB</p>
        </div>
      )}
    </div>
  )
}
