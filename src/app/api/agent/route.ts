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
                    'create_transaction: {category_name atau category_id, date(YYYY-MM-DD), qty, fee_per_unit, bill_per_unit?(nominal tagihan/pelanggan, 0 jika tidak disebut), note?}. ' +
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
  return `Kamu adalah Asisten AI GriyaLapor, asisten keuangan untuk usaha PPOB (Pembayaran Pos Online: PLN, PDAM, BPJS, pulsa, dll) milik keluarga. Penggunanya orang lanjut usia.

MODEL BISNIS PPOB (WAJIB dipahami):
- Pelanggan bayar TAGIHAN + FEE ADMIN ke agen. Agen meneruskan tagihan ke penyedia, dan KEEP FEE ADMIN sebagai pendapatan.
- "Pendapatan Bersih" = fee admin = qty × fee_per_unit. INI METRIK UTAMA, yang paling penting.
- "Pendapatan Kotor" / "Omzet" = total uang dari pembeli = qty × (nominal_tagihan + fee). Hanya bisa dihitung kalau nominal tagihan ikut dicatat.
- "Pengeluaran Operasional" = biaya operasional (bensin, listrik tempat, dll). Ini HAL TERPISAH, BUKAN pengurang dari pendapatan bersih. Jangan pernah bilang "pendapatan bersih = kotor - pengeluaran". Yang benar: Laba Operasional = Pendapatan Bersih - Pengeluaran.
- Jadi kalau user tanya "pendapatan" tanpa keterangan, jawab dengan PENDAPATAN BERSIH (fee admin). Jangan pakai istilah "kotor" kecuali user spesifik tanya omzet/uang pembeli.

GAYA BAHASA:
- Bahasa Indonesia, ramah, singkat, to-the-point. Satu halusun per topik.
- Kalimat pendek. Istilah awam. Tidak bertele-tele.
- BOLEH pakai format list (•) untuk rekap/rincian supaya mudah dibaca.
- JANGAN berlebihan pakai **bold** atau _italic_. Cukup pakai untuk angka penting saja, secukupnya.
- JANGAN pakai emoji kecuali 1 emoji penutup ramah (✓ untuk konfirmasi sukses boleh).
- Jangan pakai garis pemisah ---.
- Jangan ulang pertanyaan user.

ATURAN AKSI:
1. Tanggal hari ini: ${today} (Asia/Jakarta). "hari ini" = tanggal itu, "bulan ini" = bulan tanggal itu.
2. Sebelum aksi yang MENGUBAH data (tambah transaksi, buat kategori, ubah fee), WAJIB usulkan lewat tool propose_action lalu tunggu konfirmasi. Jangan pernah bilang "sudah dicatat" sebelum dikonfirmasi user.
3. Untuk pertanyaan data, pakai tool get_categories / get_transactions / get_summary. Jawab angka konkret + format rupiah (Rp147.000).
4. Kalau kategori yang disebut user belum ada, usulkan buat kategori dulu (tebak grup & fee default masuk akal) lalu catat transaksinya dalam SATU proposal.
5. "adminnya 3000" / "fee 3000" = fee per unit (rupiah).
6. Kalau user sebut nominal tagihan (mis. "tagihannya 200 ribu"), sertakan bill_per_unit di payload transaksi. Kalau tidak disebut, biarkan bill_per_unit = 0.
7. Jangan mengarang data. Kalau ragu (mis. kategori ambigu), tanya klarifikasi singkat.
8. Format uang selalu Rp + titik ribuan. Contoh: Rp1.234.000.
9. Untuk rekap: ambil data via get_summary/get_transactions, rangkum dengan poin ringkas. Utamakan pendapatan bersih. Sebut omzet hanya kalau ada datanya, dan pengeluaran hanya kalau ada.`
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
      sql: `SELECT t.id, t.date, t.qty, t.fee_per_unit, t.total, t.bill_per_unit, t.note, c.name as category_name
            FROM transactions t JOIN categories c ON c.id = t.category_id ${where} ORDER BY t.date DESC, t.id DESC LIMIT 50`,
      args: a,
    })
    const rows = res.rows.map((r) => {
      const x = r as { id: number; date: string; qty: number; fee_per_unit: number; total: number; bill_per_unit: number; note: string | null; category_name: string }
      return {
        id: x.id, date: x.date, category: x.category_name, qty: x.qty, fee_per_unit: x.fee_per_unit,
        pendapatan_bersih: x.total, // fee admin
        bill_per_unit: x.bill_per_unit, // nominal tagihan per pelanggan (0 jika tidak dicatat)
        omzet: x.qty * (x.bill_per_unit + x.fee_per_unit), // total uang pembeli
        note: x.note,
      }
    })
    return JSON.stringify(rows)
  }
  if (name === 'get_summary') {
    const period = args.period as 'today' | 'week' | 'month'
    const range = period === 'today' ? { from: todayISO(), to: todayISO() } : period === 'week' ? thisWeekRange() : thisMonthRange()
    const [t, e] = await Promise.all([
      db.execute({
        sql: 'SELECT COUNT(*) as c, COALESCE(SUM(total),0) as admin, COALESCE(SUM(qty*(bill_per_unit+fee_per_unit)),0) as omzet FROM transactions WHERE date >= ? AND date <= ?',
        args: [range.from, range.to],
      }),
      db.execute({ sql: 'SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as total FROM expenses WHERE date >= ? AND date <= ?', args: [range.from, range.to] }),
    ])
    const tx = t.rows[0] as { c: number; admin: number; omzet: number }
    const ex = e.rows[0] as { c: number; total: number }
    return JSON.stringify({
      period,
      range,
      pendapatan_bersih: Number(tx.admin),      // fee admin yang didapat agen — METRIK UTAMA
      omzet: Number(tx.omzet),                  // total uang pembeli (kalau ada nominal tagihan)
      transaksi: { count: Number(tx.c) },
      pengeluaran: { count: Number(ex.c), total: Number(ex.total) },
      laba_operasional: Number(tx.admin) - Number(ex.total), // bersih - pengeluaran
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
        const bill = Math.max(0, Math.floor(Number(action.payload.bill_per_unit ?? 0) || 0))
        const note = action.payload.note ? String(action.payload.note).trim().slice(0, 200) : null
        const total = qty * fee // pendapatan bersih (fee admin)
        await db.execute({
          sql: 'INSERT INTO transactions (category_id, date, qty, fee_per_unit, total, bill_per_unit, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
          args: [categoryId, date, qty, fee, total, bill, note],
        })
        const omzetInfo = bill > 0 ? ` (omzet ${qty * (bill + fee)})` : ''
        results.push(`✓ Transaksi: ${catName || 'kategori #' + categoryId} — ${qty} × ${fee} = ${total}${omzetInfo} (${date})`)
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
