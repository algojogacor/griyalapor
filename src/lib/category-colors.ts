/**
 * Sistem warna kategori PPOB untuk pengenalan visual cepat.
 * Setiap grup PPOB dapat warna khas. Dipakai di avatar/icon kategori.
 */

const GROUP_COLORS: Record<string, { bg: string; text: string; ring: string }> = {
  Listrik: { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300', ring: 'ring-amber-200 dark:ring-amber-800' },
  Air: { bg: 'bg-sky-100 dark:bg-sky-900/40', text: 'text-sky-700 dark:text-sky-300', ring: 'ring-sky-200 dark:ring-sky-800' },
  Asuransi: { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300', ring: 'ring-emerald-200 dark:ring-emerald-800' },
  Telko: { bg: 'bg-violet-100 dark:bg-violet-900/40', text: 'text-violet-700 dark:text-violet-300', ring: 'ring-violet-200 dark:ring-violet-800' },
  'Pulsa & Data': { bg: 'bg-fuchsia-100 dark:bg-fuchsia-900/40', text: 'text-fuchsia-700 dark:text-fuchsia-300', ring: 'ring-fuchsia-200 dark:ring-fuchsia-800' },
  Multifinance: { bg: 'bg-orange-100 dark:bg-orange-900/40', text: 'text-orange-700 dark:text-orange-300', ring: 'ring-orange-200 dark:ring-orange-800' },
  Gas: { bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300', ring: 'ring-blue-200 dark:ring-blue-800' },
  'TV & Hiburan': { bg: 'bg-rose-100 dark:bg-rose-900/40', text: 'text-rose-700 dark:text-rose-300', ring: 'ring-rose-200 dark:ring-rose-800' },
  'E-Money': { bg: 'bg-cyan-100 dark:bg-cyan-900/40', text: 'text-cyan-700 dark:text-cyan-300', ring: 'ring-cyan-200 dark:ring-cyan-800' },
  Lainnya: { bg: 'bg-slate-100 dark:bg-slate-900/40', text: 'text-slate-700 dark:text-slate-300', ring: 'ring-slate-200 dark:ring-slate-800' },
}

const DEFAULT_COLOR = GROUP_COLORS.Lainnya

export function getCategoryColor(group: string | null | undefined) {
  if (!group) return DEFAULT_COLOR
  // Cocokkan case-insensitive, trim
  const key = Object.keys(GROUP_COLORS).find((k) => k.toLowerCase() === group.toLowerCase())
  return key ? GROUP_COLORS[key] : DEFAULT_COLOR
}

/** Ambil inisial nama kategori untuk avatar (1-2 huruf) */
export function getCategoryInitial(name: string): string {
  const words = name.trim().split(/\s+/)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}
