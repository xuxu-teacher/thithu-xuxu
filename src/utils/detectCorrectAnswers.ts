import { supabase } from '../lib/supabaseClient'
import { QuestionBlock, isOptionLine } from './normalizeWord'
import { RawParagraph, buildQuestionMap, isOptionText } from './docxSplice'

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
export async function autoDetectCorrectRawParagraphs(paragraphs: RawParagraph[]): Promise<Set<RawParagraph>> {
  const qmap = buildQuestionMap(paragraphs)
  const payload: { key: string; questionText: string; optionLines: string[]; solutionText: string }[] = []
  const optionParagraphsByKey = new Map<string, RawParagraph[]>()

  for (const [number, { question, solution }] of qmap) {
    const optionParas = question.filter((p) => isOptionText(p.plainText))
    if (optionParas.length === 0) continue
    const questionText = question.filter((p) => !isOptionText(p.plainText)).map((p) => p.plainText).join(' ')
    const key = String(number)
    payload.push({
      key,
      questionText,
      optionLines: optionParas.map((p) => p.plainText),
      solutionText: solution.map((p) => p.plainText).join(' '),
    })
    optionParagraphsByKey.set(key, optionParas)
  }
  if (payload.length === 0) return new Set()

  const results = await callDetectApi(payload)
  const targets = new Set<RawParagraph>()
  for (const r of results) {
    const optionParas = optionParagraphsByKey.get(r.key)
    if (!optionParas) continue
    for (const idx of r.correctIndices) {
      if (optionParas[idx]) targets.add(optionParas[idx])
    }
  }
  return targets
}
