'use client'

import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '@/lib/store'
import { formatRupiah } from '@/lib/format'
import { toast } from 'sonner'
import { Sparkles, X, Send, Check, Mic, Square } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ProposalAction {
  type: 'create_category' | 'create_transaction' | 'update_category_fee'
  payload: Record<string, unknown>
}
interface Proposal {
  summary: string
  actions: ProposalAction[]
}
interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  proposal?: Proposal | null
}

const SUGGESTIONS = [
  'Rekap hari ini dong',
  'Berapa pendapatan PLN bulan ini?',
  'Tadi 49 idpel PLN admin 3000',
  'Catat 10 PDAM fee 2500 tagihan 150rb',
]

export function AgentChat({ open }: { open: boolean }) {
  const { setAgentOpen } = useAppStore()
  const qc = useQueryClient()
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Halo! Saya Asisten AI GriyaLapor. Bisa bantu catat transaksi, buat kategori, atau rangkum laporan. Coba: "Tadi ada 49 idpel PLN admin 3000".',
    },
  ])
  const [pendingProposal, setPendingProposal] = useState<Proposal | null>(null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [listening, setListening] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const recogRef = useRef<any>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  async function callAgent(payload: {
    messages: { role: 'user' | 'assistant'; content: string }[]
    pendingProposal?: Proposal | null
    confirm?: boolean | null
  }) {
    setLoading(true)
    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.error ?? 'Gagal menghubungi asisten')
      }
      const data = await res.json()
      const replyMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.reply ?? '',
        proposal: data.proposal ?? null,
      }
      setMessages((m) => [...m, replyMsg])
      if (data.proposal) {
        setPendingProposal(data.proposal)
      } else {
        setPendingProposal(null)
      }
      if (data.executed) {
        qc.invalidateQueries({ queryKey: ['summary'] })
        qc.invalidateQueries({ queryKey: ['transactions'] })
        qc.invalidateQueries({ queryKey: ['categories'] })
      }
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  function historyText(): { role: 'user' | 'assistant'; content: string }[] {
    return messages
      .filter((m) => m.id !== 'welcome')
      .map((m) => ({ role: m.role, content: m.content }))
  }

  function sendText(text: string) {
    const t = text.trim()
    if (!t || loading) return
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: t }
    setMessages((m) => [...m, userMsg])
    setInput('')
    // Jika ada proposal pending & user mengetik bebas, anggap batal proposal → kirim normal
    const wasPending = pendingProposal
    setPendingProposal(null)
    void callAgent({
      messages: [...historyText(), { role: 'user', content: t }],
      pendingProposal: null,
      confirm: null,
    })
    if (wasPending) {
      void 0 // proposal diabaikan
    }
  }

  function confirmProposal(confirm: boolean) {
    if (!pendingProposal || loading) return
    const word = confirm ? 'ya' : 'tidak'
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: word }
    setMessages((m) => [...m, userMsg])
    void callAgent({
      messages: [...historyText(), { role: 'user', content: word }],
      pendingProposal,
      confirm,
    })
  }

  // Voice input (opsional, Web Speech API)
  function toggleVoice() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      toast.info('Voice input tidak didukung di browser ini')
      return
    }
    if (listening) {
      recogRef.current?.stop()
      setListening(false)
      return
    }
    const r = new SR()
    r.lang = 'id-ID'
    r.interimResults = false
    r.onresult = (e: any) => {
      const text = e.results[0][0].transcript
      setInput((prev) => (prev ? prev + ' ' : '') + text)
    }
    r.onerror = () => toast.error('Gagal mendengarkan suara')
    r.onend = () => setListening(false)
    recogRef.current = r
    setListening(true)
    r.start()
  }

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setAgentOpen(true)}
          className="fixed bottom-20 md:bottom-6 right-4 z-40 flex items-center gap-2 h-14 px-5 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-[1.03] active:scale-95 transition-transform no-print"
          aria-label="Buka Asisten AI"
        >
          <Sparkles className="w-6 h-6" />
          <span className="font-semibold hidden sm:inline">Asisten AI</span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed inset-0 z-50 md:inset-auto md:bottom-4 md:right-4 md:w-[440px] md:h-[640px] md:max-h-[85vh] no-print">
          <div className="absolute inset-0 bg-black/40 md:hidden" onClick={() => setAgentOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 md:inset-0 bg-card border-t md:border shadow-2xl md:rounded-2xl flex flex-col h-[88vh] md:h-full overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b bg-primary text-primary-foreground shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold leading-tight">Asisten AI</div>
                  <div className="text-xs text-primary-foreground/80 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-300" /> Online
                  </div>
                </div>
              </div>
              <button onClick={() => setAgentOpen(false)} className="p-2 hover:bg-white/15 rounded-lg" aria-label="Tutup">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-thin p-4 space-y-3 bg-secondary/30">
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
              {loading && (
                <div className="flex items-center gap-2 text-muted-foreground text-sm px-1">
                  <span className="flex gap-1">
                    <span className="w-2 h-2 rounded-full bg-current animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-current animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full bg-current animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                  Asisten sedang mengetik...
                </div>
              )}

              {/* Proposal confirmation card */}
              {pendingProposal && !loading && (
                <ProposalCard proposal={pendingProposal} onConfirm={() => confirmProposal(true)} onCancel={() => confirmProposal(false)} />
              )}
            </div>

            {/* Quick suggestions */}
            {messages.length <= 1 && !loading && (
              <div className="px-3 pb-2 flex flex-wrap gap-2 shrink-0">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendText(s)}
                    className="text-xs px-3 py-1.5 rounded-full border bg-card hover:bg-secondary transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="p-3 border-t bg-card shrink-0">
              <div className="flex items-end gap-2">
                <button
                  onClick={toggleVoice}
                  className={cn(
                    'w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 transition-colors',
                    listening ? 'bg-destructive text-white border-destructive' : 'hover:bg-secondary',
                  )}
                  aria-label="Input suara"
                >
                  {listening ? <Square className="w-4 h-4" /> : <Mic className="w-5 h-5" />}
                </button>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendText(input)
                    }
                  }}
                  placeholder="Ketik pesan... (mis. catat 30 PLN admin 2500)"
                  rows={1}
                  className="flex-1 resize-none rounded-xl border bg-background px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-primary max-h-28"
                />
                <button
                  onClick={() => sendText(input)}
                  disabled={!input.trim() || loading}
                  className="w-11 h-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0 disabled:opacity-40 hover:opacity-90 transition-opacity"
                  aria-label="Kirim"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[88%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed break-words',
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-md whitespace-pre-wrap'
            : 'bg-card border rounded-bl-md shadow-sm',
        )}
      >
        {isUser ? (
          message.content
        ) : (
          <div className="agent-md">
            <ReactMarkdown
              components={{
                p: ({ children }) => <p className="my-1 first:mt-0 last:mb-0">{children}</p>,
                ul: ({ children }) => <ul className="my-1 pl-4 list-disc space-y-0.5">{children}</ul>,
                ol: ({ children }) => <ol className="my-1 pl-4 list-decimal space-y-0.5">{children}</ol>,
                li: ({ children }) => <li>{children}</li>,
                strong: ({ children }) => <strong className="font-bold">{children}</strong>,
                em: ({ children }) => <em>{children}</em>,
                hr: () => <hr className="my-2 border-border" />,
                code: ({ children }) => <code className="px-1 py-0.5 rounded bg-secondary text-[0.85em]">{children}</code>,
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  )
}

function ProposalCard({
  proposal,
  onConfirm,
  onCancel,
}: {
  proposal: Proposal
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center gap-2 text-primary font-semibold">
        <Check className="w-4 h-4" /> Konfirmasi Aksi
      </div>
      <p className="text-sm font-medium">{proposal.summary}</p>
      <div className="space-y-1.5">
        {proposal.actions.map((a, i) => (
          <ActionRow key={i} action={a} />
        ))}
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={onConfirm}
          className="flex-1 h-11 rounded-xl bg-success text-success-foreground font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
        >
          <Check className="w-5 h-5" /> Ya, Jalankan
        </button>
        <button
          onClick={onCancel}
          className="h-11 px-4 rounded-xl border font-semibold hover:bg-secondary transition-colors"
        >
          Batal
        </button>
      </div>
    </div>
  )
}

function ActionRow({ action }: { action: ProposalAction }) {
  const p = action.payload
  let label: string
  if (action.type === 'create_category') {
    label = `Buat kategori: ${p.name} · grup ${p.group ?? '-'} · fee ${formatRupiah(Number(p.default_fee ?? 0))}`
  } else if (action.type === 'create_transaction') {
    const qty = Number(p.qty ?? 0)
    const fee = Number(p.fee_per_unit ?? 0)
    const totalPaid = Number(p.total_paid ?? 0)
    const bersih = qty * fee
    const omzetInfo = totalPaid > 0 ? ` · Omzet ${formatRupiah(totalPaid)}` : ''
    label = `Catat: ${p.category_name ?? '#' + p.category_id} — ${qty} × ${formatRupiah(fee)} = Pendapatan Bersih ${formatRupiah(bersih)}${omzetInfo} (${p.date})`
  } else {
    label = `Ubah fee: ${p.category_name ?? '#' + p.category_id} → ${formatRupiah(Number(p.new_fee ?? 0))}`
  }

  return (
    <div className="text-xs bg-card rounded-lg px-3 py-2 border flex items-start gap-2">
      <span className="text-primary font-bold shrink-0">
        {action.type === 'create_category' ? '+ Kategori' : action.type === 'create_transaction' ? '+ Transaksi' : '✎ Fee'}
      </span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  )
}
