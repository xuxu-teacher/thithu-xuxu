/**
 * Vercel Serverless Function cho tính năng Gán ID6: nhận prompt từ trình duyệt, gọi AI ở phía máy chủ
 * (giữ API key bí mật). Chỉ giáo viên đã đăng nhập (access token Supabase hợp lệ) mới gọi được.
 *
 * Chiến lược tiết kiệm: thử lần lượt các model Gemini MIỄN PHÍ (mỗi model có hạn mức/ngày riêng);
 * khi tất cả hết lượt mới chuyển sang Claude Haiku (trả phí, rất rẻ) nếu có ANTHROPIC_API_KEY.
 *
 * Biến môi trường trên Vercel (Project → Settings → Environment Variables):
 *   GEMINI_API_KEY      – khoá Gemini (miễn phí hoặc đã bật thanh toán)
 *   GEMINI_MODELS       – tuỳ chọn, danh sách model cách nhau dấu phẩy (mặc định xem DEFAULT_GEMINI_MODELS)
 *   ANTHROPIC_API_KEY   – tuỳ chọn, dự phòng khi Gemini hết lượt (cùng khoá đang dùng cho Kho câu hỏi)
 *   CLAUDE_MODEL        – tuỳ chọn, mặc định claude-haiku-4-5-20251001
 *   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY – đã có sẵn của dự án
 *
 * Body nhận vào: { system: string, userText: string, pdfBase64?: string }
 * Trả về: { text, provider, model }
 */

// Không phụ thuộc @types/node
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env

const DEFAULT_GEMINI_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash']
const DEFAULT_CLAUDE_MODEL = 'claude-haiku-4-5-20251001'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Req = { method?: string; headers: Record<string, string | string[] | undefined>; body?: any }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Res = { status: (code: number) => Res; json: (data: any) => void; setHeader: (k: string, v: string) => void }

interface Payload {
  system: string
  userText: string
  pdfBase64?: string
}

interface Attempt {
  ok: boolean
  text?: string
  status?: number
  error?: string
}

async function verifyTeacher(authHeader: string | undefined): Promise<boolean> {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
  if (!url || !anon || !authHeader?.startsWith('Bearer ')) return false
  const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: authHeader } })
  return r.ok
}

async function callGemini(model: string, apiKey: string, p: Payload): Promise<Attempt> {
  const parts: unknown[] = []
  if (p.pdfBase64) parts.push({ inline_data: { mime_type: 'application/pdf', data: p.pdfBase64 } })
  parts.push({ text: p.userText })
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: p.system }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' },
    }),
  })
  const data = await r.json().catch(() => null)
  if (!r.ok) return { ok: false, status: r.status, error: data?.error?.message || `HTTP ${r.status}` }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = data?.candidates?.[0]?.content?.parts || []
  const text = out
    .filter((x) => !x.thought)
    .map((x) => x.text || '')
    .join('')
  return text ? { ok: true, text } : { ok: false, status: 502, error: 'Gemini không trả về nội dung.' }
}

async function callClaude(model: string, apiKey: string, p: Payload): Promise<Attempt> {
  const content: unknown[] = []
  if (p.pdfBase64)
    content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: p.pdfBase64 } })
  content.push({ type: 'text', text: p.userText + '\n\nChỉ trả về JSON, không giải thích, không markdown.' })
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model,
      max_tokens: 8000,
      temperature: 0,
      // Bảng ID6 dài và lặp lại mỗi lần → bật prompt caching để giảm chi phí những lần gọi sau
      system: [{ type: 'text', text: p.system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content }],
    }),
  })
  const data = await r.json().catch(() => null)
  if (!r.ok) return { ok: false, status: r.status, error: data?.error?.message || `HTTP ${r.status}` }
  const text = (data?.content ?? [])
    .map((b: { type: string; text?: string }) => (b.type === 'text' ? b.text : ''))
    .join('')
  return text ? { ok: true, text } : { ok: false, status: 502, error: 'Claude không trả về nội dung.' }
}

/** Lỗi nên thử model khác: hết hạn mức (429), model không tồn tại (404), quá tải (500/503) */
function shouldFallback(a: Attempt): boolean {
  return a.status === 429 || a.status === 404 || (a.status !== undefined && a.status >= 500) || /quota|not found|overloaded/i.test(a.error || '')
}

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Chỉ hỗ trợ POST.' })

  const auth = req.headers['authorization']
  if (!(await verifyTeacher(Array.isArray(auth) ? auth[0] : auth)))
    return res.status(401).json({ error: 'Cần đăng nhập tài khoản giáo viên.' })

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const p: Payload = { system: String(body?.system || ''), userText: String(body?.userText || ''), pdfBase64: body?.pdfBase64 }
  if (!p.system || !p.userText) return res.status(400).json({ error: 'Yêu cầu không hợp lệ.' })

  const geminiKey = env.GEMINI_API_KEY
  const claudeKey = env.ANTHROPIC_API_KEY
  if (!geminiKey && !claudeKey)
    return res.status(500).json({ error: 'Máy chủ chưa cấu hình GEMINI_API_KEY hoặc ANTHROPIC_API_KEY trên Vercel.' })

  const log: string[] = []
  let quotaHit = false

  if (geminiKey) {
    const models = (env.GEMINI_MODELS || '').split(',').map((s) => s.trim()).filter(Boolean)
    for (const model of models.length ? models : DEFAULT_GEMINI_MODELS) {
      const a = await callGemini(model, geminiKey, p)
      if (a.ok) return res.status(200).json({ text: a.text, provider: 'gemini', model })
      if (a.status === 429) quotaHit = true
      log.push(`${model}: ${a.status} ${(a.error || '').slice(0, 120)}`)
      if (!shouldFallback(a)) break
    }
  }

  if (claudeKey) {
    const model = env.CLAUDE_MODEL || DEFAULT_CLAUDE_MODEL
    const a = await callClaude(model, claudeKey, p)
    if (a.ok) return res.status(200).json({ text: a.text, provider: 'claude', model })
    log.push(`${model}: ${a.status} ${(a.error || '').slice(0, 120)}`)
  }

  const msg = quotaHit
    ? 'Đã hết lượt AI miễn phí trong ngày (Gemini). Hạn mức tự làm mới lúc khoảng 14–15 giờ chiều (giờ Việt Nam). ' +
      (claudeKey ? '' : 'Muốn dùng tiếp ngay: thêm ANTHROPIC_API_KEY vào Vercel hoặc bật thanh toán cho Gemini.')
    : 'Không gọi được AI.'
  return res.status(502).json({ error: `${msg}\nChi tiết: ${log.join(' | ')}` })
}
