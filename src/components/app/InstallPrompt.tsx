'use client'

import { useEffect, useState } from 'react'
import { X, Download } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'gl-install-dismissed'

/**
 * Banner "Pasang Aplikasi" yang muncul saat PWA bisa di-install.
 * Dismissable & hanya tampil sekali per session (atau sampai user hapus localStorage).
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    function handler(e: Event) {
      e.preventDefault()
      const evt = e as BeforeInstallPromptEvent
      setDeferred(evt)
      // Tampilkan hanya jika belum pernah di-dismiss
      const dismissed = localStorage.getItem(DISMISS_KEY)
      if (!dismissed) {
        setVisible(true)
      }
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  async function install() {
    if (!deferred) return
    await deferred.prompt()
    const choice = await deferred.userChoice
    if (choice.outcome === 'accepted') {
      setVisible(false)
    }
    setDeferred(null)
  }

  function dismiss() {
    setVisible(false)
    localStorage.setItem(DISMISS_KEY, '1')
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 right-4 md:right-auto md:w-80 z-40 no-print animate-in slide-in-from-bottom-4 duration-300">
      <div className="rounded-2xl border bg-card shadow-xl p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Download className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">Pasang GriyaLapor</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tambahkan ke layar utama agar cepat dibuka, seperti aplikasi biasa.
          </p>
          <div className="flex gap-2 mt-2.5">
            <button
              onClick={install}
              className={cn('h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity')}
            >
              Pasang
            </button>
            <button
              onClick={dismiss}
              className="h-9 px-3 rounded-lg border text-sm font-medium hover:bg-secondary transition-colors"
            >
              Nanti saja
            </button>
          </div>
        </div>
        <button
          onClick={dismiss}
          className="p-1 -mt-1 -mr-1 text-muted-foreground hover:text-foreground"
          aria-label="Tutup"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
