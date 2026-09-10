import JSZip from 'jszip'
import { MCQOption, ParsedImage, QuestionPart, TrueFalseOption } from '../types'

/**
 * ĐỌC FILE WORD (.docx) THÀNH CÂU HỎI CÓ CẤU TRÚC
 * ================================================
 * Port lại từ bộ parser "taodeword" (v10) — đọc trực tiếp XML bên trong file
 * .docx (không qua mammoth.js) nên giữ được nhiều thông tin định dạng hơn:
 *
 *  - Tự tách 3 phần đề thi: PHẦN 1 (trắc nghiệm), PHẦN 2 (đúng/sai 4 ý),
 *    PHẦN 3 (trả lời ngắn) — theo các tiêu đề thường dùng trong đề thi VN.
 *  - Tự nhận đáp án đúng của câu trắc nghiệm qua chữ "Chọn A/B/C/D" trong lời
 *    giải, HOẶC qua việc GẠCH CHÂN đáp án đúng ngay trong Word.
 *  - Tự nhận các ý đúng của câu Đúng/Sai qua việc GẠCH CHÂN ý đó trong Word —
 *    giáo viên soạn đề trong Word như bình thường, chỉ cần bôi đen ý đúng và
 *    bấm Underline (Ctrl+U), không cần thao tác gì thêm trên web.
 *  - Tự nhận đáp án câu trả lời ngắn qua dòng "Đáp án: ...".
 *  - Giữ nguyên mọi hình ảnh (kể cả hình vẽ, biểu đồ) bằng cách nhúng base64.
 *  - Công thức toán gõ bằng LaTeX trực tiếp trong Word (đặt trong $...$ hoặc
 *    $$...$$) được giữ nguyên để MathJax render ở phía web.
 *
 * CÔNG THỨC MATHTYPE (đối tượng OLE):
 * Nếu công thức được chèn bằng công cụ MathType (không phải gõ LaTeX, không
 * phải Insert > Equation của Word), nó nằm trong file Word dưới dạng đối
 * tượng OLE nhị phân — trình duyệt không tự đọc được. Cách xử lý:
 *   1) Cấu hình biến môi trường VITE_MATHTYPE_SERVER_URL trỏ tới một máy chủ
 *      chuyển đổi OLE → LaTeX riêng (nếu bạn đã có sẵn từ dự án trước). Khi
 *      đó công thức MathType sẽ tự động được chuyển đúng và hiển thị chính
 *      xác.
 *   2) Nếu KHÔNG có máy chủ này, cách ổn định nhất là: trong Word, chuyển
 *      công thức MathType sang ảnh (MathType > Convert Equations > Image)
 *      rồi chèn lại — ảnh sẽ luôn được giữ nguyên 100% dù không có máy chủ.
 */

// ============================================================
// CẤU HÌNH MÁY CHỦ MATHTYPE (tùy chọn)
// ============================================================
// QUAN TRỌNG: phải viết đúng "import.meta.env.VITE_..." — KHÔNG dùng "?."
// (optional chaining) ở đây. Vite chỉ thay giá trị thật vào lúc build khi
// gặp đúng cú pháp này; viết kiểu (import.meta as any)?.env?.KEY sẽ luôn ra
// rỗng dù biến môi trường đã cấu hình đúng trên Vercel.
const MATHTYPE_SERVER_URL: string = import.meta.env.VITE_MATHTYPE_SERVER_URL || ''

export interface DraftQuestionData {
  key: string
  order_index: number
  part: QuestionPart
  content_html: string
  options: MCQOption[] | TrueFalseOption[]
  correct_answer: string
  explanation_html: string
  points: number
  needsReview: boolean // câu tự luận / chưa chắc chắn đáp án -> giáo viên nên rà lại
}

interface ParagraphData {
  text: string
  imageRIds: string[]
  hasUnderline: boolean
  underlinedSegments: string[]
}

type RawQType = 'multiple_choice' | 'true_false' | 'short_answer' | 'writing'

interface RawOption {
  letter: string
  text: string
}

interface RawQuestion {
  number: number
  part: 1 | 2 | 3
  type: RawQType
  text: string
  options: RawOption[]
  correctAnswer: string | null
  solution: string
  images: ParsedImage[]
  solutionImages: ParsedImage[]
}

// ============================================================
// CHUẨN HÓA VĂN BẢN
// ============================================================
function normalizeVietnamese(text: string): string {
  return text ? text.normalize('NFC') : ''
}

function normalizeLatex(text: string): string {
  if (!text) return ''
  let s = text
  s = s.replace(/\\\[([\s\S]*?)\\\]/g, '$$$$1$$$$')
  s = s.replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$')
  s = s.replace(/\\begin\{align\*?\}/g, '\\begin{aligned}')
  s = s.replace(/\\end\{align\*?\}/g, '\\end{aligned}')
  s = s.replace(/\${3,}/g, '$$')
  s = s.replace(/[ \t]+/g, ' ')
  s = s.replace(/\n{3,}/g, '\n\n')
  return s.trim()
}

function escapeHtmlPreserveLaTeX(text: string): string {
  if (!text) return ''
  const blocks: string[] = []
  const protect = (m: string): string => {
    blocks.push(m)
    return `__LB_${blocks.length - 1}__`
  }
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, protect)
  text = text.replace(/\$(?!\$)([\s\S]*?)\$(?!\$)/g, protect)
  text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  for (let i = 0; i < blocks.length; i++) text = text.replace(`__LB_${i}__`, blocks[i])
  return text.replace(/\n/g, '<br/>')
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

// ============================================================
// TRÍCH XUẤT ẢNH TỪ FILE WORD
// ============================================================
async function extractImages(
  zip: JSZip
): Promise<{ images: ParsedImage[]; imageRelMap: Map<string, string> }> {
  const images: ParsedImage[] = []
  const imageRelMap = new Map<string, string>()

  try {
    const relsContent = await zip.file('word/_rels/document.xml.rels')?.async('string')
    if (relsContent) {
      const relPattern = /Id="(rId\d+)"[^>]*Target="([^"]+)"/g
      let match: RegExpExecArray | null
      while ((match = relPattern.exec(relsContent)) !== null) {
        const target = match[2]
        if (target.includes('media/')) imageRelMap.set(match[1], target.split('/').pop() || '')
      }
    }

    for (const [filePath, entry] of Object.entries(zip.files)) {
      if (filePath.startsWith('word/media/') && !entry.dir) {
        const filename = filePath.split('/').pop() || ''
        const data = await entry.async('base64')
        const ext = filename.split('.').pop()?.toLowerCase() || ''
        const types: Record<string, string> = {
          png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
          gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml',
        }
        let rId = ''
        for (const [rid, fname] of imageRelMap.entries()) {
          if (fname === filename) { rId = rid; break }
        }
        images.push({
          id: `img_${images.length}`, filename, base64: data,
          contentType: types[ext] || 'image/png', rId,
        })
      }
    }
  } catch (err) {
    console.warn('[docxParser] Lỗi khi trích xuất ảnh:', err)
  }
  return { images, imageRelMap }
}

// ============================================================
// TRÍCH XUẤT + CHUYỂN ĐỔI CÔNG THỨC MATHTYPE (OLE) — TÙY CHỌN
// ============================================================
async function extractOleItems(zip: JSZip): Promise<Array<{ id: string; ole_b64: string }>> {
  const relsContent = await zip.file('word/_rels/document.xml.rels')?.async('string')
  if (!relsContent) return []

  const ridToPath = new Map<string, string>()
  const re = /<Relationship\b[^>]*\bId="(rId\d+)"[^>]*\bType="([^"]+)"[^>]*\bTarget="([^"]+)"[^>]*\/?>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(relsContent)) !== null) {
    const type = (m[2] || '').toLowerCase()
    const target = (m[3] || '').replace(/^\.?\//, '')
    if (target.toLowerCase().endsWith('.bin') && type.includes('oleobject')) {
      ridToPath.set(m[1], 'word/' + target)
    }
  }

  const items: Array<{ id: string; ole_b64: string }> = []
  for (const [rId, filePath] of ridToPath.entries()) {
    const f = zip.file(filePath)
    if (f) items.push({ id: rId, ole_b64: await f.async('base64') })
  }
  return items
}

async function convertOleToLatex(
  items: Array<{ id: string; ole_b64: string }>,
  serverUrl: string
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (!items.length || !serverUrl) return map
  try {
    const res = await fetch(`${serverUrl}/v1/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, wrap: true }),
    })
    if (!res.ok) throw new Error(`Máy chủ MathType trả về lỗi ${res.status}`)
    const data = await res.json()
    for (const r of data.results || []) {
      if (r.id && r.latex && !r.error) map.set(r.id, r.latex.trim())
    }
  } catch (e) {
    console.warn('[docxParser] Máy chủ MathType không phản hồi, bỏ qua chuyển đổi OLE:', e)
  }
  return map
}

// ============================================================
// TRÍCH XUẤT ĐOẠN VĂN (PARAGRAPH) TỪ XML THÔ — GIỮ THÔNG TIN GẠCH CHÂN
// ============================================================
function extractParagraphsRaw(documentXml: string, oleLatexMap: Map<string, string>): ParagraphData[] {
  const paragraphs: ParagraphData[] = []
  const paraRe = /<w:p\b[\s\S]*?<\/w:p>/g
  const runRe = /<w:r\b[\s\S]*?<\/w:r>/g

  let pm: RegExpExecArray | null
  while ((pm = paraRe.exec(documentXml)) !== null) {
    const pXml = pm[0]
    let text = ''
    let hasUnderline = false
    const underlinedSegments: string[] = []
    const imageRIds: string[] = []

    let rm: RegExpExecArray | null
    runRe.lastIndex = 0
    while ((rm = runRe.exec(pXml)) !== null) {
      const runXml = rm[0]
      const rPrBlock = runXml.match(/<w:rPr\b[\s\S]*?<\/w:rPr>/)?.[0] ?? ''
      const isUnderlined = /<w:u\b/.test(rPrBlock)

      let runText = ''
      const wtRe = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g
      let wm: RegExpExecArray | null
      while ((wm = wtRe.exec(runXml)) !== null) runText += decodeXmlEntities(wm[1])
      const mtRe = /<m:t\b[^>]*>([\s\S]*?)<\/m:t>/g
      while ((wm = mtRe.exec(runXml)) !== null) runText += wm[1]

      if (/<w:tab\b/.test(runXml)) runText += '\t'
      if (/<(?:w:br|w:cr)\b/.test(runXml)) runText += '\n'

      const oleM = runXml.match(/<o:OLEObject\b[^>]+r:id="(rId\d+)"/)
      if (oleM) {
        const latex = oleLatexMap.get(oleM[1]) ?? ''
        if (latex) runText += ` ${latex} `
      }

      const runForImages = runXml.replace(/<w:object\b[\s\S]*?<\/w:object>/g, '')
      const blipRe = /r:embed="(rId\d+)"/g
      while ((wm = blipRe.exec(runForImages)) !== null) {
        if (!imageRIds.includes(wm[1])) imageRIds.push(wm[1])
      }
      const vImgRe = /(?:r:id|o:relid)="(rId\d+)"/g
      while ((wm = vImgRe.exec(runForImages)) !== null) {
        if (!imageRIds.includes(wm[1])) imageRIds.push(wm[1])
      }

      if (isUnderlined && runText.trim()) {
        hasUnderline = true
        underlinedSegments.push(runText.trim())
      }
      text += runText
    }

    text = normalizeVietnamese(text.trim())
    text = normalizeLatex(text)
    text = text.replace(/[ \t]*\n[ \t]*/g, '\n').trim()

    if (text || imageRIds.length > 0) {
      paragraphs.push({ text, imageRIds, hasUnderline, underlinedSegments })
    }
  }
  return paragraphs
}

// ============================================================
// NHẬN DIỆN RANH GIỚI PHẦN 1 / 2 / 3
// ============================================================
function detectSections(paragraphs: ParagraphData[]) {
  const info = { part1Start: -1, part2Start: -1, part3Start: -1 }
  const p1 = [/PHẦN\s*1/i, /PHAN\s*1/i, /PHẦN\s+I[.\s]/i, /I\.\s*TRẮC\s*NGHIỆM/i, /I\.\s*TRAC\s*NGHIEM/i]
  const p2 = [/PHẦN\s*2/i, /PHAN\s*2/i, /PHẦN\s+II[.\s]/i, /II\.\s*ĐÚNG\s*SAI/i, /ĐÚNG\s*SAI/i, /DUNG\s*SAI/i]
  const p3 = [/PHẦN\s*3/i, /PHAN\s*3/i, /PHẦN\s+III[.\s]/i, /III\.\s*TRẢ\s*LỜI/i, /TRẢ\s*LỜI\s*NGẮN/i, /TRA\s*LOI\s*NGAN/i]

  for (let i = 0; i < paragraphs.length; i++) {
    const t = paragraphs[i].text
    if (info.part1Start === -1 && p1.some((re) => re.test(t))) info.part1Start = i
    if (info.part2Start === -1 && i > info.part1Start && p2.some((re) => re.test(t))) info.part2Start = i
    if (info.part3Start === -1 && i > Math.max(info.part1Start, info.part2Start) && p3.some((re) => re.test(t))) info.part3Start = i
  }
  if (info.part1Start === -1) info.part1Start = 0
  if (info.part2Start === -1) info.part2Start = paragraphs.length
  if (info.part3Start === -1) info.part3Start = paragraphs.length
  return info
}

// ============================================================
// PHÂN TÍCH ĐÁP ÁN A/B/C/D — an toàn với công thức LaTeX bên trong
// ============================================================
function findOptionMarkers(text: string, startLetter: 'A' | 'C' = 'A') {
  const letters = startLetter === 'A' ? ['A', 'B', 'C', 'D'] : ['C', 'D']
  const result: Array<{ markerStart: number; contentStart: number }> = []
  let inDollar = false
  let letterIdx = 0

  for (let i = 0; i < text.length; i++) {
    if (text[i] === '$' && (i === 0 || text[i - 1] !== '\\')) inDollar = !inDollar
    if (!inDollar && letterIdx < letters.length) {
      const letter = letters[letterIdx]
      const charMatch = text[i].toUpperCase() === letter
      const prevOk = i === 0 || /[\s$.)\\]]/.test(text[i - 1])
      const next = i + 1 < text.length ? text[i + 1] : ''
      const nextOk = next === '.' || next === ')'
      if (charMatch && prevOk && nextOk) {
        let contentStart = i + 2
        while (contentStart < text.length && text[contentStart] === ' ') contentStart++
        result.push({ markerStart: i, contentStart })
        letterIdx++
        i = contentStart - 1
      }
    }
  }
  return result.length === letters.length ? result : null
}

function parseSingleLineOptions(text: string): RawOption[] | null {
  const t = text.trim()
  if (!/^A[.)]/i.test(t)) return null
  const markers = findOptionMarkers(t, 'A')
  if (!markers || markers.length !== 4) return null
  const letters = ['A', 'B', 'C', 'D']
  const opts: RawOption[] = []
  for (let i = 0; i < 4; i++) {
    const start = markers[i].contentStart
    const end = i < 3 ? markers[i + 1].markerStart : t.length
    opts.push({ letter: letters[i], text: t.slice(start, end).trim().replace(/\.\s*$/, '').trim() })
  }
  return opts.some((o) => o.text !== '') ? opts : null
}

function isSingleLineOptionPara(text: string): boolean {
  if (!/^A[.)]/i.test(text.trim())) return false
  const markers = findOptionMarkers(text.trim(), 'A')
  return markers !== null && markers.length >= 2
}

// ============================================================
// PHẦN 1: TRẮC NGHIỆM NHIỀU LỰA CHỌN
// ============================================================
function parsePart1(paragraphs: ParagraphData[], startIdx: number, endIdx: number, images: ParsedImage[]): RawQuestion[] {
  if (startIdx < 0 || endIdx <= startIdx) return []
  const questions: RawQuestion[] = []
  let currentQ: RawQuestion | null = null
  let collectingContent = false
  let contentBuffer: string[] = []
  let inSolution = false
  let solutionBuffer: string[] = []
  let currentUnderlinedLetters: string[] = []
  let currentOptionIdx = -1
  let startedOptions = false

  const qCauPattern = /^C(?:âu|au)\s*(\d+)\s*[.:]\s*(.*)/i
  const optionPattern = /^\s*([A-D])\s*[.)]\s*(.*)/i
  const answerPattern = /Ch(?:ọn|on)\s*([A-D])/i
  const SECTION_RE = /PHẦN\s*\d|PHAN\s*\d|Trắc\s*nghiệm|Trac\s*nghiem/i
  const SOLUTION_RE = /^L(?:ời|oi)\s*gi(?:ải|ai)/i

  function attachImages(q: RawQuestion, rIds: string[]) {
    for (const rId of rIds) {
      const img = images.find((im) => im.rId === rId)
      if (img && !q.images.find((im) => im.id === img.id)) q.images.push(img)
    }
  }
  function attachSolutionImages(q: RawQuestion, rIds: string[]) {
    for (const rId of rIds) {
      const img = images.find((im) => im.rId === rId)
      if (img && !q.solutionImages.find((im) => im.id === img.id)) q.solutionImages.push(img)
    }
  }

  function flush() {
    if (!currentQ) return
    if (contentBuffer.length > 0 && !currentQ.text) currentQ.text = contentBuffer.join(' ').trim()
    if (solutionBuffer.length > 0) currentQ.solution = solutionBuffer.join('\n').trim()
    if (!currentQ.correctAnswer && currentUnderlinedLetters.length > 0) {
      const ans = currentUnderlinedLetters.find((l) => /^[A-D]$/i.test(l))
      if (ans) currentQ.correctAnswer = ans.toUpperCase()
    }
    if (currentQ.text) questions.push(currentQ)
  }

  for (let i = startIdx; i < endIdx; i++) {
    const para = paragraphs[i]
    const text = para.text
    if (!text && para.imageRIds.length === 0) continue
    if (SECTION_RE.test(text)) continue

    const cauM = text.match(qCauPattern)
    if (cauM) {
      flush()
      currentQ = {
        number: parseInt(cauM[1]), part: 1, type: 'multiple_choice',
        text: '', options: [], correctAnswer: null, solution: '', images: [], solutionImages: [],
      }
      collectingContent = true
      inSolution = false
      contentBuffer = cauM[2].trim() ? [cauM[2].trim()] : []
      solutionBuffer = []
      currentUnderlinedLetters = para.hasUnderline ? [...para.underlinedSegments] : []
      currentOptionIdx = -1
      startedOptions = false
      attachImages(currentQ, para.imageRIds)
      continue
    }
    if (!currentQ) continue
    const q = currentQ

    if (SOLUTION_RE.test(text)) {
      if (contentBuffer.length > 0 && !q.text) { q.text = contentBuffer.join(' ').trim(); contentBuffer = [] }
      collectingContent = false; inSolution = true; solutionBuffer = []
      if (para.imageRIds.length > 0) attachSolutionImages(q, para.imageRIds)
      continue
    }
    const chonM = text.match(answerPattern)
    if (chonM) { q.correctAnswer = chonM[1].toUpperCase(); continue }

    if (collectingContent && isSingleLineOptionPara(text)) {
      if (q.options.length === 0 && contentBuffer.length > 0) { q.text = contentBuffer.join(' ').trim(); contentBuffer = [] }
      const opts = parseSingleLineOptions(text)
      if (opts) {
        q.options = opts
        startedOptions = true; currentOptionIdx = opts.length - 1
        if (para.hasUnderline) for (const o of opts) if (o.text) currentUnderlinedLetters.push(o.letter)
        attachImages(q, para.imageRIds)
        continue
      }
    }

    const optM = text.match(optionPattern)
    if (optM && collectingContent) {
      if (q.options.length === 0 && contentBuffer.length > 0) { q.text = contentBuffer.join(' ').trim(); contentBuffer = [] }
      const letter = optM[1].toUpperCase()
      q.options.push({ letter, text: (optM[2] || '').trim() })
      currentOptionIdx = q.options.length - 1
      startedOptions = true
      if (para.hasUnderline) currentUnderlinedLetters.push(letter)
      continue
    }

    if (collectingContent && startedOptions && currentOptionIdx >= 0 && text && !inSolution) {
      if (!/^H(?:ình|inh)\s*\d+/i.test(text)) {
        q.options[currentOptionIdx].text = (q.options[currentOptionIdx].text + ' ' + text).trim()
        if (para.hasUnderline) currentUnderlinedLetters.push(q.options[currentOptionIdx].letter)
      }
      attachImages(q, para.imageRIds)
      continue
    }

    if (collectingContent && text && !inSolution && !startedOptions) {
      if (/^H(?:ình|inh)\s*\d+/i.test(text)) { attachImages(q, para.imageRIds); continue }
      contentBuffer.push(text)
      if (para.hasUnderline) currentUnderlinedLetters.push(...para.underlinedSegments)
    }
    if (inSolution && text && !/^H(?:ình|inh)\s*\d+/i.test(text)) solutionBuffer.push(text)
    if (para.imageRIds.length > 0) {
      if (inSolution) attachSolutionImages(q, para.imageRIds)
      else attachImages(q, para.imageRIds)
    }
  }
  flush()
  questions.sort((a, b) => a.number - b.number)
  return questions
}

// ============================================================
// PHẦN 2: ĐÚNG / SAI (4 Ý a, b, c, d)
// ============================================================
function parsePart2(paragraphs: ParagraphData[], startIdx: number, endIdx: number, images: ParsedImage[]): RawQuestion[] {
  if (startIdx < 0 || startIdx >= paragraphs.length) return []
  const questions: RawQuestion[] = []
  let currentQ: RawQuestion | null = null
  let collectingContent = false
  let contentBuffer: string[] = []
  let inSolution = false
  let solutionBuffer: string[] = []
  let currentStmtIdx = -1
  let startedStatements = false

  const qPattern = /^C(?:âu|au)\s*(\d+)\s*[.:]\s*(.*)/i
  const stmtPattern = /^\s*([a-d])\s*[).]\s*(.*)/i
  const SECTION_RE = /PHẦN\s*\d|PHAN\s*\d/i
  const SOLUTION_RE = /^L(?:ời|oi)\s*gi(?:ải|ai)/i

  function attachImages(q: RawQuestion, rIds: string[]) {
    for (const rId of rIds) {
      const img = images.find((im) => im.rId === rId)
      if (img && !q.images.find((im) => im.id === img.id)) q.images.push(img)
    }
  }

  function flush() {
    if (!currentQ) return
    if (contentBuffer.length > 0 && !currentQ.text) currentQ.text = contentBuffer.join(' ').trim()
    if (solutionBuffer.length > 0) currentQ.solution = solutionBuffer.join(' ').trim()
    if (currentQ.text) questions.push(currentQ)
  }

  for (let i = startIdx; i < endIdx; i++) {
    const para = paragraphs[i]
    const text = para.text
    if (!text && para.imageRIds.length === 0) continue
    if (SECTION_RE.test(text)) continue

    const qM = text.match(qPattern)
    if (qM) {
      flush()
      currentQ = {
        number: parseInt(qM[1]), part: 2, type: 'true_false',
        text: '', options: [], correctAnswer: null, solution: '', images: [], solutionImages: [],
      }
      collectingContent = true; inSolution = false
      contentBuffer = qM[2].trim() ? [qM[2].trim()] : []
      solutionBuffer = []
      currentStmtIdx = -1; startedStatements = false
      attachImages(currentQ, para.imageRIds)
      continue
    }
    if (!currentQ) continue
    const q = currentQ

    if (SOLUTION_RE.test(text)) {
      if (contentBuffer.length > 0 && !q.text) { q.text = contentBuffer.join(' ').trim(); contentBuffer = [] }
      collectingContent = false; inSolution = true; solutionBuffer = []
      continue
    }

    const stmtM = text.match(stmtPattern)
    if (stmtM && collectingContent) {
      if (q.options.length === 0 && contentBuffer.length > 0) { q.text = contentBuffer.join(' ').trim(); contentBuffer = [] }
      const letter = stmtM[1].toLowerCase()
      // Gắn đúng/sai NGAY tại ý này (thuộc đúng câu hiện tại) — không dùng
      // biến chung cho cả đề, tránh lẫn đáp án giữa các câu khác nhau.
      ;(q.options as any).push({ letter, text: (stmtM[2] || '').trim(), isCorrect: para.hasUnderline })
      currentStmtIdx = q.options.length - 1
      startedStatements = true
      continue
    }

    if (collectingContent && startedStatements && currentStmtIdx >= 0 && text && !inSolution) {
      if (!/^H(?:ình|inh)\s*\d+/i.test(text)) {
        const opt = q.options[currentStmtIdx] as any
        opt.text = (opt.text + ' ' + text).trim()
        if (para.hasUnderline) opt.isCorrect = true
      }
      attachImages(q, para.imageRIds)
      continue
    }

    if (collectingContent && text && !inSolution && !startedStatements) {
      if (!/^H(?:ình|inh)\s*\d+/i.test(text)) contentBuffer.push(text)
    }
    if (inSolution && text && !/^H(?:ình|inh)\s*\d+/i.test(text)) solutionBuffer.push(text)
    if (para.imageRIds.length > 0 && !inSolution) attachImages(q, para.imageRIds)
  }
  flush()
  questions.sort((a, b) => a.number - b.number)
  return questions
}

// ============================================================
// PHẦN 3: TRẢ LỜI NGẮN
// ============================================================
function parsePart3(paragraphs: ParagraphData[], startIdx: number, endIdx: number, images: ParsedImage[]): RawQuestion[] {
  if (startIdx < 0 || startIdx >= paragraphs.length) return []
  const questions: RawQuestion[] = []
  let currentQ: RawQuestion | null = null
  let collectingContent = false
  let contentBuffer: string[] = []
  let solutionBuffer: string[] = []

  const qPattern = /^C(?:âu|au)\s*(\d+)\s*[.:]\s*(.*)/i
  const ansPattern = /^[*\s]*(?:Đ|D)áp\s*(?:án|an)[:\s]*(.+)/i
  const SECTION_RE = /PHẦN\s*\d|PHAN\s*\d/i
  const SOLUTION_RE = /^L(?:ời|oi)\s*gi(?:ải|ai)/i

  function attachImages(q: RawQuestion, rIds: string[]) {
    for (const rId of rIds) {
      const img = images.find((im) => im.rId === rId)
      if (img && !q.images.find((im) => im.id === img.id)) q.images.push(img)
    }
  }

  function flush() {
    if (!currentQ) return
    if (contentBuffer.length > 0) currentQ.text = contentBuffer.join(' ').trim()
    if (solutionBuffer.length > 0) currentQ.solution = solutionBuffer.join(' ').trim()
    if (!currentQ.correctAnswer) currentQ.type = 'writing'
    if (currentQ.text) questions.push(currentQ)
  }

  for (let i = startIdx; i < endIdx; i++) {
    const para = paragraphs[i]
    const text = para.text
    if (!text && para.imageRIds.length === 0) continue
    if (SECTION_RE.test(text)) continue

    const qM = text.match(qPattern)
    if (qM) {
      flush()
      currentQ = {
        number: parseInt(qM[1]), part: 3, type: 'short_answer',
        text: '', options: [], correctAnswer: null, solution: '', images: [], solutionImages: [],
      }
      collectingContent = true
      contentBuffer = qM[2].trim() ? [qM[2].trim()] : []
      solutionBuffer = []
      attachImages(currentQ, para.imageRIds)
      continue
    }
    if (!currentQ) continue
    const q = currentQ

    if (SOLUTION_RE.test(text)) {
      if (contentBuffer.length > 0) { q.text = contentBuffer.join(' ').trim(); contentBuffer = [] }
      collectingContent = false; solutionBuffer = []
      continue
    }
    const ansM = text.match(ansPattern)
    if (ansM) { q.correctAnswer = ansM[1].trim(); continue }

    if (collectingContent && text) {
      if (/^H(?:ình|inh)\s*\d+/i.test(text)) { attachImages(q, para.imageRIds); continue }
      contentBuffer.push(text)
    }
    if (!collectingContent && text && !/^C(?:âu|au)\s*\d+/.test(text)) {
      if (!/^H(?:ình|inh)\s*\d+/i.test(text) && !ansPattern.test(text)) solutionBuffer.push(text)
    }
    if (para.imageRIds.length > 0) attachImages(q, para.imageRIds)
  }
  flush()
  questions.sort((a, b) => a.number - b.number)
  return questions
}

// ============================================================
// GHÉP ẢNH VÀO HTML (base64 inline, không bao giờ vỡ link)
// ============================================================
function imagesToHtml(images: ParsedImage[]): string {
  return images
    .map((img) => `<img src="data:${img.contentType};base64,${img.base64}" style="max-width:100%" />`)
    .join('')
}

/**
 * Phát hiện các dấu hiệu công thức/nội dung có khả năng bị lỗi sau khi tách
 * từ Word, để đánh dấu "cần rà lại" thay vì để lọt ra cho học sinh thấy:
 *  - Số lượng \left và \right không khớp nhau (dấu ngoặc lớn không đủ cặp) —
 *    thường do máy chủ chuyển đổi MathType tạo LaTeX chưa hoàn chỉnh.
 *  - Dấu nháy/ngoặc kép nằm sát ngay cạnh dấu $ — dấu hiệu công thức bị lẫn
 *    ký tự trích dẫn từ câu văn xung quanh trong lúc ghép nội dung.
 */
function detectMathIssues(html: string): boolean {
  if (!html) return false
  const leftCount = (html.match(/\\left/g) || []).length
  const rightCount = (html.match(/\\right/g) || []).length
  if (leftCount !== rightCount) return true
  if (/["'”“‘’]\s*\$|\$\s*["'”“‘’]/.test(html)) return true
  return false
}

function rawToDraft(q: RawQuestion, index: number): DraftQuestionData {
  const contentHtml = escapeHtmlPreserveLaTeX(q.text) + imagesToHtml(q.images)
  const explanationHtml = escapeHtmlPreserveLaTeX(q.solution) + imagesToHtml(q.solutionImages)

  if (q.type === 'multiple_choice') {
    const options: MCQOption[] = ['A', 'B', 'C', 'D'].map((letter) => {
      const found = q.options.find((o) => o.letter === letter)
      return { key: letter, html: escapeHtmlPreserveLaTeX(found?.text || '') }
    })
    const hasMathIssue =
      detectMathIssues(contentHtml) || detectMathIssues(explanationHtml) || options.some((o) => detectMathIssues(o.html))
    return {
      key: `q_${index}`, order_index: index + 1, part: 'mcq',
      content_html: contentHtml, options,
      correct_answer: q.correctAnswer || 'A',
      explanation_html: explanationHtml, points: 0.25,
      needsReview: !q.correctAnswer || hasMathIssue,
    }
  }

  if (q.type === 'true_false') {
    const options: TrueFalseOption[] = ['a', 'b', 'c', 'd'].map((letter) => {
      const found = q.options.find((o) => o.letter === letter) as (RawOption & { isCorrect?: boolean }) | undefined
      return { key: letter, html: escapeHtmlPreserveLaTeX(found?.text || ''), correct: !!found?.isCorrect }
    })
    const hasMathIssue =
      detectMathIssues(contentHtml) || detectMathIssues(explanationHtml) || options.some((o) => detectMathIssues(o.html))
    return {
      key: `q_${index}`, order_index: index + 1, part: 'true_false',
      content_html: contentHtml, options,
      correct_answer: '',
      explanation_html: explanationHtml, points: 1,
      needsReview: !options.some((o) => o.correct) || hasMathIssue,
    }
  }

  // short_answer / writing -> gộp chung short_answer, giáo viên rà lại nếu writing (tự luận)
  const hasMathIssue = detectMathIssues(contentHtml) || detectMathIssues(explanationHtml)
  return {
    key: `q_${index}`, order_index: index + 1, part: 'short_answer',
    content_html: contentHtml, options: [],
    correct_answer: q.correctAnswer || '',
    explanation_html: explanationHtml, points: 0.5,
    needsReview: !q.correctAnswer || hasMathIssue,
  }
}

// ============================================================
// HÀM CHÍNH — GỌI TỪ GIAO DIỆN SOẠN ĐỀ
// ============================================================
export interface ParseWordResult {
  questions: DraftQuestionData[]
  mathTypeDetected: boolean
  mathTypeServerConfigured: boolean
  mathTypeConvertedCount: number
}

export async function parseWordExam(file: File): Promise<ParseWordResult> {
  const arrayBuffer = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(arrayBuffer)

  const { images } = await extractImages(zip)
  const oleItems = await extractOleItems(zip)
  const mathTypeDetected = oleItems.length > 0
  const mathTypeServerConfigured = !!MATHTYPE_SERVER_URL

  let oleLatexMap = new Map<string, string>()
  if (mathTypeDetected && mathTypeServerConfigured) {
    oleLatexMap = await convertOleToLatex(oleItems, MATHTYPE_SERVER_URL)
  }

  const documentXml = await zip.file('word/document.xml')?.async('string')
  if (!documentXml) throw new Error('Không tìm thấy document.xml — file Word có thể bị hỏng.')

  const paragraphs = extractParagraphsRaw(documentXml, oleLatexMap)
  const sectionInfo = detectSections(paragraphs)

  const part1 = parsePart1(paragraphs, sectionInfo.part1Start, sectionInfo.part2Start, images)
  const part2 = parsePart2(paragraphs, sectionInfo.part2Start, sectionInfo.part3Start, images)
  const part3 = parsePart3(paragraphs, sectionInfo.part3Start, paragraphs.length, images)

  const all = [...part1, ...part2, ...part3]
  const questions = all.map((q, i) => rawToDraft(q, i))

  return {
    questions,
    mathTypeDetected,
    mathTypeServerConfigured,
    mathTypeConvertedCount: oleLatexMap.size,
  }
}
