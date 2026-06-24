'use client'

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAppStore, type SectionId } from '@/lib/store'
import { cn } from '@/lib/utils'
import {
  Home, ReceiptText, Tags, BarChart3, Settings, Bot, Sun, Moon, TrendingDown,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { useState } from 'react'
import { DashboardSection } from './sections/DashboardSection'
import { TransactionsSection } from './sections/TransactionsSection'
import { CategoriesSection } from './sections/CategoriesSection'
import { ReportsSection } from './sections/ReportsSection'
import { ImportSection } from './sections/ImportSection'
import { SettingsSection } from './sections/SettingsSection'
import { ExpensesSection } from './sections/ExpensesSection'
import { InstallPrompt } from './InstallPrompt'
import { IosInstallInstructions } from './IosInstallInstructions'
import { AgentChat } from './agent/AgentChat'

const NAV_BASE: { id: SectionId; label: string; icon: typeof Home }[] = [
  { id: 'dashboard', label: 'Beranda', icon: Home },
  { id: 'transactions', label: 'Transaksi', icon: ReceiptText },
  { id: 'categories', label: 'Kategori', icon: Tags },
  { id: 'reports', label: 'Laporan', icon: BarChart3 },
  { id: 'settings', label: 'Pengaturan', icon: Settings },
]

export function AppShell() {
  const { activeSection, setSection } = useAppStore()
  const agentOpen = useAppStore((s) => s.agentOpen)
  const setExpensesEnabled = useAppStore((s) => s.setExpensesEnabled)
  const expensesEnabled = useAppStore((s) => s.expensesEnabled)

  // Fetch settings sekali, sync expensesEnabled ke store
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => fetch('/api/settings').then((r) => r.json()) as Promise<{ settings: Record<string, string> }>,
  })
  useEffect(() => {
    if (settings?.settings?.expenses_enabled) {
      setExpensesEnabled(settings.settings.expenses_enabled === '1')
    }
  }, [settings, setExpensesEnabled])

  // Bangun nav list: jika expenses aktif, sisipkan setelah Transaksi
  const nav: { id: SectionId; label: string; icon: typeof Home }[] = []
  for (const item of NAV_BASE) {
    nav.push(item)
    if (item.id === 'transactions' && expensesEnabled) {
      nav.push({ id: 'expenses', label: 'Pengeluaran', icon: TrendingDown })
    }
  }
  // Mobile bottom nav: batasi 6 slot, prioritaskan yang utama.
  // Label pendek untuk mobile biar muat di 6 kolom (375px).
  const mobileNavLabels: Record<SectionId, string> = {
    dashboard: 'Beranda',
    transactions: 'Transaksi',
    categories: 'Kategori',
    reports: 'Laporan',
    settings: 'Atur',
    expenses: 'Biaya',
    import: 'Impor',
  }
  const mobileNav = expensesEnabled
    ? [NAV_BASE[0], NAV_BASE[1], { id: 'expenses' as SectionId, label: 'Pengeluaran', icon: TrendingDown }, NAV_BASE[2], NAV_BASE[3], NAV_BASE[4]]
    : NAV_BASE

  // Jika activeSection = expenses tapi expensesEnabled mati, fallback ke transactions
  useEffect(() => {
    if (activeSection === 'expenses' && !expensesEnabled) {
      setSection('transactions')
    }
  }, [activeSection, expensesEnabled, setSection])

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur no-print">
        <div className="flex items-center justify-between px-4 h-16">
          <button
            onClick={() => setSection('dashboard')}
            className="flex items-center gap-2.5"
            aria-label="GriyaLapor beranda"
          >
            <img src="/icon.svg" alt="" className="w-9 h-9 rounded-lg" />
            <div className="text-left leading-tight">
              <div className="font-bold text-lg tracking-tight">GriyaLapor</div>
              <div className="text-xs text-muted-foreground -mt-0.5">Catatan Keuangan PPOB</div>
            </div>
          </button>
          <ThemeToggle />
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar desktop */}
        <aside className="hidden md:flex w-60 shrink-0 border-r bg-card/40 sticky top-16 self-start h-[calc(100vh-4rem)] flex-col p-3 no-print">
          <nav className="flex flex-col gap-1">
            {nav.map((item) => (
              <NavItem key={item.id} item={item} active={activeSection === item.id} onClick={() => setSection(item.id)} />
            ))}
            <div className="my-2 border-t" />
            <NavItem
              item={{ id: 'import', label: 'Impor CSV', icon: BarChart3 }}
              active={activeSection === 'import'}
              onClick={() => setSection('import')}
              iconOverride={<ImportIcon />}
            />
          </nav>
          <div className="mt-auto p-3 rounded-xl bg-secondary/60 text-xs text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Butuh bantuan?</p>
            Klik tombol <span className="font-semibold text-primary">Asisten AI</span> di pojok kanan bawah untuk mencatat lewat chat.
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 pb-24 md:pb-8">
          <div className="max-w-5xl mx-auto px-4 py-5 md:py-7">
            {activeSection === 'dashboard' && (
              <>
                <IosInstallInstructions />
                <DashboardSection />
              </>
            )}
            {activeSection === 'transactions' && <TransactionsSection />}
            {activeSection === 'categories' && <CategoriesSection />}
            {activeSection === 'reports' && <ReportsSection />}
            {activeSection === 'import' && <ImportSection />}
            {activeSection === 'settings' && <SettingsSection />}
            {activeSection === 'expenses' && expensesEnabled && <ExpensesSection />}
          </div>
        </main>
      </div>

      {/* Bottom nav mobile */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t bg-card/95 backdrop-blur no-print">
        <div className={cn('grid', mobileNav.length === 6 ? 'grid-cols-6' : 'grid-cols-5')}>
          {mobileNav.map((item) => {
            const Icon = item.icon
            const active = activeSection === item.id
            const mobileLabel = mobileNavLabels[item.id] ?? item.label
            return (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                className={cn(
                  'flex flex-col items-center gap-0.5 py-1.5 text-[11px] font-medium transition-colors min-h-[52px] justify-center px-0.5',
                  active ? 'text-primary' : 'text-muted-foreground',
                )}
                aria-current={active ? 'page' : undefined}
                aria-label={item.label}
              >
                <Icon className={cn('w-5 h-5', active && 'scale-110')} strokeWidth={active ? 2.4 : 2} />
                <span className="leading-tight">{mobileLabel}</span>
              </button>
            )
          })}
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>

      {/* Floating AI button + panel */}
      <AgentChat open={agentOpen} />
      <InstallPrompt />
    </div>
  )
}

function NavItem({
  item, active, onClick, iconOverride,
}: {
  item: { id: SectionId; label: string; icon: typeof Home }
  active: boolean
  onClick: () => void
  iconOverride?: React.ReactNode
}) {
  const Icon = item.icon
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] font-medium transition-colors w-full text-left',
        active ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-secondary text-foreground/80',
      )}
      aria-current={active ? 'page' : undefined}
    >
      {iconOverride ?? <Icon className="w-5 h-5 shrink-0" />}
      {item.label}
    </button>
  )
}

function ImportIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])
  if (!mounted) return <div className="w-10 h-10" />
  const isDark = theme === 'dark'
  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="w-11 h-11 rounded-xl border flex items-center justify-center hover:bg-secondary transition-colors"
      aria-label={isDark ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
    >
      {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  )
}

export { Bot }
