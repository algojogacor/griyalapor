'use client'

import { useState, useMemo, useRef, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Papa from 'papaparse'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { formatRupiah } from '@/lib/format'
import {
  Upload,
  FileSpreadsheet,
  Download,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  FileUp,
  RotateCcw,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------- Tipe ----------
type Field = 'date' | 'category' | 'group' | 'qty' | 'fee' | 'total_paid' | 'note'
type DateFormat = 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'DD-MM-YYYY'

interface ImportResult {
  imported: number
  errors: { row: number; error: string }[]
  createdCategories: string[]
}

const FIELD_LABELS: Record<Field, string> = {
  date: 'Tanggal',
  category: 'Kategori',
  group: 'Grup',
  qty: 'Jumlah (qty)',
  fee: 'Fee per Unit',
  total_paid: 'Total Dibayar Pembeli (Omzet)',
  note: 'Catatan',
}

const FIELD_REQUIRED: Record<Field, boolean> = {
  date: true,
  category: true,
  group: false,
  qty: true,
  fee: false,
  total_paid: false,
  note: false,
}

const FIELD_HINTS: Record<Field, string> = {
  date: 'Format tanggal akan terdeteksi otomatis',
  category: 'Nama kategori/layanan (contoh: PLN, BPJS)',
  group: 'Opsional. Contoh: Listrik, Air',
  qty: 'Jumlah pelanggan/IDPEL',
  fee: 'Biaya admin per unit (Rp). Kosongkan = 0',
  total_paid: 'Total uang dari pembeli = Omzet (Rp). Opsional',
  note: 'Opsional',
}

const NO_MAPPING = '__none__'

// ---------- Deteksi otomatis ----------

function detectHeaderField(header: string): Field | null {
  const h = header.toLowerCase().trim()
  if (/(^|_)tanggal($|_)|^date$|^tgl\b|tanggal/.test(h)) return 'date'
  if (/kategori|jenis|layanan|category/.test(h)) return 'category'
  if (/grup|group/.test(h)) return 'group'
  if (/jumlah|qty|pelanggan|idpel|quantity/.test(h)) return 'qty'
  if (/fee|admin/.test(h)) return 'fee'
  if (/total.*dibayar|total.*bayar|omzet|total_paid|uang.*masuk/.test(h)) return 'total_paid'
  if (/catatan|note|ket/.test(h)) return 'note'
  return null
}

function detectDateFormat(samples: string[]): DateFormat | null {
  const nonEmpty = samples.filter((s) => s && s.trim())
  if (nonEmpty.length === 0) return null
  let ymd = 0
  let dmySlash = 0
  let dmyDash = 0
  for (const s of nonEmpty) {
    const v = s.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) ymd++
    else if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) dmySlash++
    else if (/^\d{2}-\d{2}-\d{4}$/.test(v)) dmyDash++
  }
  const half = nonEmpty.length / 2
  if (ymd >= half) return 'YYYY-MM-DD'
  if (dmySlash >= half) return 'DD/MM/YYYY'
  if (dmyDash >= half) return 'DD-MM-YYYY'
  if (ymd > 0) return 'YYYY-MM-DD'
  if (dmySlash > 0) return 'DD/MM/YYYY'
  if (dmyDash > 0) return 'DD-MM-YYYY'
  return null
}

function normalizeDate(raw: string, fmt: DateFormat | null): string {
  const s = (raw ?? '').trim()
  if (!s) return ''
  if (!fmt || fmt === 'YYYY-MM-DD') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
    const d = new Date(s)
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${dd}`
    }
    return s
  }
  if (fmt === 'DD/MM/YYYY') {
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  if (fmt === 'DD-MM-YYYY') {
    const m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return s
}

function normalizeInt(raw: string): number {
  if (!raw) return 0
  const cleaned = String(raw).replace(/[^\d-]/g, '')
  const n = parseInt(cleaned, 10)
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

// ---------- Komponen utama ----------

export function ImportSection() {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [fileName, setFileName] = useState('')
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<Partial<Record<Field, string>>>({})
  const [dateFormat, setDateFormat] = useState<DateFormat | null>(null)
  const [detectedDateFormat, setDetectedDateFormat] = useState<DateFormat | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  const handleFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
      toast.error('File harus berekstensi .csv')
      return
    }
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const allRows = (res.data ?? []) as Record<string, string>[]
        const rows = allRows.filter(
          (r) =>
            r &&
            Object.values(r).some((v) => v != null && String(v).trim() !== ''),
        )
        if (rows.length === 0) {
          toast.error('CSV kosong atau tidak ada baris data')
          return
        }
        const hdrs = (res.meta.fields ?? Object.keys(rows[0] ?? {})).filter(
          (h) => h && h.trim() !== '',
        )
        if (hdrs.length === 0) {
          toast.error('CSV tidak memiliki baris header')
          return
        }
        setRawRows(rows)
        setHeaders(hdrs)
        setFileName(file.name)

        // Auto-detect mapping
        const auto: Partial<Record<Field, string>> = {}
        for (const h of hdrs) {
          const f = detectHeaderField(h)
          if (f && !auto[f]) auto[f] = h
        }
        setMapping(auto)

        // Auto-detect date format
        if (auto.date) {
          const samples = rows
            .slice(0, 10)
            .map((r) => r[auto.date!])
            .filter(Boolean)
          const fmt = detectDateFormat(samples)
          setDetectedDateFormat(fmt)
          setDateFormat(fmt)
        } else {
          setDetectedDateFormat(null)
          setDateFormat(null)
        }

        setResult(null)
        setStep(2)
        toast.success(`Berhasil membaca ${rows.length} baris dari CSV`)
      },
      error: (err: Error) => {
        toast.error('Gagal membaca CSV: ' + err.message)
      },
    })
  }, [])

  function downloadSample() {
    const csv =
      'Tanggal,Kategori,Grup,Jumlah,Fee,Total Dibayar,Catatan\n' +
      '23/06/2026,PLN,Listrik,49,3000,14000000,Shift pagi\n' +
      '23/06/2026,BPJS,Kesehatan,12,2500,,\n'
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'contoh-impor-griyalapor.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('Contoh CSV diunduh')
  }

  // Preview 8 baris pertama
  const previewRows = useMemo(() => {
    if (step < 2) return []
    return rawRows.slice(0, 8).map((r) => {
      const dateRaw = mapping.date ? r[mapping.date] ?? '' : ''
      const date = normalizeDate(dateRaw, dateFormat)
      const category = mapping.category ? (r[mapping.category] ?? '').trim() : ''
      const group = mapping.group ? (r[mapping.group] ?? '').trim() : ''
      const qty = mapping.qty ? normalizeInt(r[mapping.qty] ?? '') : 0
      const fee = mapping.fee ? normalizeInt(r[mapping.fee] ?? '') : 0
      const totalPaid = mapping.total_paid ? normalizeInt(r[mapping.total_paid] ?? '') : 0
      const note = mapping.note ? (r[mapping.note] ?? '').trim() : ''
      return { date, category, group, qty, fee, totalPaid, bersih: qty * fee, omzet: totalPaid, note }
    })
  }, [step, rawRows, mapping, dateFormat])

  // Validasi mapping wajib
  const missingRequired: Field[] = useMemo(() => {
    const out: Field[] = []
    const required: Field[] = ['date', 'category', 'qty']
    for (const f of required) {
      if (!mapping[f]) out.push(f)
    }
    return out
  }, [mapping])

  const importMutation = useMutation({
    mutationFn: async (payload: {
      rows: {
        date: string
        category: string
        group: string | null
        qty: number
        fee_per_unit: number
        total_paid: number
        note: string | null
      }[]
      createMissing: boolean
    }) => {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await res.json().catch(() => null)) as ImportResult & {
        error?: string
      }
      if (!res.ok) throw new Error(data?.error ?? 'Gagal impor')
      return data
    },
    onSuccess: (data) => {
      setResult(data)
      setStep(3)
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['summary'] })
      qc.invalidateQueries({ queryKey: ['categories'] })
      if (data.errors.length > 0) {
        toast.warning(`Berhasil impor ${data.imported}, ${data.errors.length} baris gagal`)
      } else {
        toast.success(`Berhasil mengimpor ${data.imported} transaksi`)
      }
    },
    onError: (e: Error) => toast.error(e.message),
  })

  function doImport() {
    if (missingRequired.length > 0) {
      toast.error(
        'Lengkapi pemetaan kolom wajib: ' +
          missingRequired.map((f) => FIELD_LABELS[f]).join(', '),
      )
      return
    }
    const rows = rawRows.map((r) => {
      const dateRaw = mapping.date ? r[mapping.date] ?? '' : ''
      const category = mapping.category ? (r[mapping.category] ?? '').trim() : ''
      const group = mapping.group ? (r[mapping.group] ?? '').trim() : null
      const qty = mapping.qty ? normalizeInt(r[mapping.qty] ?? '') : 0
      const fee = mapping.fee ? normalizeInt(r[mapping.fee] ?? '') : 0
      const totalPaid = mapping.total_paid ? normalizeInt(r[mapping.total_paid] ?? '') : 0
      const note = mapping.note ? (r[mapping.note] ?? '').trim() : null
      return {
        date: normalizeDate(dateRaw, dateFormat),
        category,
        group: group || null,
        qty,
        fee_per_unit: fee,
        total_paid: totalPaid,
        note: note || null,
      }
    })
    importMutation.mutate({ rows, createMissing: true })
  }

  function reset() {
    setStep(1)
    setFileName('')
    setRawRows([])
    setHeaders([])
    setMapping({})
    setDateFormat(null)
    setDetectedDateFormat(null)
    setResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function setFieldMapping(f: Field, value: string) {
    setMapping((m) => {
      const next = { ...m }
      if (value === NO_MAPPING || value === '') delete next[f]
      else next[f] = value
      return next
    })
    // Re-detect date format when date column changes
    if (f === 'date') {
      const col = value && value !== NO_MAPPING ? value : undefined
      if (col) {
        const samples = rawRows
          .slice(0, 10)
          .map((r) => r[col])
          .filter(Boolean)
        const fmt = detectDateFormat(samples)
        setDetectedDateFormat(fmt)
        setDateFormat(fmt)
      } else {
        setDetectedDateFormat(null)
        setDateFormat(null)
      }
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Impor CSV</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Impor banyak transaksi sekaligus dari file CSV
        </p>
      </div>

      {/* Indikator langkah */}
      <div className="flex items-center gap-2">
        {([
          { n: 1 as const, label: 'Upload' },
          { n: 2 as const, label: 'Pemetaan' },
          { n: 3 as const, label: 'Konfirmasi' },
        ]).map((s, i) => (
          <div key={s.n} className="flex items-center gap-2 flex-1">
            <div
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex-1',
                step >= s.n
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground',
              )}
            >
              <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold shrink-0">
                {s.n}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < 2 && (
              <div
                className={cn(
                  'h-0.5 w-6 transition-colors',
                  step > s.n ? 'bg-primary' : 'bg-border',
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 1 && (
        <Card className="p-5 md:p-7">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
              <FileUp className="w-8 h-8" />
            </div>
            <h2 className="font-bold text-lg">Unggah File CSV</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Pilih file CSV berisi transaksi. Header kolom akan dideteksi
              otomatis pada langkah berikutnya.
            </p>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              const f = e.dataTransfer.files?.[0]
              if (f) handleFile(f)
            }}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                fileInputRef.current?.click()
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="Unggah file CSV"
            className={cn(
              'mt-5 border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
              dragOver
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50 hover:bg-secondary/50',
            )}
          >
            <Upload className="w-10 h-10 mx-auto mb-2 text-muted-foreground" />
            <p className="font-medium">
              Tarik file ke sini atau klik untuk memilih
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Format .csv · contoh sudah disediakan
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />
          </div>

          <div className="mt-4 flex justify-center">
            <Button onClick={downloadSample} variant="outline" className="h-11">
              <Download className="w-4 h-4" /> Unduh Contoh CSV
            </Button>
          </div>

          <div className="mt-5 rounded-xl bg-secondary/60 p-4 text-sm">
            <p className="font-semibold mb-1.5 flex items-center gap-1.5">
              <FileSpreadsheet className="w-4 h-4 text-primary" /> Format CSV yang diharapkan
            </p>
            <p className="text-muted-foreground">
              Baris pertama harus berisi nama kolom. Contoh kolom yang dikenali:
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {['Tanggal', 'Kategori', 'Grup', 'Jumlah', 'Fee', 'Catatan'].map(
                (c) => (
                  <Badge key={c} variant="secondary" className="font-mono">
                    {c}
                  </Badge>
                ),
              )}
            </div>
            <p className="text-muted-foreground mt-2 text-xs">
              Sinonim yang dikenali: Tanggal → Date/Tgl, Kategori →
              Jenis/Layanan, Jumlah → Qty/IDPEL, Fee → Admin, Total Dibayar → Omzet/Uang Masuk, Catatan → Note/Ket,
              Grup → Group.
            </p>
          </div>
        </Card>
      )}

      {/* Step 2: Pemetaan */}
      {step === 2 && (
        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="min-w-0">
                <h2 className="font-bold text-lg">Pemetaan Kolom</h2>
                <p className="text-sm text-muted-foreground truncate">
                  File: <span className="font-medium text-foreground">{fileName}</span> ·{' '}
                  {rawRows.length} baris terdeteksi
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={reset} className="shrink-0">
                <X className="w-4 h-4" /> Ganti File
              </Button>
            </div>

            {missingRequired.length > 0 && (
              <div className="mb-4 rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  Kolom wajib belum dipetakan:{' '}
                  <strong>
                    {missingRequired.map((f) => FIELD_LABELS[f]).join(', ')}
                  </strong>
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(
                ['date', 'category', 'group', 'qty', 'fee', 'total_paid', 'note'] as Field[]
              ).map((f) => (
                <div key={f} className="space-y-1.5">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    {FIELD_LABELS[f]}
                    {FIELD_REQUIRED[f] ? (
                      <span className="text-destructive">*</span>
                    ) : (
                      <span className="text-xs text-muted-foreground font-normal">
                        (opsional)
                      </span>
                    )}
                  </Label>
                  <Select
                    value={mapping[f] ?? NO_MAPPING}
                    onValueChange={(v) => setFieldMapping(f, v)}
                  >
                    <SelectTrigger className="h-12 w-full">
                      <SelectValue placeholder="Pilih kolom CSV..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {!FIELD_REQUIRED[f] && (
                        <SelectItem value={NO_MAPPING}>— Tidak Dipakai —</SelectItem>
                      )}
                      {headers.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{FIELD_HINTS[f]}</p>
                </div>
              ))}
            </div>

            {/* Deteksi format tanggal */}
            {mapping.date && (
              <div className="mt-5 rounded-xl bg-secondary/60 p-4">
                <p className="text-sm font-medium">Format Tanggal</p>
                {detectedDateFormat ? (
                  <p className="text-sm text-success mt-1 flex items-center gap-1.5 flex-wrap">
                    <CheckCircle2 className="w-4 h-4" />
                    Terdeteksi otomatis:{' '}
                    <code className="bg-background px-1.5 py-0.5 rounded text-xs font-mono">
                      {detectedDateFormat}
                    </code>
                    <span className="text-xs text-muted-foreground">
                      (ubah bila salah)
                    </span>
                  </p>
                ) : (
                  <p className="text-sm text-warning mt-1 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    Format tanggal tidak dikenali otomatis. Pilih manual di bawah.
                  </p>
                )}
                <Select
                  value={dateFormat ?? ''}
                  onValueChange={(v) => setDateFormat(v as DateFormat)}
                >
                  <SelectTrigger className="h-10 w-full mt-2">
                    <SelectValue placeholder="Pilih format tanggal..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="YYYY-MM-DD">
                      YYYY-MM-DD (contoh: 2026-06-23)
                    </SelectItem>
                    <SelectItem value="DD/MM/YYYY">
                      DD/MM/YYYY (contoh: 23/06/2026)
                    </SelectItem>
                    <SelectItem value="DD-MM-YYYY">
                      DD-MM-YYYY (contoh: 23-06-2026)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </Card>

          {/* Pratinjau data */}
          <Card className="p-5">
            <h2 className="font-bold text-lg mb-1">Pratinjau Data</h2>
            <p className="text-sm text-muted-foreground mb-3">
              8 baris pertama · Bersih = Jumlah × Fee · Omzet = Total Dibayar Pembeli
            </p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead className="hidden sm:table-cell">Grup</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Fee</TableHead>
                    <TableHead className="text-right">Bersih</TableHead>
                    <TableHead className="text-right hidden md:table-cell">Omzet</TableHead>
                    <TableHead className="hidden md:table-cell">Catatan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">
                        {r.date || (
                          <span className="text-destructive">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.category || (
                          <span className="text-destructive">—</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground">
                        {r.group || '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.qty || (
                          <span className="text-destructive">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRupiah(r.fee)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold text-success">
                        {formatRupiah(r.bersih)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums hidden md:table-cell text-muted-foreground">
                        {r.totalPaid > 0 ? formatRupiah(r.omzet) : '—'}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground text-xs">
                        {r.note || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {previewRows.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="text-center text-muted-foreground py-6"
                      >
                        Tidak ada baris untuk dipratinjau.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={reset}
              className="h-12 px-5"
            >
              <ArrowLeft className="w-4 h-4" /> Mulai Lagi
            </Button>
            <Button
              onClick={doImport}
              disabled={missingRequired.length > 0 || importMutation.isPending}
              className="h-12 flex-1 font-semibold text-base"
            >
              {importMutation.isPending ? (
                'Mengimpor...'
              ) : (
                <>
                  Impor {rawRows.length} Transaksi{' '}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Hasil */}
      {step === 3 && result && (
        <Card className="p-5 md:p-7">
          <div className="text-center">
            <div
              className={cn(
                'w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3',
                result.errors.length > 0
                  ? 'bg-warning/15 text-warning'
                  : 'bg-success/15 text-success',
              )}
            >
              {result.errors.length > 0 ? (
                <AlertTriangle className="w-8 h-8" />
              ) : (
                <CheckCircle2 className="w-8 h-8" />
              )}
            </div>
            <h2 className="font-bold text-xl">Impor Selesai</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Berhasil mengimpor{' '}
              <span className="font-bold text-success">{result.imported}</span>{' '}
              transaksi
            </p>
          </div>

          {result.createdCategories.length > 0 && (
            <div className="mt-5 rounded-xl bg-primary/10 p-4">
              <p className="text-sm font-medium flex items-center gap-1.5 mb-2">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                {result.createdCategories.length} kategori baru dibuat:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {result.createdCategories.map((c) => (
                  <Badge key={c} variant="secondary">
                    {c}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {result.errors.length > 0 && (
            <div className="mt-5 rounded-xl bg-destructive/10 border border-destructive/30 p-4">
              <p className="text-sm font-medium text-destructive flex items-center gap-1.5 mb-2">
                <AlertTriangle className="w-4 h-4" />
                {result.errors.length} baris gagal diimpor:
              </p>
              <div className="max-h-60 overflow-y-auto scroll-thin space-y-1 pr-1">
                {result.errors.map((e, i) => (
                  <div
                    key={i}
                    className="text-sm flex items-start gap-2 py-1 border-b border-destructive/20 last:border-0"
                  >
                    <Badge
                      variant="outline"
                      className="text-destructive border-destructive/40 shrink-0"
                    >
                      Baris {e.row}
                    </Badge>
                    <span className="text-destructive/90">{e.error}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
            <Button onClick={reset} className="h-12 px-6 font-semibold">
              <RotateCcw className="w-4 h-4" /> Impor Lagi
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
