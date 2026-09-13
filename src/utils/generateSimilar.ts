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
  if (error) {
    // supabase-js chỉ trả thông báo chung "non-2xx status code" — đọc thẳng
    // nội dung lỗi thật (JSON {"error":"..."}) mà Edge Function đã trả về
    // để người dùng (và cả tôi khi debug qua ảnh chụp) thấy nguyên nhân
    // thật thay vì phải mò qua Supabase Dashboard.
    let detail = error.message
    try {
      const body = await error.context?.json()
      if (body?.error) detail = body.error
    } catch {
      /* giữ nguyên detail mặc định nếu không đọc được body lỗi */
    }
    throw new Error(`Không sinh được đề tương tự: ${detail}`)
  }

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
