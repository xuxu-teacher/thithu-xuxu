import { ChangeEvent, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { parseGenericWordParagraphs } from '../utils/docxParser'
import { parseIntoBlocks, QuestionBlock, isOptionLine } from '../utils/normalizeWord'
import { autoDetectCorrectAnswers } from '../utils/detectCorrectAnswers'
import MathRenderer from '../components/MathRenderer'

type ColorScheme = 'black-on-white' | 'white-on-green'

export default function TeacherWordStandardize() {
  const [blocks, setBlocks] = useState<QuestionBlock[] | null>(null)
  const [blankLines, setBlankLines] = useState(3)
  const [colorScheme, setColorScheme] = useState<ColorScheme>('black-on-white')
  const [showSolutions, setShowSolutions] = useState(false) // công cụ "Gắn lời giải" — bật/tắt độc lập
  const [processing, setProcessing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [detecting, setDetecting] = useState(false)
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
      setBlocks(parseIntoBlocks(paragraphs))
      setFileName(file.name.replace(/\.docx$/i, ''))
    } catch (err: any) {
      setError(err.message || 'Có lỗi khi đọc file Word.')
    } finally {
      setProcessing(false)
    }
  }

  function updateBlockText(id: string, raw: string) {
    setBlocks((prev) =>
      (prev || []).map((b) => {
        if (b.id !== id) return b
        const lines = raw.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
        const underline = lines.map((l, i) => (b.questionLines[i] === l ? b.underline[i] : false))
        return { ...b, questionLines: lines, underline }
      }),
    )
  }

  function removeBlock(id: string) {
    setBlocks((prev) => (prev || []).filter((b) => b.id !== id))
  }

  // ---- Công cụ độc lập 1: Tự động gạch chân đáp án (AI đọc lời giải) ----
  async function handleAutoUnderline() {
    if (!blocks) return
    setDetecting(true)
    setError(null)
    try {
      const updated = await autoDetectCorrectAnswers(blocks)
      setBlocks(updated)
    } catch (err: any) {
      setError(err.message || 'Có lỗi khi tự động gạch chân.')
    } finally {
      setDetecting(false)
    }
  }

  function toggleUnderline(blockId: string, lineIdx: number) {
    setBlocks((prev) =>
      (prev || []).map((b) => {
        if (b.id !== blockId) return b
        const underline = [...b.underline]
        underline[lineIdx] = !underline[lineIdx]
        return { ...b, underline }
      }),
    )
  }

  // ---- Công cụ độc lập 2: chèn dòng trống + tải PDF (như bản trước) ----
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
          Tải lên file Word có các câu đánh số "Câu 1", "Câu 2"... — tự tách phương án dính liền dòng, tự
          nhận diện lời giải kể cả khi tách riêng ở cuối file. Mặc định xuất ra đề trống (không lời giải) như
          các bản trước — 2 công cụ bên dưới hoạt động độc lập, dùng cái nào tùy bạn.
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
        <div className="card" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <h3 style={{ marginTop: 0 }}>🖊 Công cụ 1 — Tự động gạch chân đáp án</h3>
            <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              AI đọc lời giải từng câu để tự xác định và gạch chân đáp án đúng (trắc nghiệm: 1 đáp án; Đúng/
              Sai: từng ý riêng). Câu không có lời giải sẽ được bỏ qua.
            </p>
            <button type="button" className="btn secondary" onClick={handleAutoUnderline} disabled={detecting}>
              {detecting ? '⏳ Đang phân tích...' : '🖊 Tự động gạch chân'}
            </button>
          </div>
          <div style={{ flex: 1, minWidth: 260 }}>
            <h3 style={{ marginTop: 0 }}>📎 Công cụ 2 — Gắn lời giải vào đúng câu</h3>
            <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              Hiện lại lời giải ngay dưới đúng câu tương ứng (kể cả khi lời giải nằm tách riêng ở cuối file
              gốc) — thay vì tạo đề trống.
            </p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                style={{ width: 'auto', marginBottom: 0 }}
                checked={showSolutions}
                onChange={(e) => setShowSolutions(e.target.checked)}
              />
              Hiện lời giải trong bản xuất
            </label>
          </div>
        </div>
      )}

      {blocks && (
        <div className="card">
          <h3>Rà lại từng câu (sửa lỗi, xóa câu thừa, bấm dòng để tự gạch/bỏ gạch chân)</h3>
          {blocks.map((b) => (
            <div className="question-block" key={b.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{b.number ? `Câu ${b.number}` : '(không đánh số)'}</span>
                <button type="button" className="btn danger" style={{ padding: '4px 10px' }} onClick={() => removeBlock(b.id)}>
                  Xóa
                </button>
              </div>
              <textarea
                rows={Math.min(8, Math.max(2, b.questionLines.length))}
                value={b.questionLines.join('\n')}
                onChange={(e) => updateBlockText(b.id, e.target.value)}
              />
              <div className="card" style={{ background: '#fafbfe' }}>
                <b style={{ fontSize: 11, color: 'var(--muted)' }}>Xem trước (bấm dòng để gạch/bỏ gạch chân):</b>
                {b.questionLines.map((line, i) => (
                  <p
                    key={i}
                    onClick={() => toggleUnderline(b.id, i)}
                    style={{
                      color: '#111111',
                      margin: '4px 0',
                      cursor: 'pointer',
                      textDecoration: b.underline[i] ? 'underline' : 'none',
                      background: b.underline[i] ? '#fff3cd' : undefined,
                    }}
                  >
                    <MathRenderer html={line} />
                  </p>
                ))}
                {b.solutionLines.length > 0 && (
                  <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                    ✓ Có lời giải đi kèm ({b.solutionLines.length} dòng) — bật "Hiện lời giải trong bản xuất" ở
                    Công cụ 2 để đưa vào bản tải về.
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {blocks && (
        <div style={{ position: 'absolute', left: -9999, top: 0 }}>
          <div
            ref={printRef}
            style={{ width: '794px', background: pageBg, color: textColor, padding: 40, fontFamily: '"Times New Roman", Times, serif', fontSize: 15 }}
          >
            {fileName && <h2 style={{ color: textColor, textAlign: 'center' }}>{fileName}</h2>}
            {blocks.map((b) => (
              <div key={b.id}>
                {renderBlockPreview(b, textColor, showSolutions)}
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
      )}
    </div>
  )
}

function renderBlockPreview(b: QuestionBlock, color: string, showSolutions: boolean) {
  const elements: JSX.Element[] = []
  let optionBuffer: { text: string; underline: boolean }[] = []
  let key = 0

  const flushOptions = () => {
    if (optionBuffer.length === 0) return
    elements.push(
      <div key={`opt-${key++}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 16px', margin: '4px 0' }}>
        {optionBuffer.map((opt, i) => (
          <div key={i} style={{ color, textDecoration: opt.underline ? 'underline' : 'none' }}>
            <MathRenderer html={opt.text} />
          </div>
        ))}
      </div>,
    )
    optionBuffer = []
  }

  b.questionLines.forEach((line, i) => {
    if (isOptionLine(line)) {
      optionBuffer.push({ text: line, underline: b.underline[i] })
    } else {
      flushOptions()
      elements.push(
        <p key={`ln-${key++}`} style={{ color, margin: '4px 0', textDecoration: b.underline[i] ? 'underline' : 'none' }}>
          <MathRenderer html={line} />
        </p>,
      )
    }
  })
  flushOptions()

  if (showSolutions && b.solutionLines.length > 0) {
    elements.push(
      <p key="sol-label" style={{ color, margin: '6px 0 2px', fontWeight: 'bold' }}>
        Lời giải:
      </p>,
    )
    b.solutionLines.forEach((line, i) => {
      elements.push(
        <p key={`sol-${i}`} style={{ color, margin: '2px 0' }}>
          <MathRenderer html={line} />
        </p>,
      )
    })
  }

  return elements
}
