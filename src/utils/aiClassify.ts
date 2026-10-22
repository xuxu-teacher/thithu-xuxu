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
  /** Nhãn [MĐx] AI đọc được trong đề */
  mdTag?: number | null
  /** Vài chữ đầu của câu do AI chép lại từ đề — để giáo viên đối chiếu đúng câu */
  start?: string
}

/** Số câu mỗi phần mà đề tự ghi (vd "từ câu 1 đến câu 12") — AI đọc từ đề */
export type DeclaredCounts = Partial<Record<PartNo, number>>

export interface AiMeta {
  provider: string
  model: string
  fromCache: boolean
  /** 'pdf' = AI đọc thẳng file PDF; 'text' = AI đọc chữ rút từ PDF */
  mode: 'pdf' | 'text'
}

export interface ClassifyResult {
  items: ClassifiedItem[]
  declared: DeclaredCounts
  meta: AiMeta
}

const PART_NAMES: Record<PartNo, string> = {
  1: 'Phần I – trắc nghiệm nhiều phương án lựa chọn',
  2: 'Phần II – trắc nghiệm đúng/sai (mỗi câu có 4 ý a, b, c, d)',
  3: 'Phần III – trắc nghiệm trả lời ngắn',
}

/** Tổng dung lượng PDF tối đa gửi thẳng cho AI (giới hạn 4,5 MB/yêu cầu của Vercel, base64 tăng ~33%) */
export const MAX_PDF_BYTES = 3.2 * 1024 * 1024

function systemPrompt(): string {
  return `Bạn là giáo viên Toán THPT (chương trình GDPT 2018) chuyên gán ID phân loại câu hỏi theo BẢNG CHIA DẠNG ID6 bên dưới.

QUY TẮC
1. Với mỗi câu, đọc cả đề và lời giải (nếu có) để xác định kiến thức CHỦ ĐẠO mà câu hỏi kiểm tra, rồi chọn đúng MỘT mã dạng trong bảng. Chỉ dùng mã có trong bảng, giữ nguyên chữ X ở vị trí mức độ (ví dụ 2D1X2-2).
2. Câu đúng/sai có nhiều ý: chọn dạng bao quát nội dung chung của cả câu (bối cảnh và đa số các ý).
3. Bài toán có bối cảnh thực tế/mô hình hoá: ưu tiên dạng "Toán thực tế …" của đúng bài kiến thức dùng để giải (nếu bài đó có dạng như vậy).
4. Phân biệt lớp theo chương trình mới:
   - Xác suất có điều kiện, công thức xác suất toàn phần, Bayes → lớp 12 (2D6…).
   - Biến cố hợp/giao, quy tắc cộng/nhân xác suất → lớp 11 (1D9…). Xác suất cổ điển, đếm không gian mẫu → lớp 10 (0D0…).
   - Véc-tơ, lực, tổng hợp lực trong KHÔNG GIAN (chưa toạ độ) → 2H2X1…; toạ độ véc-tơ, toạ độ điểm trong Oxyz → 2H2X2…; phương trình mặt phẳng, đường thẳng, mặt cầu → 2H5…. Chỉ dùng véc-tơ lớp 10 (0H5…) khi bài hoàn toàn trong mặt phẳng.
   - Mẫu số liệu ghép nhóm: số trung bình, trung vị, tứ phân vị, mốt → 1D5…; khoảng biến thiên, khoảng tứ phân vị, phương sai, độ lệch chuẩn → 2D3….
   - Hàm số mũ, lôgarit, phương trình/bất phương trình mũ-lôgarit → 1D6…; góc, khoảng cách, thể tích trong không gian → 1H8….
5. Mức độ: N = nhận biết, H = thông hiểu, V = vận dụng, C = vận dụng cao. Tham khảo: Phần I thường N hoặc H; Phần II thường H hoặc V; Phần III thường V hoặc C (bài nhiều bước, mô hình hoá phức tạp → C).
6. "start": chép NGUYÊN VĂN khoảng 12–15 chữ đầu của đề bài câu đó (bỏ chữ "Câu n." và nhãn [MĐ]), để giáo viên đối chiếu.
7. "md": nếu đề ghi nhãn mức độ như [MĐ1], [MĐ2]… cho câu đó thì ghi số đó, không có thì để null.
8. "note": tối đa 15 từ, nêu kiến thức chính.
9. KHÔNG được bỏ sót câu nào. Số câu đánh lại từ 1 ở mỗi phần. "declared": số câu của từng phần theo lời dẫn của đề (vd "từ câu 1 đến câu 12" → 12); không thấy thì đếm.

Trả về JSON đúng dạng:
{"declared":{"1":12,"2":4,"3":6},"items":[{"part":1,"num":1,"start":"Cho hàm số y = f(x) có đạo hàm …","md":1,"code":"2H2X2-2","level":"N","note":"..."}]}

BẢNG CHIA DẠNG ID6
${taxonomyPromptText()}`
}

interface AiPayload {
  system: string
  userText: string
  pdfs?: string[]
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
const CACHE_PREFIX = 'ganid6-cache-v2:'
const CACHE_MAX = 40

async function sha256(input: string | ArrayBuffer): Promise<string> {
  const buf = typeof input === 'string' ? new TextEncoder().encode(input) : input
  const d = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

type CacheValue = { items: ClassifiedItem[]; declared: DeclaredCounts; mode: 'pdf' | 'text' }

function cacheGet(key: string): CacheValue | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key)
    return raw ? (JSON.parse(raw) as CacheValue) : null
  } catch {
    return null
  }
}

function cacheSet(key: string, v: CacheValue) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), ...v }))
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

function normalize(raw: unknown): { items: ClassifiedItem[]; declared: DeclaredCounts } {
  const obj = raw as { items?: unknown[]; declared?: Record<string, unknown> }
  if (!Array.isArray(obj?.items)) throw new Error('AI trả về dữ liệu không đúng cấu trúc. Hãy thử lại.')
  const declared: DeclaredCounts = {}
  for (const p of [1, 2, 3] as PartNo[]) {
    const n = Number(obj.declared?.[String(p)])
    if (Number.isInteger(n) && n > 0 && n <= 60) declared[p] = n
  }
  const seen = new Set<string>()
  const items: ClassifiedItem[] = []
  for (const it of obj.items as Record<string, unknown>[]) {
    const part = Number(it.part) as PartNo
    const num = Number(it.num)
    if (![1, 2, 3].includes(part) || !Number.isInteger(num) || num < 1) continue
    const k = `${part}-${num}`
    if (seen.has(k)) continue // AI lặp câu → giữ lần đầu
    seen.add(k)
    const rawCode = String(it.code ?? '')
    const code = toDangCode(rawCode)
    const lvl = String(it.level ?? '').toUpperCase() as Level
    const valid = !!code && isValidDang(code)
    items.push({
      part,
      num,
      dangCode: valid ? code! : '',
      aiLevel: LEVELS.includes(lvl) ? lvl : 'H',
      note: String(it.note ?? ''),
      invalidCode: valid ? undefined : rawCode || '(trống)',
      mdTag: [1, 2, 3, 4].includes(Number(it.md)) ? Number(it.md) : null,
      start: typeof it.start === 'string' ? it.start.slice(0, 200) : undefined,
    })
  }
  items.sort((a, b) => a.part - b.part || a.num - b.num)
  return { items, declared }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/**
 * Gán ID cho cả đề trong 1 lượt AI.
 * Ưu tiên gửi NGUYÊN FILE PDF cho AI đọc (thấy đúng công thức, hình vẽ, bố cục 2 cột) — chính xác hơn
 * nhiều so với chữ rút từ PDF (công thức MathType thường bị vỡ, câu bị dính/mất).
 * Chỉ khi file quá lớn mới dùng chữ đã tách (textQuestions).
 * Kết quả lưu đệm theo nội dung file: tải lại cùng đề không tốn lượt.
 */
export async function classifyExam(
  files: File[],
  textQuestions: SplitQuestion[],
  opts: { force?: boolean } = {}
): Promise<ClassifyResult> {
  const totalBytes = files.reduce((s, f) => s + f.size, 0)
  const usePdf = totalBytes <= MAX_PDF_BYTES
  if (!usePdf && textQuestions.length === 0)
    throw new Error('File PDF lớn hơn 3,2 MB và không rút được chữ. Hãy nén file PDF (vd ilovepdf.com) rồi thử lại.')

  const hashes: string[] = []
  for (const f of files) hashes.push(await sha256(await f.arrayBuffer()))
  const key = `${usePdf ? 'pdf' : 'text'}-${await sha256(hashes.join('|'))}`
  if (!opts.force) {
    const c = cacheGet(key)
    if (c) return { items: c.items, declared: c.declared, meta: { provider: '', model: '', fromCache: true, mode: c.mode } }
  }

  let r: { text: string; provider: string; model: string }
  if (usePdf) {
    const pdfs: string[] = []
    for (const f of files) pdfs.push(await fileToBase64(f))
    r = await callAi({
      system: systemPrompt(),
      pdfs,
      userText:
        (files.length > 1
          ? `Có ${files.length} file PDF: file đầu là đề, các file sau là lời giải của CÙNG đề đó. `
          : 'File PDF là đề thi (có thể kèm lời giải ở cuối). ') +
        'Hãy xác định TẤT CẢ các câu hỏi của đề theo 3 phần ' +
        `(part 1 = ${PART_NAMES[1]}; part 2 = ${PART_NAMES[2]}; part 3 = ${PART_NAMES[3]}), ` +
        'không tính trùng phần lời giải lặp lại đề, rồi gán mã dạng ID6 và mức độ cho từng câu.',
    })
  } else {
    r = await callAi({
      system: systemPrompt(),
      userText:
        `Gán mã dạng ID6 và mức độ cho ${textQuestions.length} câu sau. ` +
        `part 1 = ${PART_NAMES[1]}; part 2 = ${PART_NAMES[2]}; part 3 = ${PART_NAMES[3]}. ` +
        `Văn bản được rút từ PDF nên công thức có thể bị vỡ, hãy suy luận theo ngữ cảnh. ` +
        `Trả về đủ ${textQuestions.length} phần tử trong "items".\n\n` +
        textQuestions.map((q) => `=== part=${q.part} num=${q.num} ===\n${q.text}`).join('\n\n'),
    })
  }

  const { items, declared } = normalize(parseJsonLoose(r.text))
  if (items.length === 0) throw new Error('AI không nhận ra câu hỏi nào trong file. Hãy kiểm tra lại file PDF.')
  const mode = usePdf ? 'pdf' : 'text'
  cacheSet(key, { items, declared, mode })
  return { items, declared, meta: { provider: r.provider, model: r.model, fromCache: false, mode } }
}
