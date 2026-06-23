'use client'

import { useState, useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface RupiahInputProps extends Omit<React.ComponentProps<typeof Input>, 'onChange' | 'value'> {
  value: string // raw numeric string (digits only)
  onChange: (rawDigits: string) => void
  /** Prefix label, default "Rp" */
  prefix?: string
  /** Tampilkan prefix di dalam input */
  showPrefix?: boolean
}

/**
 * Input angka rupiah yang menampilkan pemisah ribuan saat user mengetik.
 * - value/onChange tetap pakai digit mentah (string "1500"), bukan "Rp1.500".
 * - Memudahkan lansia melihat angka besar dengan jelas.
 */
export function RupiahInput({
  value,
  onChange,
  prefix = 'Rp',
  showPrefix = true,
  className,
  ...rest
}: RupiahInputProps) {
  const raw = (value ?? '').replace(/[^\d]/g, '')
  // Tampilkan dengan titik ribuan: 1500 -> "1.500"
  const formatted = raw ? Number(raw).toLocaleString('id-ID') : ''
  const inputRef = useRef<HTMLInputElement>(null)

  // Pertahankan posisi kursor di akhir saat value berubah dari luar
  useEffect(() => {
    if (inputRef.current && document.activeElement === inputRef.current) {
      const len = inputRef.current.value.length
      inputRef.current.setSelectionRange(len, len)
    }
  }, [formatted])

  return (
    <div className="relative">
      {showPrefix && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold pointer-events-none select-none">
          {prefix}
        </span>
      )}
      <Input
        ref={inputRef}
        inputMode="numeric"
        value={formatted}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^\d]/g, '')
          onChange(digits)
        }}
        className={cn(showPrefix && 'pl-10', className)}
        {...rest}
      />
    </div>
  )
}
