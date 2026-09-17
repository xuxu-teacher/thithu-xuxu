import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { v4 as uuid } from 'uuid'
import { useAuth } from '../context/AuthContext'
import {
  getTeacherDisclosure,
  saveTeacherDisclosure,
  listScheduleRows,
  saveScheduleRow,
  deleteScheduleRow,
} from '../utils/teacherDisclosure'
import { TeacherDisclosure, TeacherScheduleRow } from '../types'
import ScheduleTable from '../components/ScheduleTable'

const emptyDisclosure = (teacherId: string): TeacherDisclosure => ({
  teacher_id: teacherId,
  business_name: '',
  address: '',
  phone: '',
  school_year: '',
  subjects_info: '',
  teaching_form: '',
  tuition_rates: '',
  teacher_degree: '',
  teacher_major: '',
  teacher_workplace: '',
  principal_school_name: '',
  report_teaching_time: '',
})

export default function TeacherDisclosurePage() {
  const { teacher } = useAuth()
  const [form, setForm] = useState<TeacherDisclosure | null>(null)
  const [rows, setRows] = useState<TeacherScheduleRow[]>([])
  const [saving, setSaving] = useState(false)
  const [savedNote, setSavedNote] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      if (!teacher) return
      const d = await getTeacherDisclosure(teacher.id)
      setForm(d || emptyDisclosure(teacher.id))
      setRows(await listScheduleRows(teacher.id))
    }
    load()
  }, [teacher])

  function update(patch: Partial<TeacherDisclosure>) {
    setForm((f) => (f ? { ...f, ...patch } : f))
  }

  async function handleSave() {
    if (!form) return
    setSaving(true)
    try {
      await saveTeacherDisclosure(form)
      setSavedNote('✅ Đã lưu.')
      setTimeout(() => setSavedNote(null), 3000)
    } catch (err: any) {
      alert('Lỗi khi lưu: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  function addRow() {
    const newRow: TeacherScheduleRow = {
      id: uuid(),
      teacher_id: teacher!.id,
      class_label: '',
      order_index: rows.length,
    }
    setRows((prev) => [...prev, newRow])
  }

  async function persistRow(row: TeacherScheduleRow) {
    try {
      await saveScheduleRow(row)
    } catch (err: any) {
      alert('Lỗi khi lưu dòng thời khóa biểu: ' + err.message)
    }
  }

  function changeLabel(rowId: string, value: string) {
    setRows((prev) => {
      const next = prev.map((r) => (r.id === rowId ? { ...r, class_label: value } : r))
      const row = next.find((r) => r.id === rowId)
      if (row) persistRow(row)
      return next
    })
  }

  function changeCell(rowId: string, day: string, value: string) {
    setRows((prev) => {
      const next = prev.map((r) => (r.id === rowId ? { ...r, [day]: value } : r))
      const row = next.find((r) => r.id === rowId)
      if (row) persistRow(row)
      return next
    })
  }

  async function removeRow(rowId: string) {
    setRows((prev) => prev.filter((r) => r.id !== rowId))
    await deleteScheduleRow(rowId)
  }

  if (!form) return <div className="container">Đang tải...</div>

  return (
    <div className="container">
      <Link to="/teacher/dashboard" className="btn secondary" style={{ marginBottom: 16, display: 'inline-flex' }}>
        ← Trang chủ giáo viên
      </Link>

      <div className="card">
        <h2>📋 Kê khai thông tin dạy thêm</h2>
        <p style={{ fontSize: 13 }}>
          Nội dung này hiển thị công khai cho học sinh xem (mục tương ứng ở trang học sinh), theo đúng cấu
          trúc "Công khai thông tin về tuyển sinh các khóa học thêm" và "Báo cáo Hiệu trưởng" theo quy định.
        </p>

        <label>Tên hộ kinh doanh / cơ sở dạy thêm</label>
        <input value={form.business_name || ''} onChange={(e) => update({ business_name: e.target.value })} placeholder="VD: HỘ KINH DOANH UYÊN THƠ" />

        <label>Địa chỉ</label>
        <input value={form.address || ''} onChange={(e) => update({ address: e.target.value })} />

        <label>Số điện thoại</label>
        <input value={form.phone || ''} onChange={(e) => update({ phone: e.target.value })} />

        <label>Năm học</label>
        <input value={form.school_year || ''} onChange={(e) => update({ school_year: e.target.value })} placeholder="VD: 2026-2027" />

        <label>Danh xưng (dùng để ghép câu trong đơn đăng ký)</label>
        <select value={form.teacher_honorific || 'Cô'} onChange={(e) => update({ teacher_honorific: e.target.value })}>
          <option value="Thầy">Thầy</option>
          <option value="Cô">Cô</option>
        </select>

        <label>Tên hiển thị (trong đơn/kê khai)</label>
        <input value={form.teacher_display_name || teacher?.full_name || ''} onChange={(e) => update({ teacher_display_name: e.target.value })} />

        <label>Các môn/khối tổ chức dạy thêm</label>
        <textarea rows={3} value={form.subjects_info || ''} onChange={(e) => update({ subjects_info: e.target.value })} placeholder={'VD:\n+ Lớp Toán 10, Chương trình giáo dục phổ thông\n+ Lớp Toán 11, Chương trình giáo dục phổ thông'} />

        <label>Hình thức tổ chức dạy thêm, học thêm</label>
        <textarea rows={2} value={form.teaching_form || ''} onChange={(e) => update({ teaching_form: e.target.value })} />

        <label>Mức thu tiền học thêm</label>
        <textarea rows={2} value={form.tuition_rates || ''} onChange={(e) => update({ tuition_rates: e.target.value })} placeholder={'VD: 300.000đ/01 tháng/01 HS - Tuần 2 buổi\n380.000đ/01 tháng/01 HS - Tuần 3 buổi'} />
      </div>

      <div className="card">
        <h3>Thời khóa biểu (linh hoạt — tự thêm/xóa dòng, tự sửa từng ô)</h3>
        <ScheduleTable rows={rows} editable onChangeCell={changeCell} onChangeLabel={changeLabel} onDeleteRow={removeRow} />
        <button type="button" className="btn secondary" onClick={addRow} style={{ marginTop: 10 }}>
          + Thêm dòng
        </button>
      </div>

      <div className="card">
        <h3>Thông tin người dạy (bản thân)</h3>
        <label>Trình độ chuyên môn</label>
        <input value={form.teacher_degree || ''} onChange={(e) => update({ teacher_degree: e.target.value })} placeholder="VD: Thạc sỹ" />
        <label>Chuyên ngành đào tạo</label>
        <input value={form.teacher_major || ''} onChange={(e) => update({ teacher_major: e.target.value })} placeholder="VD: Toán" />
        <label>Đơn vị công tác</label>
        <input value={form.teacher_workplace || ''} onChange={(e) => update({ teacher_workplace: e.target.value })} placeholder="VD: THPT số 1 Tư Nghĩa" />
      </div>

      <div className="card">
        <h3>Báo cáo Hiệu trưởng (nếu đang là giáo viên biên chế/hợp đồng tại trường)</h3>
        <label>Kính gửi Hiệu trưởng trường</label>
        <input value={form.principal_school_name || ''} onChange={(e) => update({ principal_school_name: e.target.value })} placeholder="VD: Trường THPT số 1 Tư Nghĩa" />
        <label>Thời gian dạy thêm (để báo cáo)</label>
        <textarea rows={2} value={form.report_teaching_time || ''} onChange={(e) => update({ report_teaching_time: e.target.value })} />
      </div>

      <button className="btn" onClick={handleSave} disabled={saving}>
        {saving ? 'Đang lưu...' : 'Lưu kê khai'}
      </button>
      {savedNote && <span style={{ marginLeft: 10, color: 'green' }}>{savedNote}</span>}
    </div>
  )
}
