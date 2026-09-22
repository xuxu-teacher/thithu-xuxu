import { ChangeEvent, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { parseGenericWordParagraphs } from '../utils/docxParser'
import { standardizeIntoBlocks, QuestionBlock, isOptionLine } from '../utils/normalizeWord'
import MathRenderer from '../components/MathRenderer'

type ColorScheme = 'black-on-white' | 'white-on-green'

export default function TeacherWordStandardize() {
  const [blocks, setBlocks] = useState<QuestionBlock[] | null>(null)
  const [blankLines, setBlankLines] = useState(3)
  const [colorScheme, setColorScheme] = useState<ColorScheme>('black-on-white')
  const [processing, setProcessing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const printRef = useRef<HTMLDivElement>(null)

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setProcessing(true)
    setError(null)
    setBlocks(null)
    try {
      const paragraphs = await parseGenericWordParagraphs(file)
      const result = standardizeIntoBlocks(paragraphs)
      setBlocks(result)
      setFileName(file.name.replace(/\.docx$/i, ''))
    } catch (err: any) {
      setError(err.message || 'Có lỗi khi đọc file Word.')
    } finally {
      setProcessing(false)
    }
  }

  function updateBlockText(id: string, raw: string) {
    setBlocks((prev) =>
      (prev || []).map((b) =>
        b.id === id ? { ...b, lines: raw.split('\n').map((l) => l.trim()).filter((l) => l.length > 0) } : b,
      ),
    )
  }

  function removeBlock(id: string) {
    setBlocks((prev) => (prev || []).filter((b) => b.id !== id))
  }

  // Xuất PDF trực tiếp bằng html2canvas + jsPDF — chụp đúng màu nền/chữ
  // đang hiển thị (không qua hộp thoại in của trình duyệt, nên không bị
  // trình duyệt tự xóa màu nền, không có tiêu đề/ngày giờ trình duyệt tự
  // chèn vào, không cần bấm thêm bước nào khác — bấm là tải file về luôn.
  async function handleDownloadPdf() {
    if (!printRef.current) return
    setExporting(true)
    try {
      const node = printRef.current
      const canvas = await html2canvas(node, {
        scale: 2,
        useCORS: true,
        backgroundColor: colorScheme === 'white-on-green' ? '#1f5c3f' : '#ffffff',
      })

      const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
      const pageWidthMm = pdf.internal.pageSize.getWidth()
      const pageHeightMm = pdf.internal.pageSize.getHeight()

      const pxPerMm = canvas.width / pageWidthMm
      const pageHeightPx = Math.floor(pageHeightMm * pxPerMm)

      let renderedPx = 0
      let pageIndex = 0
      while (renderedPx < canvas.height) {
        const sliceHeightPx = Math.min(pageHeightPx, canvas.height - renderedPx)

        const sliceCanvas = document.createElement('canvas')
        sliceCanvas.width = canvas.width
        sliceCanvas.height = sliceHeightPx
        const ctx = sliceCanvas.getContext('2d')!
        ctx.drawImage(canvas, 0, renderedPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx)

        const imgData = sliceCanvas.toDataURL('image/jpeg', 0.95)
        if (pageIndex > 0) pdf.addPage()
        pdf.addImage(imgData, 'JPEG', 0, 0, pageWidthMm, (sliceHeightPx / pxPerMm))

        renderedPx += sliceHeightPx
        pageIndex++
      }

      pdf.save(`${fileName || 'de-chuan-hoa'}.pdf`)
    } catch (err: any) {
      alert('Có lỗi khi xuất PDF: ' + (err.message || err))
    } finally {
      setExporting(false)
    }
  }

  const isDark = colorScheme === 'white-on-green'
  const pageBg = isDark ? '#1f5c3f' : '#ffffff'
  const textColor = isDark ? '#ffffff' : '#111111'

  return (
    <div className="container">
      <Link to="/teacher/dashboard" className="btn secondary" style={{ marginBottom: 16, display: 'inline-flex' }}>
        ← Trang chủ giáo viên
      </Link>

      <div className="card">
        <h2>📄 Chuẩn hóa Word</h2>
        <p style={{ fontSize: 13 }}>
          Tải lên bất kỳ file Word nào chứa các câu hỏi được đánh số "Câu 1", "Câu 2"... — hệ thống tự động{' '}
          <b>xóa toàn bộ lời giải</b>, <b>tự tách các phương án A/B/C/D</b> nếu bị dính chung dòng với câu
          hỏi, giữ nguyên câu hỏi và số liệu, chèn khoảng trắng giữa các câu để học sinh tự làm, rồi tải về
          PDF trực tiếp.
        </p>

        <label>Chọn file Word (.docx)</label>
        <input type="file" accept=".docx" onChange={handleFile} disabled={processing} />
        {processing && <p>Đang xử lý file...</p>}
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

        {blocks && (
          <>
            <label>Số dòng trống chèn giữa mỗi câu</label>
            <input
              type="number"
              min={0}
              max={50}
              value={blankLines}
              onChange={(e) => setBlankLines(Math.max(0, Math.min(50, Number(e.target.value))))}
              style={{ maxWidth: 120 }}
            />

            <label>Màu văn bản</label>
            <select value={colorScheme} onChange={(e) => setColorScheme(e.target.value as ColorScheme)}>
              <option value="black-on-white">Nền trắng — chữ đen</option>
              <option value="white-on-green">Nền xanh (bảng viết) — chữ trắng</option>
            </select>

            <button className="btn" onClick={handleDownloadPdf} disabled={exporting} style={{ marginTop: 12 }}>
              {exporting ? '⏳ Đang tạo PDF...' : '⬇ Tải về PDF'}
            </button>
          </>
        )}
      </div>

      {blocks && (
        <div className="card">
          <h3>Rà lại từng câu trước khi tải (sửa lỗi tách sai, xóa câu thừa)</h3>
          {blocks.map((b) => (
            <div className="question-block" key={b.id}>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" className="btn danger" style={{ padding: '4px 10px' }} onClick={() => removeBlock(b.id)}>
                  Xóa
                </button>
              </div>
              <textarea
                rows={Math.min(8, Math.max(2, b.lines.length))}
                value={b.lines.join('\n')}
                onChange={(e) => updateBlockText(b.id, e.target.value)}
              />
              <div className="card" style={{ background: '#fafbfe' }}>
                <b style={{ fontSize: 11, color: 'var(--muted)' }}>Xem trước:</b>
                {renderBlockPreview(b, '#111111')}
              </div>
            </div>
          ))}
        </div>
      )}

      {blocks && (
        <div style={{ position: 'absolute', left: -9999, top: 0 }}>
          {/* Vùng dựng nội dung để chụp xuất PDF — luôn tồn tại trong DOM, chỉ đẩy ra ngoài màn hình
              (không dùng display:none / height:0 để html2canvas vẫn đọc đúng kích thước/màu sắc thật). */}
          <div
            ref={printRef}
            style={{ width: '794px', background: pageBg, color: textColor, padding: 40, fontFamily: '"Times New Roman", Times, serif', fontSize: 15 }}
          >
            {fileName && <h2 style={{ color: textColor, textAlign: 'center' }}>{fileName}</h2>}
            {blocks.map((b) => (
              <div key={b.id}>
                {renderBlockPreview(b, textColor)}
                {isQuestionStart(b) &&
                  Array.from({ length: blankLines }).map((_, k) => (
                    <p key={`blank-${k}`} style={{ margin: 0, minHeight: 22 }}>
                      &nbsp;
                    </p>
                  ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function isQuestionStart(b: QuestionBlock): boolean {
  return /^\s*(Câu|CÂU|Bài|BÀI)\s*\d+/i.test(b.lines[0] || '')
}

/**
 * Hiển thị các dòng của 1 câu — dòng nào là phương án (A/B/C/D) được gom
 * theo cặp và căn đều trong lưới 2 cột (A-B 1 hàng, C-D 1 hàng) cho thẳng
 * hàng, giống cách trình bày đề thi chuẩn; các dòng khác hiển thị bình
 * thường theo đúng thứ tự.
 */
function renderBlockPreview(b: QuestionBlock, color: string) {
  const elements: JSX.Element[] = []
  let optionBuffer: string[] = []
  let key = 0

  const flushOptions = () => {
    if (optionBuffer.length === 0) return
    elements.push(
      <div key={`opt-${key++}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 16px', margin: '4px 0' }}>
        {optionBuffer.map((line, i) => (
          <div key={i} style={{ color }}>
            <MathRenderer html={line} />
          </div>
        ))}
      </div>,
    )
    optionBuffer = []
  }

  for (const line of b.lines) {
    if (isOptionLine(line)) {
      optionBuffer.push(line)
    } else {
      flushOptions()
      elements.push(
        <p key={`ln-${key++}`} style={{ color, margin: '4px 0' }}>
          <MathRenderer html={line} />
        </p>,
      )
    }
  }
  flushOptions()
  return elements
}
