import { ChangeEvent, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { v4 as uuid } from 'uuid'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { DOCUMENT_CATEGORIES } from '../data/documentCategories'
import {
  uploadTeacherDocument,
  listTeacherDocuments,
  getDocumentSignedUrl,
  deleteTeacherDocument,
} from '../utils/teacherDocuments'
import {
  getTeacherDisclosure,
  saveTeacherDisclosure,
  listScheduleRows,
  saveScheduleRow,
  deleteScheduleRow,
} from '../utils/teacherDisclosure'
import ScheduleTable from '../components/ScheduleTable'
import { TeacherDocument, TuitionApplication, TeacherDisclosure, TeacherScheduleRow } from '../types'

const emptyDisclosure = (teacherId: string): TeacherDisclosure => ({
  teacher_id: teacherId,
  business_name: '',
  address: '',
  phone: '',
  school_year: '',
  subjects_info: '',
  teaching_form: '',
  tuition_rates: '',
  teacher_honorific: 'Cô',
  teacher_display_name: '',
  teacher_degree: '',
  teacher_major: '',
  teacher_workplace: '',
  principal_school_name: '',
  report_teaching_time: '',
})

export default function TeacherManagement() {
  const { teacher } = useAuth()
  const [docs, setDocs] = useState<TeacherDocument[]>([])
  const [applications, setApplications] = useState<TuitionApplication[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'docs' | 'applications' | 'disclosure'>('docs')
  const [activeCategory, setActiveCategory] = useState(DOCUMENT_CATEGORIES[0].key)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [disclosure, setDisclosure] = useState<TeacherDisclosure | null>(null)
  const [scheduleRows, setScheduleRows] = useState<TeacherScheduleRow[]>([])
  const [savingDisclosure, setSavingDisclosure] = useState(false)
  const [disclosureSavedNote, setDisclosureSavedNote] = useState<string | null>(null)

  async function reload() {
    setLoading(true)
    const [docData, appData] = await Promise.all([
      listTeacherDocuments(teacher!.id),
      supabase.from('tuition_applications').select('*').eq('teacher_id', teacher!.id).order('created_at', { ascending: false }),
    ])
    setDocs(docData)
    setApplications((appData.data as TuitionApplication[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    if (teacher) reload()
  }, [teacher])

  useEffect(() => {
    async function loadDisclosure() {
      if (!teacher || disclosure) return
      const d = await getTeacherDisclosure(teacher.id)
      setDisclosure(d || emptyDisclosure(teacher.id))
      setScheduleRows(await listScheduleRows(teacher.id))
    }
    if (mode === 'disclosure') loadDisclosure()
  }, [mode, teacher])

  async function handleToggleReviewed(id: string, reviewed: boolean) {
    setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, reviewed } : a)))
    await supabase.from('tuition_applications').update({ reviewed }).eq('id', id)
  }

  function updateDisclosure(patch: Partial<TeacherDisclosure>) {
    setDisclosure((d) => (d ? { ...d, ...patch } : d))
  }

  async function handleSaveDisclosure() {
    if (!disclosure) return
    setSavingDisclosure(true)
    try {
      await saveTeacherDisclosure(disclosure)
      setDisclosureSavedNote('✅ Đã lưu.')
      setTimeout(() => setDisclosureSavedNote(null), 3000)
    } catch (err: any) {
      alert('Lỗi khi lưu: ' + err.message)
    } finally {
      setSavingDisclosure(false)
    }
  }

  function addScheduleRow() {
    setScheduleRows((prev) => [...prev, { id: uuid(), teacher_id: teacher!.id, class_label: '', order_index: prev.length }])
  }

  async function persistScheduleRow(row: TeacherScheduleRow) {
    try {
      await saveScheduleRow(row)
    } catch (err: any) {
      alert('Lỗi khi lưu dòng thời khóa biểu: ' + err.message)
    }
  }

  function changeScheduleLabel(rowId: string, value: string) {
    setScheduleRows((prev) => {
      const next = prev.map((r) => (r.id === rowId ? { ...r, class_label: value } : r))
      const row = next.find((r) => r.id === rowId)
      if (row) persistScheduleRow(row)
      return next
    })
  }

  function changeScheduleCell(rowId: string, day: string, value: string) {
    setScheduleRows((prev) => {
      const next = prev.map((r) => (r.id === rowId ? { ...r, [day]: value } : r))
      const row = next.find((r) => r.id === rowId)
      if (row) persistScheduleRow(row)
      return next
    })
  }

  async function removeScheduleRow(rowId: string) {
    setScheduleRows((prev) => prev.filter((r) => r.id !== rowId))
    await deleteScheduleRow(rowId)
  }

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      await uploadTeacherDocument(file, teacher!.id, activeCategory)
      await reload()
    } catch (err: any) {
      setError(err.message || 'Có lỗi khi tải file lên.')
    } finally {
      setUploading(false)
    }
  }

  async function handleOpen(doc: TeacherDocument) {
    try {
      const url = await getDocumentSignedUrl(doc.storage_path)
      window.open(url, '_blank')
    } catch (err: any) {
      setError(err.message || 'Không mở được file.')
    }
  }

  async function handleDelete(doc: TeacherDocument) {
    if (!window.confirm(`Xóa file "${doc.file_name}"? Không thể hoàn tác.`)) return
    await deleteTeacherDocument(doc.id, doc.storage_path)
    setDocs((prev) => prev.filter((d) => d.id !== doc.id))
  }

  const docsInCategory = docs.filter((d) => d.category === activeCategory)

  return (
    <div className="container">
      <Link to="/teacher/dashboard" className="btn secondary" style={{ marginBottom: 16, display: 'inline-flex' }}>
        ← Trang chủ giáo viên
      </Link>

      <div className="card">
        <h2>🗂 Quản lý — Giấy tờ sổ sách dạy thêm</h2>
        <p style={{ fontSize: 13 }}>
          Nơi lưu trữ riêng tư các giấy tờ liên quan đến việc tổ chức dạy thêm ngoài nhà trường, tổ chức theo
          các nhóm hồ sơ theo quy định hiện hành (Thông tư 29/2024/TT-BGDĐT, sửa đổi bởi Thông tư
          19/2026/TT-BGDĐT). File ở đây chỉ mình bạn xem được, không công khai cho học sinh.
        </p>
        <p style={{ fontSize: 12, color: 'var(--danger)' }}>
          ⚠️ Đây là nơi tổ chức lưu trữ, không thay thế việc tự kiểm tra chính xác loại giấy tờ/mẫu biểu cần
          có với nhà trường hoặc Sở GDĐT nơi bạn công tác — quy định có thể khác nhau theo từng địa phương.
        </p>
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <button type="button" className={`btn ${mode === 'docs' ? '' : 'secondary'}`} onClick={() => setMode('docs')}>
            🗂 Giấy tờ theo thư mục
          </button>
          <button type="button" className={`btn ${mode === 'applications' ? '' : 'secondary'}`} onClick={() => setMode('applications')}>
            👪 Đơn xin học thêm của học sinh{applications.filter((a) => !a.reviewed).length > 0 && ` (${applications.filter((a) => !a.reviewed).length} mới)`}
          </button>
          <button type="button" className={`btn ${mode === 'disclosure' ? '' : 'secondary'}`} onClick={() => setMode('disclosure')}>
            📋 Kê khai thông tin dạy
          </button>
        </div>
      </div>

      {mode === 'disclosure' && disclosure && (
        <>
          <div className="card">
            <h3>Thông tin cơ sở dạy thêm</h3>
            <p style={{ fontSize: 13 }}>Nội dung này hiển thị công khai cho học sinh xem ở trang học sinh.</p>

            <label>Tên hộ kinh doanh / cơ sở dạy thêm</label>
            <input value={disclosure.business_name || ''} onChange={(e) => updateDisclosure({ business_name: e.target.value })} placeholder="VD: HỘ KINH DOANH UYÊN THƠ" />

            <label>Địa chỉ</label>
            <input value={disclosure.address || ''} onChange={(e) => updateDisclosure({ address: e.target.value })} />

            <label>Số điện thoại</label>
            <input value={disclosure.phone || ''} onChange={(e) => updateDisclosure({ phone: e.target.value })} />

            <label>Năm học</label>
            <input value={disclosure.school_year || ''} onChange={(e) => updateDisclosure({ school_year: e.target.value })} placeholder="VD: 2026-2027" />

            <label>Danh xưng (dùng để ghép câu trong đơn đăng ký)</label>
            <select value={disclosure.teacher_honorific || 'Cô'} onChange={(e) => updateDisclosure({ teacher_honorific: e.target.value })}>
              <option value="Thầy">Thầy</option>
              <option value="Cô">Cô</option>
            </select>

            <label>Tên hiển thị (trong đơn/kê khai)</label>
            <input value={disclosure.teacher_display_name || teacher?.full_name || ''} onChange={(e) => updateDisclosure({ teacher_display_name: e.target.value })} />

            <label>Các môn/khối tổ chức dạy thêm</label>
            <textarea rows={3} value={disclosure.subjects_info || ''} onChange={(e) => updateDisclosure({ subjects_info: e.target.value })} placeholder={'VD:\n+ Lớp Toán 10, Chương trình giáo dục phổ thông\n+ Lớp Toán 11, Chương trình giáo dục phổ thông'} />

            <label>Hình thức tổ chức dạy thêm, học thêm</label>
            <textarea rows={2} value={disclosure.teaching_form || ''} onChange={(e) => updateDisclosure({ teaching_form: e.target.value })} />

            <label>Mức thu tiền học thêm</label>
            <textarea rows={2} value={disclosure.tuition_rates || ''} onChange={(e) => updateDisclosure({ tuition_rates: e.target.value })} placeholder={'VD: 300.000đ/01 tháng/01 HS - Tuần 2 buổi'} />
          </div>

          <div className="card">
            <h3>Thời khóa biểu (linh hoạt — tự thêm/xóa dòng, tự sửa từng ô)</h3>
            <ScheduleTable rows={scheduleRows} editable onChangeCell={changeScheduleCell} onChangeLabel={changeScheduleLabel} onDeleteRow={removeScheduleRow} />
            <button type="button" className="btn secondary" onClick={addScheduleRow} style={{ marginTop: 10 }}>
              + Thêm dòng
            </button>
          </div>

          <div className="card">
            <h3>Thông tin người dạy (bản thân)</h3>
            <label>Trình độ chuyên môn</label>
            <input value={disclosure.teacher_degree || ''} onChange={(e) => updateDisclosure({ teacher_degree: e.target.value })} placeholder="VD: Thạc sỹ" />
            <label>Chuyên ngành đào tạo</label>
            <input value={disclosure.teacher_major || ''} onChange={(e) => updateDisclosure({ teacher_major: e.target.value })} placeholder="VD: Toán" />
            <label>Đơn vị công tác</label>
            <input value={disclosure.teacher_workplace || ''} onChange={(e) => updateDisclosure({ teacher_workplace: e.target.value })} placeholder="VD: THPT số 1 Tư Nghĩa" />
          </div>

          <div className="card">
            <h3>Báo cáo Hiệu trưởng</h3>
            <label>Kính gửi Hiệu trưởng trường</label>
            <input value={disclosure.principal_school_name || ''} onChange={(e) => updateDisclosure({ principal_school_name: e.target.value })} placeholder="VD: Trường THPT số 1 Tư Nghĩa" />
            <label>Thời gian dạy thêm (để báo cáo)</label>
            <textarea rows={2} value={disclosure.report_teaching_time || ''} onChange={(e) => updateDisclosure({ report_teaching_time: e.target.value })} />
          </div>

          <button className="btn" onClick={handleSaveDisclosure} disabled={savingDisclosure}>
            {savingDisclosure ? 'Đang lưu...' : 'Lưu kê khai'}
          </button>
          {disclosureSavedNote && <span style={{ marginLeft: 10, color: 'green' }}>{disclosureSavedNote}</span>}
        </>
      )}

      {mode === 'applications' && (
        <div className="card">
          <h3>Đơn xin học thêm của học sinh</h3>
          {loading ? (
            <p>Đang tải...</p>
          ) : applications.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>Chưa có đơn nào được nộp.</p>
          ) : (
            <table className="list">
              <thead>
                <tr>
                  <th>Học sinh</th>
                  <th>Lớp/Trường</th>
                  <th>Môn/Khối ĐK</th>
                  <th>Đối tượng</th>
                  <th>Phụ huynh</th>
                  <th>SĐT phụ huynh</th>
                  <th>Ý kiến PH</th>
                  <th>Ngày nộp</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((a) => (
                  <tr key={a.id}>
                    <td>{a.student_full_name}</td>
                    <td>{a.student_school_class || '-'} / {a.student_school_name || '-'}</td>
                    <td>{a.subject_registered || '-'} - {a.grade_registered || '-'}</td>
                    <td style={{ fontSize: 12 }}>{a.not_direct_student === false ? 'HS trực tiếp giảng dạy' : 'Không trực tiếp'}</td>
                    <td>{a.parent_name}</td>
                    <td>{a.parent_phone}</td>
                    <td style={{ fontSize: 12 }}>{a.parent_consent_text || a.note || '-'}</td>
                    <td>{new Date(a.created_at).toLocaleDateString('vi-VN')}</td>
                    <td>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          style={{ width: 'auto', marginBottom: 0 }}
                          checked={a.reviewed}
                          onChange={(e) => handleToggleReviewed(a.id, e.target.checked)}
                        />
                        <span className={`badge ${a.reviewed ? 'correct' : 'warn'}`}>{a.reviewed ? 'Đã xử lý' : 'Chờ xử lý'}</span>
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {mode === 'docs' && (
      <div className="card">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {DOCUMENT_CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`btn ${activeCategory === c.key ? '' : 'secondary'}`}
              onClick={() => setActiveCategory(c.key)}
            >
              {c.label} {docs.filter((d) => d.category === c.key).length > 0 && `(${docs.filter((d) => d.category === c.key).length})`}
            </button>
          ))}
        </div>

        <p style={{ fontSize: 13, color: 'var(--muted)' }}>
          {DOCUMENT_CATEGORIES.find((c) => c.key === activeCategory)?.description}
        </p>

        <label className="btn" style={{ cursor: 'pointer', display: 'inline-flex' }}>
          {uploading ? '⏳ Đang tải...' : '📤 Tải file lên thư mục này'}
          <input type="file" style={{ display: 'none' }} onChange={handleUpload} disabled={uploading} />
        </label>
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

        {loading ? (
          <p>Đang tải...</p>
        ) : docsInCategory.length === 0 ? (
          <p style={{ color: 'var(--muted)', marginTop: 12 }}>Chưa có file nào trong thư mục này.</p>
        ) : (
          <table className="list" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Tên file</th>
                <th>Ngày tải lên</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {docsInCategory.map((d) => (
                <tr key={d.id}>
                  <td>{d.file_name}</td>
                  <td>{new Date(d.created_at).toLocaleDateString('vi-VN')}</td>
                  <td style={{ display: 'flex', gap: 8 }}>
                    <button className="btn secondary" style={{ padding: '4px 10px' }} onClick={() => handleOpen(d)}>
                      Mở
                    </button>
                    <button className="btn danger" style={{ padding: '4px 10px' }} onClick={() => handleDelete(d)}>
                      Xóa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      )}
    </div>
  )
}
