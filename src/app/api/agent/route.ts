import { db } from '@/lib/db'
import { json, errorJson } from '@/lib/http'
import { mistralChat, type MistralMessage, type MistralTool } from '@/lib/mistral'
import { todayISO, thisWeekRange, thisMonthRange } from '@/lib/format'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ---------- Tipe proposal ----------
type ActionType = 'create_category' | 'create_transaction' | 'update_category_fee'
interface ProposalAction {
  type: ActionType
  payload: Record<string, unknown>
}
interface Proposal {
  summary: string
  actions: ProposalAction[]
}

interface AgentRequest {
  messages: { role: 'user' | 'assistant'; content: string }[]
  pendingProposal?: Proposal | null
  confirm?: boolean | null
}

// ---------- Tools (OpenAI-compatible function calling) ----------
const TOOLS: MistralTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_categories',
      description: 'Ambil daftar semua kategori layanan PPOB beserta fee default-nya dari database.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_transactions',
      description: 'Ambil transaksi dalam rentang tanggal tertentu. Tanpa parameter = semua transaksi (limit 50).',
      parameters: {
        type: 'object',
        properties: {
          date_from: { type: 'string', description: 'Tanggal mulai YYYY-MM-DD' },
          date_to: { type: 'string', description: 'Tanggal akhir YYYY-MM-DD' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_summary',
      description: 'Ambil ringkasan pendapatan untuk periode tertentu. Mengembalikan total & jumlah transaksi.',
      parameters: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['today', 'week', 'month'], description: 'today=hari ini, week=minggu ini, month=bulan ini' },
        },
        required: ['period'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_action',
      description:
        'Usulkan aksi yang MENGUBAH data (tambah transaksi, buat kategori baru, ubah fee default). ' +
        'Aksi TIDAK langsung dieksekusi — user akan dikonfirmasi dulu. ' +
        'Selalu gunakan tool ini untuk aksi tulis, jangan langsung bilang sudah dicatat.',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Ringkasan singkat bahasa Indonesia tentang apa yang akan dilakukan' },
          actions: {
            type: 'array',
            description: 'Daftar aksi berurutan',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['create_category', 'create_transaction', 'update_category_fee'] },
                payload: {
                  type: 'object',
                  description:
                    'create_category: {name, group?, default_fee}. ' +
                    'create_transaction: {category_name atau category_id, date(YYYY-MM-DD), qty, fee_per_unit, note?}. ' +
                    'update_category_fee: {category_name atau category_id, new_fee}.',
                },
              },
              required: ['type', 'payload'],
            },
          },
        },
        required: ['summary', 'actions'],
      },
    },
  },
]

// ---------- System prompt ----------
function systemPrompt(): string {
  const today = todayISO()
  return `Kamu adalah Asisten AI GriyaLapor, asisten keuangan untuk usaha PPOB (Pembayaran Pos Online seperti PLN, PDAM, BPJS, pulsa) milik keluarga.

ATURAN WAJIB:
1. Berbahasa Indonesia, ramah, singkat, jelas. Tidak bertele-tele. Pengguna adalah orang lanjut usia — gunakan kalimat pendek dan istilah awam.
2. Tanggal hari ini: ${today} (Asia/Jakarta). "hari ini" = tanggal itu. "bulan ini" = bulan tanggal itu.
3. Sebelum melakukan aksi yang MENGUBAH data (tambah transaksi, buat kategori, ubah fee), kamu WAJIB mengusulkannya lewat tool propose_action, lalu tunggu konfirmasi user. JANGAN pernah bilang "sudah dicatat" sebelum dikonfirmasi.
4. Untuk pertanyaan tentang data, gunakan tool get_categories / get_transactions / get_summary. Jawab dengan angka konkret dan format rupiah (Rp147.000).
5. Jika kategori yang disebut user belum ada di database, usulkan pembuatan kategori dulu (tebak grup & fee default yang masuk akal), lalu catat transaksinya, dalam SATU proposal.
6. Jika user menyebut "adminnya 3000" atau "fee 3000", itu = fee per unit (rupiah).
7. Jangan mengarang data. Jika tidak yakin (mis. kategori ambigu), tanya klarifikasi singkat.
8. Untuk rekap/laporan, ambil data lewat get_summary/get_transactions, lalu rangkum rapi dengan poin-poin.
9. Format uang selalu Rp dengan titik ribuan. Contoh: Rp1.234.000.
10. Jika user bilang "ya"/"iya"/"gas"/"lanjut"/"oke" setelah kamu mengusulkan aksi, itu konfirmasi. Tapi tetap jalankan lewat mekanisme konfirmasi yang ada.`
}

// ---------- Eksekusi tool baca ----------
async function executeReadTool(name: string, args: Record<string, unknown>): Promise<string> {
  if (name === 'get_categories') {
    const res = await db.execute('SELECT id, name, group_name, default_fee FROM categories ORDER BY group_name, name')
    const rows = res.rows.map((r) => {
      const x = r as { id: number; name: string; group_name: string | null; default_fee: number }
      return { id: x.id, name: x.name, group: x.group_name, default_fee: x.default_fee }
    })
    return JSON.stringify(rows)
  }
  if (name === 'get_transactions') {
    const from = args.date_from as string | undefined
    const to = args.date_to as string | undefined
    const cond: string[] = []
    const a: (string | number)[] = []
    if (from) { cond.push('t.date >= ?'); a.push(from) }
    if (to) { cond.push('t.date <= ?'); a.push(to) }
    const where = cond.length ? 'WHERE ' + cond.join(' AND ') : ''
    const res = await db.execute({
      sql: `SELECT t.id, t.date, t.qty, t.fee_per_unit, t.total, t.note, c.name as category_name
            FROM transactions t JOIN categories c ON c.id = t.category_id ${where} ORDER BY t.date DESC, t.id DESC LIMIT 50`,
      args: a,
    })
    const rows = res.rows.map((r) => {
      const x = r as { id: number; date: string; qty: number; fee_per_unit: number; total: number; note: string | null; category_name: string }
      return { id: x.id, date: x.date, category: x.category_name, qty: x.qty, fee_per_unit: x.fee_per_unit, total: x.total, note: x.note }
    })
    return JSON.stringify(rows)
  }
  if (name === 'get_summary') {
    const period = args.period as 'today' | 'week' | 'month'
    const range = period === 'today' ? { from: todayISO(), to: todayISO() } : period === 'week' ? thisWeekRange() : thisMonthRange()
    const [t, e] = await Promise.all([
      db.execute({ sql: 'SELECT COUNT(*) as c, COALESCE(SUM(total),0) as total FROM transactions WHERE date >= ? AND date <= ?', args: [range.from, range.to] }),
      db.execute({ sql: 'SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as total FROM expenses WHERE date >= ? AND date <= ?', args: [range.from, range.to] }),
    ])
    return JSON.stringify({
      period,
      range,
      transactions: { count: Number((t.rows[0] as { c: number }).c), total: Number((t.rows[0] as { total: number }).total) },
      expenses: { count: Number((e.rows[0] as { c: number }).c), total: Number((e.rows[0] as { total: number }).total) },
    })
  }
  return '{}'
}

// ---------- Eksekusi proposal ----------
async function executeProposal(proposal: Proposal): Promise<{ results: string[]; ok: boolean }> {
  const results: string[] = []
  const catCache = new Map<string, number>()
  // preload cache
  const cats = await db.execute('SELECT id, name FROM categories')
  for (const r of cats.rows) {
    const x = r as { id: number; name: string }
    catCache.set(x.name.toLowerCase(), x.id)
  }

  for (const action of proposal.actions) {
    try {
      if (action.type === 'create_category') {
        const name = String(action.payload.name ?? '').trim()
        const group = action.payload.group ? String(action.payload.group).trim() : null
        const fee = Math.max(0, Math.floor(Number(action.payload.default_fee ?? 0) || 0))
        if (!name) throw new Error('Nama kategori kosong')
        const res = await db.execute({ sql: 'INSERT INTO categories (name, group_name, default_fee) VALUES (?, ?, ?) RETURNING id', args: [name, group, fee] })
        const id = Number((res.rows[0] as { id: number }).id)
        catCache.set(name.toLowerCase(), id)
        results.push(`✓ Kategori "${name}" dibuat (grup: ${group ?? '-'}, fee: ${fee})`)
      } else if (action.type === 'create_transaction') {
        let categoryId = Number(action.payload.category_id) || 0
        const catName = action.payload.category_name ? String(action.payload.category_name).trim() : ''
        if (!categoryId && catName) categoryId = catCache.get(catName.toLowerCase()) ?? 0
        if (!categoryId) throw new Error(`Kategori tidak ditemukan: ${catName}`)
        const date = String(action.payload.date ?? todayISO())
        const qty = Math.max(0, Math.floor(Number(action.payload.qty ?? 0) || 0))
        const fee = Math.max(0, Math.floor(Number(action.payload.fee_per_unit ?? 0) || 0))
        const note = action.payload.note ? String(action.payload.note).trim().slice(0, 200) : null
        const total = qty * fee
        await db.execute({
          sql: 'INSERT INTO transactions (category_id, date, qty, fee_per_unit, total, note) VALUES (?, ?, ?, ?, ?, ?)',
          args: [categoryId, date, qty, fee, total, note],
        })
        results.push(`✓ Transaksi: ${catName || 'kategori #' + categoryId} — ${qty} × ${fee} = ${total} (${date})`)
      } else if (action.type === 'update_category_fee') {
        let categoryId = Number(action.payload.category_id) || 0
        const catName = action.payload.category_name ? String(action.payload.category_name).trim() : ''
        if (!categoryId && catName) categoryId = catCache.get(catName.toLowerCase()) ?? 0
        if (!categoryId) throw new Error(`Kategori tidak ditemukan: ${catName}`)
        const newFee = Math.max(0, Math.floor(Number(action.payload.new_fee ?? 0) || 0))
        await db.execute({ sql: 'UPDATE categories SET default_fee = ? WHERE id = ?', args: [newFee, categoryId] })
        results.push(`✓ Fee "${catName || 'kategori #' + categoryId}" diubah jadi ${newFee}`)
      }
    } catch (e) {
      results.push(`✗ ${action.type}: ${(e as Error).message}`)
    }
  }
  return { results, ok: true }
}

// ---------- Handler utama ----------
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as AgentRequest | null
  if (!body || !Array.isArray(body.messages)) return errorJson('Body tidak valid', 400)

  const history: MistralMessage[] = body.messages.map((m) => ({ role: m.role, content: m.content }))
  const messages: MistralMessage[] = [{ role: 'system', content: systemPrompt() }, ...history]

  // === Kasus 1: konfirmasi proposal ===
  if (body.pendingProposal) {
    if (body.confirm) {
      const { results } = await executeProposal(body.pendingProposal)
      const resultText = results.join('\n')
      messages.push({
        role: 'user',
        content: `[SISTEM] User mengkonfirmasi. Aksi berikut telah dieksekusi:\n${resultText}\n\nBeri tahu user singkat & ramah bahwa aksi berhasil (atau ada yang gagal). Jangan ulangi detail berlebihan.`,
      })
      const resp = await mistralChat({ messages, temperature: 0.4 })
      return json({ reply: resp.message.content ?? 'Selesai.', executed: true, results })
    } else {
      messages.push({ role: 'user', content: '[SISTEM] User membatalkan proposal. Akui dengan singkat & ramah.' })
      const resp = await mistralChat({ messages, temperature: 0.4 })
      return json({ reply: resp.message.content ?? 'Oke, dibatalkan.', cancelled: true })
    }
  }

  // === Kasus 2: turn normal dengan tool loop ===
  const MAX_ITER = 6
  for (let i = 0; i < MAX_ITER; i++) {
    const resp = await mistralChat({ messages, tools: TOOLS, temperature: 0.4 })
    const toolCalls = resp.message.tool_calls

    if (!toolCalls || toolCalls.length === 0) {
      // Respons teks biasa
      return json({ reply: resp.message.content ?? '' })
    }

    // Tambahkan pesan assistant (dengan tool_calls) ke history
    messages.push({ role: 'assistant', content: resp.message.content, tool_calls: toolCalls })

    // Proses setiap tool call
    let proposalToReturn: Proposal | null = null
    for (const tc of toolCalls) {
      if (tc.function.name === 'propose_action') {
        try {
          proposalToReturn = JSON.parse(tc.function.arguments) as Proposal
        } catch {
          proposalToReturn = { summary: tc.function.arguments, actions: [] }
        }
        // Beri tahu Mistral bahwa proposal menunggu konfirmasi
        messages.push({ role: 'tool', tool_call_id: tc.id, name: tc.function.name, content: 'Proposal dikirim ke user. Tunggu konfirmasi.' })
      } else {
        let args: Record<string, unknown> = {}
        try { args = JSON.parse(tc.function.arguments) } catch { /* empty */ }
        const result = await executeReadTool(tc.function.name, args)
        messages.push({ role: 'tool', tool_call_id: tc.id, name: tc.function.name, content: result })
      }
    }

    // Jika ada proposal, hentikan loop dan kembalikan ke client
    if (proposalToReturn) {
      // Minta Mistral menulis kalimat pengantar ramah untuk proposal
      const intro = await mistralChat({
        messages: [...messages, { role: 'user', content: '[SISTEM] Tolong tulis kalimat pengantar singkat & ramah untuk proposal di atas, lalu akhiri dengan "Ketik ya untuk konfirmasi atau tidak untuk batal."' }],
        temperature: 0.4,
      })
      return json({ reply: intro.message.content ?? proposalToReturn.summary, proposal: proposalToReturn })
    }
    // else lanjut loop (Mistral akan memproses tool results)
  }

  return json({ reply: 'Maaf, saya butuh informasi lebih. Bisa diulang?' })
}
