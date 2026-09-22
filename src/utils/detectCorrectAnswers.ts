import { supabase } from '../lib/supabaseClient'
import { QuestionBlock, isOptionLine } from './normalizeWord'

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
