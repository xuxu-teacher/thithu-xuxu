export type QuestionPart = 'mcq' | 'true_false' | 'short_answer'
export type ScoringMethod = 'equal_split' | 'ministry_partial'
export type AttemptStatus = 'in_progress' | 'submitted' | 'missed' | 'disqualified'

// 4 mức độ nhận thức theo chương trình GDPT 2018 (Bộ GDĐT) — dùng cho kho
// câu hỏi và ma trận đề (chưa dùng ở luồng tạo đề thủ công hiện tại).
export type QuestionDifficulty = 'Nhận biết' | 'Thông hiểu' | 'Vận dụng' | 'Vận dụng cao'

export interface MCQOption {
  key: string // 'A' | 'B' | 'C' | 'D'
  html: string
}

export interface TrueFalseOption {
  key: string // 'a' | 'b' | 'c' | 'd'
  html: string
  correct: boolean
}

/** Ảnh trích xuất trực tiếp từ file Word (đã nhúng base64) */
export interface ParsedImage {
  id: string
  filename: string
  base64: string
  contentType: string
  rId?: string
}

export interface Question {
  id: string
  exam_id: string
  order_index: number
  part: QuestionPart
  content_html: string
  image_url?: string | null
  options: MCQOption[] | TrueFalseOption[] | null
  correct_answer?: string | null // mcq / short_answer
  explanation_html?: string | null
  points: number
}

export interface Exam {
  id: string
  teacher_id: string
  class_id: string
  title: string
  wave_number: number
  duration_minutes: number
  open_at: string
  close_at: string
  scoring_method: ScoringMethod
  requires_previous_wave: boolean
}

export interface ClassRoom {
  id: string
  teacher_id: string
  class_code: string
  class_name: string
  grade?: string | null
}

export interface Chapter {
  id: string
  teacher_id: string
  grade: string
  title: string
  order_index: number
}

export interface Lesson {
  id: string
  chapter_id: string
  title: string
  link: string
  exam_file_link?: string | null
  solution_file_link?: string | null
  order_index: number
}

export interface Student {
  id: string
  class_id: string
  student_code: string
  full_name: string
  phone?: string | null
}

export interface Attempt {
  id: string
  exam_id: string
  student_id: string
  status: AttemptStatus
  started_at: string | null
  submitted_at: string | null
  answers: Record<string, StudentAnswer>
  score: number | null
}

// Đáp án học sinh chọn cho 1 câu:
// mcq: "A"
// true_false: { a: true, b: false, c: true, d: true }
// short_answer: "chuỗi trả lời"
export type StudentAnswer = string | Record<string, boolean>

export interface TeacherSession {
  id: string
  full_name: string
  email: string
}

// ---------- KHO CÂU HỎI (question_bank) + SINH ĐỀ THEO MA TRẬN ----------

export interface QuestionBankItem {
  id: string
  teacher_id: string
  grade: string
  chapter_id: string | null
  topic: string
  difficulty: QuestionDifficulty
  part: QuestionPart
  content_html: string
  image_url?: string | null
  options: MCQOption[] | TrueFalseOption[] | null
  correct_answer?: string | null
  explanation_html?: string | null
  points: number
  source_file?: string | null
  needs_review: boolean
}

/** Một ô trong ma trận đề: chủ đề × mức độ × dạng câu -> số lượng cần rút từ kho. */
export interface MatrixCell {
  topic: string
  difficulty: QuestionDifficulty
  part: QuestionPart
  count: number
}

/** Kết quả RPC create_exam_from_matrix — dùng để cảnh báo nếu kho không đủ câu ở ô nào. */
export interface MatrixGenerateResult {
  topic: string
  difficulty: QuestionDifficulty
  part: QuestionPart
  requested: number
  inserted: number
}

export interface StudentSession {
  id: string
  class_id: string
  full_name: string
  student_code: string
  class_code: string
}
