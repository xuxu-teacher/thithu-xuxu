import JSZip from 'jszip'

// ============================================================
// GHÉP/SỬA FILE WORD MÀ GIỮ NGUYÊN ĐỊNH DẠNG GỐC
// ============================================================
// Khác với parseGenericWordParagraphs (đọc ra chữ+LaTeX để HIỂN THỊ, mất
// hết định dạng gốc) — ở đây làm việc trực tiếp trên XML <w:p> GỐC của
// từng đoạn văn, chỉ SẮP XẾP LẠI hoặc THÊM THUỘC TÍNH (gạch chân) vào
// đúng đoạn, mọi thứ khác (font, công thức OMML, ảnh, mọi định dạng)
// giữ nguyên 100% vì không đụng vào — rồi đóng gói lại CHÍNH bộ zip gốc,
// chỉ thay mỗi word/document.xml.
// ============================================================

export interface RawParagraph {
  xml: string // toàn bộ <w:p ...>...</w:p> gốc, chưa xử lý gì
  plainText: string // chữ thô (chỉ để nhận diện Câu N / Lời giải, không dùng để hiển thị)
}

function extractPlainText(pXml: string): string {
  const wtRe = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g
  let text = ''
  let m: RegExpExecArray | null
  while ((m = wtRe.exec(pXml))) text += m[1]
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim()
}

export async function loadRawDocx(
  file: File,
): Promise<{ zip: JSZip; documentXml: string; paragraphs: RawParagraph[] }> {
  const arrayBuffer = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(arrayBuffer)
  const documentXml = await zip.file('word/document.xml')?.async('string')
  if (!documentXml) throw new Error('Không tìm thấy document.xml — file Word có thể bị hỏng.')

  const pRe = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g
  const matches = documentXml.match(pRe) || []
  const paragraphs: RawParagraph[] = matches.map((xml) => ({ xml, plainText: extractPlainText(xml) }))
  return { zip, documentXml, paragraphs }
}

/** Đóng gói lại: thay thế TOÀN BỘ chuỗi đoạn văn gốc bằng danh sách XML mới (đã sắp xếp/sửa lại), giữ nguyên mọi phần khác của document.xml và mọi file khác trong zip. */
export async function repackDocxWithParagraphs(
  zip: JSZip,
  documentXml: string,
  newParagraphXmls: string[],
): Promise<Blob> {
  const pRe = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g
  let m: RegExpExecArray | null
  let firstIdx = -1
  let lastEnd = -1
  while ((m = pRe.exec(documentXml))) {
    if (firstIdx === -1) firstIdx = m.index
    lastEnd = m.index + m[0].length
  }
  if (firstIdx === -1) throw new Error('Không tìm thấy đoạn văn nào trong file để ghép lại.')

  const before = documentXml.slice(0, firstIdx)
  const after = documentXml.slice(lastEnd)
  const newDocumentXml = before + newParagraphXmls.join('') + after

  zip.file('word/document.xml', newDocumentXml)
  return zip.generateAsync({ type: 'blob' })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Thêm thuộc tính gạch chân (w:u) vào MỌI run chữ trong 1 đoạn văn — dùng đánh dấu đáp án đúng, không đụng gì khác trong đoạn. */
export function addUnderlineToParagraph(pXml: string): string {
  return pXml.replace(/(<w:r\b[^>]*>)([\s\S]*?)(<\/w:r>)/g, (_whole, open, inner, close) => {
    if (/<w:rPr>/.test(inner)) {
      return open + inner.replace(/<w:rPr>/, '<w:rPr><w:u w:val="single"/>') + close
    }
    return open + '<w:rPr><w:u w:val="single"/></w:rPr>' + inner + close
  })
}

/**
 * Áp dụng gạch chân theo đúng (đoạn văn, chữ cái) — nhiều mục tiêu có thể
 * trỏ chung 1 đoạn văn (trường hợp cả 4 phương án gộp 1 dòng); mỗi mục
 * tiêu chỉ gạch đúng phạm vi chữ của riêng phương án đó trong đoạn, không
 * đụng phần còn lại.
 */
export function applyUnderlineToParagraphs(
  all: RawParagraph[],
  targets: { paragraph: RawParagraph; letter: string }[],
): RawParagraph[] {
  const lettersByParagraph = new Map<RawParagraph, Set<string>>()
  for (const t of targets) {
    const set = lettersByParagraph.get(t.paragraph) || new Set<string>()
    set.add(t.letter.toUpperCase())
    lettersByParagraph.set(t.paragraph, set)
  }

  return all.map((p) => {
    const letters = lettersByParagraph.get(p)
    if (!letters) return p
    let xml = p.xml
    for (const letter of letters) xml = addUnderlineToOptionInParagraph(xml, letter)
    return { ...p, xml }
  })
}

/**
 * Một số file gộp cả 4 phương án A/B/C/D chung 1 đoạn văn (ngăn cách bằng
 * tab) thay vì mỗi phương án 1 đoạn riêng — nếu gạch chân cả đoạn sẽ gạch
 * nhầm cả 4. Hàm này chỉ gạch chân đúng phạm vi RUN thuộc về 1 chữ cái cụ
 * thể (từ mốc "X." đến trước mốc chữ cái tiếp theo), giữ nguyên phần còn
 * lại của đoạn.
 */
export function addUnderlineToOptionInParagraph(pXml: string, letter: string): string {
  const runRe = /<w:r\b[^>]*>[\s\S]*?<\/w:r>/g
  const runs: { xml: string; start: number; end: number; text: string }[] = []
  let m: RegExpExecArray | null
  while ((m = runRe.exec(pXml))) {
    const wt = m[0].match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/)
    runs.push({ xml: m[0], start: m.index, end: m.index + m[0].length, text: wt ? wt[1] : '' })
  }
  if (runs.length === 0) return pXml

  const markerRunIdx: Record<string, number> = {}
  runs.forEach((r, i) => {
    const mm = r.text.match(/^\s*([A-Da-d])[.)]/)
    if (mm) {
      const key = mm[1].toUpperCase()
      if (markerRunIdx[key] === undefined) markerRunIdx[key] = i
    }
  })

  const target = letter.toUpperCase()
  const startIdx = markerRunIdx[target]
  if (startIdx === undefined) return pXml

  let endIdx = runs.length
  for (const l of ['A', 'B', 'C', 'D']) {
    const idx = markerRunIdx[l]
    if (l !== target && idx !== undefined && idx > startIdx && idx < endIdx) endIdx = idx
  }

  // Ghép lại chuỗi paragraph, chỉ thay các run trong phạm vi [startIdx, endIdx) bằng bản đã gạch chân — theo đúng vị trí index, tránh nhầm lẫn nếu có run trùng nội dung.
  let result = ''
  let cursor = 0
  runs.forEach((r, i) => {
    result += pXml.slice(cursor, r.start)
    result += i >= startIdx && i < endIdx ? addUnderlineToParagraph(r.xml) : r.xml
    cursor = r.end
  })
  result += pXml.slice(cursor)
  return result
}

/** Dựng 1 đoạn văn nhãn (in đậm) hợp lệ về mặt XML để chèn vào giữa các đoạn khác — dùng chèn lại tiêu đề "Lời giải" đã bị bỏ khi tách. */
export function buildLabelParagraph(text: string): RawParagraph {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return {
    xml: `<w:p><w:pPr><w:rPr><w:b/></w:rPr></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${escaped}</w:t></w:r></w:p>`,
    plainText: text,
  }
}

const QUESTION_NUM_RE = /^\s*(?:Câu|CÂU|Bài|BÀI)\s*(\d+)/i
const SOLUTION_RE =
  /^\s*(Lời giải|LỜI GIẢI|Hướng dẫn giải|HƯỚNG DẪN GIẢI|Giải\s*:|Đáp án\s*:|Lời giải chi tiết|Trả lời)\s*:?\s*$/i
const SKIP_HEADING_RE = /^\s*(ĐÁP ÁN|Đáp án|BẢNG ĐÁP ÁN)\s*$/i

export interface RawOccurrence {
  number: number | null
  paragraphs: RawParagraph[]
}

export function groupRawByQuestionMarker(paragraphs: RawParagraph[]): RawOccurrence[] {
  const occurrences: RawOccurrence[] = []
  let current: RawOccurrence | null = null

  for (const p of paragraphs) {
    const text = p.plainText.trim()
    if (!text || SKIP_HEADING_RE.test(text)) continue

    const m = text.match(QUESTION_NUM_RE)
    if (m) {
      current = { number: parseInt(m[1], 10), paragraphs: [p] }
      occurrences.push(current)
      continue
    }
    if (current) {
      current.paragraphs.push(p)
    } else {
      occurrences.push({ number: null, paragraphs: [p] })
      current = null
    }
  }
  return occurrences
}

/** Trong 1 occurrence, tách thành phần "câu hỏi" (trước dòng Lời giải) và "lời giải" (từ đó trở đi). */
export function splitRawSolution(paragraphs: RawParagraph[]): { question: RawParagraph[]; solution: RawParagraph[] } {
  const question: RawParagraph[] = []
  const solution: RawParagraph[] = []
  let inSol = false
  for (const p of paragraphs) {
    const text = p.plainText.trim()
    if (!text) continue
    if (!inSol && SOLUTION_RE.test(text)) {
      inSol = true
      continue
    }
    if (inSol) solution.push(p)
    else question.push(p)
  }
  return { question, solution }
}

export function isOptionText(text: string): boolean {
  return /^\s*[A-Da-d][.)]\s*\S/.test(text)
}

export interface OptionRef {
  letter: string
  paragraph: RawParagraph
  text: string // đúng đoạn chữ của riêng phương án này (để gửi AI đọc), có thể trùng nguồn paragraph với option khác
}

const INLINE_OPTION_RE = /(?:^|\s)([A-Da-d])[.)]\s*(?=\S)/g

/**
 * Một đoạn văn có thể chứa 1 phương án (mỗi phương án riêng 1 <w:p>) hoặc
 * gộp cả 4 phương án chung 1 <w:p> (ngăn cách bằng tab) — hàm này liệt kê
 * RÕ TỪNG phương án kèm chữ cái, dù có thể trỏ chung 1 paragraph gốc.
 */
export function splitOptionParagraphs(paragraphs: RawParagraph[]): OptionRef[] {
  const refs: OptionRef[] = []
  for (const p of paragraphs) {
    if (!isOptionText(p.plainText)) continue
    const marks: { letter: string; index: number }[] = []
    let m: RegExpExecArray | null
    INLINE_OPTION_RE.lastIndex = 0
    while ((m = INLINE_OPTION_RE.exec(p.plainText))) {
      marks.push({ letter: m[1], index: m.index + m[0].indexOf(m[1]) })
    }
    if (marks.length === 0) continue
    marks.forEach((mk, i) => {
      const end = i + 1 < marks.length ? marks[i + 1].index : p.plainText.length
      refs.push({ letter: mk.letter.toUpperCase(), paragraph: p, text: p.plainText.slice(mk.index, end).trim() })
    })
  }
  return refs
}

/** Với mỗi số câu, gộp lại đúng phần câu hỏi + lời giải hiệu lực (dù nằm ngay trong hay tách rời ở cuối file) — dùng chung cho cả 2 công cụ (ghép lời giải, và chuẩn bị dữ liệu cho AI xác định đáp án đúng). */
export function buildQuestionMap(
  paragraphs: RawParagraph[],
): Map<number, { question: RawParagraph[]; solution: RawParagraph[] }> {
  const occurrences = groupRawByQuestionMarker(paragraphs)
  const split = occurrences.map((occ) => ({ occ, ...splitRawSolution(occ.paragraphs) }))

  const detachedSolutionByNumber = new Map<number, RawParagraph[]>()
  for (const { occ, question, solution } of split) {
    const isSolutionOnly = occ.number !== null && question.length <= 1 && solution.length > 0
    if (isSolutionOnly) {
      const existing = detachedSolutionByNumber.get(occ.number!) || []
      detachedSolutionByNumber.set(occ.number!, [...existing, ...solution])
    }
  }

  const map = new Map<number, { question: RawParagraph[]; solution: RawParagraph[] }>()
  for (const { occ, question, solution } of split) {
    if (occ.number === null) continue
    const isSolutionOnly = question.length <= 1 && solution.length > 0
    if (isSolutionOnly) continue
    if (map.has(occ.number)) continue
    const finalSolution = solution.length > 0 ? solution : detachedSolutionByNumber.get(occ.number) || []
    map.set(occ.number, { question, solution: finalSolution })
  }
  return map
}

/**
 * GHÉP LỜI GIẢI VÀO ĐÚNG CÂU — giữ nguyên toàn bộ XML gốc của đề, chỉ di
 * chuyển các đoạn lời giải (đang nằm tách riêng, đánh số lại ở cuối file)
 * về đúng ngay sau câu hỏi tương ứng.
 */
export function spliceAttachSolutions(paragraphs: RawParagraph[]): RawParagraph[] {
  const occurrences = groupRawByQuestionMarker(paragraphs)
  const split = occurrences.map((occ) => ({ occ, ...splitRawSolution(occ.paragraphs) }))

  // Lượt 1: gom các occurrence "chỉ có lời giải" (câu hỏi rỗng, tách riêng ở cuối file) theo đúng số câu.
  const detachedSolutionByNumber = new Map<number, RawParagraph[]>()
  for (const { occ, question, solution } of split) {
    const isSolutionOnly = occ.number !== null && question.length <= 1 && solution.length > 0
    if (isSolutionOnly) {
      const existing = detachedSolutionByNumber.get(occ.number!) || []
      detachedSolutionByNumber.set(occ.number!, [...existing, ...solution])
    }
  }

  // Lượt 2: dựng lại danh sách cuối — mỗi câu hỏi thật, theo sau là lời giải
  // của chính nó (nếu nằm ngay trong) hoặc lời giải đã gom ở Lượt 1 (nếu tách rời).
  const finalParagraphs: RawParagraph[] = []
  const seenNumbers = new Set<number>()

  for (const { occ, question, solution } of split) {
    const isSolutionOnly = occ.number !== null && question.length <= 1 && solution.length > 0
    if (isSolutionOnly) continue // đã gộp vào đúng câu gốc, bỏ qua vị trí gốc của nó

    if (occ.number === null) {
      finalParagraphs.push(...occ.paragraphs)
      continue
    }
    if (seenNumbers.has(occ.number)) continue
    seenNumbers.add(occ.number)

    finalParagraphs.push(...question)
    const finalSolution = solution.length > 0 ? solution : detachedSolutionByNumber.get(occ.number) || []
    if (finalSolution.length > 0) {
      // Nhãn "Lời giải" bị bỏ đi lúc tách (chỉ dùng để NHẬN DIỆN ranh giới,
      // không giữ lại) — chèn lại 1 đoạn nhãn mới ở đây cho rõ ràng.
      finalParagraphs.push(buildLabelParagraph('Lời giải'))
      finalParagraphs.push(...finalSolution)
    }
  }

  return finalParagraphs
}
