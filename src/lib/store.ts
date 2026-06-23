'use client'

import { create } from 'zustand'

export type SectionId = 'dashboard' | 'transactions' | 'categories' | 'reports' | 'import' | 'settings'

interface AppState {
  activeSection: SectionId
  setSection: (s: SectionId) => void
  agentOpen: boolean
  setAgentOpen: (v: boolean) => void
  // Apakah pengeluaran operasional aktif (sinkron dari settings)
  expensesEnabled: boolean
  setExpensesEnabled: (v: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  activeSection: 'dashboard',
  setSection: (s) => set({ activeSection: s }),
  agentOpen: false,
  setAgentOpen: (v) => set({ agentOpen: v }),
  expensesEnabled: false,
  setExpensesEnabled: (v) => set({ expensesEnabled: v }),
}))
