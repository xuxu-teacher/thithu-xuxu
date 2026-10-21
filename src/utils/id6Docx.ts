import JSZip from 'jszip'
import { PartNo } from './questionSplitter'

/** Mẫu Word (header/footer, khổ giấy, lề) dựng từ file mẫu của nhóm, đặt trong public/templates */
const TEMPLATE_URL = '/templates/mau-gan-id6.docx'

export interface DocxRow {
  part: PartNo
  num: number
  id6: string
}

export const PART_HEADINGS: Record<PartNo, string> = {
  1: 'I. CÂU TRẮC NGHIỆM NHIỀU LỰA CHỌN',
  2: 'II. CÂU TRẮC NGHIỆM ĐÚNG SAI',
  3: 'III. CÂU TRẮC NGHIỆM TRẢ LỜI NGẮN',
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function rPr(color: string): string {
  return (
    '<w:rPr><w:rFonts w:ascii="Times New Roman" w:eastAsia="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>' +
    `<w:b/><w:noProof w:val="0"/><w:color w:val="${color}"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>`
  )
}

const P_PR =
  '<w:pPr><w:tabs><w:tab w:val="left" w:pos="992"/></w:tabs><w:spacing w:before="120" w:line="276" w:lineRule="auto"/>' +
  '<w:ind w:left="992" w:hanging="992"/></w:pPr>'

function headingPara(text: string): string {
  return `<w:p>${P_PR}<w:r>${rPr('FF0000')}<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`
}

function questionPara(num: number, id6: string): string {
  return (
    `<w:p>${P_PR}` +
    `<w:r>${rPr('0000FF')}<w:t>Câu ${num}.</w:t></w:r>` +
    `<w:r>${rPr('0000FF')}<w:tab/></w:r>` +
    `<w:r>${rPr('FF0000')}<w:t>[${esc(id6)}]</w:t></w:r>` +
    `</w:p>`
  )
}

export function buildBodyXml(rows: DocxRow[]): string {
  let xml = ''
  for (const p of [1, 2, 3] as PartNo[]) {
    const qs = rows.filter((r) => r.part === p).sort((a, b) => a.num - b.num)
    if (qs.length === 0) continue
    xml += headingPara(PART_HEADINGS[p])
    for (const q of qs) xml += questionPara(q.num, q.id6)
  }
  return xml
}

/** "de-thi-abc.pdf" → "de-thi-abc.docx" */
export function docxFileName(pdfName: string): string {
  const base = pdfName.replace(/\.pdf$/i, '').trim() || 'gan-id'
  return `${base}.docx`
}

export async function buildId6Docx(rows: DocxRow[], schoolYear: string, templateData?: ArrayBuffer): Promise<Blob> {
  let data = templateData
  if (!data) {
    const res = await fetch(TEMPLATE_URL)
    if (!res.ok) throw new Error('Không tải được file mẫu Word (templates/mau-gan-id6.docx).')
    data = await res.arrayBuffer()
  }
  const zip = await JSZip.loadAsync(data)

  const docPath = 'word/document.xml'
  const doc = await zip.file(docPath)!.async('string')
  const placeholder = '<w:p><w:r><w:t>@@BODY@@</w:t></w:r></w:p>'
  if (!doc.includes(placeholder)) throw new Error('File mẫu Word không đúng định dạng.')
  zip.file(docPath, doc.replace(placeholder, buildBodyXml(rows)))

  for (const h of ['word/header1.xml', 'word/header2.xml']) {
    const f = zip.file(h)
    if (!f) continue
    const xml = await f.async('string')
    zip.file(h, xml.split('@@NAMHOC@@').join(esc(schoolYear)))
  }

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
  })
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function currentSchoolYear(d = new Date()): string {
  const y = d.getFullYear()
  return d.getMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`
}
