'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Smartphone, Share, Plus, X } from 'lucide-react'

const DISMISS_KEY = 'gl-ios-install-dismissed'

/**
 * Kartu instruksi instalasi khusus iOS Safari.
 * iOS Safari tidak support beforeinstallprompt, jadi user harus install manual
 * via "Share → Add to Home Screen".
 * Hanya tampil di iOS Safari yang belum standalone (belum di-install).
 */
export function IosInstallInstructions() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Deteksi iOS Safari (bukan dalam mode standalone = belum di-install)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream
    const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
    const dismissed = localStorage.getItem(DISMISS_KEY)

    if (isIOS && isSafari && !isStandalone && !dismissed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(true)
    }
  }, [])

  function dismiss() {
    setVisible(false)
    localStorage.setItem(DISMISS_KEY, '1')
  }

  if (!visible) return null

  return (
    <Card className="p-4 border-primary/30 bg-primary/5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
          <Smartphone className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm flex items-center gap-2">
            Pasang ke Layar Utama
            <button onClick={dismiss} className="ml-auto text-muted-foreground hover:text-foreground p-1 -mt-1 -mr-1" aria-label="Tutup">
              <X className="w-4 h-4" />
            </button>
          </p>
          <p className="text-xs text-muted-foreground mt-1 mb-3">
            Ikuti langkah berikut untuk memasang GriyaLapor seperti aplikasi biasa di iPhone/iPad:
          </p>
          <ol className="space-y-2 text-xs">
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0 font-bold text-[10px] mt-0.5">1</span>
              <span className="leading-relaxed">
                Tap tombol <strong>Share</strong> di bar bawah Safari
                <Share className="inline-block w-3 h-3 mx-1 align-text-bottom text-primary" />
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0 font-bold text-[10px] mt-0.5">2</span>
              <span className="leading-relaxed">
                Pilih <strong>"Tambahkan ke Layar Utama"</strong> (Add to Home Screen)
                <Plus className="inline-block w-3 h-3 mx-1 align-text-bottom text-primary" />
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0 font-bold text-[10px] mt-0.5">3</span>
              <span className="leading-relaxed">Tap <strong>Tambah</strong> — selesai! GriyaLapor akan muncul di layar utama.</span>
            </li>
          </ol>
        </div>
      </div>
    </Card>
  )
}
