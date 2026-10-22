import { supabase } from '../lib/supabaseClient'
import { Level, LEVELS, isValidDang, taxonomyPromptText, toDangCode } from './id6'
import { PartNo, SplitQuestion } from './questionSplitter'

export interface ClassifiedItem {
  part: PartNo
  num: number
  /** Mã dạng có X ở vị trí mức độ, ví dụ 2D1X2-2 ('' nếu AI không trả được mã hợp lệ) */
  dangCode: string
  /** Mức độ AI đánh giá */
  aiLevel: Level
  note: string
  /** Mã AI trả về nhưng không có trong bảng */
  invalidCode?: string
  /** Nhãn [MĐx] AI đọc được (chỉ dùng khi gửi thẳng PDF scan) */
  mdTag?: number | null
}

const PART_NAMES: Record<PartNo, string> = {
  1: 'Phần I – trắc nghiệm nhiều phương án lựa chọn',
  2: 'Phần II – trắc nghiệm đúng/sai (mỗi câu có 4 ý a, b, c, d)',
  3: 'Phần III – trắc nghiệm trả lời ngắn',
}

function systemPrompt(): string {
  return `Bạn là giáo viên Toán THPT (chương trình GDPT 2018) chuyên gán ID phân loại câu hỏi theo BẢNG CHIA DẠNG ID6 bên dưới.

QUY TẮC
1. Với mỗi câu, đọc cả đề và lời giải (nếu có) để xác định kiến thức CHỦ ĐẠO mà câu hỏi kiểm tra, rồi chọn đúng MỘT mã dạng trong bảng. Chỉ dùng mã có trong bảng, giữ nguyên chữ X ở vị trí mức độ (ví dụ 2D1X2-2).
2. Câu đúng/sai có nhiều ý: chọn dạng bao quát nội dung chung của cả câu (bối cảnh và đa số các ý).
3. Bài toán có bối cảnh thực tế/mô hình hoá: ưu tiên dạng "Toán thực tế …" của đúng bài kiến thức dùng để giải (nếu bài đó có dạng như vậy).
4. Phân biệt lớp theo chương trình mới:
   - Xác suất có điều kiện, công thức xác suất toàn phần, Bayes → lớp 12 (2D6…).
   - Biến cố hợp/giao, quy tắc cộng/nhân xác suất → lớp 11 (1D9…). Xác suất cổ điển, đếm không gian mẫu → lớp 10 (0D0…).
   - Véc-tơ trong không gian (chưa toạ độ) và toạ độ véc-tơ, toạ độ điểm trong Oxyz → 2H2…; phương trình mặt phẳng, đường thẳng, mặt cầu → 2H5….
   - Mẫu số liệu ghép nhóm: số trung bình, trung vị, tứ phân vị, mốt → 1D5…; khoảng biến thiên, khoảng tứ phân vị, phương sai, độ lệch chuẩn → 2D3….
   - Hàm số mũ, lôgarit, phương trình/bất phương trình mũ-lôgarit → 1D6…; góc, khoảng cách, thể tích trong không gian → 1H8….
5. Mức độ: N = nhận biết, H = thông hiểu, V = vận dụng, C = vận dụng cao. Tham khảo: Phần I thường N hoặc H; Phần II thường H hoặc V; Phần III thường V hoặc C (bài nhiều bước, mô hình hoá phức tạp → C).
6. "note": tối đa 15 từ, nêu kiến thức chính.

Trả về JSON đúng dạng:
{"items":[{"part":1,"num":1,"code":"2H2X2-2","level":"N","note":"..."}]}

BẢNG CHIA DẠNG ID6
${taxonomyPromptText()}`
}

export interface AiMeta {
  provider: string
  model: string
  fromCache: boolean
}

interface AiPayload {
  system: string
  userText: string
  pdfBase64?: string
}

async function callAi(payload: AiPayload): Promise<{ text: string; provider: string; model: string }> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Phiên đăng nhập giáo viên đã hết hạn. Hãy đăng nhập lại.')
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(json?.error || `Máy chủ AI báo lỗi (${res.status}).`)
  return { text: (json?.text as string) || '', provider: json?.provider || '', model: json?.model || '' }
}

// ---------- Bộ nhớ đệm: cùng một đề tải lại không tốn lượt AI ----------
const CACHE_PREFIX = 'ganid6-cache-v1:'
const CACHE_MAX = 40

async function sha256(input: string | ArrayBuffer): Promise<string> {
  const buf = typeof input === 'string' ? new TextEncoder().encode(input) : input
  const d = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

function cacheGet(key: string): ClassifiedItem[] | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key)
    return raw ? (JSON.parse(raw).items as ClassifiedItem[]) : null
  } catch {
    return null
  }
}

function cacheSet(key: string, items: ClassifiedItem[]) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), items }))
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX))
    if (keys.length > CACHE_MAX) {
      const sorted = keys
        .map((k) => ({ k, t: JSON.parse(localStorage.getItem(k) || '{}').t || 0 }))
        .sort((a, b) => a.t - b.t)
      sorted.slice(0, keys.length - CACHE_MAX).forEach((x) => localStorage.removeItem(x.k))
    }
  } catch {
    /* bộ nhớ trình duyệt đầy hoặc bị chặn — bỏ qua */
  }
}

function parseJsonLoose(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1))
    throw new Error('AI trả về dữ liệu không đọc được. Hãy thử lại.')
  }
}

function normalizeItems(raw: unknown): ClassifiedItem[] {
  const items = (raw as { items?: unknown[] })?.items
  if (!Array.isArray(items)) throw new Error('AI trả về dữ liệu không đúng cấu trúc. Hãy thử lại.')
  const out: ClassifiedItem[] = []
  for (const it of items as Record<string, unknown>[]) {
    const part = Number(it.part) as PartNo
    const num = Number(it.num)
    if (![1, 2, 3].includes(part) || !Number.isInteger(num) || num < 1) continue
    const rawCode = String(it.code ?? '')
    const code = toDangCode(rawCode)
    const lvl = String(it.level ?? '').toUpperCase() as Level
    const valid = !!code && isValidDang(code)
    out.push({
      part,
      num,
      dangCode: valid ? code! : '',
      aiLevel: LEVELS.includes(lvl) ? lvl : 'H',
      note: String(it.note ?? ''),
      invalidCode: valid ? undefined : rawCode || '(trống)',
      mdTag: [1, 2, 3, 4].includes(Number(it.md)) ? Number(it.md) : null,
    })
  }
  return out
}

/**
 * Gán ID cho các câu đã tách được từ văn bản PDF.
 * Gửi CẢ ĐỀ trong 1 lần gọi (tiết kiệm lượt AI); đề dài trên 30 câu mới chia nhóm.
 * Kết quả được lưu đệm theo nội dung đề: tải lại cùng đề không gọi AI nữa.
 */
export async function classifyQuestions(
  questions: SplitQuestion[],
  opts: { force?: boolean } = {}
): Promise<{ items: ClassifiedItem[]; meta: AiMeta }> {
  const key = await sha256(questions.map((q) => `${q.part}|${q.num}|${q.text}`).join('\n'))
  if (!opts.force) {
    const cached = cacheGet(key)
    if (cached) return { items: cached, meta: { provider: '', model: '', fromCache: true } }
  }
  const sys = systemPrompt()
  const groups: SplitQuestion[][] = []
  for (let i = 0; i < questions.length; i += 30) groups.push(questions.slice(i, i + 30))
  let meta: AiMeta = { provider: '', model: '', fromCache: false }
  const items: ClassifiedItem[] = []
  for (const qs of groups) {
    const userText =
      `Gán mã dạng ID6 và mức độ cho ${qs.length} câu sau. ` +
      `part 1 = ${PART_NAMES[1]}; part 2 = ${PART_NAMES[2]}; part 3 = ${PART_NAMES[3]}. ` +
      `Văn bản được rút từ PDF nên công thức có thể bị vỡ, hãy suy luận theo ngữ cảnh. ` +
      `Trả về đủ ${qs.length} phần tử trong "items".\n\n` +
      qs.map((q) => `=== part=${q.part} num=${q.num} ===\n${q.text}`).join('\n\n')
    const r = await callAi({ system: sys, userText })
    meta = { provider: r.provider, model: r.model, fromCache: false }
    items.push(...normalizeItems(parseJsonLoose(r.text)))
  }
  cacheSet(key, items)
  return { items, meta }
}

/** Trường hợp PDF scan (không rút được chữ): gửi nguyên file PDF để AI tự đọc, tách câu và gán ID. */
export async function classifyPdfDirect(
  file: File,
  opts: { force?: boolean } = {}
): Promise<{ items: ClassifiedItem[]; meta: AiMeta }> {
  if (file.size > 3.2 * 1024 * 1024)
    throw new Error('File PDF scan lớn hơn 3,2 MB nên không gửi được cho AI. Hãy nén file hoặc dùng PDF có lớp chữ.')
  const key = 'pdf-' + (await sha256(await file.arrayBuffer()))
  if (!opts.force) {
    const cached = cacheGet(key)
    if (cached) return { items: cached, meta: { provider: '', model: '', fromCache: true } }
  }
  const pdfBase64 = await fileToBase64(file)
  const r = await callAi({
    system: systemPrompt(),
    pdfBase64,
    userText:
      'File PDF đính kèm là đề thi (có thể kèm lời giải). Hãy tự xác định từng câu hỏi theo 3 phần ' +
      '(part 1: nhiều phương án, part 2: đúng/sai, part 3: trả lời ngắn; số câu đánh lại từ 1 ở mỗi phần), ' +
      'rồi gán mã dạng ID6 và mức độ cho TẤT CẢ các câu. Nếu đề có nhãn mức độ như [MĐ1], [MĐ2]… thì ghi thêm trường "md" là số đó.',
  })
  const items = normalizeItems(parseJsonLoose(r.text))
  cacheSet(key, items)
  return { items, meta: { provider: r.provider, model: r.model, fromCache: false } }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
