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

async function callGemini(body: unknown): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Phiên đăng nhập giáo viên đã hết hạn. Hãy đăng nhập lại.')
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(json?.error || `Máy chủ AI báo lỗi (${res.status}).`)
  return (json?.text as string) || ''
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

/** Gán ID cho các câu đã tách được từ văn bản PDF. Gửi song song theo từng phần. */
export async function classifyQuestions(questions: SplitQuestion[]): Promise<ClassifiedItem[]> {
  const sys = systemPrompt()
  const groups: SplitQuestion[][] = []
  for (const p of [1, 2, 3] as PartNo[]) {
    const qs = questions.filter((q) => q.part === p)
    for (let i = 0; i < qs.length; i += 12) groups.push(qs.slice(i, i + 12))
  }
  const results = await Promise.all(
    groups.map(async (qs) => {
      const userText =
        `Gán mã dạng ID6 và mức độ cho ${qs.length} câu sau (${PART_NAMES[qs[0].part]}). ` +
        `Văn bản được rút từ PDF nên công thức có thể bị vỡ, hãy suy luận theo ngữ cảnh.\n\n` +
        qs.map((q) => `=== part=${q.part} num=${q.num} ===\n${q.text}`).join('\n\n')
      const text = await callGemini({
        systemInstruction: { parts: [{ text: sys }] },
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      })
      return normalizeItems(parseJsonLoose(text))
    })
  )
  return results.flat()
}

/** Trường hợp PDF scan (không rút được chữ): gửi nguyên file PDF để AI tự đọc, tách câu và gán ID. */
export async function classifyPdfDirect(file: File): Promise<ClassifiedItem[]> {
  if (file.size > 3.2 * 1024 * 1024)
    throw new Error('File PDF scan lớn hơn 3,2 MB nên không gửi được cho AI. Hãy nén file hoặc dùng PDF có lớp chữ.')
  const base64 = await fileToBase64(file)
  const text = await callGemini({
    systemInstruction: { parts: [{ text: systemPrompt() }] },
    contents: [
      {
        role: 'user',
        parts: [
          { inline_data: { mime_type: 'application/pdf', data: base64 } },
          {
            text:
              'File PDF trên là đề thi (có thể kèm lời giải). Hãy tự xác định từng câu hỏi theo 3 phần ' +
              '(part 1: nhiều phương án, part 2: đúng/sai, part 3: trả lời ngắn; số câu đánh lại từ 1 ở mỗi phần), ' +
              'rồi gán mã dạng ID6 và mức độ cho TẤT CẢ các câu. Nếu đề có nhãn mức độ như [MĐ1], [MĐ2]… thì ghi thêm trường "md" là số đó.',
          },
        ],
      },
    ],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' },
  })
  return normalizeItems(parseJsonLoose(text))
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
