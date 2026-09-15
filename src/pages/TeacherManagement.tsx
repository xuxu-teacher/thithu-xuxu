import { ChangeEvent, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { DOCUMENT_CATEGORIES } from '../data/documentCategories'
import {
  uploadTeacherDocument,
  listTeacherDocuments,
  getDocumentSignedUrl,
  deleteTeacherDocument,
} from '../utils/teacherDocuments'
import { TeacherDocument } from '../types'

export default function TeacherManagement() {
  const { teacher } = useAuth()
  const [docs, setDocs] = useState<TeacherDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState(DOCUMENT_CATEGORIES[0].key)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    setLoading(true)
    const data = await listTeacherDocuments(teacher!.id)
    setDocs(data)
    setLoading(false)
  }

  useEffect(() => {
    if (teacher) reload()
  }, [teacher])

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
    </div>
  )
}
