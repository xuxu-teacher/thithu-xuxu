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
  // Định dạng cột Mã học sinh + Số điện thoại là Văn bản (@) — để khi giáo viên
  // gõ "0867..." Excel không tự đổi thành số và làm mất số 0 đầu.
  for (let r = 1; r <= 500; r++) {
    for (const col of ['B', 'C']) {
      const ref = `${col}${r + 1}`
      if (!ws[ref]) ws[ref] = { t: 's', v: '' }
      ws[ref].z = '@'
    }
  }
  ws['!ref'] = 'A1:C501'
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Danh sách học sinh')
  XLSX.writeFile(wb, 'mau_danh_sach_hoc_sinh.xlsx')
}

/**
 * Chuẩn hóa số điện thoại đọc từ Excel. Excel tự đổi ô "0867773187" thành
 * SỐ 867773187 (mất số 0 đầu) — nếu dùng nguyên số đó làm mật khẩu, học sinh
 * gõ đúng số điện thoại của mình (có số 0) sẽ KHÔNG đăng nhập được.
 */
function normalizePhone(val: unknown): string {
  let d = String(val ?? '').trim().replace(/[^0-9]/g, '')
  if (!d) return ''
  if (d.startsWith('84') && d.length === 11) d = '0' + d.slice(2) // +84xxxxxxxxx
  if (d.length === 9 && !d.startsWith('0')) d = '0' + d // mất số 0 đầu
  return d
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
  const [tuitionFee, setTuitionFee] = useState('')
  const [scheduleInfo, setScheduleInfo] = useState('')
  const [studyDuration, setStudyDuration] = useState('')
  const [savingPublicInfo, setSavingPublicInfo] = useState(false)

  async function loadAll() {
    const { data: c } = await supabase.from('classes').select('*').eq('id', classId).single()
    const room = c as ClassRoom
    setClassRoom(room)
    setTuitionFee(room?.tuition_fee || '')
    setScheduleInfo(room?.schedule_info || '')
    setStudyDuration(room?.study_duration || '')
    const { data: s } = await supabase
      .from('students')
      .select('id, class_id, student_code, full_name, phone, tuition_paid')
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

      // LƯU Ý: chữ "đ" KHÔNG tách dấu được bằng NFD (nó là 1 chữ riêng, không
      // phải "d" + dấu) — trước đây bị xóa luôn, nên "Số điện thoại" thành
      // "soienthoai", "SĐT" thành "st" → KHÔNG BAO GIỜ nhận ra cột số điện thoại.
      const normalizeKey = (k: string) =>
        k
          .toLowerCase()
          .replace(/đ/g, 'd')
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
            if (['sodienthoai', 'sdt', 'dienthoai', 'phone', 'sodt'].includes(nk)) phone = normalizePhone(val)
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
      let withPhone = 0
      // Ghi lại ĐÚNG lý do từng dòng lỗi (trước đây chỉ đếm, bỏ mất thông báo
      // lỗi thật của Supabase nên không biết vì sao lỗi).
      const dupInSystem: string[] = []
      const dupInFile: string[] = []
      const otherErrors: string[] = []
      const seenCodes = new Set<string>()

      for (const row of parsed) {
        const code = row.code || randomCode('HS')
        // Mã học sinh là tên đăng nhập nên phải DUY NHẤT trên TOÀN HỆ THỐNG
        // (cột student_code có ràng buộc unique cho mọi lớp, mọi giáo viên).
        if (seenCodes.has(code.toUpperCase())) { dupInFile.push(code); continue }
        seenCodes.add(code.toUpperCase())

        const password = row.phone || Math.random().toString(36).slice(2, 8)
        const { data: hashed, error: hashErr } = await supabase.rpc('hash_password', { plain: password })
        if (hashErr) { otherErrors.push(`${code} (${row.name}): ${hashErr.message}`); continue }
        const { error: insErr } = await supabase.from('students').insert({
          class_id: classId,
          student_code: code,
          full_name: row.name,
          phone: row.phone || null,
          password_hash: hashed,
        })
        if (insErr) {
          if (insErr.code === '23505') dupInSystem.push(code)
          else otherErrors.push(`${code} (${row.name}): ${insErr.message}`)
          continue
        }
        success++
        if (row.phone) withPhone++
      }

      const failed = dupInSystem.length + dupInFile.length + otherErrors.length
      let msg =
        `Đã thêm thành công ${success}/${parsed.length} học sinh. ` +
        `Trong đó ${withPhone} em có số điện thoại → mật khẩu ban đầu chính là số điện thoại của em đó; ` +
        `${success - withPhone} em còn lại được sinh mật khẩu ngẫu nhiên (báo học sinh vào mục "Đổi mật khẩu" để tự đặt lại).`
      if (failed > 0) {
        msg += `\n\n⚠ ${failed} dòng KHÔNG thêm được:`
        if (dupInSystem.length)
          msg +=
            `\n• ${dupInSystem.length} mã đã có người dùng trong hệ thống (mã học sinh là tên đăng nhập nên không được trùng với BẤT KỲ lớp nào, kể cả lớp của giáo viên khác): ${dupInSystem.join(', ')}.` +
            ` Cách xử lý: đặt mã riêng cho lớp (VD thêm tên lớp: 10A1-HS01) hoặc để trống cột "Mã học sinh" để hệ thống tự sinh mã.`
        if (dupInFile.length) msg += `\n• ${dupInFile.length} mã bị lặp lại ngay trong file: ${dupInFile.join(', ')}.`
        if (otherErrors.length) msg += `\n• Lỗi khác: ${otherErrors.join('; ')}`
      }
      setImportResult(msg)
      loadAll()
    } catch (err: any) {
      setImportResult(`Lỗi khi đọc file Excel: ${err.message || err}`)
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  async function handleSavePublicInfo() {
    setSavingPublicInfo(true)
    const { error } = await supabase
      .from('classes')
      .update({ tuition_fee: tuitionFee, schedule_info: scheduleInfo, study_duration: studyDuration })
      .eq('id', classId)
    setSavingPublicInfo(false)
    if (error) alert('Lỗi khi lưu: ' + error.message)
    else loadAll()
  }

  async function handleDeleteStudent(studentId: string, name: string) {
    if (!window.confirm(`Xóa học sinh "${name}" khỏi lớp? Toàn bộ kết quả thi của em này cũng sẽ bị xóa theo. Hành động không thể hoàn tác.`)) return
    const { error } = await supabase.from('students').delete().eq('id', studentId)
    if (error) { alert('Lỗi khi xóa: ' + error.message); return }
    loadAll()
  }

  async function handleDeleteAllStudents() {
    if (students.length === 0) return
    if (!window.confirm(`XÓA TOÀN BỘ ${students.length} học sinh khỏi lớp "${classRoom?.class_name}"? Toàn bộ kết quả thi của cả lớp cũng sẽ bị xóa theo. Hành động KHÔNG THỂ HOÀN TÁC.`)) return
    if (!window.confirm('Xác nhận lần nữa — chắc chắn xóa hết toàn bộ học sinh trong lớp này?')) return
    const { error } = await supabase.from('students').delete().eq('class_id', classId)
    if (error) { alert('Lỗi khi xóa: ' + error.message); return }
    loadAll()
  }

  async function handleToggleTuition(studentId: string, paid: boolean) {
    setStudents((prev) => prev.map((s) => (s.id === studentId ? { ...s, tuition_paid: paid } : s)))
    const { error } = await supabase.from('students').update({ tuition_paid: paid }).eq('id', studentId)
    if (error) alert('Lỗi khi cập nhật học phí: ' + error.message)
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
        <Link to={`/teacher/classes/${classId}/exams/new-hub`} className="btn">
          + Tạo đề thi
        </Link>{' '}
        <Link to={`/teacher/classes/${classId}/practice/new`} className="btn secondary">
          📝 Tạo đề thi thử
        </Link>
      </div>

      <div className="card">
        <h3>📢 Công khai thông tin dạy thêm</h3>
        <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>
          Hiển thị trực tiếp cho học sinh của lớp này ở trang chủ học sinh.
        </p>
        <label>Mức học phí</label>
        <input value={tuitionFee} onChange={(e) => setTuitionFee(e.target.value)} placeholder="VD: 500.000đ/tháng" />
        <label>Lịch học</label>
        <input value={scheduleInfo} onChange={(e) => setScheduleInfo(e.target.value)} placeholder="VD: Thứ 2 - 4 - 6, 18h00 - 20h00" />
        <label>Thời gian học (thời lượng mỗi buổi)</label>
        <input value={studyDuration} onChange={(e) => setStudyDuration(e.target.value)} placeholder="VD: 120 phút/buổi" />
        <button className="btn" onClick={handleSavePublicInfo} disabled={savingPublicInfo}>
          {savingPublicInfo ? 'Đang lưu...' : 'Lưu thông tin công khai'}
        </button>
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
        {importResult && <div className="explanation" style={{ whiteSpace: 'pre-line' }}>{importResult}</div>}
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
              <th>Học phí</th>
              <th>
                {students.length > 0 && (
                  <button className="btn danger" style={{ padding: '4px 10px', fontSize: 12 }} onClick={handleDeleteAllStudents}>
                    🗑 Xóa toàn bộ ({students.length})
                  </button>
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id}>
                <td>{s.student_code}</td>
                <td>{s.full_name}</td>
                <td>{s.phone || '-'}</td>
                <td>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      style={{ width: 'auto', marginBottom: 0 }}
                      checked={!!s.tuition_paid}
                      onChange={(e) => handleToggleTuition(s.id, e.target.checked)}
                    />
                    <span className={`badge ${s.tuition_paid ? 'correct' : 'warn'}`}>
                      {s.tuition_paid ? 'Đã nộp' : 'Chưa nộp'}
                    </span>
                  </label>
                </td>
                <td>
                  <button className="btn danger" style={{ padding: '4px 12px', fontSize: 12.5 }} onClick={() => handleDeleteStudent(s.id, s.full_name)}>
                    Xóa
                  </button>
                </td>
              </tr>
            ))}
            {students.length === 0 && (
              <tr>
                <td colSpan={5} style={{ color: 'var(--muted)' }}>
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
