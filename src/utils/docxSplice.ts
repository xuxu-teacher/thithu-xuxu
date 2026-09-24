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

// Quét ở CẤP CAO NHẤT của <w:body>: mỗi khối là 1 ĐOẠN VĂN <w:p>...</w:p>
// HOẶC 1 BẢNG <w:tbl>...</w:tbl> NGUYÊN VẸN — bảng KHÔNG bị tách thành các
// đoạn văn bên trong (nếu tách, khung bảng <w:tbl>/<w:tr>/<w:tc> sẽ bị mất,
// làm hỏng file). Vì regex thử các nhánh theo đúng thứ tự tại từng vị trí,
// khi gặp "<w:tbl>" nó khớp trọn cả bảng, không bao giờ khớp riêng <w:p>
// nằm bên trong ô bảng.
const BLOCK_RE = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g

export async function loadRawDocx(
  file: File,
): Promise<{ zip: JSZip; documentXml: string; paragraphs: RawParagraph[] }> {
  const arrayBuffer = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(arrayBuffer)
  const documentXml = await zip.file('word/document.xml')?.async('string')
  if (!documentXml) throw new Error('Không tìm thấy document.xml — file Word có thể bị hỏng.')

  const matches = documentXml.match(BLOCK_RE) || []
  const paragraphs: RawParagraph[] = matches.map((xml) =>
    xml.startsWith('<w:tbl>')
      ? { xml, plainText: '[BẢNG SỐ LIỆU]' } // giữ nguyên khối, không phân tích chữ bên trong — tránh khớp nhầm "Câu"/"Lời giải"/phương án nằm tình cờ trong ô bảng
      : { xml, plainText: extractPlainText(xml) },
  )
  return { zip, documentXml, paragraphs }
}

/** Đóng gói lại: thay thế TOÀN BỘ chuỗi khối (đoạn văn + bảng) gốc bằng danh sách XML mới (đã sắp xếp/sửa lại), giữ nguyên mọi phần khác của document.xml và mọi file khác trong zip. */
export async function repackDocxWithParagraphs(
  zip: JSZip,
  documentXml: string,
  newParagraphXmls: string[],
): Promise<Blob> {
  let m: RegExpExecArray | null
  let firstIdx = -1
  let lastEnd = -1
  BLOCK_RE.lastIndex = 0
  while ((m = BLOCK_RE.exec(documentXml))) {
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

/** Tách 1 run thành "phần chữ cái mốc" (markerLen ký tự đầu, VD "b)") + "phần còn lại" — dùng để CHỈ gạch chân đúng chữ cái, không đụng cả câu. */
function splitMarkerRun(runXml: string, markerLen: number): { markerXml: string; restXml: string } | null {
  const rPrMatch = runXml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)
  const rPr = rPrMatch ? rPrMatch[0] : ''
  const tMatch = runXml.match(/<w:t\b([^>]*)>([\s\S]*?)<\/w:t>/)
  if (!tMatch) return null
  const attrs = tMatch[1]
  const text = tMatch[2]
  const markerText = text.slice(0, markerLen)
  const restText = text.slice(markerLen)

  // attrs có thể đã sẵn xml:space="preserve" từ file gốc — không thêm lặp lại,
  // chỉ thêm khi thật sự chưa có (thêm 2 lần cùng thuộc tính làm Word coi XML
  // là hỏng, không mở được file).
  const attrsWithSpace = attrs.includes('xml:space') ? attrs : `${attrs} xml:space="preserve"`
  const markerRPr = rPr ? rPr.replace('<w:rPr>', '<w:rPr><w:u w:val="single"/>') : '<w:rPr><w:u w:val="single"/></w:rPr>'
  const markerXml = `<w:r>${markerRPr}<w:t${attrsWithSpace}>${markerText}</w:t></w:r>`
  const restXml = restText.length > 0 ? `<w:r>${rPr}<w:t${attrsWithSpace}>${restText}</w:t></w:r>` : ''
  return { markerXml, restXml }
}

/** Chỉ gạch chân ĐÚNG CHỮ CÁI mốc (VD "b)"), không gạch chân cả nội dung câu/ý phía sau nó. */
export function addUnderlineToOptionInParagraph(pXml: string, letter: string): string {
  const runRe = /<w:r\b[^>]*>[\s\S]*?<\/w:r>/g
  const runs: { xml: string; start: number; end: number; text: string }[] = []
  let m: RegExpExecArray | null
  while ((m = runRe.exec(pXml))) {
    const wt = m[0].match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/)
    runs.push({ xml: m[0], start: m.index, end: m.index + m[0].length, text: wt ? wt[1] : '' })
  }
  if (runs.length === 0) return pXml

  const markerRunIdx: Record<string, { idx: number; markerLen: number }> = {}
  runs.forEach((r, i) => {
    const mm = r.text.match(/^(\s*[A-Da-d][.)])/)
    if (mm) {
      const key = mm[1].trim()[0].toUpperCase()
      if (markerRunIdx[key] === undefined) markerRunIdx[key] = { idx: i, markerLen: mm[1].length }
    }
  })

  const target = letter.toUpperCase()
  const info = markerRunIdx[target]
  if (!info) return pXml

  const targetRun = runs[info.idx]
  const split = splitMarkerRun(targetRun.xml, info.markerLen)
  if (!split) return pXml

  return pXml.slice(0, targetRun.start) + split.markerXml + split.restXml + pXml.slice(targetRun.end)
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
// KHÔNG bắt buộc khớp trọn cả dòng nữa — một số file có chữ thừa/gõ dính
// trước mốc (VD "Xong ph#Lời giải" — lỗi gõ dính có sẵn trong file gốc,
// thường do bị định dạng ẩn chữ che khuất khi soạn) — chỉ cần dòng CÓ
// CHỨA đúng cụm từ mốc, không quan tâm có gì đứng trước nó.
const SOLUTION_RE = /[#*~]*\s*(Lời giải chi tiết|Lời giải|LỜI GIẢI|Hướng dẫn giải|HƯỚNG DẪN GIẢI|Giải\s*:|Đáp án\s*:|Trả lời)\s*:?\s*$/i
const SKIP_HEADING_RE = /^\s*(ĐÁP ÁN|Đáp án|BẢNG ĐÁP ÁN)\s*$/i
// Các dòng "rác" hay gặp trong lời giải sưu tầm từ nhóm chia sẻ đề (ghi
// công tác giả/phản biện...) — không phải nội dung hướng dẫn giải thật,
// tự động loại bỏ khi ghép lời giải.
const JUNK_LINE_RE = /^\s*(FB\s*(tác giả|phản biện)|Facebook\s*(tác giả|phản biện)|Người\s*(ra đề|phản biện))\s*:/i

// Đề thi thường chia nhiều "PHẦN" (PHẦN I, PHẦN II, PHẦN III...), MỖI PHẦN
// tự đánh số lại từ "Câu 1" — nếu chỉ dùng đúng số câu làm khóa nhận diện,
// "Câu 1" của PHẦN II sẽ bị hiểu nhầm là TRÙNG với "Câu 1" của PHẦN I và
// bị bỏ qua toàn bộ (mất trắng cả phần sau). Vì vậy khóa nhận diện thật sự
// dùng bên dưới là (số thứ tự PHẦN × 1000 + số câu) — vẫn là 1 số nguyên
// bình thường nên không cần đổi bất kỳ chỗ nào khác đang dùng "number".
const PART_HEADING_RE = /^\s*PHẦN\s+[IVXLCDM\d]+[.\s)]/i

export interface RawOccurrence {
  number: number | null
  paragraphs: RawParagraph[]
}

export function groupRawByQuestionMarker(paragraphs: RawParagraph[]): RawOccurrence[] {
  const occurrences: RawOccurrence[] = []
  let current: RawOccurrence | null = null
  let partIndex = 0

  for (const p of paragraphs) {
    const text = p.plainText.trim()
    if (!text || SKIP_HEADING_RE.test(text)) continue

    if (PART_HEADING_RE.test(text)) {
      partIndex++
      current = null
      occurrences.push({ number: null, paragraphs: [p] }) // giữ lại dòng tiêu đề PHẦN, không gán số câu
      continue
    }

    const m = text.match(QUESTION_NUM_RE)
    if (m) {
      const effectiveNumber = partIndex * 1000 + parseInt(m[1], 10)
      current = { number: effectiveNumber, paragraphs: [p] }
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

/** Trong 1 occurrence, tách thành phần "câu hỏi" (trước dòng Lời giải) và "lời giải" (từ đó trở đi) — tự loại bỏ các dòng rác (ghi công tác giả/phản biện...) khỏi phần lời giải. */
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
    if (inSol) {
      if (JUNK_LINE_RE.test(text)) continue
      solution.push(p)
    } else {
      question.push(p)
    }
  }
  return { question, solution }
}

export function isOptionText(text: string): boolean {
  return /^\s*[A-Da-d][.)]\s*\S/.test(text)
}

/**
 * Nếu 1 đoạn văn gộp nhiều phương án chung 1 dòng (A/B/C/D hoặc a/b/c/d
 * dính liền) — tách thành NHIỀU đoạn văn riêng, mỗi đoạn 1 phương án,
 * giữ nguyên toàn bộ định dạng của từng run (chỉ chia lại ranh giới
 * đoạn, không đổi font/màu/công thức gì).
 */
export function splitOptionsIntoOwnParagraphs(paragraphs: RawParagraph[]): RawParagraph[] {
  const result: RawParagraph[] = []

  for (const p of paragraphs) {
    if (!isOptionText(p.plainText)) {
      result.push(p)
      continue
    }

    const runRe = /<w:r\b[^>]*>[\s\S]*?<\/w:r>/g
    const runs: { xml: string; start: number; end: number; text: string }[] = []
    let m: RegExpExecArray | null
    while ((m = runRe.exec(p.xml))) {
      const wt = m[0].match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/)
      runs.push({ xml: m[0], start: m.index, end: m.index + m[0].length, text: wt ? wt[1] : '' })
    }

    const markerIdx: { letter: string; runIdx: number }[] = []
    runs.forEach((r, i) => {
      const mm = r.text.match(/^\s*([A-Da-d])[.)]/)
      if (mm) markerIdx.push({ letter: mm[1], runIdx: i })
    })

    if (markerIdx.length < 2 || runs.length === 0) {
      result.push(p)
      continue
    }

    // Lấy pPr (thuộc tính đoạn văn: căn lề, dãn dòng...) của đoạn gốc để dùng chung cho các đoạn mới, giữ đúng định dạng đoạn.
    const pPrMatch = p.xml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)
    const pPr = pPrMatch ? pPrMatch[0] : ''
    const pOpenTag = p.xml.match(/^<w:p\b[^>]*>/)?.[0] || '<w:p>'

    markerIdx.forEach((mk, i) => {
      const startRun = mk.runIdx
      const endRun = i + 1 < markerIdx.length ? markerIdx[i + 1].runIdx : runs.length
      const runsXml = runs.slice(startRun, endRun).map((r) => r.xml).join('')
      const newXml = `${pOpenTag}${pPr}${runsXml}</w:p>`
      const newText = runs.slice(startRun, endRun).map((r) => r.text).join('')
      result.push({ xml: newXml, plainText: newText })
    })
  }

  return result
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
const HUONG_DAN_GIAI_MARKER_RE = /^\s*HƯỚNG DẪN GIẢI\s*$/i

/**
 * Một số file trình bày đề 3 LẦN trong cùng 1 file: (1) đề + lời giải rút
 * gọn dạng "#Lời giải" ngay sau mỗi câu, (2) mục "ĐÁP ÁN" chỉ có bảng chữ
 * cái, (3) mục "HƯỚNG DẪN GIẢI" — bản đầy đủ nhất, đề và lời giải chi tiết
 * đúng vị trí liền nhau. Nếu tìm thấy mục (3), CHỈ dùng từ đó trở đi làm
 * nguồn duy nhất — bỏ hẳn phần đề gốc và phần đáp án phía trước (tránh
 * nhầm lẫn số câu do "PHẦN..." bị lặp lại nhiều lần, và tránh sót nội
 * dung/hình ảnh do xử lý nhầm 2 bản trùng lặp phía trước).
 */
export function extractHuongDanGiaiSection(paragraphs: RawParagraph[]): RawParagraph[] | null {
  const idx = paragraphs.findIndex((p) => HUONG_DAN_GIAI_MARKER_RE.test(p.plainText.trim()))
  if (idx === -1) return null
  return paragraphs.slice(idx + 1)
}

export function spliceAttachSolutions(
  paragraphs: RawParagraph[],
  shortAnswerByNumber?: Map<number, string>,
  answerLabel: string = 'Đáp án',
): RawParagraph[] {
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

    // Câu trả lời ngắn (không có phương án A/B/C/D hay a/b/c/d) -> chèn dòng
    // "Đáp án: ..." NGAY GIỮA đề và "Lời giải", đúng theo mẫu chuẩn.
    const answerText = shortAnswerByNumber?.get(occ.number)
    if (answerText) {
      finalParagraphs.push(buildLabelParagraph(`${answerLabel}: ${answerText}`))
    }

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
