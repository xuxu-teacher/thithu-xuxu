import { ChangeEvent, FormEvent, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabaseClient'
import { ClassRoom, Exam, Student } from '../types'
import ClassOverallStats from '../components/ClassOverallStats'

function randomCode(prefix: string) {
  return prefix + Math.random().toString(36).slice(2, 7).toUpperCase()
}

/** Tạo và tải xuống file Excel mẫu đúng định dạng import danh sách học sinh. */
function downloadSampleExcel() {
  const sample = [
    { 'Họ và tên': 'Nguyễn Văn A', 'Mã học sinh': 'HS0001', 'Số điện thoại': '0901234567' },
    { 'Họ và tên': 'Trần Thị B', 'Mã học sinh': 'HS0002', 'Số điện thoại': '0912345678' },
    { 'Họ và tên': 'Lê Văn C', 'Mã học sinh': '', 'Số điện thoại': '' },
  ]
  const ws = XLSX.utils.json_to_sheet(sample)
  ws['!cols'] = [{ wch: 24 }, { wch: 14 }, { wch: 16 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Danh sách học sinh')
  XLSX.writeFile(wb, 'mau_danh_sach_hoc_sinh.xlsx')
}

interface ExcelRow {
  name: string
  code: string
  phone: string
}

export default function TeacherClassDetail() {
  const { classId } = useParams()
  const [classRoom, setClassRoom] = useState<ClassRoom | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [exams, setExams] = useState<Exam[]>([])
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [lastCreated, setLastCreated] = useState<{ code: string; password: string } | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)

  async function loadAll() {
    const { data: c } = await supabase.from('classes').select('*').eq('id', classId).single()
    setClassRoom(c as ClassRoom)
    const { data: s } = await supabase
      .from('students')
      .select('id, class_id, student_code, full_name, phone')
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
    const password = newPhone.trim() || Math.random().toString(36).slice(2, 8)
    const { data: hashed } = await supabase.rpc('hash_password', { plain: password })
    await supabase.from('students').insert({
      class_id: classId,
      student_code: code,
      full_name: newName,
      phone: newPhone.trim() || null,
      password_hash: hashed,
    })
    setLastCreated({ code, password })
    setNewName('')
    setNewPhone('')
    loadAll()
  }

  /**
   * Import danh sách học sinh từ file Excel (.xlsx/.xls).
   * Cột nhận diện linh hoạt (không phân biệt hoa/thường, có/không dấu):
   *   - "Họ và tên" / "Ho va ten" / "Họ tên" / "Name"  -> bắt buộc
   *   - "Mã học sinh" / "Ma hoc sinh" / "Mã số" / "Code" -> tùy chọn, nếu để
   *     trống sẽ tự sinh mã ngẫu nhiên như khi thêm thủ công.
   *   - "Số điện thoại" / "SĐT" / "Phone" -> tùy chọn.
   * Mật khẩu ban đầu: ƯU TIÊN số điện thoại (nếu cột này có giá trị) — vì học
   * sinh nhớ số của mình sẵn, dễ đăng nhập lần đầu. Nếu không có số điện
   * thoại, hệ thống tự sinh mật khẩu ngẫu nhiên như thêm thủ công bình thường.
   * Học sinh có thể tự đổi mật khẩu sau khi đăng nhập lần đầu.
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
          let phone = ''
          for (const [key, val] of Object.entries(row)) {
            const nk = normalizeKey(key)
            if (['hovaten', 'hoten', 'name', 'hovaten1', 'tenhocsinh'].includes(nk)) name = String(val).trim()
            if (['mahocsinh', 'maso', 'code', 'masohocsinh', 'ma'].includes(nk)) code = String(val).trim()
            if (['sodienthoai', 'sdt', 'dienthoai', 'phone', 'sodt'].includes(nk)) phone = String(val).trim().replace(/[^0-9]/g, '')
          }
          return { name, code, phone }
        })
        .filter((r) => r.name)

      if (parsed.length === 0) {
        setImportResult(
          'Không đọc được dòng nào. Hãy đảm bảo file có cột tiêu đề "Họ và tên" (bắt buộc); có thể thêm cột "Mã học sinh" và "Số điện thoại" (tùy chọn).'
        )
        setImporting(false)
        e.target.value = ''
        return
      }

      let success = 0
      let failed = 0
      let withPhone = 0

      for (const row of parsed) {
        const code = row.code || randomCode('HS')
        const password = row.phone || Math.random().toString(36).slice(2, 8)
        if (row.phone) withPhone++
        const { data: hashed, error: hashErr } = await supabase.rpc('hash_password', { plain: password })
        if (hashErr) { failed++; continue }
        const { error: insErr } = await supabase.from('students').insert({
          class_id: classId,
          student_code: code,
          full_name: row.name,
          phone: row.phone || null,
          password_hash: hashed,
        })
        if (insErr) failed++
        else success++
      }

      setImportResult(
        `Đã thêm thành công ${success}/${parsed.length} học sinh` +
          (failed > 0 ? ` (${failed} dòng lỗi — có thể do trùng mã học sinh).` : '.') +
          ` Trong đó ${withPhone} em có số điện thoại → mật khẩu ban đầu chính là số điện thoại của em đó; ` +
          `${success - withPhone} em còn lại được sinh mật khẩu ngẫu nhiên (báo học sinh vào mục "Đổi mật khẩu" để tự đặt lại).`
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
          <form onSubmit={handleAddStudent} style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flex: 1, minWidth: 280, flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <label>Thêm từng em</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Họ và tên học sinh" required />
            </div>
            <div style={{ flex: 1 }}>
              <label>SĐT (tùy chọn — dùng làm mật khẩu)</label>
              <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Để trống sẽ tự sinh mật khẩu" />
            </div>
            <button className="btn secondary" type="submit" style={{ marginBottom: 12 }}>
              Thêm
            </button>
          </form>

          <div style={{ flex: 1, minWidth: 280 }}>
            <label>Hoặc nhập cả danh sách từ file Excel (.xlsx)</label>
            <input type="file" accept=".xlsx,.xls" onChange={handleImportExcel} disabled={importing} />
            <p style={{ fontSize: 12.5, margin: 0 }}>
              File cần có cột <b>Họ và tên</b> (bắt buộc), có thể thêm cột <b>Mã học sinh</b> và{' '}
              <b>Số điện thoại</b> (đều tùy chọn). Nếu có số điện thoại, mật khẩu ban đầu = số điện thoại;
              nếu không, hệ thống tự sinh mật khẩu ngẫu nhiên.
            </p>
            <button type="button" className="btn secondary" style={{ marginTop: 8 }} onClick={downloadSampleExcel}>
              📥 Tải file mẫu Excel
            </button>
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
              <th>SĐT</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id}>
                <td>{s.student_code}</td>
                <td>{s.full_name}</td>
                <td>{s.phone || '-'}</td>
                <td>
                  <button className="btn danger" style={{ padding: '4px 12px', fontSize: 12.5 }} onClick={() => handleDeleteStudent(s.id, s.full_name)}>
                    Xóa
                  </button>
                </td>
              </tr>
            ))}
            {students.length === 0 && (
              <tr>
                <td colSpan={4} style={{ color: 'var(--muted)' }}>
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
