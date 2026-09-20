// ============================================================
// CHUẨN HÓA WORD — xóa lời giải, giữ câu hỏi + số liệu nguyên vẹn,
// nhận diện ranh giới câu theo mẫu "Câu N" ... "Câu N+1"
// ============================================================

const QUESTION_RE = /^\s*(Câu|CÂU|Bài|BÀI)\s*\d+/i
const SOLUTION_RE = /^\s*(Lời giải|LỜI GIẢI|Hướng dẫn giải|HƯỚNG DẪN GIẢI|Giải\s*:|Đáp án\s*:|Lời giải chi tiết)/i

export interface QuestionBlock {
  lines: string[] // các dòng còn lại của câu hỏi (đã bỏ lời giải)
}

/**
 * Gộp danh sách đoạn văn thành các khối theo từng câu (nhận diện "Câu N"),
 * bỏ hết phần từ dòng "Lời giải"/"Hướng dẫn giải"/... trở đi trong mỗi
 * khối (giữ nguyên câu hỏi + số liệu + các phương án, nếu có).
 */
export function standardizeIntoBlocks(paragraphs: { text: string }[]): QuestionBlock[] {
  const blocks: QuestionBlock[] = []
  let current: QuestionBlock | null = null
  let inSolution = false

  for (const p of paragraphs) {
    const text = p.text.trim()
    if (!text) continue

    if (QUESTION_RE.test(text)) {
      current = { lines: [text] }
      blocks.push(current)
      inSolution = false
      continue
    }

    if (SOLUTION_RE.test(text)) {
      inSolution = true
      continue
    }

    if (inSolution) continue // đang trong phần lời giải -> bỏ qua

    if (current) {
      current.lines.push(text)
    } else {
      // Đoạn văn trước câu hỏi đầu tiên (tiêu đề bài, ghi chú...) — giữ làm khối riêng, không đánh số.
      blocks.push({ lines: [text] })
      current = null
    }
  }

  return blocks
}
