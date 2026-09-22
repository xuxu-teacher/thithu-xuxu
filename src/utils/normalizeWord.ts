// ============================================================
// CHUẨN HÓA WORD
// ============================================================
// - Nhận diện ranh giới câu theo mẫu "Câu N" / "Bài N"
// - 2 chế độ xử lý lời giải:
//   'strip'  : xóa hết lời giải (đề trống để học sinh tự làm)
//   'attach' : GIỮ lời giải, ghép đúng vào câu tương ứng — kể cả khi lời
//              giải nằm tách hẳn ở 1 khu vực riêng cuối file (đề liệt kê
//              hết Câu 1..N trước, rồi "Câu 1." "Lời giải" lặp lại ở dưới,
//              kiểu đề + đáp án tách rời rất phổ biến)
// - Tự tách phương án A/B/C/D dính liền dòng
// - Cho phép đánh dấu gạch chân (đáp án đúng) thủ công theo từng dòng
// ============================================================

const QUESTION_NUM_RE = /^\s*(?:Câu|CÂU|Bài|BÀI)\s*(\d+)/i
const SOLUTION_RE =
  /^\s*(Lời giải|LỜI GIẢI|Hướng dẫn giải|HƯỚNG DẪN GIẢI|Giải\s*:|Đáp án\s*:|Lời giải chi tiết|Trả lời)\s*:?\s*$/i
const SKIP_HEADING_RE = /^\s*(ĐÁP ÁN|Đáp án|BẢNG ĐÁP ÁN)\s*$/i

const OPTION_MARK_RE = /(?:^|\s)([A-D])[.)]\s*(?=\S)/g

export function isOptionLine(text: string): boolean {
  return /^\s*[A-D][.)]\s*\S/.test(text)
}

export function optionLetter(text: string): string {
  return (text.match(/^\s*([A-D])[.)]/)?.[1] || '').toUpperCase()
}

/**
 * Nếu 1 dòng chứa từ 2 mốc phương án (A./B./C./D.) trở lên dính liền
 * nhau — tách mỗi phương án xuống 1 dòng riêng.
 */
export function splitStuckOptions(text: string): string[] {
  const marks: { letter: string; index: number }[] = []
  let m: RegExpExecArray | null
  OPTION_MARK_RE.lastIndex = 0
  while ((m = OPTION_MARK_RE.exec(text))) {
    marks.push({ letter: m[1], index: m.index + m[0].indexOf(m[1]) })
  }
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
  number: number | null
  lines: string[]
  underline: boolean[] // song song với lines — dòng nào bị gạch chân thủ công (đáp án đúng)
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

/** Tách 1 occurrence thành phần câu hỏi (trước "Lời giải") và phần lời giải (sau đó). */
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
 * Gộp danh sách đoạn văn thành các khối theo từng câu — xử lý được cả 2
 * kiểu file: (1) lời giải nằm ngay sau câu hỏi trong cùng khối, và
 * (2) lời giải tách hẳn thành 1 khu vực riêng ở cuối file, đánh số lại
 * theo đúng thứ tự câu (kiểu "đề trước, đáp án sau").
 */
export function standardizeIntoBlocks(
  paragraphs: { text: string }[],
  mode: 'strip' | 'attach' = 'strip',
): QuestionBlock[] {
  const occurrences = splitByQuestionMarker(paragraphs)
  const blocksByNumber = new Map<number, QuestionBlock>()
  const orderedBlocks: QuestionBlock[] = []
  let counter = 0
  const nextId = () => `blk_${counter++}`

  for (const occ of occurrences) {
    const { question, solution } = splitSolution(occ.lines)

    if (occ.number === null) {
      // Đoạn văn không thuộc câu nào (tiêu đề bài, ghi chú đầu file...).
      const block: QuestionBlock = { id: nextId(), number: null, lines: question, underline: question.map(() => false) }
      orderedBlocks.push(block)
      continue
    }

    // "Solution-only": chỉ có dòng tiêu đề "Câu N" rồi vào thẳng lời giải,
    // không có nội dung câu hỏi thật -> đây là khối LỜI GIẢI của 1 câu đã
    // xuất hiện trước đó, không phải câu mới.
    const isSolutionOnly = question.length <= 1 && solution.length > 0 && blocksByNumber.has(occ.number)

    if (isSolutionOnly) {
      const target = blocksByNumber.get(occ.number)!
      if (mode === 'attach' && solution.length > 0) {
        target.lines.push('— Lời giải —', ...solution)
        target.underline.push(false, ...solution.map(() => false))
      }
      continue
    }

    // Câu hỏi thật (lần xuất hiện đầu tiên của số này).
    const lines = [...question]
    if (mode === 'attach' && solution.length > 0) {
      lines.push('— Lời giải —', ...solution)
    }
    const block: QuestionBlock = { id: nextId(), number: occ.number, lines, underline: lines.map(() => false) }
    blocksByNumber.set(occ.number, block)
    orderedBlocks.push(block)
  }

  return orderedBlocks
}
