'use client'

/**
 * MonthlyChart — komponen grafik batang bulanan (recharts).
 * Dipisah agar di-code-split via next/dynamic (recharts berat, laptop kakek lemot).
 */
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from 'recharts'
import { formatRupiah, formatMonthLabel } from '@/lib/format'

export interface MonthlyTrendPoint {
  ym: string
  admin: number
  omzet: number
  expenses: number
}

function compactRupiah(v: number): string {
  if (!Number.isFinite(v)) return ''
  if (v >= 1_000_000) {
    const jt = v / 1_000_000
    return 'Rp' + (Number.isInteger(jt) ? String(jt) : jt.toFixed(1).replace('.0', '')) + 'jt'
  }
  if (v >= 1_000) return 'Rp' + Math.round(v / 1000) + 'rb'
  return 'Rp' + Math.round(v)
}

export function MonthlyChart({ data, expensesEnabled }: { data: MonthlyTrendPoint[]; expensesEnabled: boolean }) {
  // Hanya tampilkan bar Omzet jika ada data omzet > 0 (nominal tagihan pernah diisi)
  const hasOmzet = data.some((d) => d.omzet > d.admin)
  const chartData = data.map((d) => ({
    name: formatMonthLabel(d.ym),
    'Pendapatan Bersih': d.admin,
    ...(hasOmzet ? { Omzet: d.omzet } : {}),
    ...(expensesEnabled ? { Pengeluaran: d.expenses } : {}),
  }))

  return (
    <div className="w-full h-full text-muted-foreground">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.15} vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 12, fill: 'currentColor' }}
            tickLine={false}
            axisLine={{ stroke: 'currentColor', strokeOpacity: 0.2 }}
            interval={0}
          />
          <YAxis
            tickFormatter={(v: number) => compactRupiah(Number(v))}
            tick={{ fontSize: 11, fill: 'currentColor' }}
            tickLine={false}
            axisLine={false}
            width={68}
          />
          <Tooltip
            cursor={{ fill: 'currentColor', fillOpacity: 0.05 }}
            contentStyle={{
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--popover)',
              color: 'var(--popover-foreground)',
              fontSize: 13,
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            }}
            formatter={(value, name) => [formatRupiah(Number(value)), String(name)]}
          />
          <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8 }} iconType="circle" />
          <Bar dataKey="Pendapatan Bersih" className="fill-primary" radius={[4, 4, 0, 0]} maxBarSize={48} />
          {hasOmzet && (
            <Bar dataKey="Omzet" fill="#0ea5e9" radius={[4, 4, 0, 0]} maxBarSize={48} />
          )}
          {expensesEnabled && (
            <Bar dataKey="Pengeluaran" className="fill-destructive" radius={[4, 4, 0, 0]} maxBarSize={48} />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export default MonthlyChart
