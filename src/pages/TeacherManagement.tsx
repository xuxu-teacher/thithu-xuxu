import { ChangeEvent, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { DOCUMENT_CATEGORIES } from '../data/documentCategories'
import {
  uploadTeacherDocument,
  listTeacherDocuments,
  getDocumentSignedUrl,
  deleteTeacherDocument,
} from '../utils/teacherDocuments'
import { TeacherDocument, TuitionApplication } from '../types'

export default function TeacherManagement() {
  const { teacher } = useAuth()
  const [docs, setDocs] = useState<TeacherDocument[]>([])
  const [applications, setApplications] = useState<TuitionApplication[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'docs' | 'applications'>('docs')
  const [activeCategory, setActiveCategory] = useState(DOCUMENT_CATEGORIES[0].key)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  async function handleToggleReviewed(id: string, reviewed: boolean) {
    setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, reviewed } : a)))
    await supabase.from('tuition_applications').update({ reviewed }).eq('id', id)
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
        </div>
      </div>

      {mode === 'applications' ? (
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
      ) : (
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
