import { createClient, type Client } from '@libsql/client'

/**
 * GriyaLapor database client — Turso (libSQL).
 * Dipakai server-side saja (API routes). Token tidak pernah diekspos ke client.
 */

const globalForDb = globalThis as unknown as { _griyalaporDb?: Client }

function createDb(): Client {
  const url = process.env.TURSO_URL ?? process.env.DATABASE_URL ?? ''
  const authToken = process.env.TURSO_AUTH_TOKEN ?? undefined
  if (!url) throw new Error('TURSO_URL belum dikonfigurasi')
  return createClient({ url, authToken })
}

export const db: Client = globalForDb._griyalaporDb ?? createDb()
if (process.env.NODE_ENV !== 'production') globalForDb._griyalaporDb = db

// ---------- Tipe data ----------

export interface Category {
  id: number
  name: string
  group_name: string | null
  default_fee: number
  created_at: string
}

export interface Transaction {
  id: number
  category_id: number
  date: string // YYYY-MM-DD
  qty: number
  fee_per_unit: number
  total: number
  customer_name: string | null
  note: string | null
  created_at: string
}

export interface TransactionWithCategory extends Transaction {
  category_name: string
  category_group: string | null
}

export interface Expense {
  id: number
  date: string
  label: string
  amount: number
  created_at: string
}

export interface Setting {
  key: string
  value: string
}
