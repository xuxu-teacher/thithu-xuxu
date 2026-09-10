import { supabase } from '../lib/supabaseClient'
import { DraftQuestionData } from './docxParser'
import { QuestionDifficulty } from '../types'

/**
 * GỌI EDGE FUNCTION "classify-questions"
 * =======================================
 * Nhận danh sách câu hỏi vừa parse từ Word (DraftQuestionData — xem
 * docxParser.ts) + khối lớp + danh sách chủ đề hợp lệ (nên lấy từ
 * `chapters.title` của đúng khối, đã có sẵn trong schema cho phần bài
 * giảng) rồi trả về bản sao các câu hỏi, mỗi câu được gắn thêm `topic`,
 * `difficulty`, `needsTopicReview`.
 *
 * Không tự lưu gì vào Supabase — chỉ trả dữ liệu để màn hình duyệt hiển
 * thị cho giáo viên sửa trước khi bấm "Lưu vào kho câu hỏi".
 */

export interface ClassifiedQuestionData extends DraftQuestionData {
  topic: string
  difficulty: QuestionDifficulty
  needsTopicReview: boolean
}

interface ClassifyApiResult {
  key: string
  topic: string
  difficulty: QuestionDifficulty
  needs_review: boolean
}

export async function classifyQuestions(
  questions: DraftQuestionData[],
  grade: '10' | '11' | '12',
  topics: string[],
): Promise<ClassifiedQuestionData[]> {
  if (topics.length === 0) {
    throw new Error('Chưa có danh sách chủ đề (chương) cho khối lớp này — hãy tạo Chương trước ở mục Bài giảng.')
  }

  const { data, error } = await supabase.functions.invoke('classify-questions', {
    body: {
      grade,
      topics,
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
      topic: r?.topic ?? topics[0],
      difficulty: r?.difficulty ?? 'Thông hiểu',
      needsTopicReview: r ? r.needs_review : true,
    }
  })
}
