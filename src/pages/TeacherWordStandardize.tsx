import { ChangeEvent, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { parseGenericWordParagraphs } from '../utils/docxParser'
import { parseIntoBlocks, QuestionBlock, isOptionLine } from '../utils/normalizeWord'
import {
  loadRawDocx,
  repackDocxWithParagraphs,
  applyUnderlineToParagraphs,
  spliceAttachSolutions,
  downloadBlob,
} from '../utils/docxSplice'
import { autoDetectCorrectRawParagraphs } from '../utils/detectCorrectAnswers'
import MathRenderer from '../components/MathRenderer'

type ColorScheme = 'black-on-white' | 'white-on-green'

export default function TeacherWordStandardize() {
  const [file, setFile] = useState<File | null>(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="container">
      <Link to="/teacher/dashboard" className="btn secondary" style={{ marginBottom: 16, display: 'inline-flex' }}>
        ← Trang chủ giáo viên
      </Link>

      <div className="card">
        <h2>📄 Hỗ trợ Word</h2>
        <p style={{ fontSize: 13 }}>
          Tải lên 1 file Word có các câu đánh số "Câu 1", "Câu 2"... — dùng chung cho cả 3 công cụ độc lập
          bên dưới, chọn công cụ nào tùy nhu cầu.
        </p>
        <label>Chọn file Word (.docx)</label>
        <input
          type="file"
          accept=".docx"
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            setFile(f)
            setFileName(f.name.replace(/\.docx$/i, ''))
            setError(null)
          }}
        />
        {file && <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>Đã chọn: {file.name}</p>}
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      </div>

      {file && (
        <>
          <PdfBlankTool file={file} fileName={fileName} onError={setError} />
          <UnderlineWordTool file={file} fileName={fileName} onError={setError} />
          <AttachSolutionWordTool file={file} fileName={fileName} onError={setError} />
        </>
      )}
    </div>
  )
}

// ============================================================
// KHỐI 1 — Tạo file PDF có khoảng trống — tải PDF
// ============================================================
function PdfBlankTool({ file, fileName, onError }: { file: File; fileName: string; onError: (e: string | null) => void }) {
  const [blocks, setBlocks] = useState<QuestionBlock[] | null>(null)
  const [blankLines, setBlankLines] = useState(3)
  const [colorScheme, setColorScheme] = useState<ColorScheme>('black-on-white')
  const [processing, setProcessing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  async function handleProcess() {
    setProcessing(true)
    onError(null)
    try {
      const paragraphs = await parseGenericWordParagraphs(file)
      setBlocks(parseIntoBlocks(paragraphs))
    } catch (err: any) {
      onError(err.message || 'Có lỗi khi đọc file Word.')
    } finally {
      setProcessing(false)
    }
  }

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
        pdf.addImage(imgData, 'JPEG', 0, 0, pageWidthMm, sliceHeightPx / pxPerMm)
        renderedPx += sliceHeightPx
        pageIndex++
      }
      pdf.save(`${fileName || 'de'}-khoang-trong.pdf`)
    } catch (err: any) {
      onError('Có lỗi khi xuất PDF: ' + (err.message || err))
    } finally {
      setExporting(false)
    }
  }

  const isDark = colorScheme === 'white-on-green'
  const pageBg = isDark ? '#1f5c3f' : '#ffffff'
  const textColor = isDark ? '#ffffff' : '#111111'

  return (
    <div className="card" style={{ border: '1px solid #c7d2fe' }}>
      <h3>📄 Tạo file PDF có khoảng trống — tải PDF</h3>
      <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>
        Xóa lời giải, chèn khoảng trắng giữa mỗi câu để học sinh tự làm bài, xuất ra file PDF.
      </p>
      {!blocks ? (
        <button className="btn secondary" onClick={handleProcess} disabled={processing}>
          {processing ? 'Đang xử lý...' : 'Xử lý file'}
        </button>
      ) : (
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
            {exporting ? '⏳ Đang tạo PDF...' : '⬇ Tải PDF'}
          </button>

          <div style={{ position: 'absolute', left: -9999, top: 0 }}>
            <div ref={printRef} style={{ width: '794px', background: pageBg, color: textColor, padding: 40, fontFamily: '"Times New Roman", Times, serif', fontSize: 15 }}>
              {fileName && <h2 style={{ color: textColor, textAlign: 'center' }}>{fileName}</h2>}
              {blocks.map((b) => (
                <div key={b.id}>
                  {renderQuestionOnly(b, textColor)}
                  {b.number !== null &&
                    Array.from({ length: blankLines }).map((_, k) => (
                      <p key={`blank-${k}`} style={{ margin: 0, minHeight: 22 }}>
                        &nbsp;
                      </p>
                    ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ============================================================
// KHỐI 2 — Gạch chân đáp án theo file mẫu — tải về file Word
// ============================================================
function UnderlineWordTool({ file, fileName, onError }: { file: File; fileName: string; onError: (e: string | null) => void }) {
  const [working, setWorking] = useState(false)
  const [doneNote, setDoneNote] = useState<string | null>(null)

  async function handleRun() {
    setWorking(true)
    onError(null)
    setDoneNote(null)
    try {
      const raw = await loadRawDocx(file)
      const targets = await autoDetectCorrectRawParagraphs(raw.paragraphs)
      if (targets.length === 0) {
        setDoneNote('⚠ Không tìm được lời giải rõ ràng cho câu nào trong file để xác định đáp án — chưa gạch chân được câu nào.')
        return
      }
      const newParagraphs = applyUnderlineToParagraphs(raw.paragraphs, targets)
      const blob = await repackDocxWithParagraphs(raw.zip, raw.documentXml, newParagraphs.map((p) => p.xml))
      downloadBlob(blob, `${fileName || 'de'}-gach-chan-dap-an.docx`)
      setDoneNote(`✅ Đã gạch chân ${targets.length} đáp án và tải file Word về.`)
    } catch (err: any) {
      onError(err.message || 'Có lỗi khi xử lý.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="card" style={{ border: '1px solid #c7d2fe' }}>
      <h3>🖊 Gạch chân đáp án theo file mẫu — tải về file Word</h3>
      <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>
        AI đọc lời giải từng câu để tự xác định và gạch chân đáp án đúng NGAY TRONG file Word gốc — giữ
        nguyên toàn bộ định dạng, font chữ, công thức, ảnh của đề, chỉ thêm gạch chân vào đúng phương án.
      </p>
      <button className="btn" onClick={handleRun} disabled={working}>
        {working ? '⏳ Đang xử lý...' : '🖊 Gạch chân & Tải Word'}
      </button>
      {doneNote && <p style={{ fontSize: 12.5, marginTop: 8 }}>{doneNote}</p>}
    </div>
  )
}

// ============================================================
// KHỐI 3 — Ghép đề với lời giải — tải về file Word
// ============================================================
function AttachSolutionWordTool({ file, fileName, onError }: { file: File; fileName: string; onError: (e: string | null) => void }) {
  const [working, setWorking] = useState(false)
  const [doneNote, setDoneNote] = useState<string | null>(null)

  async function handleRun() {
    setWorking(true)
    onError(null)
    setDoneNote(null)
    try {
      const raw = await loadRawDocx(file)
      const merged = spliceAttachSolutions(raw.paragraphs)
      const blob = await repackDocxWithParagraphs(raw.zip, raw.documentXml, merged.map((p) => p.xml))
      downloadBlob(blob, `${fileName || 'de'}-co-loi-giai.docx`)
      setDoneNote('✅ Đã ghép lời giải vào đúng câu và tải file Word về.')
    } catch (err: any) {
      onError(err.message || 'Có lỗi khi xử lý.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="card" style={{ border: '1px solid #c7d2fe' }}>
      <h3>📎 Ghép đề với lời giải — tải về file Word</h3>
      <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>
        Giữ nguyên toàn bộ đề gốc, chỉ di chuyển lời giải (kể cả khi đang tách riêng ở cuối file, đánh số lại
        từ đầu) về đúng ngay dưới câu hỏi tương ứng — không dựng lại nội dung, giữ nguyên định dạng gốc.
      </p>
      <button className="btn" onClick={handleRun} disabled={working}>
        {working ? '⏳ Đang xử lý...' : '📎 Ghép lời giải & Tải Word'}
      </button>
      {doneNote && <p style={{ fontSize: 12.5, marginTop: 8 }}>{doneNote}</p>}
    </div>
  )
}

function renderQuestionOnly(b: QuestionBlock, color: string) {
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

  for (const line of b.questionLines) {
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
