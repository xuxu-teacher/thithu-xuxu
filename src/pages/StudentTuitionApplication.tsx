import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

export default function StudentTuitionApplication() {
  const { student } = useAuth()
  const navigate = useNavigate()
  const [studentFullName, setStudentFullName] = useState('')
  const [parentName, setParentName] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!studentFullName || !parentName || !parentPhone) {
      setError('Điền đầy đủ họ tên học sinh, họ tên và SĐT phụ huynh.')
      return
    }
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.rpc('submit_tuition_application', {
      p_student_id: student!.id,
      p_class_id: student!.class_id,
      p_student_full_name: studentFullName,
      p_parent_name: parentName,
      p_parent_phone: parentPhone,
      p_note: note || null,
    })
    setSaving(false)
    if (err) setError(err.message)
    else setDone(true)
  }

  if (done) {
    return (
      <div className="container">
        <div className="card">
          <h2>✅ Đã gửi đơn thành công</h2>
          <p>Giáo viên sẽ xem lại đơn của bạn trong mục quản lý.</p>
          <button className="btn" onClick={() => navigate('/student/dashboard')}>
            Về trang chủ
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <Link to="/student/dashboard" className="btn secondary" style={{ marginBottom: 16, display: 'inline-flex' }}>
        ← Trang chủ
      </Link>

      <div className="card">
        <h2>📝 Đơn xin học thêm</h2>
        <p style={{ fontSize: 13 }}>
          Đơn đăng ký học thêm trên tinh thần tự nguyện, dùng làm hồ sơ theo quy định về dạy thêm, học thêm.
        </p>

        <form onSubmit={handleSubmit}>
          <label>Họ và tên học sinh</label>
          <input value={studentFullName} onChange={(e) => setStudentFullName(e.target.value)} />

          <label>Họ và tên phụ huynh</label>
          <input value={parentName} onChange={(e) => setParentName(e.target.value)} />

          <label>Số điện thoại phụ huynh</label>
          <input value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} />

          <label>Ghi chú (nếu có)</label>
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />

          {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
          <button className="btn" type="submit" disabled={saving}>
            {saving ? 'Đang gửi...' : 'Gửi đơn'}
          </button>
        </form>
      </div>
    </div>
  )
}
