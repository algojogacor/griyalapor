/**
 * Mistral AI client (server-side only).
 * Mendukung function calling / tool use untuk AI Agent GriyaLapor.
 * Docs: https://docs.mistral.ai/capabilities/function_calling/
 */

const MISTRAL_URL = 'https://api.mistral.ai/v1/chat/completions'

export interface MistralMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: MistralToolCall[]
  tool_call_id?: string
  name?: string
}

export interface MistralToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface MistralTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface MistralResponse {
  message: MistralMessage
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
}

export function getMistralKeys(): string[] {
  const keys = [process.env.MISTRAL_API_KEY, process.env.MISTRAL_API_KEY_BACKUP].filter(
    (k): k is string => !!k,
  )
  if (keys.length === 0) throw new Error('MISTRAL_API_KEY tidak ditemukan di environment')
  return keys
}

export function getMistralModel(): string {
  return process.env.MISTRAL_MODEL ?? 'mistral-large-latest'
}

/**
 * Memanggil Mistral chat completion dengan dukungan tools.
 * Otomatis fallback ke API key cadangan jika terkena rate limit (429) / auth (401).
 */
export async function mistralChat(opts: {
  messages: MistralMessage[]
  tools?: MistralTool[]
  temperature?: number
  toolChoice?: 'auto' | 'any' | 'none'
}): Promise<MistralResponse> {
  const keys = getMistralKeys()
  const body: Record<string, unknown> = {
    model: getMistralModel(),
    messages: opts.messages,
    temperature: opts.temperature ?? 0.3,
  }
  if (opts.tools && opts.tools.length > 0) {
    body.tools = opts.tools
    body.tool_choice = opts.toolChoice ?? 'auto'
  }

  let lastErr = ''
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    const res = await fetch(MISTRAL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      const data = await res.json()
      const choice = data?.choices?.[0]
      if (!choice) throw new Error('Mistral: respons tidak memiliki choices')
      return {
        message: {
          role: 'assistant',
          content: choice.message?.content ?? null,
          tool_calls: choice.message?.tool_calls,
        },
        usage: data?.usage,
      }
    }

    const text = await res.text().catch(() => '')
    lastErr = `Mistral API error ${res.status}: ${text}`
    // Hanya fallback untuk 429 (rate limit) atau 401 (auth)
    if (res.status !== 429 && res.status !== 401) break
    // Jeda singkat sebelum mencoba key berikutnya
    if (i < keys.length - 1) await new Promise((r) => setTimeout(r, 800))
  }
  throw new Error(lastErr || 'Mistral API gagal')
}
