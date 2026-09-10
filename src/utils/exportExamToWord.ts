import JSZip from 'jszip'
import { mml2omml } from 'mathml2omml'
import { Question, MCQOption, TrueFalseOption } from '../types'

// ============================================================
// XUẤT ĐỀ THI RA FILE WORD (.docx) VỚI CÔNG THỨC LÀ PHƯƠNG TRÌNH WORD
// THẬT (OMML) — không phải ảnh chụp công thức.
// ============================================================
// Cách làm: MathJax (đã nạp sẵn cho cả app, xem index.html) có thể
// chuyển LaTeX -> MathML ngay trên trình duyệt (API tex2mmlPromise, có
// sẵn trong bundle tex-mml-chtml đang dùng). Từ MathML, dùng thư viện
// `mathml2omml` (JS thuần, không cần XSLT/thư viện ngoài) chuyển tiếp
// sang OMML — đúng định dạng phương trình gốc của Word, giống hệt khi
// giáo viên tự gõ công thức bằng Insert > Equation trong Word: mở ra vẫn
// bấm sửa được bình thường, không phải ảnh tĩnh.
//
// File .docx được dựng tay bằng JSZip (không qua thư viện `docx` ngoài)
// để có toàn quyền chèn thẳng XML OMML vào đúng vị trí.
// ============================================================

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

type Segment =
  | { type: 'text'; text: string }
  | { type: 'math'; latex: string; display: boolean }
  | { type: 'image'; dataUrl: string }

/** Tách content_html thành chuỗi các đoạn: chữ thường / công thức LaTeX / ảnh, theo đúng thứ tự xuất hiện. */
function splitSegments(html: string): Segment[] {
  const segments: Segment[] = []
  // Bắt theo thứ tự ưu tiên: ảnh > công thức khối $$..$$ > công thức dòng $..$
  const re = /<img[^>]*\ssrc=["']([^"']+)["'][^>]*>|\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g
  let lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    if (m.index > lastIndex) {
      pushText(segments, html.slice(lastIndex, m.index))
    }
    if (m[1] !== undefined) {
      segments.push({ type: 'image', dataUrl: m[1] })
    } else if (m[2] !== undefined) {
      segments.push({ type: 'math', latex: m[2].trim(), display: true })
    } else if (m[3] !== undefined) {
      segments.push({ type: 'math', latex: m[3].trim(), display: false })
    }
    lastIndex = re.lastIndex
  }
  if (lastIndex < html.length) pushText(segments, html.slice(lastIndex))
  return segments
}

function pushText(segments: Segment[], rawHtml: string) {
  // Bỏ toàn bộ thẻ HTML còn lại (bold/underline/span...) để lấy chữ thô —
  // export tập trung vào công thức đúng, chưa giữ định dạng chữ đậm/nghiêng.
  const text = rawHtml
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
  if (text) segments.push({ type: 'text', text })
}

async function latexToOmmlXml(latex: string, display: boolean): Promise<string> {
  try {
    const mathjax = (window as any).MathJax
    const mathml: string = await mathjax.tex2mmlPromise(latex, { display })
    const omml = mml2omml(mathml)
    // mml2omml trả về "<m:oMath xmlns:m=...>...</m:oMath>" — với công thức
    // hiển thị riêng dòng (display) bọc thêm oMathPara để Word căn giữa
    // đúng như một phương trình độc lập, giống $$...$$ trên web.
    if (display) {
      const inner = omml.replace(/^<m:oMath\b[^>]*>/, '<m:oMath>').replace(/<\/m:oMath>$/, '</m:oMath>')
      return `<m:oMathPara>${inner}</m:oMathPara>`
    }
    return omml
  } catch {
    // Không chuyển được (cú pháp LaTeX lạ) -> chèn lại nguyên văn LaTeX dạng
    // chữ nghiêng, để không mất nội dung, giáo viên tự sửa tay trong Word.
    const wrapped = display ? `$$${latex}$$` : `$${latex}$`
    return `<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">${escapeXml(wrapped)}</w:t></w:r>`
  }
}

function textRunXml(text: string): string {
  return text
    .split('\n')
    .map((line) => `<w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>`)
    .join('<w:br/>')
}

interface MediaCtx {
  files: { name: string; base64: string; ext: string }[]
  relationships: { id: string; target: string }[]
  nextId: number
}

function guessImageExt(dataUrl: string): string {
  const m = /^data:image\/(png|jpe?g|gif|bmp);base64,/i.exec(dataUrl)
  return (m?.[1] || 'png').replace('jpg', 'jpeg')
}

async function imageDrawingXml(dataUrl: string, ctx: MediaCtx): Promise<string> {
  const ext = guessImageExt(dataUrl)
  const base64 = dataUrl.split(',')[1] || ''
  const relId = `rIdImg${ctx.nextId++}`
  const fileName = `image${ctx.files.length + 1}.${ext === 'jpeg' ? 'jpeg' : ext}`
  ctx.files.push({ name: fileName, base64, ext })
  ctx.relationships.push({ id: relId, target: `media/${fileName}` })

  // Đo kích thước ảnh thật để giữ đúng tỉ lệ, giới hạn chiều rộng tối đa
  // ~15cm (khổ giấy A4 trừ lề) — quy đổi px -> EMU (1px @96dpi = 9525 EMU).
  const dims = await getImageSize(dataUrl)
  const maxWidthEmu = 15 * 360000 // 15cm quy ra EMU (1cm = 360000 EMU)
  let widthEmu = dims.width * 9525
  let heightEmu = dims.height * 9525
  if (widthEmu > maxWidthEmu) {
    const scale = maxWidthEmu / widthEmu
    widthEmu = maxWidthEmu
    heightEmu = Math.round(heightEmu * scale)
  }

  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">
    <wp:extent cx="${widthEmu}" cy="${heightEmu}"/>
    <wp:docPr id="${ctx.nextId}" name="Picture ${ctx.nextId}"/>
    <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
      <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
        <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
          <pic:nvPicPr>
            <pic:cNvPr id="${ctx.nextId}" name="Picture ${ctx.nextId}"/>
            <pic:cNvPicPr/>
          </pic:nvPicPr>
          <pic:blipFill>
            <a:blip r:embed="${relId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
            <a:stretch><a:fillRect/></a:stretch>
          </pic:blipFill>
          <pic:spPr>
            <a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm>
            <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
          </pic:spPr>
        </pic:pic>
      </a:graphicData>
    </a:graphic>
  </wp:inline></w:drawing></w:r>`
}

function getImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth || 400, height: img.naturalHeight || 300 })
    img.onerror = () => resolve({ width: 400, height: 300 })
    img.src = dataUrl
  })
}

/** Dựng nội dung XML (các <w:r>/<m:oMathPara>) của 1 đoạn HTML — tái dùng cho câu hỏi, đáp án, lời giải. */
async function segmentsToXml(html: string, ctx: MediaCtx): Promise<string> {
  const segments = splitSegments(html)
  const parts: string[] = []
  for (const seg of segments) {
    if (seg.type === 'text') parts.push(textRunXml(seg.text))
    else if (seg.type === 'math') parts.push(await latexToOmmlXml(seg.latex, seg.display))
    else parts.push(await imageDrawingXml(seg.dataUrl, ctx))
  }
  return parts.join('')
}

function heading(text: string): string {
  return `<w:p><w:pPr><w:spacing w:before="200" w:after="100"/><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="26"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`
}

async function questionToXml(q: Question, index: number, ctx: MediaCtx): Promise<string> {
  const paras: string[] = []
  paras.push(
    `<w:p><w:pPr><w:spacing w:before="160"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Câu ${index}. </w:t></w:r>${await segmentsToXml(q.content_html, ctx)}</w:p>`,
  )

  if (q.part === 'mcq') {
    for (const opt of q.options as MCQOption[]) {
      paras.push(`<w:p><w:pPr><w:ind w:left="360"/></w:pPr><w:r><w:t xml:space="preserve">${opt.key}. </w:t></w:r>${await segmentsToXml(opt.html, ctx)}</w:p>`)
    }
  } else if (q.part === 'true_false') {
    for (const opt of q.options as TrueFalseOption[]) {
      paras.push(`<w:p><w:pPr><w:ind w:left="360"/></w:pPr><w:r><w:t xml:space="preserve">${opt.key}) </w:t></w:r>${await segmentsToXml(opt.html, ctx)}</w:p>`)
    }
  } else {
    paras.push(`<w:p><w:pPr><w:ind w:left="360"/></w:pPr><w:r><w:i/><w:t xml:space="preserve">(Trả lời: .............................)</w:t></w:r></w:p>`)
  }

  return paras.join('')
}

const PART_LABEL: Record<Question['part'], string> = {
  mcq: 'PHẦN I — TRẮC NGHIỆM',
  true_false: 'PHẦN II — ĐÚNG / SAI',
  short_answer: 'PHẦN III — TRẢ LỜI NGẮN',
}

/** Xuất đề thi (không kèm đáp án — bản đề sạch để phát cho học sinh) + 1 trang đáp án riêng ở cuối. */
export async function exportExamToWord(title: string, questions: Question[]): Promise<Blob> {
  const ctx: MediaCtx = { files: [], relationships: [], nextId: 1 }

  const bodyParts: string[] = []
  bodyParts.push(
    `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="300"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t xml:space="preserve">${escapeXml(title)}</w:t></w:r></w:p>`,
  )

  let counter = 0
  for (const part of ['mcq', 'true_false', 'short_answer'] as const) {
    const group = questions.filter((q) => q.part === part)
    if (group.length === 0) continue
    bodyParts.push(heading(PART_LABEL[part]))
    for (const q of group) {
      counter++
      bodyParts.push(await questionToXml(q, counter, ctx))
    }
  }

  // Trang đáp án — sang trang mới, liệt kê ngắn gọn để giáo viên chấm tay/đối chiếu.
  bodyParts.push('<w:p><w:pPr><w:pageBreakBefore/></w:pPr></w:p>')
  bodyParts.push(heading('ĐÁP ÁN'))
  counter = 0
  for (const part of ['mcq', 'true_false', 'short_answer'] as const) {
    const group = questions.filter((q) => q.part === part)
    for (const q of group) {
      counter++
      const ans =
        q.part === 'mcq'
          ? q.correct_answer || '?'
          : q.part === 'short_answer'
          ? q.correct_answer || '?'
          : (q.options as TrueFalseOption[]).map((o) => `${o.key}) ${o.correct ? 'Đ' : 'S'}`).join('  ')
      bodyParts.push(
        `<w:p><w:r><w:t xml:space="preserve">Câu ${counter}: ${escapeXml(ans)}</w:t></w:r></w:p>`,
      )
    }
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${bodyParts.join('\n')}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/>
    </w:sectPr>
  </w:body>
</w:document>`

  return buildDocxZip(documentXml, ctx)
}

async function buildDocxZip(documentXml: string, ctx: MediaCtx): Promise<Blob> {
  const zip = new JSZip()

  const imageDefaults = Array.from(new Set(ctx.files.map((f) => f.ext)))
    .map((ext) => `<Default Extension="${ext}" ContentType="image/${ext}"/>`)
    .join('')

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${imageDefaults}
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  )

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  )

  const rels = ctx.relationships
    .map(
      (r) =>
        `<Relationship Id="${r.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${r.target}"/>`,
    )
    .join('')
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`,
  )

  zip.file('word/document.xml', documentXml)

  for (const f of ctx.files) {
    zip.file(`word/media/${f.name}`, f.base64, { base64: true })
  }

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
