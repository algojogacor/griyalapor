/**
 * Utilitas format untuk GriyaLapor.
 * Semua angka disimpan sebagai integer rupiah (tanpa desimal).
 */

const IDR = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})

const NUM = new Intl.NumberFormat('id-ID')

/** Format integer rupiah -> "Rp147.000" */
export function formatRupiah(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return 'Rp0'
  return IDR.format(Math.round(value))
}

/** Format angka biasa -> "1.234" */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '0'
  return NUM.format(Math.round(value))
}

/** Parse string input ke integer. "1.500" -> 1500, "147000" -> 147000 */
export function parseRupiahInput(input: string): number {
  const cleaned = input.replace(/[^\d]/g, '')
  return cleaned ? parseInt(cleaned, 10) : 0
}

const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

const DAYS_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

/** Tanggal hari ini (Asia/Jakarta) dalam format YYYY-MM-DD */
export function todayISO(): string {
  return formatDateISO(new Date())
}

/** Format Date -> YYYY-MM-DD (timezone-aware via toISOString slicing of local) */
export function formatDateISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** "2026-06-23" -> "23 Jun 2026" */
export function formatShortDate(iso: string): string {
  const d = parseISODate(iso)
  if (!d) return iso
  return `${d.getDate()} ${MONTHS_ID[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`
}

/** "2026-06-23" -> "Selasa, 23 Juni 2026" */
export function formatLongDate(iso: string): string {
  const d = parseISODate(iso)
  if (!d) return iso
  return `${DAYS_ID[d.getDay()]}, ${d.getDate()} ${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`
}

/** "2026-06" -> "Juni 2026" */
export function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m) return ym
  return `${MONTHS_ID[m - 1]} ${y}`
}

function parseISODate(iso: string): Date | null {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

/** Range tanggal minggu ini (Senin s/d Minggu) */
export function thisWeekRange(): { from: string; to: string } {
  const now = new Date()
  const day = now.getDay() // 0=Min, 1=Sen...
  const diffToMonday = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setDate(now.getDate() + diffToMonday)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { from: formatDateISO(monday), to: formatDateISO(sunday) }
}

/** Range tanggal bulan ini (1 s/d akhir bulan) */
export function thisMonthRange(): { from: string; to: string } {
  const now = new Date()
  const from = formatDateISO(new Date(now.getFullYear(), now.getMonth(), 1))
  const to = formatDateISO(new Date(now.getFullYear(), now.getMonth() + 1, 0))
  return { from, to }
}

/** YYYY-MM untuk bulan ini */
export function thisMonthYM(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
