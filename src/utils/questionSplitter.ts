/**
 * Tách văn bản (rút từ PDF đề + lời giải) thành từng câu hỏi theo 3 phần của đề TN THPT:
 *   Phần I  – trắc nghiệm nhiều phương án
 *   Phần II – trắc nghiệm đúng/sai
 *   Phần III – trả lời ngắn
 * Ưu tiên lấy nội dung trong mục "LỜI GIẢI CHI TIẾT" (có cả đề + lời giải) nếu có.
 */

export type PartNo = 1 | 2 | 3

export interface SplitQuestion {
  part: PartNo
  num: number
  /** Nội dung câu (kèm lời giải nếu có), đã cắt gọn */
  text: string
  /** Nhãn mức độ có sẵn trong đề, ví dụ [MĐ2] → 2 */
  mdTag: number | null
}

export interface SplitResult {
  questions: SplitQuestion[]
  usedSolutionSection: boolean
  warnings: string[]
}

const MAX_CHARS_PER_QUESTION = 2200

// Chỉ bắt tiêu đề VIẾT HOA (vd "LỜI GIẢI CHI TIẾT"); không bắt dòng "Lời giải"/"Hướng dẫn giải" dưới từng câu
const SOLUTION_HEADING =
  /(L[ỜO]I\s+GI[ẢA]I\s+CHI\s+TI[ẾE]T|H[ƯU][ỚO]NG\s+D[ẪA]N\s+GI[ẢA]I\s+CHI\s+TI[ẾE]T|L[ỜO]I\s+GI[ẢA]I\s+THAM\s+KH[ẢA]O|ĐÁP\s+ÁN\s+VÀ\s+LỜI\s+GIẢI)/g

const PART_HEADING = /^\s*PH[ẦA]N\s+(III|II|I|3|2|1)\b/i
// "Câu 1." / "Câu 1:" / "Câu 5 [MĐ3]" — phân biệt hoa thường và bắt buộc có dấu . : hoặc nhãn [ ngay sau số,
// để KHÔNG bắt các dòng bảng đáp án như "Câu 1 2 3 4" hay "CÂU 1 CÂU 2 CÂU 3 CÂU 4"
const QUESTION_START = /^\s*Câu\s+(\d{1,2})\s*(?:[.:]|(?=\[))/
const MD_TAG = /[[(]\s*M[ĐD]\s*([1-4])\s*[\])]/i

function romanToPart(s: string): PartNo {
  const u = s.toUpperCase()
  if (u === 'III' || u === '3') return 3
  if (u === 'II' || u === '2') return 2
  return 1
}

function normalize(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
}

interface RawQ {
  part: number
  num: number
  lines: string[]
}

function parseBlock(text: string): RawQ[] {
  const lines = text.split('\n')
  const out: RawQ[] = []
  let part = 1
  let explicitPartSinceLast = false
  let current: RawQ | null = null

  for (const line of lines) {
    const ph = line.match(PART_HEADING)
    if (ph) {
      part = romanToPart(ph[1])
      explicitPartSinceLast = true
      if (current) {
        out.push(current)
        current = null
      }
      continue
    }
    const qm = line.match(QUESTION_START)
    if (qm) {
      const num = parseInt(qm[1], 10)
      if (current) out.push(current)
      // Đánh số quay lại 1 mà không có tiêu đề PHẦN → sang phần kế tiếp
      if (num === 1 && out.length > 0 && !explicitPartSinceLast) part += 1
      explicitPartSinceLast = false
      current = { part, num, lines: [line] }
      continue
    }
    if (current) current.lines.push(line)
  }
  if (current) out.push(current)
  return out
}

function finalize(raw: RawQ[]): SplitQuestion[] {
  // Nếu cả đề và lời giải nằm chung (không có tiêu đề), phần sẽ chạy tới 4,5,6 → quy về 1,2,3.
  // Câu xuất hiện sau (thường là bản có lời giải) ghi đè câu xuất hiện trước.
  const map = new Map<string, SplitQuestion>()
  for (const q of raw) {
    const part = ((((q.part - 1) % 3) + 3) % 3 + 1) as PartNo
    let text = q.lines.join('\n').trim()
    if (text.length > MAX_CHARS_PER_QUESTION) text = text.slice(0, MAX_CHARS_PER_QUESTION) + ' …'
    const md = text.slice(0, 300).match(MD_TAG)
    map.set(`${part}-${q.num}`, { part, num: q.num, text, mdTag: md ? parseInt(md[1], 10) : null })
  }
  return [...map.values()].sort((a, b) => a.part - b.part || a.num - b.num)
}

export function splitQuestions(fullText: string): SplitResult {
  const text = normalize(fullText)
  const warnings: string[] = []

  // Tìm tiêu đề lời giải cuối cùng mà phía sau còn câu hỏi
  let solutionStart = -1
  for (const m of text.matchAll(SOLUTION_HEADING)) {
    const after = text.slice(m.index! + m[0].length)
    if (/\n\s*C[âa]u\s+1\s*[.:[]/i.test(after)) solutionStart = m.index!
  }

  let usedSolutionSection = false
  let raw: RawQ[] = []
  if (solutionStart >= 0) {
    raw = parseBlock(text.slice(solutionStart))
    usedSolutionSection = raw.length > 0
  }
  if (!usedSolutionSection) raw = parseBlock(text)

  const questions = finalize(raw)

  // Kiểm tra số câu liên tục trong từng phần
  for (const p of [1, 2, 3] as PartNo[]) {
    const nums = questions.filter((q) => q.part === p).map((q) => q.num)
    if (nums.length === 0) continue
    const max = Math.max(...nums)
    const missing: number[] = []
    for (let i = 1; i <= max; i++) if (!nums.includes(i)) missing.push(i)
    if (missing.length) warnings.push(`Phần ${p}: không tách được câu ${missing.join(', ')}.`)
  }
  return { questions, usedSolutionSection, warnings }
}
