/**
 * Vercel Serverless Function: chuyển tiếp yêu cầu tới Google Gemini, giữ API key ở phía máy chủ.
 * Chỉ giáo viên đã đăng nhập (có access token Supabase hợp lệ) mới gọi được.
 *
 * Biến môi trường cần đặt trên Vercel (Project → Settings → Environment Variables):
 *   GEMINI_API_KEY   – bắt buộc
 *   GEMINI_MODEL     – tuỳ chọn, mặc định thử lần lượt gemini-3.6-flash → gemini-3.8-flash → gemini-2.5-flash
 *   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY – đã có sẵn của dự án
 */

// Không phụ thuộc @types/node
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env

const DEFAULT_MODELS = ['gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-2.5-flash']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Req = { method?: string; headers: Record<string, string | string[] | undefined>; body?: any }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Res = { status: (code: number) => Res; json: (data: any) => void; setHeader: (k: string, v: string) => void }

async function verifyTeacher(authHeader: string | undefined): Promise<boolean> {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
  if (!url || !anon || !authHeader?.startsWith('Bearer ')) return false
  const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: authHeader } })
  return r.ok
}

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Chỉ hỗ trợ POST.' })

  const apiKey = env.GEMINI_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'Máy chủ chưa cấu hình GEMINI_API_KEY trên Vercel.' })

  const auth = req.headers['authorization']
  if (!(await verifyTeacher(Array.isArray(auth) ? auth[0] : auth)))
    return res.status(401).json({ error: 'Cần đăng nhập tài khoản giáo viên.' })

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  if (!body || !Array.isArray(body.contents)) return res.status(400).json({ error: 'Yêu cầu không hợp lệ.' })

  const models = env.GEMINI_MODEL ? [env.GEMINI_MODEL, ...DEFAULT_MODELS] : DEFAULT_MODELS
  let lastError = ''
  for (const model of [...new Set(models)]) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: body.systemInstruction,
        contents: body.contents,
        generationConfig: body.generationConfig,
      }),
    })
    const data = await r.json().catch(() => null)
    if (r.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parts: any[] = data?.candidates?.[0]?.content?.parts || []
      const text = parts
        .filter((p) => !p.thought)
        .map((p) => p.text || '')
        .join('')
      if (!text) return res.status(502).json({ error: 'AI không trả về nội dung (có thể do bộ lọc an toàn). Hãy thử lại.' })
      return res.status(200).json({ text, model })
    }
    lastError = data?.error?.message || `HTTP ${r.status}`
    // Model không tồn tại / không còn phục vụ → thử model kế tiếp; lỗi khác → dừng
    if (r.status !== 404 && !/not found|not supported|no longer available/i.test(lastError)) break
  }
  return res.status(502).json({ error: `Gemini báo lỗi: ${lastError}` })
}
