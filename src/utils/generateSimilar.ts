import { supabase } from '../lib/supabaseClient'
import { Question } from '../types'

export interface SimilarVariant {
  content_html: string
  options: Question['options']
  correct_answer: string | null
  explanation_html: string
  changed_numbers: boolean
}

/**
 * Sinh phiên bản "tương tự" cho một hoặc nhiều câu hỏi — giữ nguyên cấu
 * trúc/lời văn, chỉ đổi số liệu và tính lại đáp án đúng. Trả về đúng thứ
 * tự với mảng đầu vào (không phải mảng đã lưu DB — client tự quyết định
 * dùng để lưu thành đề mới, hay chỉ hiển thị tạm cho học sinh luyện tập).
 */
export async function generateSimilarQuestions(
  questions: Pick<Question, 'part' | 'content_html' | 'options' | 'correct_answer' | 'explanation_html'>[],
): Promise<SimilarVariant[]> {
  const withKeys = questions.map((q, i) => ({ key: String(i), ...q }))

  const { data, error } = await supabase.functions.invoke('generate-similar-questions', {
    body: { questions: withKeys },
  })
  if (error) throw new Error(`Không sinh được đề tương tự: ${error.message}`)

  const variants: (SimilarVariant & { key: string })[] = data?.variants ?? []
  const byKey = new Map(variants.map((v) => [v.key, v]))

  return withKeys.map((q, i) => {
    const v = byKey.get(String(i))
    return (
      v || {
        content_html: q.content_html,
        options: q.options,
        correct_answer: q.correct_answer ?? null,
        explanation_html: q.explanation_html || '',
        changed_numbers: false,
      }
    )
  })
}
