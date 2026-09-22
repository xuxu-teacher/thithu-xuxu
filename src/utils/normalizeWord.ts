// ============================================================
// CHUẨN HÓA WORD
// ============================================================
// Luôn tách mỗi câu thành 2 phần rõ rệt: questionLines (câu hỏi + phương
// án) và solutionLines (lời giải, nếu tìm thấy — kể cả khi lời giải nằm
// tách hẳn ở cuối file, đánh số lại từ đầu). Việc HIỂN THỊ/XUẤT có lời
// giải hay không, và việc gạch chân đáp án, là 2 CÔNG CỤ ĐỘC LẬP tác
// động lên cùng 1 dữ liệu gốc này — không phá vỡ lẫn nhau.
// ============================================================

const QUESTION_NUM_RE = /^\s*(?:Câu|CÂU|Bài|BÀI)\s*(\d+)/i
const SOLUTION_RE =
  /^\s*(Lời giải|LỜI GIẢI|Hướng dẫn giải|HƯỚNG DẪN GIẢI|Giải\s*:|Đáp án\s*:|Lời giải chi tiết|Trả lời)\s*:?\s*$/i
const SKIP_HEADING_RE = /^\s*(ĐÁP ÁN|Đáp án|BẢNG ĐÁP ÁN)\s*$/i

const OPTION_MARK_RE = /(?:^|\s)([A-Da-d])[.)]\s*(?=\S)/g

export function isOptionLine(text: string): boolean {
  return /^\s*[A-Da-d][.)]\s*\S/.test(text)
}

export function optionLetter(text: string): string {
  return text.match(/^\s*([A-Da-d])[.)]/)?.[1] || ''
}

/** Phương án chữ hoa = trắc nghiệm (chọn 1); chữ thường = Đúng/Sai (mỗi ý riêng). */
export function isUppercaseOptionSet(lines: string[]): boolean {
  const first = lines.find(isOptionLine)
  return !!first && /^[A-D]/.test(optionLetter(first))
}

/**
 * Nếu 1 dòng chứa từ 2 mốc phương án (A./B./C./D. hoặc a/b/c/d) trở lên
 * dính liền nhau — tách mỗi phương án xuống 1 dòng riêng.
 */
export function splitStuckOptions(text: string): string[] {
  const marks: { letter: string; index: number }[] = []
  let m: RegExpExecArray | null
  OPTION_MARK_RE.lastIndex = 0
  while ((m = OPTION_MARK_RE.exec(text))) {
    marks.push({ letter: m[1], index: m.index + m[0].indexOf(m[1]) })
  }
  // Chỉ tách khi >= 2 mốc, cùng loại chữ hoa/thường như nhau, và theo đúng
  // thứ tự chữ cái liên tiếp tăng dần (A→B→C→D hoặc a→b→c→d).
  const sameCase = marks.every((x) => /[A-D]/.test(x.letter) === /[A-D]/.test(marks[0].letter))
  const isSequential =
    marks.length >= 2 &&
    sameCase &&
    marks.every((x, i) => i === 0 || x.letter.charCodeAt(0) === marks[i - 1].letter.charCodeAt(0) + 1)
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
  number: number | null
  questionLines: string[]
  solutionLines: string[] // rỗng nếu không tìm thấy lời giải cho câu này
  underline: boolean[] // song song với questionLines — dòng nào bị gạch chân (đáp án đúng)
}

interface RawOccurrence {
  number: number | null
  lines: string[]
}

function splitByQuestionMarker(paragraphs: { text: string }[]): RawOccurrence[] {
  const occurrences: RawOccurrence[] = []
  let current: RawOccurrence | null = null

  for (const p of paragraphs) {
    const text = p.text.trim()
    if (!text || SKIP_HEADING_RE.test(text)) continue

    const m = text.match(QUESTION_NUM_RE)
    if (m) {
      current = { number: parseInt(m[1], 10), lines: [text] }
      occurrences.push(current)
      continue
    }
    if (current) {
      current.lines.push(text)
    } else {
      occurrences.push({ number: null, lines: [text] })
      current = null
    }
  }
  return occurrences
}

function splitSolution(lines: string[]): { question: string[]; solution: string[] } {
  const question: string[] = []
  const solution: string[] = []
  let inSol = false
  for (const line of lines) {
    if (!inSol && SOLUTION_RE.test(line)) {
      inSol = true
      continue
    }
    if (inSol) solution.push(line)
    else question.push(...splitStuckOptions(line))
  }
  return { question, solution }
}

/**
 * Đọc toàn bộ đoạn văn, tách thành các câu — mỗi câu giữ RIÊNG câu hỏi và
 * lời giải (nếu có, kể cả khi lời giải tách hẳn thành khu vực riêng ở
 * cuối file, đánh số lại theo đúng thứ tự câu).
 */
export function parseIntoBlocks(paragraphs: { text: string }[]): QuestionBlock[] {
  const occurrences = splitByQuestionMarker(paragraphs)
  const blocksByNumber = new Map<number, QuestionBlock>()
  const orderedBlocks: QuestionBlock[] = []
  let counter = 0
  const nextId = () => `blk_${counter++}`

  for (const occ of occurrences) {
    const { question, solution } = splitSolution(occ.lines)

    if (occ.number === null) {
      orderedBlocks.push({
        id: nextId(),
        number: null,
        questionLines: question,
        solutionLines: [],
        underline: question.map(() => false),
      })
      continue
    }

    const isSolutionOnly = question.length <= 1 && solution.length > 0 && blocksByNumber.has(occ.number)

    if (isSolutionOnly) {
      const target = blocksByNumber.get(occ.number)!
      if (target.solutionLines.length === 0) target.solutionLines = solution
      else target.solutionLines.push(...solution)
      continue
    }

    const block: QuestionBlock = {
      id: nextId(),
      number: occ.number,
      questionLines: question,
      solutionLines: solution,
      underline: question.map(() => false),
    }
    blocksByNumber.set(occ.number, block)
    orderedBlocks.push(block)
  }

  return orderedBlocks
}
