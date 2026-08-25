import { Question, ScoringMethod, StudentAnswer, TrueFalseOption } from '../types'

/**
 * Bảng điểm từng phần cho câu Đúng/Sai 4 ý theo quy chế thi tốt nghiệp THPT
 * (Bộ GDĐT áp dụng từ kỳ thi 2025 trở đi): mỗi câu hỏi Đúng/Sai có 4 ý nhỏ,
 * điểm tối đa của câu = question.points (mặc định 1đ), chia theo số ý đúng:
 *   đúng 1 ý  -> 0.1 x (points / 1)   -> quy về tỉ lệ 0.10
 *   đúng 2 ý  -> 0.25
 *   đúng 3 ý  -> 0.50
 *   đúng 4 ý  -> 1.00 (toàn bộ điểm)
 * Tỉ lệ này áp dụng trên thang điểm 1 của câu hỏi, sau đó nhân với points thực tế.
 */
const MINISTRY_RATIO: Record<number, number> = {
  0: 0,
  1: 0.1,
  2: 0.25,
  3: 0.5,
  4: 1.0,
}

function countCorrectSub(options: TrueFalseOption[], answer: Record<string, boolean> | undefined) {
  if (!answer) return { correct: 0, total: options.length }
  let correct = 0
  for (const opt of options) {
    if (answer[opt.key] === opt.correct) correct++
  }
  return { correct, total: options.length }
}

/** Chấm 1 câu, trả về điểm đạt được (0..question.points) */
export function scoreQuestion(
  q: Question,
  answer: StudentAnswer | undefined,
  method: ScoringMethod
): number {
  if (q.part === 'mcq') {
    if (!answer || typeof answer !== 'string') return 0
    return answer === q.correct_answer ? q.points : 0
  }

  if (q.part === 'short_answer') {
    if (!answer || typeof answer !== 'string') return 0
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
    return norm(answer) === norm(q.correct_answer || '') ? q.points : 0
  }

  // true_false
  const options = (q.options as TrueFalseOption[]) || []
  const ans = (answer && typeof answer === 'object' ? answer : undefined) as
    | Record<string, boolean>
    | undefined
  const { correct, total } = countCorrectSub(options, ans)

  if (method === 'equal_split') {
    // chia đều điểm theo tỉ lệ số ý đúng / tổng số ý
    return total > 0 ? (q.points * correct) / total : 0
  }

  // ministry_partial: dùng đúng bảng quy đổi 4 ý của Bộ GDĐT
  const ratio = MINISTRY_RATIO[Math.min(correct, 4)] ?? 0
  return q.points * ratio
}

export function scoreExam(
  questions: Question[],
  answers: Record<string, StudentAnswer>,
  method: ScoringMethod
): { total: number; max: number; perQuestion: Record<string, number> } {
  let total = 0
  let max = 0
  const perQuestion: Record<string, number> = {}

  for (const q of questions) {
    const s = scoreQuestion(q, answers[q.id], method)
    perQuestion[q.id] = Math.round(s * 100) / 100
    total += s
    max += q.points
  }

  return { total: Math.round(total * 100) / 100, max, perQuestion }
}
