import { supabase } from '../lib/supabaseClient'
import { MatrixCell, MatrixGenerateResult, QuestionBankItem } from '../types'
import { ClassifiedQuestionData } from './classifyQuestions'

export interface BankDraftQuestion extends ClassifiedQuestionData {
  sourceFile: string
}

/** Lưu các câu hỏi đã phân loại (từ classifyQuestions) vào kho câu hỏi — khối lớp lấy theo từng câu (q.grade), AI đã tự nhận diện, không còn cố định 1 khối cho cả lượt tải lên. */
export async function saveQuestionsToBank(teacherId: string, questions: BankDraftQuestion[]): Promise<void> {
  const rows = questions.map((q) => ({
    teacher_id: teacherId,
    grade: q.grade,
    chapter_id: null,
    topic: q.topic,
    difficulty: q.difficulty,
    part: q.part,
    content_html: q.content_html,
    options: q.part === 'short_answer' ? null : q.options,
    correct_answer: q.part === 'true_false' ? null : q.correct_answer,
    explanation_html: q.explanation_html,
    points: q.points,
    source_file: q.sourceFile,
    needs_review: q.needsTopicReview || q.needsReview,
  }))

  const { error } = await supabase.from('question_bank').insert(rows)
  if (error) throw error
}

/** Đếm số câu hiện có trong kho theo từng ô (chủ đề × mức độ × dạng), dùng để hiển thị khi dựng ma trận. */
export async function getBankCounts(
  teacherId: string,
  grade: string,
): Promise<Map<string, number>> {
  const { data, error } = await supabase.rpc('question_bank_counts', {
    p_teacher_id: teacherId,
    p_grade: grade,
  })
  if (error) throw error

  const map = new Map<string, number>()
  for (const row of data ?? []) {
    map.set(`${row.topic}|${row.difficulty}|${row.part}`, Number(row.cnt))
  }
  return map
}

export function bankCountKey(topic: string, difficulty: string, part: string) {
  return `${topic}|${difficulty}|${part}`
}

/** Xóa 1 câu khỏi kho câu hỏi. */
export async function deleteBankQuestion(id: string): Promise<void> {
  const { error } = await supabase.from('question_bank').delete().eq('id', id)
  if (error) throw error
}

/** Sinh đề thi từ ma trận — exam đã được tạo trước (insert vào bảng `exams`) ở phía client. */
export async function generateExamFromMatrix(
  examId: string,
  teacherId: string,
  grade: string,
  matrix: MatrixCell[],
): Promise<MatrixGenerateResult[]> {
  const { data, error } = await supabase.rpc('create_exam_from_matrix', {
    p_exam_id: examId,
    p_teacher_id: teacherId,
    p_grade: grade,
    p_matrix: matrix,
  })
  if (error) throw error
  return (data ?? []) as MatrixGenerateResult[]
}

/** Danh sách kho câu hỏi hiện có (xem/lọc), không giới hạn theo khối — dùng cho màn hình xem lại kho. */
export async function listBankQuestions(teacherId: string, grade?: string): Promise<QuestionBankItem[]> {
  let query = supabase.from('question_bank').select('*').eq('teacher_id', teacherId).order('created_at', { ascending: false })
  if (grade) query = query.eq('grade', grade)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as QuestionBankItem[]
}
