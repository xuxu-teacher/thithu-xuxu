// ============================================================
// CHUẨN HÓA WORD — xóa lời giải, giữ câu hỏi + số liệu nguyên vẹn,
// nhận diện ranh giới câu theo mẫu "Câu N" ... "Câu N+1"
// ============================================================

const QUESTION_RE = /^\s*(Câu|CÂU|Bài|BÀI)\s*\d+/i
const SOLUTION_RE = /^\s*(Lời giải|LỜI GIẢI|Hướng dẫn giải|HƯỚNG DẪN GIẢI|Giải\s*:|Đáp án\s*:|Lời giải chi tiết)/i

// Nhận diện mốc bắt đầu 1 phương án — "A." "A)" "B." "B)"... (chỉ tính khi
// theo sau là khoảng trắng hoặc chữ, đứng riêng, không phải 1 phần của từ khác).
const OPTION_MARK_RE = /(?:^|\s)([A-D])[.)]\s*(?=\S)/g

export function isOptionLine(text: string): boolean {
  return /^\s*[A-D][.)]\s*\S/.test(text)
}

export function optionLetter(text: string): string {
  return (text.match(/^\s*([A-D])[.)]/)?.[1] || '').toUpperCase()
}

/**
 * Nếu 1 dòng chứa từ 2 mốc phương án (A./B./C./D.) trở lên dính liền
 * nhau (thường do câu hỏi và các phương án bị gộp chung 1 dòng khi tách
 * từ Word) — tách mỗi phương án xuống 1 dòng riêng. Phần trước mốc "A."
 * đầu tiên (nếu có, thường là nội dung câu hỏi) giữ làm 1 dòng riêng.
 */
export function splitStuckOptions(text: string): string[] {
  const marks: { letter: string; index: number }[] = []
  let m: RegExpExecArray | null
  OPTION_MARK_RE.lastIndex = 0
  while ((m = OPTION_MARK_RE.exec(text))) {
    marks.push({ letter: m[1], index: m.index + m[0].indexOf(m[1]) })
  }
  // Chỉ tách khi tìm được ít nhất 2 mốc VÀ chúng theo đúng thứ tự chữ cái
  // liên tiếp tăng dần (A→B→C→D) — tránh tách nhầm câu văn tình cờ có
  // "A." đứng giữa câu không phải là danh sách phương án.
  const isSequential =
    marks.length >= 2 && marks.every((x, i) => i === 0 || x.letter.charCodeAt(0) === marks[i - 1].letter.charCodeAt(0) + 1)
  if (!isSequential) return [text]

  const parts: string[] = []
  const head = text.slice(0, marks[0].index).trim()
  if (head) parts.push(head)
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].index
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length
    const seg = text.slice(start, end).trim()
    if (seg) parts.push(seg)
  }
  return parts
}

export interface QuestionBlock {
  id: string
  lines: string[] // các dòng còn lại của câu hỏi (đã bỏ lời giải, đã tách phương án dính liền)
}

/**
 * Gộp danh sách đoạn văn thành các khối theo từng câu (nhận diện "Câu N"),
 * bỏ hết phần từ dòng "Lời giải"/"Hướng dẫn giải"/... trở đi trong mỗi
 * khối (giữ nguyên câu hỏi + số liệu + các phương án, nếu có), và tự tách
 * các phương án A/B/C/D nếu bị dính chung 1 dòng với câu hỏi hoặc với nhau.
 */
export function standardizeIntoBlocks(paragraphs: { text: string }[]): QuestionBlock[] {
  const blocks: QuestionBlock[] = []
  let current: QuestionBlock | null = null
  let inSolution = false
  let counter = 0
  const nextId = () => `blk_${counter++}`

  const pushLines = (target: QuestionBlock, text: string) => {
    target.lines.push(...splitStuckOptions(text))
  }

  for (const p of paragraphs) {
    const text = p.text.trim()
    if (!text) continue

    if (QUESTION_RE.test(text)) {
      current = { id: nextId(), lines: [] }
      pushLines(current, text)
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
      pushLines(current, text)
    } else {
      // Đoạn văn trước câu hỏi đầu tiên (tiêu đề bài, ghi chú...) — giữ làm khối riêng, không đánh số.
      blocks.push({ id: nextId(), lines: [text] })
      current = null
    }
  }

  return blocks
}
