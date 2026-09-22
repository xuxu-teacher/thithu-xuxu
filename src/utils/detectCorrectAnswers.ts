import { supabase } from '../lib/supabaseClient'
import { QuestionBlock, isOptionLine } from './normalizeWord'
import { RawParagraph, buildQuestionMap, isOptionText, splitOptionParagraphs, OptionRef } from './docxSplice'

/**
 * Gọi AI đọc lời giải của từng câu để tự xác định đáp án đúng, trả về
 * bản sao các block với mảng `underline` đã cập nhật (đúng vị trí các
 * dòng phương án). Câu không có lời giải hoặc không tìm được đáp án chắc
 * chắn thì giữ nguyên (không gạch chân).
 */
export async function autoDetectCorrectAnswers(blocks: QuestionBlock[]): Promise<QuestionBlock[]> {
  const payload = blocks.map((b) => {
    const optionIdx: number[] = []
    const optionLines: string[] = []
    b.questionLines.forEach((line, i) => {
      if (isOptionLine(line)) {
        optionIdx.push(i)
        optionLines.push(line)
      }
    })
    const questionText = b.questionLines.filter((l) => !isOptionLine(l)).join(' ')
    return {
      key: b.id,
      questionText,
      optionLines,
      solutionText: b.solutionLines.join(' '),
      _optionIdx: optionIdx, // giữ lại để map ngược, không gửi cho server
    }
  })

  const { data, error } = await supabase.functions.invoke('detect-correct-answers', {
    body: { blocks: payload.map(({ _optionIdx, ...rest }) => rest) },
  })
  if (error) {
    let detail = error.message
    try {
      const body = await error.context?.json()
      if (body?.error) detail = body.error
    } catch {
      /* giữ nguyên detail mặc định */
    }
    throw new Error(`Không tự động gạch chân được: ${detail}`)
  }

  const results: { key: string; correctIndices: number[] }[] = data?.results ?? []
  const byKey = new Map(results.map((r) => [r.key, r.correctIndices]))
  const byBlockId = new Map(payload.map((p) => [p.key, p._optionIdx]))

  return blocks.map((b) => {
    const correctIndices = byKey.get(b.id) || []
    const optionIdx = byBlockId.get(b.id) || []
    if (correctIndices.length === 0) return b
    const underline = [...b.underline]
    for (const ci of correctIndices) {
      const lineIdx = optionIdx[ci]
      if (lineIdx !== undefined) underline[lineIdx] = true
    }
    return { ...b, underline }
  })
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
  return (data?.results ?? []) as { key: string; correctIndices: number[] }[]
}

/**
 * Dùng cho công cụ "Gạch chân đáp án – tải về file Word": làm việc trực
 * tiếp trên đoạn văn XML gốc (RawParagraph) thay vì mô hình chữ đơn giản
 * — trả về đúng tập các RawParagraph (phương án) cần gạch chân, để
 * addUnderlineToParagraph/applyUnderlineToParagraphs áp dụng lên bản gốc,
 * giữ nguyên mọi định dạng khác.
 */
// Mẫu "Chọn X" / "Chọn đáp án X" rất phổ biến trong lời giải trắc nghiệm
// Việt Nam — nhận diện thẳng bằng regex, chính xác 100% khi có, nhanh và
// miễn phí, không cần gọi AI cho những câu này.
const CHON_RE = /Chọn\s*(?:đáp án\s*)?([A-D])\b/i

export function detectChonAnswer(solutionText: string): string | null {
  const m = solutionText.match(CHON_RE)
  return m ? m[1].toUpperCase() : null
}

export interface UnderlineTarget {
  paragraph: RawParagraph
  letter: string
}

export async function autoDetectCorrectRawParagraphs(paragraphs: RawParagraph[]): Promise<UnderlineTarget[]> {
  const qmap = buildQuestionMap(paragraphs)
  const targets: UnderlineTarget[] = []

  const payload: { key: string; questionText: string; optionLines: string[]; solutionText: string }[] = []
  const optionRefsByKey = new Map<string, OptionRef[]>()

  for (const [number, { question, solution }] of qmap) {
    const optionRefs = splitOptionParagraphs(question)
    if (optionRefs.length === 0) continue
    const solutionText = solution.map((p) => p.plainText).join(' ')

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
    const key = String(number)
    payload.push({ key, questionText, optionLines: optionRefs.map((r) => r.text), solutionText })
    optionRefsByKey.set(key, optionRefs)
  }

  if (payload.length === 0) return targets

  const results = await callDetectApi(payload)
  for (const r of results) {
    const optionRefs = optionRefsByKey.get(r.key)
    if (!optionRefs) continue
    for (const idx of r.correctIndices) {
      if (optionRefs[idx]) targets.push({ paragraph: optionRefs[idx].paragraph, letter: optionRefs[idx].letter })
    }
  }
  return targets
}
