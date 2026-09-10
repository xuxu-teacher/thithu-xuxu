import { ChangeEvent, useState } from 'react'
import * as XLSX from 'xlsx'
import { MatrixCell, QuestionDifficulty, QuestionPart } from '../types'

// ============================================================
// TẢI MA TRẬN ĐỀ TỪ FILE EXCEL
// ============================================================
// Giáo viên thường đã có sẵn file ma trận đề (thường lập theo yêu cầu nhà
// trường/tổ chuyên môn) — thay vì bắt gõ tay từng dòng trên web, cho phép
// tải file Excel theo mẫu 4 cột: Chủ đề | Mức độ | Dạng câu | Số câu.
// Parse xong sẽ CHÈN THÊM vào ma trận đang dựng trên trang (không xóa các
// dòng đã có), giáo viên xem lại/sửa trước khi sinh đề.
// ============================================================

const DIFFICULTY_ALIASES: Record<string, QuestionDifficulty> = {
  'nhận biết': 'Nhận biết',
  nb: 'Nhận biết',
  'thông hiểu': 'Thông hiểu',
  th: 'Thông hiểu',
  'vận dụng': 'Vận dụng',
  vd: 'Vận dụng',
  'vận dụng cao': 'Vận dụng cao',
  vdc: 'Vận dụng cao',
}

const PART_ALIASES: Record<string, QuestionPart> = {
  'trắc nghiệm': 'mcq',
  tn: 'mcq',
  mcq: 'mcq',
  'đúng/sai': 'true_false',
  'đúng sai': 'true_false',
  ds: 'true_false',
  true_false: 'true_false',
  'trả lời ngắn': 'short_answer',
  tln: 'short_answer',
  short_answer: 'short_answer',
}

function normalize(s: string) {
  return s.trim().toLowerCase()
}

function matchTopic(raw: string, topics: string[]): string | null {
  const target = normalize(raw)
  const exact = topics.find((t) => normalize(t) === target)
  if (exact) return exact
  // Khớp gần đúng: chủ đề trong file chứa hoặc bị chứa trong tên chuẩn —
  // đỡ bắt giáo viên gõ đúng 100% dấu câu/khoảng trắng như trong hệ thống.
  const loose = topics.find((t) => normalize(t).includes(target) || target.includes(normalize(t)))
  return loose || null
}

export default function MatrixFileImport({
  topics,
  onImport,
}: {
  topics: string[]
  onImport: (rows: MatrixCell[]) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  function downloadTemplate() {
    const wsData = [
      ['Chủ đề', 'Mức độ', 'Dạng câu', 'Số câu'],
      [topics[0] || 'Mệnh đề và tập hợp', 'Nhận biết', 'Trắc nghiệm', 3],
      [topics[0] || 'Mệnh đề và tập hợp', 'Thông hiểu', 'Trắc nghiệm', 2],
      [topics[1] || topics[0] || 'Vectơ', 'Vận dụng', 'Đúng/Sai', 1],
    ]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    ws['!cols'] = [{ wch: 45 }, { wch: 14 }, { wch: 14 }, { wch: 10 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Ma trận đề')

    const noteData = [
      ['Mức độ hợp lệ (cột B)'],
      ['Nhận biết'],
      ['Thông hiểu'],
      ['Vận dụng'],
      ['Vận dụng cao'],
      [],
      ['Dạng câu hợp lệ (cột C)'],
      ['Trắc nghiệm'],
      ['Đúng/Sai'],
      ['Trả lời ngắn'],
      [],
      ['Chủ đề hợp lệ (cột A) — theo đúng khối lớp'],
      ...topics.map((t) => [t]),
    ]
    const wsNote = XLSX.utils.aoa_to_sheet(noteData)
    wsNote['!cols'] = [{ wch: 55 }]
    XLSX.utils.book_append_sheet(wb, wsNote, 'Danh sách hợp lệ')

    XLSX.writeFile(wb, 'mau-ma-tran-de.xlsx')
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    setNote(null)

    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false })

      const dataRows = rows.slice(1) // bỏ dòng tiêu đề
      const parsed: MatrixCell[] = []
      const problems: string[] = []

      dataRows.forEach((r, i) => {
        const [rawTopic, rawDifficulty, rawPart, rawCount] = r
        if (!rawTopic && !rawDifficulty && !rawPart && !rawCount) return // dòng trống
        const lineNo = i + 2 // +2: bù dòng tiêu đề + index bắt đầu từ 0

        const topic = matchTopic(String(rawTopic || ''), topics)
        const difficulty = DIFFICULTY_ALIASES[normalize(String(rawDifficulty || ''))]
        const part = PART_ALIASES[normalize(String(rawPart || ''))]
        const count = Number(rawCount)

        if (!topic) return problems.push(`Dòng ${lineNo}: không nhận ra chủ đề "${rawTopic}"`)
        if (!difficulty) return problems.push(`Dòng ${lineNo}: mức độ "${rawDifficulty}" không hợp lệ`)
        if (!part) return problems.push(`Dòng ${lineNo}: dạng câu "${rawPart}" không hợp lệ`)
        if (!count || count <= 0) return problems.push(`Dòng ${lineNo}: số câu "${rawCount}" không hợp lệ`)

        parsed.push({ topic, difficulty, part, count })
      })

      if (parsed.length > 0) onImport(parsed)
      if (problems.length > 0) {
        setError(`Bỏ qua ${problems.length} dòng lỗi:\n${problems.join('\n')}`)
      }
      if (parsed.length > 0) {
        setNote(`Đã thêm ${parsed.length} dòng ma trận từ file — kiểm tra lại bên dưới.`)
      }
    } catch (err: any) {
      setError('Không đọc được file — hãy dùng đúng file mẫu Excel (.xlsx).')
    }
  }

  return (
    <div style={{ background: '#fafbfe', border: '1px dashed #cbd5e1', borderRadius: 8, padding: 12, marginBottom: 16 }}>
      <p style={{ fontSize: 13, margin: '0 0 8px' }}>
        Đã có sẵn file ma trận đề? Tải lên thay vì gõ tay từng dòng bên dưới (điền đúng 4 cột: Chủ đề, Mức độ, Dạng
        câu, Số câu).
      </p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn secondary" onClick={downloadTemplate}>
          ⬇ Tải file mẫu Excel
        </button>
        <label style={{ margin: 0 }}>
          <span className="btn" style={{ cursor: 'pointer' }}>
            📤 Tải lên file ma trận (.xlsx)
          </span>
          <input type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display: 'none' }} />
        </label>
      </div>
      {note && <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 8 }}>{note}</p>}
      {error && <pre style={{ fontSize: 12, color: 'var(--danger)', whiteSpace: 'pre-wrap', marginTop: 8 }}>{error}</pre>}
    </div>
  )
}
