import { supabase } from '../lib/supabaseClient'
import { RawParagraph, buildQuestionMap, isOptionText, splitOptionParagraphs, OptionRef } from './docxSplice'

// Mẫu "Chọn X" / "Chọn đáp án X" rất phổ biến trong lời giải trắc nghiệm
// Việt Nam — nhận diện thẳng bằng regex, chính xác 100% khi có, nhanh và
// miễn phí, không cần gọi AI cho những câu này.
const CHON_RE = /Chọn\s*(?:đáp án\s*)?([A-D])\b/i

export function detectChonAnswer(solutionText: string): string | null {
  const m = solutionText.match(CHON_RE)
  return m ? m[1].toUpperCase() : null
}

// Với câu trả lời ngắn, nhiều file GỐC đã tự ghi sẵn "Đáp án: ..." hoặc
// "Đáp số: ..." ngay trong lời giải — ưu tiên lấy THẲNG giá trị này (chính
// xác 100%, không tốn phí AI) thay vì để AI tự đọc lời giải suy luận lại,
// vì AI có thể tính sai hoặc đọc thiếu số liệu (đặc biệt khi số liệu được
// gõ bằng công thức MathType).
// CHỈ bắt tối đa ~40 ký tự sau dấu ":" (thay vì bắt hết đến hết dòng) — một
// đáp số/đáp án thật sự luôn ngắn gọn; nếu bắt dài hơn thế gần như chắc
// chắn đã lỡ nuốt luôn cả câu văn phía sau do các đoạn lời giải bị nối
// liền nhau mà không có ranh giới rõ ràng.
const EXPLICIT_ANSWER_RE = /(?:Đáp\s*án|Đáp\s*số)\s*:?\s*([^\n.;]{1,40})/i

export function extractExplicitAnswer(solutionText: string): string | null {
  const m = solutionText.match(EXPLICIT_ANSWER_RE)
  if (!m) return null
  const val = m[1].trim().replace(/\.\s*$/, '').trim()
  return val.length > 0 ? val : null
}

async function callDetectApi(payload: { key: string; questionText: string; optionLines: string[]; solutionText: string }[]) {
  const { data, error } = await supabase.functions.invoke('detect-correct-answers', { body: { blocks: payload } })
  if (error) {
    let detail = error.message
    try {
      const body = await error.context?.json()
      if (body?.error) detail = body.error
    } catch {
      /* giữ nguyên detail mặc định */
    }
    throw new Error(`Không tự động xác định đáp án được: ${detail}`)
  }
  return (data?.results ?? []) as { key: string; correctIndices: number[]; answerText: string | null }[]
}

export interface UnderlineTarget {
  paragraph: RawParagraph
  letter: string
}

export interface ShortAnswerResult {
  number: number
  answerText: string
}

export interface DetectionResult {
  underlineTargets: UnderlineTarget[]
  shortAnswers: ShortAnswerResult[]
}

export async function autoDetectCorrectRawParagraphs(paragraphs: RawParagraph[]): Promise<DetectionResult> {
  const qmap = buildQuestionMap(paragraphs)
  const targets: UnderlineTarget[] = []
  const shortAnswers: ShortAnswerResult[] = []

  const payload: { key: string; questionText: string; optionLines: string[]; solutionText: string }[] = []
  const optionRefsByKey = new Map<string, OptionRef[]>()

  for (const [number, { question, solution }] of qmap) {
    const optionRefs = splitOptionParagraphs(question)
    // Nối bằng xuống dòng thật (không phải dấu cách) để giữ đúng ranh giới
    // từng đoạn văn gốc — cần thiết để không bắt nhầm "Đáp số: ..." lấn
    // sang cả câu văn của đoạn tiếp theo (xem EXPLICIT_ANSWER_RE ở trên).
    const solutionText = solution.map((p) => p.plainText).join('\n')
    const key = String(number)

    if (optionRefs.length === 0) {
      // Câu trả lời ngắn (không có phương án) — ưu tiên lấy thẳng
      // "Đáp án:/Đáp số:" đã có sẵn trong chính lời giải gốc.
      if (!solutionText.trim()) continue
      const explicit = extractExplicitAnswer(solutionText)
      if (explicit) {
        shortAnswers.push({ number, answerText: explicit })
        continue
      }
      const questionText = question.filter((p) => !isOptionText(p.plainText)).map((p) => p.plainText).join(' ')
      payload.push({ key, questionText, optionLines: [], solutionText })
      continue
    }

    // Chỉ áp dụng lối tắt "Chọn X" cho trắc nghiệm 1 đáp án (chữ hoa A-D) —
    // Đúng/Sai (chữ thường) luôn cần AI xét riêng từng ý.
    const isUpper = optionRefs[0].letter >= 'A' && optionRefs[0].letter <= 'D'
    const chon = isUpper ? detectChonAnswer(solutionText) : null
    if (chon) {
      const match = optionRefs.find((r) => r.letter === chon)
      if (match) {
        targets.push({ paragraph: match.paragraph, letter: match.letter })
        continue // câu này xong, không cần đưa vào lô gửi AI
      }
    }

    const questionText = question.filter((p) => !isOptionText(p.plainText)).map((p) => p.plainText).join(' ')
    payload.push({ key, questionText, optionLines: optionRefs.map((r) => r.text), solutionText })
    optionRefsByKey.set(key, optionRefs)
  }

  if (payload.length === 0) return { underlineTargets: targets, shortAnswers }

  const results = await callDetectApi(payload)
  for (const r of results) {
    const optionRefs = optionRefsByKey.get(r.key)
    if (optionRefs) {
      for (const idx of r.correctIndices) {
        if (optionRefs[idx]) targets.push({ paragraph: optionRefs[idx].paragraph, letter: optionRefs[idx].letter })
      }
    } else if (r.answerText) {
      shortAnswers.push({ number: Number(r.key), answerText: r.answerText })
    }
  }
  return { underlineTargets: targets, shortAnswers }
}
