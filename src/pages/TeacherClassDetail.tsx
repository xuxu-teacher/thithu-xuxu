import { ChangeEvent, FormEvent, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabaseClient'
import { ClassRoom, Exam, Student } from '../types'
import ClassOverallStats from '../components/ClassOverallStats'

function randomCode(prefix: string) {
  return prefix + Math.random().toString(36).slice(2, 7).toUpperCase()
}

interface ExcelRow {
  name: string
  code: string
}

export default function TeacherClassDetail() {
  const { classId } = useParams()
  const [classRoom, setClassRoom] = useState<ClassRoom | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [exams, setExams] = useState<Exam[]>([])
  const [newName, setNewName] = useState('')
  const [lastCreated, setLastCreated] = useState<{ code: string; password: string } | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)

  async function loadAll() {
    const { data: c } = await supabase.from('classes').select('*').eq('id', classId).single()
    setClassRoom(c as ClassRoom)
    const { data: s } = await supabase
      .from('students')
      .select('id, class_id, student_code, full_name')
      .eq('class_id', classId)
      .order('student_code')
    setStudents((s as Student[]) || [])
    const { data: e } = await supabase
      .from('exams')
      .select('*')
      .eq('class_id', classId)
      .order('wave_number')
    setExams((e as Exam[]) || [])
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId])

  async function handleAddStudent(e: FormEvent) {
    e.preventDefault()
    const code = randomCode('HS')
    const password = Math.random().toString(36).slice(2, 8)
    const { data: hashed } = await supabase.rpc('hash_password', { plain: password })
    await supabase.from('students').insert({
      class_id: classId,
      student_code: code,
      full_name: newName,
      password_hash: hashed,
    })
    setLastCreated({ code, password })
    setNewName('')
    loadAll()
  }

  /**
   * Import danh sách học sinh từ file Excel (.xlsx/.xls).
   * Cột nhận diện linh hoạt (không phân biệt hoa/thường, có/không dấu):
   *   - "Họ và tên" / "Ho va ten" / "Họ tên" / "Name"  -> bắt buộc
   *   - "Mã học sinh" / "Ma hoc sinh" / "Mã số" / "Code" -> tùy chọn, nếu để
   *     trống sẽ tự sinh mã ngẫu nhiên như khi thêm thủ công.
   * Mật khẩu ban đầu của mỗi học sinh = đúng mã học sinh của em đó (dễ nhớ,
   * giáo viên chỉ cần thông báo 1 mã duy nhất cho mỗi em).
   */
  async function handleImportExcel(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportResult(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' })

      const normalizeKey = (k: string) =>
        k
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]/g, '')

      const parsed: ExcelRow[] = rows
        .map((row) => {
          let name = ''
          let code = ''
          for (const [key, val] of Object.entries(row)) {
            const nk = normalizeKey(key)
            if (['hovaten', 'hoten', 'name', 'hovaten1', 'tenhocsinh'].includes(nk)) name = String(val).trim()
            if (['mahocsinh', 'maso', 'code', 'masohocsinh', 'ma'].includes(nk)) code = String(val).trim()
          }
          return { name, code }
        })
        .filter((r) => r.name)

      if (parsed.length === 0) {
        setImportResult(
          'Không đọc được dòng nào. Hãy đảm bảo file có cột tiêu đề "Họ và tên" (bắt buộc) và có thể thêm cột "Mã học sinh" (tùy chọn).'
        )
        setImporting(false)
        e.target.value = ''
        return
      }

      let success = 0
      let failed = 0
      const createdList: { code: string; name: string }[] = []

      for (const row of parsed) {
        const code = row.code || randomCode('HS')
        const password = row.code || Math.random().toString(36).slice(2, 8) // mật khẩu = mã số nếu có, nếu không thì random
        const { data: hashed, error: hashErr } = await supabase.rpc('hash_password', { plain: password })
        if (hashErr) { failed++; continue }
        const { error: insErr } = await supabase.from('students').insert({
          class_id: classId,
          student_code: code,
          full_name: row.name,
          password_hash: hashed,
        })
        if (insErr) failed++
        else { success++; createdList.push({ code, name: row.name }) }
      }

      setImportResult(
        `Đã thêm thành công ${success}/${parsed.length} học sinh` +
          (failed > 0 ? ` (${failed} dòng lỗi — có thể do trùng mã học sinh).` : '.') +
          ' Mật khẩu ban đầu của mỗi em chính là mã học sinh của em đó — hãy thông báo mã này cho từng em.'
      )
      loadAll()
    } catch (err: any) {
      setImportResult(`Lỗi khi đọc file Excel: ${err.message || err}`)
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  async function handleDeleteStudent(studentId: string, name: string) {
    if (!window.confirm(`Xóa học sinh "${name}" khỏi lớp? Toàn bộ kết quả thi của em này cũng sẽ bị xóa theo. Hành động không thể hoàn tác.`)) return
    const { error } = await supabase.from('students').delete().eq('id', studentId)
    if (error) { alert('Lỗi khi xóa: ' + error.message); return }
    loadAll()
  }

  if (!classRoom) return <div className="container">Đang tải...</div>

  return (
    <div className="container">
      <Link to="/teacher/dashboard" className="btn secondary" style={{ marginBottom: 16, display: 'inline-flex' }}>
        ← Trang chủ giáo viên
      </Link>

      <div className="card">
        <h2>
          Lớp {classRoom.class_name} — <span className="badge">{classRoom.class_code}</span>
        </h2>
        <Link to={`/teacher/classes/${classId}/exams/new`} className="btn">
          + Tạo đề thi mới
        </Link>
      </div>

      <div className="card">
        <h3>Thêm học sinh</h3>

        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <form onSubmit={handleAddStudent} style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flex: 1, minWidth: 280 }}>
            <div style={{ flex: 1 }}>
              <label>Thêm từng em (tự sinh mã HS)</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Họ và tên học sinh" required />
            </div>
            <button className="btn secondary" type="submit" style={{ marginBottom: 12 }}>
              Thêm
            </button>
          </form>

          <div style={{ flex: 1, minWidth: 280 }}>
            <label>Hoặc nhập cả danh sách từ file Excel (.xlsx)</label>
            <input type="file" accept=".xlsx,.xls" onChange={handleImportExcel} disabled={importing} />
            <p style={{ fontSize: 12.5, margin: 0 }}>
              File cần có cột <b>Họ và tên</b> (bắt buộc), có thể thêm cột <b>Mã học sinh</b> (nếu để trống hệ
              thống tự sinh mã). Mật khẩu ban đầu = đúng mã học sinh.
            </p>
          </div>
        </div>

        {importing && <p>Đang import danh sách...</p>}
        {importResult && <div className="explanation">{importResult}</div>}
        {lastCreated && (
          <p className="explanation">
            Đã tạo tài khoản — Mã HS: <b>{lastCreated.code}</b>, Mật khẩu: <b>{lastCreated.password}</b>{' '}
            (hãy sao chép/gửi cho học sinh ngay, hệ thống không hiển thị lại mật khẩu này).
          </p>
        )}

        <table className="list">
          <thead>
            <tr>
              <th>Mã học sinh</th>
              <th>Họ và tên</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id}>
                <td>{s.student_code}</td>
                <td>{s.full_name}</td>
                <td>
                  <button className="btn danger" style={{ padding: '4px 12px', fontSize: 12.5 }} onClick={() => handleDeleteStudent(s.id, s.full_name)}>
                    Xóa
                  </button>
                </td>
              </tr>
            ))}
            {students.length === 0 && (
              <tr>
                <td colSpan={3} style={{ color: 'var(--muted)' }}>
                  Chưa có học sinh nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>📈 Thống kê tổng hợp của lớp (qua tất cả các đợt thi)</h3>
        <ClassOverallStats classId={classId!} students={students} />
      </div>

      <div className="card">
        <h3>Các đợt thi (toàn bộ đề thi được lưu trữ vĩnh viễn)</h3>
        <table className="list">
          <thead>
            <tr>
              <th>Đợt</th>
              <th>Tên đề thi</th>
              <th>Mở cổng</th>
              <th>Đóng cổng</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {exams.map((ex) => (
              <tr key={ex.id}>
                <td>#{ex.wave_number}</td>
                <td>{ex.title}</td>
                <td>{new Date(ex.open_at).toLocaleString('vi-VN')}</td>
                <td>{new Date(ex.close_at).toLocaleString('vi-VN')}</td>
                <td>
                  <Link to={`/teacher/exams/${ex.id}/results`}>Xem thống kê & kết quả →</Link>
                </td>
              </tr>
            ))}
            {exams.length === 0 && (
              <tr>
                <td colSpan={5} style={{ color: 'var(--muted)' }}>
                  Chưa có đề thi.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
