import { supabase } from '../lib/supabaseClient'
import { DraftQuestionData } from './docxParser'
import { QuestionDifficulty } from '../types'
import { CURRICULUM_TOPICS } from '../data/curriculumTopics'

/**
 * GỌI EDGE FUNCTION "classify-questions"
 * =======================================
 * Nhận danh sách câu hỏi vừa parse từ Word (DraftQuestionData — xem
 * docxParser.ts) rồi trả về bản sao các câu hỏi, mỗi câu được gắn thêm
 * `grade` (10/11/12 — AI TỰ NHẬN DIỆN, không cần giáo viên chọn trước),
 * `topic`, `difficulty`, `needsTopicReview`.
 *
 * Không tự lưu gì vào Supabase — chỉ trả dữ liệu để màn hình duyệt hiển
 * thị cho giáo viên sửa trước khi bấm "Lưu vào kho câu hỏi".
 */

export interface ClassifiedQuestionData extends DraftQuestionData {
  grade: '10' | '11' | '12'
  topic: string
  difficulty: QuestionDifficulty
  needsTopicReview: boolean
}

interface ClassifyApiResult {
  key: string
  grade: '10' | '11' | '12'
  topic: string
  difficulty: QuestionDifficulty
  needs_review: boolean
}

export async function classifyQuestions(questions: DraftQuestionData[]): Promise<ClassifiedQuestionData[]> {
  const { data, error } = await supabase.functions.invoke('classify-questions', {
    body: {
      curriculum: CURRICULUM_TOPICS,
      questions: questions.map((q) => ({
        key: q.key,
        content_html: q.content_html,
        part: q.part,
      })),
    },
  })

  if (error) {
    throw new Error(`Không phân loại được câu hỏi: ${error.message}`)
  }

  const results: ClassifyApiResult[] = data?.classifications ?? []
  const byKey = new Map(results.map((r) => [r.key, r]))

  return questions.map((q) => {
    const r = byKey.get(q.key)
    return {
      ...q,
      grade: r?.grade ?? '10',
      topic: r?.topic ?? CURRICULUM_TOPICS['10'][0],
      difficulty: r?.difficulty ?? 'Thông hiểu',
      needsTopicReview: r ? r.needs_review : true,
    }
  })
}
