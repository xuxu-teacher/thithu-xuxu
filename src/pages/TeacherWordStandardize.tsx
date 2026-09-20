import { ChangeEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { parseGenericWordParagraphs } from '../utils/docxParser'
import { standardizeIntoBlocks, QuestionBlock } from '../utils/normalizeWord'
import MathRenderer from '../components/MathRenderer'

type ColorScheme = 'black-on-white' | 'white-on-green'

export default function TeacherWordStandardize() {
  const [blocks, setBlocks] = useState<QuestionBlock[] | null>(null)
  const [blankLines, setBlankLines] = useState(3)
  const [colorScheme, setColorScheme] = useState<ColorScheme>('black-on-white')
  const [processing, setProcessing] = useState(false)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState<string | null>(null)

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

  function handleExportPdf() {
    window.print()
  }

  const isDark = colorScheme === 'white-on-green'
  const pageBg = isDark ? '#1f5c3f' : '#ffffff'
  const textColor = isDark ? '#ffffff' : '#111111'

  return (
    <div className="container">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #standardize-print-area, #standardize-print-area * { visibility: visible; }
          #standardize-print-area {
            position: absolute; top: 0; left: 0; width: 100%;
            background: ${pageBg} !important;
            color: ${textColor} !important;
          }
          @page { margin: 15mm; }
        }
      `}</style>

      <div className="no-print">
        <Link to="/teacher/dashboard" className="btn secondary" style={{ marginBottom: 16, display: 'inline-flex' }}>
          ← Trang chủ giáo viên
        </Link>

        <div className="card">
          <h2>📄 Chuẩn hóa Word</h2>
          <p style={{ fontSize: 13 }}>
            Tải lên bất kỳ file Word nào chứa các câu hỏi được đánh số "Câu 1", "Câu 2"... — hệ thống tự động{' '}
            <b>xóa toàn bộ lời giải</b> (nhận diện qua dòng "Lời giải"/"Hướng dẫn giải"/"Giải:"), giữ nguyên câu
            hỏi và số liệu, chèn khoảng trắng giữa các câu để học sinh tự làm, rồi xuất ra PDF.
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
                max={20}
                value={blankLines}
                onChange={(e) => setBlankLines(Math.max(0, Number(e.target.value)))}
                style={{ maxWidth: 120 }}
              />

              <label>Màu văn bản</label>
              <select value={colorScheme} onChange={(e) => setColorScheme(e.target.value as ColorScheme)}>
                <option value="black-on-white">Nền trắng — chữ đen</option>
                <option value="white-on-green">Nền xanh (bảng viết) — chữ trắng</option>
              </select>

              <button className="btn" onClick={handleExportPdf} style={{ marginTop: 12 }}>
                🖨 Xuất PDF
              </button>
              <p style={{ fontSize: 12, color: 'var(--muted)' }}>
                Bấm xong, ở hộp thoại in của trình duyệt chọn máy in <b>"Save as PDF" / "Lưu dưới dạng PDF"</b>{' '}
                thay vì in giấy thật.
              </p>
            </>
          )}
        </div>
      </div>

      {blocks && (
        <div
          id="standardize-print-area"
          className="card"
          style={{ background: pageBg, color: textColor, padding: 24 }}
        >
          {fileName && <h2 style={{ color: textColor, textAlign: 'center' }}>{fileName}</h2>}
          {blocks.map((b, i) => (
            <div key={i}>
              {b.lines.map((line, j) => (
                <p key={j} style={{ color: textColor, margin: '4px 0' }}>
                  <MathRenderer html={line} />
                </p>
              ))}
              {QUESTION_START(b) &&
                Array.from({ length: blankLines }).map((_, k) => (
                  <p key={`blank-${k}`} style={{ margin: 0, minHeight: 22 }}>
                    &nbsp;
                  </p>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function QUESTION_START(b: QuestionBlock): boolean {
  return /^\s*(Câu|CÂU|Bài|BÀI)\s*\d+/i.test(b.lines[0] || '')
}
