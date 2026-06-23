'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

/**
 * Family members management — stored di settings (cloud DB, sync semua device).
 * Setting key: family_members = JSON array of names.
 * Default members: Yangti, Yangkung, Mama, Papa.
 *
 * recorded_by (siapa yang mencatat) disimpan per-transaksi di kolom recorded_by.
 * Last-used recorder disimpan di localStorage untuk default selection.
 */

const DEFAULT_MEMBERS = ['Yangti', 'Yangkung', 'Mama', 'Papa']
const LAST_RECORDER_KEY = 'gl-last-recorder'

export function useFamilyMembers() {
  const qc = useQueryClient()
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => fetch('/api/settings').then((r) => r.json()),
  })

  const members: string[] = (() => {
    const raw = settings?.settings?.family_members
    if (!raw) return DEFAULT_MEMBERS
    try {
      const parsed = JSON.parse(raw) as string[]
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_MEMBERS
    } catch {
      return DEFAULT_MEMBERS
    }
  })()

  const saveMutation = useMutation({
    mutationFn: async (newMembers: string[]) => {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ family_members: JSON.stringify(newMembers) }),
      })
      if (!res.ok) throw new Error('Gagal menyimpan anggota')
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const addMember = useCallback((name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    if (members.some((m) => m.toLowerCase() === trimmed.toLowerCase())) {
      toast.info('Anggota sudah ada')
      return
    }
    saveMutation.mutate([...members, trimmed])
  }, [members, saveMutation])

  const removeMember = useCallback((name: string) => {
    saveMutation.mutate(members.filter((m) => m !== name))
  }, [members, saveMutation])

  return { members, addMember, removeMember, saveMutation }
}

/** Hook untuk default recorder (last-used), disimpan di localStorage per-device */
export function useLastRecorder() {
  const [lastRecorder, setLastRecorderState] = useState<string>('')

  useEffect(() => {
    const saved = localStorage.getItem(LAST_RECORDER_KEY)
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLastRecorderState(saved)
    }
  }, [])

  const setLastRecorder = useCallback((name: string) => {
    setLastRecorderState(name)
    localStorage.setItem(LAST_RECORDER_KEY, name)
  }, [])

  return { lastRecorder, setLastRecorder }
}
