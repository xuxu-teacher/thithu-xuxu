// ============================================================
// CHUẨN HÓA WORD (dùng cho khối "Tạo file PDF có khoảng trống")
// ============================================================
// Tách mỗi câu thành questionLines (câu hỏi + phương án) và solutionLines
// (lời giải, nếu có — kể cả khi lời giải nằm tách riêng ở cuối file).
//
// GẠCH CHÂN: đoạn chữ nào được gạch chân trong file Word gốc đã được bọc
// sẵn trong thẻ <u>...</u> ở bước đọc file. Mọi bước tách dòng ở đây đều
// giữ đúng vị trí các thẻ <u> đó (chính xác đến từng ký tự) — nên khi tách
// "A. ... B. ... C. ... D. ..." dính chung 1 dòng thành 4 dòng, chỉ đúng
// phương án nào có chữ gạch chân mới giữ gạch chân, không lan sang cả 4.
// ============================================================

export interface InputParagraph {
  text: string
  hasUnderline?: boolean // giữ để tương thích, không còn dùng — gạch chân đã nằm trong text dưới dạng <u>
}

const QUESTION_NUM_RE = /^\s*(?:Câu|CÂU|Bài|BÀI)\s*(\d+)/i
const SOLUTION_RE =
  /^\s*(Lời giải|LỜI GIẢI|Hướng dẫn giải|HƯỚNG DẪN GIẢI|Giải\s*:|Đáp án\s*:|Lời giải chi tiết|Trả lời)\s*:?\s*$/i
const SKIP_HEADING_RE = /^\s*(ĐÁP ÁN|Đáp án|BẢNG ĐÁP ÁN)\s*$/i
// Mỗi PHẦN của đề tự đánh số lại từ "Câu 1" — dùng để không nhầm "Câu 1"
// của PHẦN II với "Câu 1" của PHẦN I.
const PART_HEADING_RE = /^\s*PHẦN\s+[IVXLCDM\d]+[.\s)]/i

// Mốc phương án: chữ A-D/a-d + dấu . hoặc ), đứng đầu dòng hoặc sau khoảng
// trắng / dấu chấm / chấm phẩy / phẩy (file hay gõ dính kiểu "... 2019 .B. ...").
const OPTION_MARK_RE = /(?:^|[\s.;,])([A-Da-d])[.)]\s*(?=\S)/g

const stripU = (s: string) => s.replace(/<\/?u>/g, '')

export function isOptionLine(text: string): boolean {
  return /^\s*[A-Da-d][.)]\s*\S/.test(stripU(text))
}

export function optionLetter(text: string): string {
  return stripU(text).match(/^\s*([A-Da-d])[.)]/)?.[1] || ''
}

/** Phương án chữ hoa = trắc nghiệm (chọn 1); chữ thường = Đúng/Sai (mỗi ý riêng). */
export function isUppercaseOptionSet(lines: string[]): boolean {
  const first = lines.find(isOptionLine)
  return !!first && /^[A-D]/.test(optionLetter(first))
}

/** Tách chuỗi có thẻ <u> thành chữ thuần + mảng "ký tự nào đang được gạch chân". */
function analyze(text: string): { plain: string; ul: boolean[] } {
  let plain = ''
  const ul: boolean[] = []
  let inU = false
  let last = 0
  const re = /<(\/?)u>/g
  let m: RegExpExecArray | null
  const pushChunk = (chunk: string) => {
    for (let i = 0; i < chunk.length; i++) {
      plain += chunk[i]
      ul.push(inU)
    }
  }
  while ((m = re.exec(text))) {
    pushChunk(text.slice(last, m.index))
    inU = m[1] === ''
    last = m.index + m[0].length
  }
  pushChunk(text.slice(last))
  return { plain, ul }
}

/** Dựng lại 1 đoạn con [start, end) của chữ thuần, bọc lại <u> đúng chỗ đã gạch chân. */
function sliceMarked(plain: string, ul: boolean[], start: number, end: number): string {
  let out = ''
  let open = false
  for (let i = start; i < end; i++) {
    if (ul[i] && !open) {
      out += '<u>'
      open = true
    } else if (!ul[i] && open) {
      out += '</u>'
      open = false
    }
    out += plain[i]
  }
  if (open) out += '</u>'
  return out
}

/**
 * Nếu 1 dòng chứa từ 2 mốc phương án trở lên dính liền nhau (A→B→C→D hoặc
 * a→b→c→d, cùng chữ hoa/thường, đúng thứ tự) — tách mỗi phương án xuống 1
 * dòng riêng. Phần chữ đứng trước mốc đầu tiên (nếu có) giữ làm 1 dòng.
 */
export function splitStuckOptions(text: string): string[] {
  const { plain, ul } = analyze(text)
  const marks: { letter: string; index: number }[] = []
  let m: RegExpExecArray | null
  OPTION_MARK_RE.lastIndex = 0
  while ((m = OPTION_MARK_RE.exec(plain))) {
    marks.push({ letter: m[1], index: m.index + m[0].indexOf(m[1]) })
  }
  const sameCase = marks.every((x) => /[A-D]/.test(x.letter) === /[A-D]/.test(marks[0].letter))
  const isSequential =
    marks.length >= 2 &&
    sameCase &&
    marks.every((x, i) => i === 0 || x.letter.charCodeAt(0) === marks[i - 1].letter.charCodeAt(0) + 1)
  if (!isSequential) return [text]

  const bounds: [number, number][] = []
  if (marks[0].index > 0) bounds.push([0, marks[0].index])
  marks.forEach((mk, i) => bounds.push([mk.index, i + 1 < marks.length ? marks[i + 1].index : plain.length]))

  const parts: string[] = []
  for (let [s, e] of bounds) {
    while (s < e && /\s/.test(plain[s])) s++
    while (e > s && /\s/.test(plain[e - 1])) e--
    if (e > s) parts.push(sliceMarked(plain, ul, s, e))
  }
  return parts
}

export interface QuestionBlock {
  id: string
  number: number | null
  questionLines: string[]
  solutionLines: string[] // rỗng nếu không tìm thấy lời giải cho câu này
  underline: boolean[] // song song với questionLines — dòng nào CÓ chữ gạch chân (chỉ để tham khảo; hiển thị dùng thẻ <u> trong chính dòng)
}

interface RawOccurrence {
  number: number | null
  key: number | null // khóa duy nhất theo (PHẦN × 1000 + số câu)
  lines: string[]
}

function splitByQuestionMarker(paragraphs: InputParagraph[]): RawOccurrence[] {
  const occurrences: RawOccurrence[] = []
  let current: RawOccurrence | null = null
  let partIndex = 0

  for (const p of paragraphs) {
    const text = p.text.trim()
    const plain = stripU(text).trim()
    if (!plain || SKIP_HEADING_RE.test(plain)) continue

    if (PART_HEADING_RE.test(plain)) {
      partIndex++
      current = null
      occurrences.push({ number: null, key: null, lines: [text] })
      continue
    }

    const m = plain.match(QUESTION_NUM_RE)
    if (m) {
      const n = parseInt(m[1], 10)
      current = { number: n, key: partIndex * 1000 + n, lines: [text] }
      occurrences.push(current)
      continue
    }
    if (current) {
      current.lines.push(text)
    } else {
      occurrences.push({ number: null, key: null, lines: [text] })
    }
  }
  return occurrences
}

function splitSolution(lines: string[]): { question: string[]; solution: string[] } {
  const question: string[] = []
  const solution: string[] = []
  let inSol = false
  for (const line of lines) {
    if (!inSol && SOLUTION_RE.test(stripU(line))) {
      inSol = true
      continue
    }
    if (inSol) solution.push(line)
    else question.push(...splitStuckOptions(line))
  }
  return { question, solution }
}

/** "Câu N" trơn, không kèm nội dung câu hỏi thật (dấu hiệu chỉ là dòng dẫn vào lời giải tách riêng). */
function isBareQuestionMarker(line: string): boolean {
  const rest = stripU(line).replace(QUESTION_NUM_RE, '').trim()
  return rest.length === 0 || /^[.:]+$/.test(rest)
}

/**
 * Đọc toàn bộ đoạn văn, tách thành các câu — mỗi câu giữ RIÊNG câu hỏi và
 * lời giải (nếu có). Giữ nguyên gạch chân đúng chỗ (thẻ <u>) từ file gốc.
 */
export function parseIntoBlocks(paragraphs: InputParagraph[]): QuestionBlock[] {
  const occurrences = splitByQuestionMarker(paragraphs)
  const blocksByKey = new Map<number, QuestionBlock>()
  const orderedBlocks: QuestionBlock[] = []
  let counter = 0
  const nextId = () => `blk_${counter++}`
  const hasU = (l: string) => /<u>/.test(l)

  for (const occ of occurrences) {
    const { question, solution } = splitSolution(occ.lines)

    if (occ.number === null || occ.key === null) {
      orderedBlocks.push({
        id: nextId(),
        number: null,
        questionLines: question,
        solutionLines: [],
        underline: question.map(hasU),
      })
      continue
    }

    const isSolutionOnly =
      question.length === 1 && isBareQuestionMarker(question[0]) && solution.length > 0 && blocksByKey.has(occ.key)

    if (isSolutionOnly) {
      const target = blocksByKey.get(occ.key)!
      target.solutionLines.push(...solution)
      continue
    }

    const block: QuestionBlock = {
      id: nextId(),
      number: occ.number,
      questionLines: question,
      solutionLines: solution,
      underline: question.map(hasU),
    }
    blocksByKey.set(occ.key, block)
    orderedBlocks.push(block)
  }

  return orderedBlocks
}
